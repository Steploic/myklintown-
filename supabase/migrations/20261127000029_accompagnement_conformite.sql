-- =============================================================================
-- MyKlinTown — Accompagnement des précollecteurs vers la conformité
-- =============================================================================
-- Décision du 27/11/2026 : seuls des précollecteurs habilités sont présentés
-- aux abonnés (0028). MyKlinTown aide les précollecteurs informels à le devenir
-- (formations, ateliers, aide aux démarches, avec le soutien des mairies et des
-- ministères, hors de l'application).
--
--   1. `accompagnements` : le gérant demande de l'aide pour une étape — créer
--      une structure légale, obtenir le NIU, l'autorisation d'une de ses
--      communes, le permis environnemental. Une demande ouverte par étape (et
--      par commune pour l'autorisation), dix par jour au plus.
--   2. L'équipe MyKlinTown suit chaque demande (contacté, en cours, obtenue,
--      close) et peut laisser un message, que le gérant lit dans son dossier.
--   3. La pièce déposée au dossier (autorisation, permis, NIU) clôt d'elle-même
--      la demande correspondante : « obtenue ».
--   Lecture : le précollecteur (ses membres) et l'administrateur. Écriture :
--   seulement par les fonctions ci-dessous.
--
-- Additive et rejouable. À jouer APRÈS 20261127000028 ; « OK » sur les lignes 1
-- à 3 du contrôle.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regprocedure('public.mairies_actives()') is null
     or pg_get_functiondef('public.pieces_manquantes(uuid)'::regprocedure) not like '%autorisation_path is null%' then
    raise exception 'Migration à jouer d''abord : 20261127000028_autorisation_obligatoire (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Les demandes
-- =============================================================================
create table if not exists public.accompagnements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  etape text not null check (etape in ('structure', 'niu', 'autorisation', 'permis')),
  -- La commune, pour l'autorisation seulement.
  commune_id uuid references public.communes(id) on delete cascade,
  message text check (char_length(message) <= 500),
  statut text not null default 'demande' check (statut in ('demande', 'contacte', 'en_cours', 'obtenue', 'close')),
  -- Message de l'équipe MyKlinTown, lu par le gérant.
  message_equipe text check (char_length(message_equipe) <= 1000),
  demande_par uuid references public.profiles(id) on delete set null,
  suivi_par uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accompagnements_commune check ((etape = 'autorisation') = (commune_id is not null))
);

comment on table public.accompagnements is
  'Demandes d''aide d''un précollecteur pour se mettre en règle (structure, NIU, autorisation de la commune, permis), suivies par l''équipe MyKlinTown.';

