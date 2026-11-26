-- =============================================================================
-- MyKlinTown — Sans les Mairies : le précollecteur trace ses zones ;
-- l'autorisation de la commune devient facultative ; les droits Mairie dorment
-- =============================================================================
-- Décision du 26/11/2026 : MyKlinTown fonctionne sans aucune intervention des
-- Mairies.
--
--   1. Interrupteur `mairies_actives` (0 = fermé, posé par cette migration).
--      Fermé, un compte Mairie ne lit et n'écrit plus rien, et aucun accès
--      Mairie ne se demande ni ne s'accorde. Le code reste en place. Rouvrir :
--        update public.parametres_plateforme set valeur = '1' where cle = 'mairies_actives';
--   2. Dossier : l'autorisation territoriale de chaque commune n'est plus
--      exigée. Elle reste téléversable ; la déposer ne relance plus la
--      vérification d'un dossier validé (le permis environnemental, si).
--   3. Zones : le gérant trace, modifie et supprime SES zones (colonne
--      `entreprise_id`). Elles sont affectées d'office à son entreprise, dans
--      une de ses communes d'activité, cinquante au plus. Les chevauchements
--      restent permis. Une Mairie, même rouverte, ne touche pas aux zones d'un
--      précollecteur.
--   4. Abonnés : la zone d'une fiche est toujours une zone de SON précollecteur,
--      sinon celle des siennes qui contient la position, sinon aucune. Deux
--      précollecteurs peuvent donc tracer au même endroit sans se mélanger.
--
-- Signatures inchangées. Additive et rejouable (rejouer ne rouvre ni ne ferme
-- les Mairies). À jouer APRÈS 20261118000026 ; « OK » sur les lignes 1 à 5 du
-- contrôle.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regprocedure('public.clients_demo_avant_validation()') is null then
    raise exception 'Migration à jouer d''abord : 20261118000026_quartiers_signalements_demo (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Interrupteur des Mairies
-- =============================================================================
insert into public.parametres_plateforme (cle, valeur, description) values
  ('mairies_actives', '0',
   'Accès des Mairies : 1 = ouverts, 0 = fermés. Fermés le 26/11/2026 (MyKlinTown fonctionne sans intervention des Mairies).')
on conflict (cle) do nothing;

-- Un booléen, aucune donnée : la page d'inscription (visiteur anonyme) s'en
-- sert pour proposer, ou non, le lien « Vous représentez une Mairie ? ».
create or replace function public.mairies_actives() returns boolean
language sql stable security definer set search_path = public as $$
  select public.parametre_entier('mairies_actives', 0) = 1
$$;

revoke all on function public.mairies_actives() from public;
grant execute on function public.mairies_actives() to anon, authenticated, service_role;

-- Les prédicats de supervision : la branche Mairie ne vaut que si les accès
-- sont ouverts. L'administrateur garde tout.
create or replace function public.est_superviseur() returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or (coalesce(public.role_courant() = 'mairie', false) and public.mairies_actives())
$$;

