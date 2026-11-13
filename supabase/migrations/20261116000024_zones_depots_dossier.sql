-- =============================================================================
-- MyKlinTown — Dossier revérifié quand l'identité change ; contour de zone
-- contrôlé ; dépôts de preuves plafonnés ; demande d'abonnement non réécrite
-- =============================================================================
-- Revue du 10/11/2026 (suite).
--
--   1. Dossier du précollecteur : une fois validé, changer le nom, le RCCM ou
--      l'adresse fiscale le renvoie en vérification, comme le faisaient déjà
--      le NIU et le siège. Ce sont les mentions imprimées sur les factures et
--      affichées dans l'annuaire.
--   2. Zones : un contour doit être un polygone lisible, de taille plausible.
--      Un contour illisible faisait échouer la recherche du précollecteur d'une
--      adresse pour tout le monde.
--   3. Preuves (photos et vidéos des signalements) : 60 dépôts par jour pour un
--      membre de l'équipe, 10 pour un abonné ; 15 Mo par fichier (une vidéo de
--      30 secondes en pèse moins de 6).
--   4. Demande d'abonnement en attente : son auteur ne peut qu'en changer le
--      statut (l'annuler).
--
-- Additive et rejouable. À jouer APRÈS 20261115000023 ; « OK » sur les lignes
-- 1 à 4 du contrôle ; la ligne 5 est une information.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regclass('public.paiements_en_ligne_un_en_cours') is null then
    raise exception 'Migration à jouer d''abord : 20261115000023_paiement_en_ligne_garde_fous (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Dossier : l'identité affichée et facturée se revérifie
-- =============================================================================
create or replace function public.dossier_revalidation() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.dossier_statut = 'valide'
     and (new.niu is distinct from old.niu or new.siege is distinct from old.siege
          or new.nom is distinct from old.nom or new.rccm is distinct from old.rccm
          or new.adresse_fiscale is distinct from old.adresse_fiscale)
     and not public.est_admin() then
    new.dossier_statut := 'soumis';
    new.dossier_soumis_at := now();
  end if;
  return new;
end $$;

revoke all on function public.dossier_revalidation() from public, anon, authenticated;

drop trigger if exists entreprises_dossier_revalidation on public.entreprises;
create trigger entreprises_dossier_revalidation
  before update of niu, siege, nom, rccm, adresse_fiscale on public.entreprises
  for each row execute function public.dossier_revalidation();

-- =============================================================================
-- 2. Zones : contour lisible et de taille plausible
-- =============================================================================
-- Polygone ou multipolygone GeoJSON, de 100 m² à 5 000 km², 10 000 points au
-- plus. Un tracé qui se recoupe reste accepté (il est réparé à la lecture).
create or replace function public.contour_zone_valide(p_contour jsonb) returns boolean
language plpgsql immutable set search_path = public, extensions as $$
declare
  v_geom geometry;
begin
  if p_contour is null or jsonb_typeof(p_contour) <> 'object'
     or coalesce(p_contour ->> 'type', '') not in ('Polygon', 'MultiPolygon') then
    return false;
  end if;
  v_geom := public.geom_zone(p_contour);
  return v_geom is not null
     and not ST_IsEmpty(v_geom)
     and ST_NPoints(v_geom) between 4 and 10000
     and ST_Area(v_geom::geography) between 100 and 5000000000;
exception when others then
  return false;
end $$;

revoke all on function public.contour_zone_valide(jsonb) from public, anon;
grant execute on function public.contour_zone_valide(jsonb) to authenticated, service_role;

alter table public.zones drop constraint if exists zones_contour_valide;
alter table public.zones
  add constraint zones_contour_valide check (public.contour_zone_valide(contour)) not valid;

-- Les zones déjà tracées : validées si elles respectent toutes la règle. Sinon
-- la contrainte reste posée pour les nouvelles écritures, et le contrôle le dit.
do $$
begin
  alter table public.zones validate constraint zones_contour_valide;
exception when check_violation then
  raise notice 'Des zones existantes ont un contour à reprendre : voir la ligne 2 du contrôle.';
end $$;

-- =============================================================================
-- 3. Preuves : dépôts plafonnés, fichiers de 15 Mo au plus
-- =============================================================================
-- Dépôts de l'appelant dans « preuves » depuis 24 h (son dossier porte son
-- identifiant en deuxième position du chemin).
create or replace function public.depots_preuves_du_jour() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from storage.objects o
  where o.bucket_id = 'preuves'
    and split_part(o.name, '/', 2) = auth.uid()::text
    and o.created_at > now() - interval '24 hours'
$$;

revoke all on function public.depots_preuves_du_jour() from public, anon;
grant execute on function public.depots_preuves_du_jour() to authenticated;

drop policy if exists preuves_depot on storage.objects;
create policy preuves_depot on storage.objects for insert to authenticated
  with check (
    bucket_id = 'preuves'
    and split_part(name, '/', 2) = auth.uid()::text
    and (
      (public.est_membre(public.dossier_entreprise(name)) and public.depots_preuves_du_jour() < 60)
      or (public.est_client_de(public.dossier_entreprise(name)) and public.depots_preuves_du_jour() < 10)
    )
  );

update storage.buckets
   set file_size_limit = 15728640
 where id = 'preuves' and (file_size_limit is null or file_size_limit > 15728640);

-- =============================================================================
-- 4. Demande d'abonnement : seul le statut se modifie
-- =============================================================================
revoke update on public.demandes_abonnement from authenticated;
grant update (statut) on public.demandes_abonnement to authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 4.
-- =============================================================================
select controle, case when ok is null then 'INFO' when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Dossier revérifié si le nom, le RCCM ou l''adresse fiscale change' as controle,
         (select pg_get_triggerdef(t.oid) like '%nom%' and pg_get_triggerdef(t.oid) like '%adresse_fiscale%'
            from pg_trigger t
           where t.tgrelid = 'public.entreprises'::regclass and t.tgname = 'entreprises_dossier_revalidation') as ok,
         'comme le NIU et le siège' as detail
  union all
  select 2, 'Contour de zone contrôlé',
         (select c.convalidated from pg_constraint c
           where c.conrelid = 'public.zones'::regclass and c.conname = 'zones_contour_valide'),
         (select count(*) filter (where not public.contour_zone_valide(z.contour)) || ' zone(s) existante(s) à reprendre sur ' || count(*)
            from public.zones z)
  union all
  select 3, 'Dépôts de preuves plafonnés ; 15 Mo par fichier',
         (select p.with_check like '%depots_preuves_du_jour%' from pg_policies p
           where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'preuves_depot')
         and (select b.file_size_limit <= 15728640 from storage.buckets b where b.id = 'preuves'),
         '60 par jour pour l''équipe, 10 pour un abonné'
  union all
  select 4, 'Demande d''abonnement : seul le statut se modifie',
         not has_table_privilege('authenticated', 'public.demandes_abonnement', 'update')
         and has_column_privilege('authenticated', 'public.demandes_abonnement', 'statut', 'update'),
         'l''auteur peut l''annuler, pas la réécrire'
  union all
  select 5, 'Fichiers déjà déposés dans « preuves »',
         null::boolean,
         (select count(*) || ' fichier(s)' from storage.objects o where o.bucket_id = 'preuves')
) x order by n;
