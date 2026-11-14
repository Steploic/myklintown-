-- =============================================================================
-- MyKlinTown — Quartiers trop courts ; signalements réservés aux abonnés
-- servis ; données de démonstration avant la validation du dossier
-- =============================================================================
-- Revue du 10/11/2026 (fin).
--
--   1. Quartiers : un mot de moins de quatre lettres ne correspond qu'à un mot
--      identique. « Bo » ne vaut plus pour « Bonamoussadi » ; « Nkol » vaut
--      toujours pour « Nkolbisson », « Ada » pour « Mvog-Ada ».
--   2. Signalements et preuves côté abonné : réservés aux abonnés servis
--      (actifs ou suspendus). Une demande pas encore acceptée, ou un
--      abonnement résilié, ne les ouvre pas.
--   3. Données de démonstration : elles servent à découvrir l'outil. Une fois
--      le dossier validé, il ne s'en crée plus.
--
-- Mêmes signatures. Additive et rejouable. À jouer APRÈS 20261117000025 ;
-- « OK » sur les lignes 1 à 3 du contrôle.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
do $$
begin
  if to_regclass('public.clients_notes') is null then
    raise exception 'Migration à jouer d''abord : 20261117000025_notes_internes_clients (et les précédentes)'
      using hint = 'Rien n''a été modifié. Contrôle complet : supabase/EMPREINTE_SCHEMA.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Quartiers : pas de correspondance par début de mot sous quatre lettres
-- =============================================================================
-- Deux noms correspondent quand chaque mot du plus court se retrouve dans
-- l'autre : à l'identique, ou comme début de mot s'il a au moins quatre lettres.
create or replace function public.quartier_correspond(p_a text, p_b text) returns boolean
language sql immutable set search_path = public as $$
  with a as (select t from unnest(string_to_array(public.cle_quartier(p_a), ' ')) t where char_length(t) >= 2),
       b as (select t from unnest(string_to_array(public.cle_quartier(p_b), ' ')) t where char_length(t) >= 2)
  select exists (select 1 from a) and exists (select 1 from b)
     and (not exists (select 1 from b where not exists (
            select 1 from a where a.t = b.t or (char_length(b.t) >= 4 and starts_with(a.t, b.t))))
          or not exists (select 1 from a where not exists (
            select 1 from b where b.t = a.t or (char_length(a.t) >= 4 and starts_with(b.t, a.t)))))
$$;

-- =============================================================================
-- 2. Signalements et preuves : abonnés servis seulement
-- =============================================================================
create or replace function public.est_abonne_de(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients
    where entreprise_id = p_entreprise and user_id = auth.uid() and statut in ('actif', 'suspendu')
  )
$$;

revoke all on function public.est_abonne_de(uuid) from public, anon;
grant execute on function public.est_abonne_de(uuid) to authenticated;

drop policy if exists incidents_pc_insert on public.incidents_precollecte;
create policy incidents_pc_insert on public.incidents_precollecte for insert to authenticated
  with check (
    auteur_id = auth.uid()
    and ((source = 'precollecteur' and public.est_membre(entreprise_id))
         or (source = 'client' and public.est_abonne_de(entreprise_id)))
  );

drop policy if exists preuves_depot on storage.objects;
create policy preuves_depot on storage.objects for insert to authenticated
  with check (
    bucket_id = 'preuves'
    and split_part(name, '/', 2) = auth.uid()::text
    and (
      (public.est_membre(public.dossier_entreprise(name)) and public.depots_preuves_du_jour() < 60)
      or (public.est_abonne_de(public.dossier_entreprise(name)) and public.depots_preuves_du_jour() < 10)
    )
  );

-- =============================================================================
-- 3. Données de démonstration : avant la validation du dossier
-- =============================================================================
create or replace function public.clients_demo_avant_validation() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.est_demo and current_user in ('anon', 'authenticated') and not public.est_admin()
     and exists (select 1 from public.entreprises e
                 where e.id = new.entreprise_id and e.dossier_statut = 'valide') then
    raise exception 'Votre dossier est validé : les données de démonstration ne se créent plus.'
      using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.clients_demo_avant_validation() from public, anon;

drop trigger if exists clients_demo_avant_validation on public.clients;
create trigger clients_demo_avant_validation before insert on public.clients
  for each row execute function public.clients_demo_avant_validation();

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : « OK » sur les lignes 1 à 3.
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Quartiers : pas de correspondance par début de mot sous quatre lettres' as controle,
         not public.quartier_correspond('Bonamoussadi', 'Bo')
         and public.quartier_correspond('Nkolbisson', 'Nkol')
         and public.quartier_correspond('Mvog-Ada', 'Ada') as ok,
         'un mot court ne correspond qu''à un mot identique' as detail
  union all
  select 2, 'Signalements et preuves réservés aux abonnés servis',
         (select p.with_check like '%est_abonne_de%' from pg_policies p
           where p.schemaname = 'public' and p.tablename = 'incidents_precollecte' and p.policyname = 'incidents_pc_insert')
         and (select p.with_check like '%est_abonne_de%' from pg_policies p
               where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'preuves_depot'),
         'abonnement actif ou suspendu'
  union all
  select 3, 'Données de démonstration : avant la validation du dossier',
         exists (select 1 from pg_trigger
                  where tgrelid = 'public.clients'::regclass and tgname = 'clients_demo_avant_validation' and not tgisinternal),
         'elles restent supprimables'
) x order by n;
