-- =============================================================================
-- MyKlinTown — SETUP COMPLET (à coller en une fois dans le SQL Editor Supabase)
-- Concaténation de : 20260526000001_init.sql + 20260530000002_features...sql
-- =============================================================================
--
-- ⚠️ CE FICHIER NE REFLÈTE PLUS À LUI SEUL L'ÉTAT DE LA BASE.
--    Il s'arrête à la migration du 30/05/2026. Depuis, la migration
--    20260831000003_securite_rls_et_roles.sql (= supabase/setup_rls.sql) a été
--    appliquée en production le 2026-08-31 et REMPLACE deux objets définis ici :
--      • handle_new_user()      — ne concède plus que 'citoyen' et 'enterprise'
--      • profiles_update_own    — reçoit un `with check`, et un déclencheur
--                                 interdit qu'un compte change son propre rôle
--    Elle ajoute aussi les politiques manquantes sur 15 tables.
--    👉 Lire les deux fichiers ensemble. Ne jamais rejouer celui-ci sur une
--       base déjà installée : aucun `create` n'y porte de `if not exists`.
-- =============================================================================

-- =============================================================================
-- MyKlinTown — Schéma initial
-- =============================================================================
-- Couvre les entités du cahier des charges V2 :
--   ménages, structures, abonnements, paiements, bacs, capteurs IoT,
--   camions, tournées, scans, signalements, marketplace, stock entrepôt.
--
-- Convention :
--   - id en UUID (gen_random_uuid)
--   - timestamps : created_at / updated_at avec triggers
--   - géolocalisation : PostGIS geography(POINT, 4326)
--   - Row Level Security activée partout
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

-- =============================================================================
-- Helpers
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- Profils utilisateur (étend auth.users)
-- =============================================================================

create type user_role as enum ('citoyen', 'collecteur', 'mairie', 'enterprise', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  telephone text,
  nom_complet text not null,
  role user_role not null default 'citoyen',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nom_complet, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nom_complet', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'citoyen')
  );
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =============================================================================
-- Géographie
-- =============================================================================