create unique index if not exists accompagnements_une_ouverte
  on public.accompagnements (entreprise_id, etape, coalesce(commune_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where statut in ('demande', 'contacte', 'en_cours');
create index if not exists accompagnements_suivi_idx on public.accompagnements (statut, created_at);

drop trigger if exists accompagnements_updated_at on public.accompagnements;
create trigger accompagnements_updated_at before update on public.accompagnements
  for each row execute function public.set_updated_at();

alter table public.accompagnements enable row level security;

drop policy if exists accompagnements_lecture on public.accompagnements;
create policy accompagnements_lecture on public.accompagnements for select to authenticated
  using (public.est_membre(entreprise_id) or public.est_admin());
-- Aucune politique d'écriture : tout passe par les fonctions.

-- =============================================================================
-- 2. Le gérant demande, ou retire sa demande
-- =============================================================================
create or replace function public.demander_accompagnement(p_etape text, p_commune uuid default null, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ent uuid := public.mon_entreprise();
  v_commune uuid := case when p_etape = 'autorisation' then p_commune end;
  v_id uuid;
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if p_etape is null or p_etape not in ('structure', 'niu', 'autorisation', 'permis') then
    raise exception 'Étape inconnue : %', coalesce(p_etape, '(vide)');
  end if;
  if p_etape = 'autorisation' and (v_commune is null or not exists (
       select 1 from public.entreprise_communes ec where ec.entreprise_id = v_ent and ec.commune_id = v_commune)) then
    raise exception 'Choisissez une de vos communes d''activité';
  end if;
  if exists (select 1 from public.accompagnements a
              where a.entreprise_id = v_ent and a.etape = p_etape and a.commune_id is not distinct from v_commune
                and a.statut in ('demande', 'contacte', 'en_cours')) then
    raise exception 'Votre demande est déjà enregistrée : l''équipe MyKlinTown vous recontacte.';
  end if;
  if (select count(*) from public.accompagnements a
       where a.entreprise_id = v_ent and a.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Dix demandes par jour au plus : l''équipe MyKlinTown vous recontacte.';
  end if;
  insert into public.accompagnements (entreprise_id, etape, commune_id, message, demande_par)
  values (v_ent, p_etape, v_commune, nullif(left(btrim(coalesce(p_message, '')), 500), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.retirer_accompagnement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.accompagnements a set statut = 'close'
   where a.id = p_id and public.est_gerant(a.entreprise_id) and a.statut in ('demande', 'contacte', 'en_cours');
  if not found then raise exception 'Demande introuvable ou déjà close'; end if;
end $$;

-- =============================================================================
-- 3. L'équipe MyKlinTown suit la demande
-- =============================================================================
-- `p_message` null : le message précédent est gardé ; chaîne vide : il est effacé.
create or replace function public.suivre_accompagnement(p_id uuid, p_statut text, p_message text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''équipe MyKlinTown' using errcode = '42501';
  end if;
  if p_statut is null or p_statut not in ('demande', 'contacte', 'en_cours', 'obtenue', 'close') then
    raise exception 'Statut inconnu : %', coalesce(p_statut, '(vide)');
  end if;
  update public.accompagnements
     set statut = p_statut,
         message_equipe = case when p_message is null then message_equipe else nullif(left(btrim(p_message), 1000), '') end,
         suivi_par = auth.uid()
   where id = p_id;
  if not found then raise exception 'Demande introuvable'; end if;
end $$;

-- =============================================================================
-- 4. La pièce déposée clôt la demande : « obtenue »
-- =============================================================================
create or replace function public.accompagnement_piece_deposee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'entreprise_communes' then
    if new.autorisation_path is not null and new.autorisation_path is distinct from old.autorisation_path then
      update public.accompagnements set statut = 'obtenue'
       where entreprise_id = new.entreprise_id and etape = 'autorisation' and commune_id = new.commune_id
         and statut in ('demande', 'contacte', 'en_cours');
    end if;
  else
    if new.permis_env_path is not null and new.permis_env_path is distinct from old.permis_env_path then
      update public.accompagnements set statut = 'obtenue'
       where entreprise_id = new.id and etape = 'permis' and statut in ('demande', 'contacte', 'en_cours');
    end if;
    if coalesce(btrim(new.niu), '') <> '' and new.niu is distinct from old.niu then
      update public.accompagnements set statut = 'obtenue'
       where entreprise_id = new.id and etape = 'niu' and statut in ('demande', 'contacte', 'en_cours');
    end if;
  end if;
  return null;
end $$;

drop trigger if exists entreprise_communes_accompagnement on public.entreprise_communes;
create trigger entreprise_communes_accompagnement after update of autorisation_path on public.entreprise_communes
  for each row execute function public.accompagnement_piece_deposee();

drop trigger if exists entreprises_accompagnement on public.entreprises;
create trigger entreprises_accompagnement after update of permis_env_path, niu on public.entreprises
  for each row execute function public.accompagnement_piece_deposee();

-- =============================================================================
-- 5. Droits
-- =============================================================================
revoke all on function public.demander_accompagnement(text, uuid, text) from public, anon;
revoke all on function public.retirer_accompagnement(uuid) from public, anon;
revoke all on function public.suivre_accompagnement(uuid, text, text) from public, anon;
revoke all on function public.accompagnement_piece_deposee() from public, anon;
grant execute on function public.demander_accompagnement(text, uuid, text) to authenticated;
grant execute on function public.retirer_accompagnement(uuid) to authenticated;
grant execute on function public.suivre_accompagnement(uuid, text, text) to authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 3.
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Demandes d''accompagnement, lisibles par leur précollecteur et l''équipe' as controle,
         to_regclass('public.accompagnements') is not null
         and (select c.relrowsecurity from pg_class c where c.oid = 'public.accompagnements'::regclass)
         and not exists (select 1 from pg_policies p
                          where p.schemaname = 'public' and p.tablename = 'accompagnements' and p.cmd <> 'SELECT') as ok,
         'écriture par les fonctions seulement' as detail
  union all
  select 2, 'Demander, retirer, suivre : jamais sans compte',
         to_regprocedure('public.suivre_accompagnement(uuid, text, text)') is not null
         and not has_function_privilege('anon', 'public.demander_accompagnement(text, uuid, text)', 'execute')
         and not has_function_privilege('anon', 'public.suivre_accompagnement(uuid, text, text)', 'execute')
         and not has_function_privilege('anon', 'public.retirer_accompagnement(uuid)', 'execute'),
         'suivre : équipe MyKlinTown seulement'
  union all
  select 3, 'Pièce déposée : demande « obtenue » d''elle-même',
         exists (select 1 from pg_trigger where tgrelid = 'public.entreprise_communes'::regclass and tgname = 'entreprise_communes_accompagnement')
         and exists (select 1 from pg_trigger where tgrelid = 'public.entreprises'::regclass and tgname = 'entreprises_accompagnement'),
         'autorisation, permis, NIU'
) x order by n;