create or replace function public.supervise_commune(p_commune uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or (p_commune is not null
          and coalesce(public.role_courant() = 'mairie', false)
          and public.mairies_actives()
          and exists (select 1 from public.mairie_communes mc
                       where mc.user_id = auth.uid() and mc.commune_id = p_commune))
$$;

create or replace function public.supervise_entreprise(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or (coalesce(public.role_courant() = 'mairie', false)
          and public.mairies_actives()
          and exists (
            select 1 from public.mairie_communes mc
             where mc.user_id = auth.uid()
               and (exists (select 1 from public.entreprises e
                             where e.id = p_entreprise and e.commune_id = mc.commune_id)
                    or exists (select 1 from public.zone_affectations a
                                 join public.zones z on z.id = a.zone_id
                                where a.entreprise_id = p_entreprise and z.commune_id = mc.commune_id))))
$$;

-- Anciennes tables (avant le pivot précollecteurs) : leurs politiques lisent
-- `current_user_role()`. Accès fermés, un compte Mairie y est un compte simple.
create or replace function public.current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select case when p.role = 'mairie' and not public.mairies_actives() then 'citoyen'::user_role else p.role end
    from public.profiles p where p.id = auth.uid()
$$;

-- Accès fermés : pas de nouvelle demande, pas d'acceptation, pas de commune
-- accordée. Refuser ou annuler une demande reste possible.
create or replace function public.acces_mairie_ferme() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.mairies_actives() then
    return new;
  end if;
  if tg_table_name = 'demandes_acces' and tg_op = 'UPDATE'
     and not (new.statut = 'acceptee' and old.statut is distinct from 'acceptee') then
    return new;
  end if;
  raise exception 'Les accès Mairie sont fermés : MyKlinTown fonctionne sans intervention des Mairies.'
    using errcode = '42501';
end $$;

revoke all on function public.acces_mairie_ferme() from public, anon;

drop trigger if exists demandes_acces_fermees on public.demandes_acces;
create trigger demandes_acces_fermees before insert or update of statut on public.demandes_acces
  for each row execute function public.acces_mairie_ferme();

drop trigger if exists mairie_communes_fermees on public.mairie_communes;
create trigger mairie_communes_fermees before insert on public.mairie_communes
  for each row execute function public.acces_mairie_ferme();

-- =============================================================================
-- 2. Dossier : l'autorisation de la commune devient facultative
-- =============================================================================
create or replace function public.pieces_manquantes(p_entreprise uuid) returns text[]
language sql stable set search_path = public as $$
  select array_remove(array[
    case when coalesce(btrim(e.niu), '') = '' then 'le NIU' end,
    case when coalesce(btrim(e.siege), '') = '' then 'l''adresse du siège social' end,
    case when not exists (select 1 from public.entreprise_communes ec where ec.entreprise_id = e.id)
         then 'au moins une commune d''activité' end,
    case when e.permis_env_path is null then 'le permis environnemental' end
  ], null)
  from public.entreprises e
  where e.id = p_entreprise
    and (public.est_membre(e.id) or public.est_admin())
$$;

-- Reprise de 20261109000017 : seul un nouveau permis relance la vérification
-- d'un dossier validé ; une autorisation (facultative) ou un logo, non.
create or replace function public.enregistrer_piece_dossier(p_piece text, p_chemin text, p_commune uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ent uuid := public.mon_entreprise();
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if p_piece is null or p_piece not in ('autorisation', 'permis', 'logo') then
    raise exception 'Pièce inconnue : %', coalesce(p_piece, '(vide)');
  end if;
  if public.dossier_entreprise(p_chemin) is distinct from v_ent or p_chemin !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' then
    raise exception 'Fichier hors du dossier de l''entreprise' using errcode = '42501';
  end if;

  if p_piece = 'autorisation' then
    update public.entreprise_communes set autorisation_path = p_chemin
     where entreprise_id = v_ent and commune_id = p_commune;
    if not found then raise exception 'Ajoutez d''abord cette commune à vos communes d''activité'; end if;
  elsif p_piece = 'permis' then
    update public.entreprises set permis_env_path = p_chemin where id = v_ent;
  else
    update public.entreprises set logo_path = p_chemin where id = v_ent;
  end if;

  if p_piece = 'permis' then
    update public.entreprises set dossier_statut = 'soumis', dossier_soumis_at = now()
     where id = v_ent and dossier_statut = 'valide';
  end if;
end $$;

-- =============================================================================
-- 3. Zones tracées par le précollecteur
-- =============================================================================
alter table public.zones add column if not exists entreprise_id uuid references public.entreprises(id) on delete cascade;
create index if not exists zones_entreprise_idx on public.zones (entreprise_id) where entreprise_id is not null;

comment on column public.zones.entreprise_id is
  'Précollecteur qui a tracé la zone (lui seul la modifie, avec l''administrateur). Vide : zone tracée par l''administrateur ou une Mairie.';

-- Entreprise propriétaire d'une zone (null : zone de l'administrateur ou d'une Mairie).
create or replace function public.zone_de_precollecteur(p_zone uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select entreprise_id from public.zones where id = p_zone
$$;

revoke all on function public.zone_de_precollecteur(uuid) from public, anon;
grant execute on function public.zone_de_precollecteur(uuid) to authenticated, service_role;

-- Garde-fous, avec les droits de l'appelant : une zone reste à l'entreprise qui
-- l'a tracée ; elle est dans une de ses communes d'activité ; 50 au plus.
create or replace function public.zones_du_precollecteur() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.entreprise_id is distinct from old.entreprise_id
     and current_user in ('anon', 'authenticated') and not public.est_admin() then
    raise exception 'Une zone reste à l''entreprise qui l''a tracée' using errcode = '42501';
  end if;
  if new.entreprise_id is not null then
    if new.commune_id is not null and not exists (
         select 1 from public.entreprise_communes ec
          where ec.entreprise_id = new.entreprise_id and ec.commune_id = new.commune_id) then
      raise exception 'Choisissez une de vos communes d''activité (menu Dossier & vitrine)';
    end if;
    if tg_op = 'INSERT' and (select count(*) from public.zones z where z.entreprise_id = new.entreprise_id) >= 50 then
      raise exception 'Cinquante zones au plus par entreprise';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.zones_du_precollecteur() from public, anon;

drop trigger if exists zones_du_precollecteur on public.zones;
create trigger zones_du_precollecteur before insert or update on public.zones
  for each row execute function public.zones_du_precollecteur();

-- La zone tracée est affectée d'office à son entreprise (le gérant n'écrit pas
-- lui-même dans les affectations).
create or replace function public.zone_affectee_a_son_precollecteur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.entreprise_id is not null then
    insert into public.zone_affectations (zone_id, entreprise_id) values (new.id, new.entreprise_id)
    on conflict do nothing;
  end if;
  return null;
end $$;

revoke all on function public.zone_affectee_a_son_precollecteur() from public, anon;

drop trigger if exists zones_affectation_auto on public.zones;
create trigger zones_affectation_auto after insert or update of entreprise_id on public.zones
  for each row execute function public.zone_affectee_a_son_precollecteur();

-- Zone d'un précollecteur : lui ou l'administrateur. Les autres : comme avant
-- (administrateur, ou Mairie de la commune si les accès sont ouverts).
drop policy if exists zones_ecriture on public.zones;
create policy zones_ecriture on public.zones for all to authenticated
  using (case when entreprise_id is null then public.supervise_commune(commune_id)
              else public.est_admin() or public.est_gerant(entreprise_id) end)
  with check (case when entreprise_id is null then public.supervise_commune(commune_id)
                   else public.est_admin() or public.est_gerant(entreprise_id) end);

-- Affectations : une Mairie ne touche pas aux zones d'un précollecteur.
drop policy if exists affectations_ecriture on public.zone_affectations;
create policy affectations_ecriture on public.zone_affectations for all to authenticated
  using (public.supervise_zone(zone_id)
         and (public.est_admin() or public.zone_de_precollecteur(zone_id) is null))
  with check (public.supervise_zone(zone_id) and public.supervise_entreprise(entreprise_id)
              and (public.est_admin() or public.zone_de_precollecteur(zone_id) is null));

-- =============================================================================
-- 4. Abonnés : la zone d'une fiche est une zone de son précollecteur
-- =============================================================================
-- Avant : la zone d'un point était la première zone trouvée, de n'importe quel
-- précollecteur (`zone_du_point`). Avec des zones tracées par chacun, deux
-- concurrents se chevauchent : la fiche prend une zone de SON précollecteur
-- qui contient sa position, ou aucune. Une fiche sans zone mais avec une
-- position reçoit la sienne d'office.
create or replace function public.clients_zone_du_precollecteur() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.zone_id is not null and exists (
       select 1 from public.zone_affectations a
        where a.zone_id = new.zone_id and a.entreprise_id = new.entreprise_id) then
    return new;
  end if;
  new.zone_id := null;
  if new.lat is not null and new.lng is not null then
    select a.zone_id into new.zone_id
      from public.zone_affectations a
      join public.zones z on z.id = a.zone_id
     where a.entreprise_id = new.entreprise_id
       and ST_Intersects(public.geom_zone(z.contour), ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326))
     order by z.created_at, z.id
     limit 1;
  end if;
  return new;
end $$;

revoke all on function public.clients_zone_du_precollecteur() from public, anon;

drop trigger if exists clients_zone_du_precollecteur on public.clients;
create trigger clients_zone_du_precollecteur before insert or update of zone_id, entreprise_id, lat, lng on public.clients
  for each row execute function public.clients_zone_du_precollecteur();

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 5.
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Interrupteur des Mairies en place' as controle,
         exists (select 1 from public.parametres_plateforme where cle = 'mairies_actives') as ok,
         case when public.mairies_actives() then 'accès Mairie OUVERTS' else 'accès Mairie fermés' end as detail
  union all
  select 2, 'Supervision Mairie soumise à l''interrupteur',
         pg_get_functiondef('public.est_superviseur()'::regprocedure) like '%mairies_actives%'
         and pg_get_functiondef('public.supervise_commune(uuid)'::regprocedure) like '%mairies_actives%'
         and pg_get_functiondef('public.supervise_entreprise(uuid)'::regprocedure) like '%mairies_actives%'
         and pg_get_functiondef('public.current_user_role()'::regprocedure) like '%mairies_actives%'
         and exists (select 1 from pg_trigger where tgrelid = 'public.demandes_acces'::regclass and tgname = 'demandes_acces_fermees')
         and exists (select 1 from pg_trigger where tgrelid = 'public.mairie_communes'::regclass and tgname = 'mairie_communes_fermees'),
         'lecture, écriture, demandes et communes accordées'
  union all
  select 3, 'Dossier complet sans autorisation de commune',
         pg_get_functiondef('public.pieces_manquantes(uuid)'::regprocedure) not like '%autorisation_path%',
         'NIU, siège, une commune d''activité, permis environnemental'
  union all
  select 4, 'Zones tracées par le précollecteur',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'zones' and column_name = 'entreprise_id')
         and exists (select 1 from pg_trigger where tgrelid = 'public.zones'::regclass and tgname = 'zones_affectation_auto')
         and (select p.qual like '%est_gerant%' from pg_policies p
               where p.schemaname = 'public' and p.tablename = 'zones' and p.policyname = 'zones_ecriture'),
         (select count(*) || ' zone(s) tracée(s) par un précollecteur' from public.zones where entreprise_id is not null)
  union all
  select 5, 'Zone d''un abonné = zone de son précollecteur',
         exists (select 1 from pg_trigger where tgrelid = 'public.clients'::regclass and tgname = 'clients_zone_du_precollecteur'),
         (select count(*) || ' fiche(s) existante(s) dans une zone d''un autre précollecteur (corrigées à leur prochaine modification)'
            from public.clients c
           where c.zone_id is not null
             and not exists (select 1 from public.zone_affectations a where a.zone_id = c.zone_id and a.entreprise_id = c.entreprise_id))
) x order by n;