create table public.communes (
  id uuid primary key default uuid_generate_v4(),
  nom text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.secteurs (
  id uuid primary key default uuid_generate_v4(),
  commune_id uuid not null references public.communes(id) on delete cascade,
  nom text not null,
  polygone geography(POLYGON, 4326),
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Structures de pré-collecte
-- =============================================================================

create type type_structure as enum ('pre_collecte', 'ecole', 'b2b', 'mairie');

create table public.structures (
  id uuid primary key default uuid_generate_v4(),
  nom text not null,
  type type_structure not null,
  secteur_id uuid references public.secteurs(id),
  contact_nom text,
  contact_telephone text,
  nb_menages_couverts int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger structures_updated_at
before update on public.structures
for each row execute function public.set_updated_at();

-- =============================================================================
-- Ménages
-- =============================================================================

create type statut_abonnement as enum ('actif', 'expire', 'en_attente', 'suspendu', 'test');

create table public.menages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  nom_foyer text not null,
  telephone text not null,
  localisation geography(POINT, 4326) not null,
  adresse_textuelle text,
  secteur_id uuid references public.secteurs(id),
  structure_id uuid references public.structures(id),
  qr_code_id text not null unique,
  statut_abonnement statut_abonnement not null default 'test',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menages_localisation_gix on public.menages using gist (localisation);
create index menages_secteur_idx on public.menages (secteur_id);
create index menages_statut_idx on public.menages (statut_abonnement);

create trigger menages_updated_at
before update on public.menages
for each row execute function public.set_updated_at();

-- =============================================================================
-- Abonnements & Paiements
-- =============================================================================

create type formule_abonnement as enum ('mensuel', 'trimestriel', 'annuel');
create type statut_solvabilite as enum ('a_jour', 'en_retard', 'critique');

create table public.abonnements (
  id uuid primary key default uuid_generate_v4(),
  menage_id uuid not null references public.menages(id) on delete cascade,
  formule formule_abonnement not null,
  montant_fcfa int not null,
  date_debut date not null,
  date_fin date not null,
  statut_solvabilite statut_solvabilite not null default 'a_jour',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index abonnements_menage_idx on public.abonnements (menage_id);
create index abonnements_solvabilite_idx on public.abonnements (statut_solvabilite);

create trigger abonnements_updated_at
before update on public.abonnements
for each row execute function public.set_updated_at();

create type methode_paiement as enum ('mtn_momo', 'orange_money', 'especes', 'virement');
create type statut_paiement as enum ('en_attente', 'reussi', 'echoue', 'rembourse');

create table public.paiements (
  id uuid primary key default uuid_generate_v4(),
  abonnement_id uuid references public.abonnements(id) on delete set null,
  menage_id uuid not null references public.menages(id) on delete cascade,
  montant_fcfa int not null,
  methode methode_paiement not null,
  reference_externe text,
  statut statut_paiement not null default 'en_attente',
  created_at timestamptz not null default now()
);

create index paiements_menage_idx on public.paiements (menage_id);
create index paiements_statut_idx on public.paiements (statut);

-- =============================================================================
-- Bacs & IoT
-- =============================================================================

create type type_bac as enum ('residentiel', 'scolaire', 'b2b', 'public');
create type niveau_remplissage as enum ('vide', 'partiel', 'plein', 'deborde');

create table public.bacs (
  id uuid primary key default uuid_generate_v4(),
  qr_code_id text unique,
  type type_bac not null,
  localisation geography(POINT, 4326) not null,
  capacite_litres int not null default 240,
  niveau_remplissage niveau_remplissage not null default 'vide',
  pourcentage_remplissage int,
  menage_id uuid references public.menages(id) on delete set null,
  structure_id uuid references public.structures(id) on delete set null,
  last_capteur_update timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bacs_localisation_gix on public.bacs using gist (localisation);
create index bacs_niveau_idx on public.bacs (niveau_remplissage);

create trigger bacs_updated_at
before update on public.bacs
for each row execute function public.set_updated_at();

create type reseau_iot as enum ('lorawan', 'gprs', 'wifi');

create table public.capteurs_iot (
  id uuid primary key default uuid_generate_v4(),
  bac_id uuid not null references public.bacs(id) on delete cascade,
  modele text not null,
  microcontroleur text not null,
  reseau reseau_iot not null,
  batterie_pct int,
  online boolean not null default false,
  last_ping timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Camions & Tournées
-- =============================================================================

create type statut_camion as enum ('disponible', 'en_tournee', 'maintenance', 'hors_service');

create table public.camions (
  id uuid primary key default uuid_generate_v4(),
  immatriculation text not null unique,
  capacite_tonnes numeric(5,2) not null,
  modele text,
  chauffeur_user_id uuid references public.profiles(id) on delete set null,
  statut statut_camion not null default 'disponible',
  position_actuelle geography(POINT, 4326),
  last_position_update timestamptz,
  boitier_gps_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger camions_updated_at
before update on public.camions
for each row execute function public.set_updated_at();

create type creneau_tournee as enum ('matin', 'soir');
create type statut_tournee as enum ('planifiee', 'en_cours', 'terminee', 'annulee');

create table public.tournees (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  creneau creneau_tournee not null,
  camion_id uuid not null references public.camions(id),
  secteur_id uuid references public.secteurs(id),
  collecteur_user_id uuid references public.profiles(id),
  parcours_planifie geography(LINESTRING, 4326),
  parcours_effectue geography(LINESTRING, 4326),
  menages_a_collecter uuid[] default '{}',
  statut statut_tournee not null default 'planifiee',
  tonnage_collecte_kg numeric(10,2),
  duree_minutes int,
  km_parcourus numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tournees_date_idx on public.tournees (date);
create index tournees_statut_idx on public.tournees (statut);

create trigger tournees_updated_at
before update on public.tournees
for each row execute function public.set_updated_at();

create type type_scan as enum ('collecte_ok', 'bac_vide', 'absent', 'inaccessible');

create table public.scans (
  id uuid primary key default uuid_generate_v4(),
  tournee_id uuid not null references public.tournees(id) on delete cascade,
  menage_id uuid references public.menages(id),
  bac_id uuid references public.bacs(id),
  type type_scan not null,
  localisation geography(POINT, 4326),
  photo_url text,
  notes text,
  scanned_at timestamptz not null default now(),
  sync_offline boolean not null default false,
  created_at timestamptz not null default now()
);

create index scans_tournee_idx on public.scans (tournee_id);
create index scans_menage_idx on public.scans (menage_id);
create index scans_scanned_at_idx on public.scans (scanned_at desc);

-- =============================================================================
-- Signalements citoyens
-- =============================================================================

create type type_signalement as enum ('bac_plein', 'depot_sauvage', 'retard_collecte', 'incident_collecteur');
create type statut_signalement as enum ('nouveau', 'en_traitement', 'resolu', 'rejete');

create table public.signalements (
  id uuid primary key default uuid_generate_v4(),
  auteur_user_id uuid not null references public.profiles(id) on delete cascade,
  type type_signalement not null,
  localisation geography(POINT, 4326) not null,
  description text,
  photo_url text,
  statut statut_signalement not null default 'nouveau',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references public.profiles(id)
);

create index signalements_statut_idx on public.signalements (statut);
create index signalements_loc_gix on public.signalements using gist (localisation);

-- =============================================================================
-- Rapports QHSE
-- =============================================================================

create table public.rapports_qhse (
  id uuid primary key default uuid_generate_v4(),
  tournee_id uuid not null references public.tournees(id) on delete cascade,
  collecteur_user_id uuid not null references public.profiles(id),
  epi_porte boolean not null default true,
  incidents text,
  ressources_manquantes text,
  photo_urls text[] default '{}',
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Marketplace & Recyclage (B2B)
-- =============================================================================

create type type_dechet as enum ('plastique', 'metal', 'papier_carton', 'verre', 'organique', 'electronique');

create table public.recycleurs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  raison_sociale text not null,
  types_dechets_acceptes type_dechet[] not null default '{}',
  adresse text,
  localisation geography(POINT, 4326),
  contact_nom text,
  contact_telephone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recycleurs_updated_at
before update on public.recycleurs
for each row execute function public.set_updated_at();

create type statut_article as enum ('en_vente', 'rupture', 'archive');
create type unite_vente as enum ('kg', 'tonne', 'piece');

create table public.articles_marketplace (
  id uuid primary key default uuid_generate_v4(),
  recycleur_id uuid not null references public.recycleurs(id) on delete cascade,
  nom text not null,
  description text,
  type_dechet_origine type_dechet not null,
  prix_unitaire_fcfa int not null,
  unite unite_vente not null default 'kg',
  stock_disponible numeric(12,2) not null default 0,
  photos text[] default '{}',
  statut statut_article not null default 'en_vente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index articles_marketplace_statut_idx on public.articles_marketplace (statut);

create trigger articles_marketplace_updated_at
before update on public.articles_marketplace
for each row execute function public.set_updated_at();

create type statut_demande as enum ('nouvelle', 'acceptee', 'en_cours', 'terminee', 'annulee');

create table public.demandes_collecte (
  id uuid primary key default uuid_generate_v4(),
  demandeur_user_id uuid not null references public.profiles(id) on delete cascade,
  recycleur_id uuid references public.recycleurs(id),
  type_dechet type_dechet not null,
  volume_estime_kg numeric(10,2) not null,
  localisation geography(POINT, 4326) not null,
  date_souhaitee date not null,
  statut statut_demande not null default 'nouvelle',
  prix_propose_fcfa int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index demandes_collecte_statut_idx on public.demandes_collecte (statut);

create trigger demandes_collecte_updated_at
before update on public.demandes_collecte
for each row execute function public.set_updated_at();

-- =============================================================================
-- Stock entrepôt
-- =============================================================================

create type type_mouvement as enum ('entree', 'sortie');

create table public.mouvements_stock (
  id uuid primary key default uuid_generate_v4(),
  type type_mouvement not null,
  type_dechet type_dechet not null,
  quantite_kg numeric(10,2) not null,
  source_tournee_id uuid references public.tournees(id),
  destination_recycleur_id uuid references public.recycleurs(id),
  prix_unitaire_fcfa int,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references public.profiles(id)
);

create index mouvements_stock_type_idx on public.mouvements_stock (type, type_dechet);

-- =============================================================================
-- Gamification
-- =============================================================================

create table public.profils_gamification (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  points_totaux int not null default 0,
  niveau int not null default 1,
  badges text[] default '{}',
  updated_at timestamptz not null default now()
);

create trigger profils_gamification_updated_at
before update on public.profils_gamification
for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================
-- Politique générale : les utilisateurs ne voient que leurs propres données,
-- sauf les rôles mairie/admin qui voient tout en lecture.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.menages enable row level security;
alter table public.abonnements enable row level security;
alter table public.paiements enable row level security;
alter table public.bacs enable row level security;
alter table public.tournees enable row level security;
alter table public.scans enable row level security;
alter table public.signalements enable row level security;
alter table public.rapports_qhse enable row level security;
alter table public.recycleurs enable row level security;
alter table public.articles_marketplace enable row level security;
alter table public.demandes_collecte enable row level security;
alter table public.mouvements_stock enable row level security;
alter table public.profils_gamification enable row level security;

-- Helper : récupérer le rôle de l'utilisateur courant
create or replace function public.current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Profil : chacun voit/modifie le sien, mairie/admin voient tout
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.current_user_role() in ('mairie', 'admin'));

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Ménages : citoyen voit le sien, mairie/admin voient tout, collecteurs voient ceux assignés
create policy "menages_read_role_based"
  on public.menages for select
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('mairie', 'admin', 'collecteur')
  );

-- Articles marketplace : lecture publique (toute personne authentifiée)
create policy "articles_marketplace_public_read"
  on public.articles_marketplace for select
  using (true);

create policy "articles_marketplace_owner_write"
  on public.articles_marketplace for all
  using (
    exists (
      select 1 from public.recycleurs r
      where r.id = articles_marketplace.recycleur_id and r.user_id = auth.uid()
    )
  );

-- Signalements : auteur écrit/lit, mairie lit tout
create policy "signalements_owner_or_mairie"
  on public.signalements for select
  using (auteur_user_id = auth.uid() or public.current_user_role() in ('mairie', 'admin'));

create policy "signalements_owner_insert"
  on public.signalements for insert
  with check (auteur_user_id = auth.uid());

-- D'autres policies (paiements, tournées, etc.) seront ajoutées au fur et à mesure.


-- =============================================================================
-- MyKlinTown — Features : incidents terrain collecteur + RPC géolocalisées
-- =============================================================================
-- Ajoute :
--   1. La table `incidents_terrain` (incidents opérationnels du collecteur)
--   2. Une RPC `create_signalement` pour insérer un signalement citoyen avec
--      coordonnées lat/lng (encapsule la conversion PostGIS)
--   3. Une RPC `create_incident_terrain` équivalente pour le collecteur
--
-- Les RPC s'exécutent en `security invoker` → les politiques RLS s'appliquent,
-- et `auth.uid()` renvoie l'utilisateur appelant. Elles renvoient l'UUID créé
-- (pas la ligne complète) pour éviter les soucis de sérialisation des colonnes
-- geography via PostgREST.
-- =============================================================================

-- =============================================================================
-- 1. Incidents terrain (collecteur)
-- =============================================================================

create type type_incident_terrain as enum (
  'bac_detruit',
  'bac_inaccessible',
  'bac_introuvable',
  'camion_panne',
  'accident',
  'autre'
);

create type statut_incident as enum ('transmis', 'en_traitement', 'resolu');

create table public.incidents_terrain (
  id uuid primary key default uuid_generate_v4(),
  collecteur_user_id uuid not null references public.profiles(id) on delete cascade,
  type type_incident_terrain not null,
  description text,
  localisation geography(POINT, 4326),
  photo_url text,
  statut statut_incident not null default 'transmis',
  created_at timestamptz not null default now()
);

create index incidents_terrain_statut_idx on public.incidents_terrain (statut);
create index incidents_terrain_auteur_idx on public.incidents_terrain (collecteur_user_id);
create index incidents_terrain_created_idx on public.incidents_terrain (created_at desc);

alter table public.incidents_terrain enable row level security;

-- Le collecteur lit/écrit les siens ; mairie & admin voient tout.
create policy "incidents_terrain_owner_or_mairie"
  on public.incidents_terrain for select
  using (
    collecteur_user_id = auth.uid()
    or public.current_user_role() in ('mairie', 'admin')
  );

create policy "incidents_terrain_owner_insert"
  on public.incidents_terrain for insert
  with check (collecteur_user_id = auth.uid());

-- =============================================================================
-- 2. RPC — créer un signalement citoyen (avec coordonnées)
-- =============================================================================

create or replace function public.create_signalement(
  p_type type_signalement,
  p_lat double precision,
  p_lng double precision,
  p_description text default null,
  p_photo_url text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.signalements (auteur_user_id, type, localisation, description, photo_url)
  values (
    auth.uid(),
    p_type,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_description,
    p_photo_url
  )
  returning id into v_id;
  return v_id;
end $$;

-- =============================================================================
-- 3. RPC — créer un incident terrain collecteur (localisation optionnelle)
-- =============================================================================

create or replace function public.create_incident_terrain(
  p_type type_incident_terrain,
  p_lat double precision default null,
  p_lng double precision default null,
  p_description text default null,
  p_photo_url text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_loc geography(POINT, 4326);
begin
  if p_lat is not null and p_lng is not null then
    v_loc := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  else
    v_loc := null;
  end if;

  insert into public.incidents_terrain (collecteur_user_id, type, localisation, description, photo_url)
  values (auth.uid(), p_type, v_loc, p_description, p_photo_url)
  returning id into v_id;
  return v_id;
end $$;
