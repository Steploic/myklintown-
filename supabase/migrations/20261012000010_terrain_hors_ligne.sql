-- =============================================================================
-- MyKlinTown — Tournées hors ligne : l'heure du terrain
-- =============================================================================
-- Sans réseau, l'application garde les scans et les pointages sur le
-- téléphone et les envoie au retour du réseau. Jusqu'ici, un passage envoyé
-- en différé prenait l'heure de l'ENVOI. Il prend désormais l'heure du
-- GESTE, transmise par le téléphone (`p_horodatage`).
--
-- Garde-fou : une heure annoncée par un téléphone n'est pas une preuve. Elle
-- n'est retenue que si elle est plausible — pas dans le futur (5 min de marge
-- pour les horloges), pas plus de 48 h dans le passé — sinon on garde
-- l'heure du serveur. Et l'heure de réception est toujours notée à part
-- (`collectes.enregistre_at`) : un passage arrivé tard reste repérable.
--
-- Rétrocompatible : sans `p_horodatage`, rien ne change. L'application sait
-- aussi fonctionner AVANT cette migration (elle rappelle alors les fonctions
-- sans le paramètre).
--
-- Une transaction, rejouable. À jouer sur la base de TEST, puis sur la vraie.
-- =============================================================================

begin;

alter table public.collectes add column if not exists enregistre_at timestamptz;
comment on column public.collectes.enregistre_at is
  'Heure de réception par le serveur (≠ realisee_at, heure du geste sur le terrain, qui peut être antérieure si le geste a été fait hors ligne).';

-- Heure annoncée par le téléphone, retenue seulement si elle est plausible.
create or replace function public.heure_terrain(p_horodatage timestamptz) returns timestamptz
language sql stable set search_path = public as $$
  select case
           when p_horodatage between now() - interval '48 hours' and now() + interval '5 minutes'
             then least(p_horodatage, now())
           else now()
         end
$$;

-- Les anciennes signatures (sans heure) laissent place aux nouvelles : deux
-- versions côte à côte rendraient l'appel ambigu pour l'API.
drop function if exists public.pointer_passage(uuid, text, text);
drop function if exists public.scanner_passage(uuid, text);

create or replace function public.pointer_passage(
  p_collecte uuid, p_statut text, p_motif text default null, p_horodatage timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tournee uuid;
  v_statut_tournee text;
begin
  if p_statut not in ('realisee', 'non_realisee', 'prevue') then raise exception 'Statut inconnu'; end if;
  select co.tournee_id, t.statut into v_tournee, v_statut_tournee
    from public.collectes co
    join public.tournees_precollecte t on t.id = co.tournee_id
   where co.id = p_collecte;
  if not found then raise exception 'Passage introuvable'; end if;
  if not public.peut_agir_sur_tournee(v_tournee) then
    raise exception 'Ce passage ne fait pas partie de vos tournées' using errcode = '42501';
  end if;
  if v_statut_tournee not in ('planifiee', 'en_cours') then
    raise exception 'Tournée close : rouvrez-la pour corriger un passage';
  end if;

  update public.collectes
     set statut = p_statut,
         motif = case when p_statut = 'non_realisee' then coalesce(nullif(btrim(p_motif), ''), 'Autre') end,
         realisee_at = case when p_statut = 'prevue' then null else public.heure_terrain(p_horodatage) end,
         enregistre_at = now(),
         employe_id = coalesce(public.mon_employe(), employe_id)
   where id = p_collecte;
end $$;

create or replace function public.scanner_passage(p_tournee uuid, p_code text, p_horodatage timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.tournees_precollecte;
  c record;
  v_collecte uuid;
  v_statut text;
begin
  select * into t from public.tournees_precollecte where id = p_tournee;
  if not found or not public.peut_agir_sur_tournee(p_tournee) then
    raise exception 'Tournée introuvable ou hors de vos tournées' using errcode = '42501';
  end if;
  if t.statut not in ('planifiee', 'en_cours') then
    raise exception 'Tournée close : rouvrez-la pour scanner';
  end if;

  select v.id, v.nom, v.code, v.statut_abonnement, v.quartier into c
    from public.v_clients_statut v
   where v.entreprise_id = t.entreprise_id and v.code = upper(btrim(p_code));
  if not found then
    raise exception 'Code % inconnu : ce ménage n''est pas un client de l''entreprise', upper(btrim(p_code));
  end if;

  select id, statut into v_collecte, v_statut
    from public.collectes where tournee_id = p_tournee and client_id = c.id;

  -- Déjà enregistré (scan rejoué après une coupure, ou scanné deux fois) : rien ne bouge.
  if v_collecte is not null and v_statut = 'realisee' then
    return jsonb_build_object('nom', c.nom, 'code', c.code, 'statut_abonnement', c.statut_abonnement,
                              'quartier', c.quartier, 'hors_planning', false, 'deja_fait', true);
  end if;

  if v_collecte is not null then
    update public.collectes
       set statut = 'realisee', motif = null, realisee_at = public.heure_terrain(p_horodatage), enregistre_at = now(),
           employe_id = coalesce(public.mon_employe(), employe_id)
     where id = v_collecte;
  else
    insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue, employe_id, statut, realisee_at, enregistre_at)
    values (t.entreprise_id, t.id, c.id, t.date, coalesce(public.mon_employe(), t.employe_id), 'realisee',
            public.heure_terrain(p_horodatage), now());
  end if;

  return jsonb_build_object('nom', c.nom, 'code', c.code, 'statut_abonnement', c.statut_abonnement,
                            'quartier', c.quartier, 'hors_planning', v_collecte is null, 'deja_fait', false);
end $$;

-- Droits : comptes connectés seulement (les fonctions vérifient ensuite gérant ou équipier).
revoke all on function public.pointer_passage(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.scanner_passage(uuid, text, timestamptz) from public, anon;
revoke all on function public.heure_terrain(timestamptz) from public, anon;
grant execute on function public.pointer_passage(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.scanner_passage(uuid, text, timestamptz) to authenticated;

commit;

-- Contrôle : 3 lignes « OK » attendues.
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat
from (
  select 1 as n, 'Colonne collectes.enregistre_at' as controle,
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'collectes' and column_name = 'enregistre_at') as ok
  union all
  select 2, 'pointer_passage et scanner_passage acceptent l''heure du terrain',
         to_regprocedure('public.pointer_passage(uuid, text, text, timestamptz)') is not null
         and to_regprocedure('public.scanner_passage(uuid, text, timestamptz)') is not null
         and to_regprocedure('public.pointer_passage(uuid, text, text)') is null
         and to_regprocedure('public.scanner_passage(uuid, text)') is null
  union all
  select 3, 'Fermées au visiteur anonyme',
         not has_function_privilege('anon', 'public.pointer_passage(uuid, text, text, timestamptz)', 'execute')
         and not has_function_privilege('anon', 'public.scanner_passage(uuid, text, timestamptz)', 'execute')
) x order by n;
