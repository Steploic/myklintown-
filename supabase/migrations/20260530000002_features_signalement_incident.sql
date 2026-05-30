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
