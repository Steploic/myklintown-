-- =============================================================================
-- MyKlinTown — Retours de test de l'équipe (Julien MFOULOU 01/10, Pie MEYONG 30/09)
-- =============================================================================
--   R2  Communes : Yaoundé I → VII et Douala I → VI dans le référentiel unique.
--   R3  Plus d'impasse pour le ménage hors zone : sa demande est ENREGISTRÉE et
--       proposée aux précollecteurs, qui peuvent la prendre en charge.
--   R1  Demande d'accès Mairie : formulaire, statut « en cours », validation
--       par un administrateur MyKlinTown (qui promeut le compte).
--   R8  Noms harmonisés : « Initiale Majuscule » partout (existant + futur).
--   ++  Zones robustes : un tracé irrégulier (côtés qui se croisent) ne rend plus
--       une zone « invisible » à la recherche de précollecteur (ST_MakeValid).
--
-- Script ADDITIF et IDEMPOTENT. À exécuter APRÈS 20260928000004 et 000005.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- R2. Communes
-- -----------------------------------------------------------------------------
insert into public.communes (nom, code) values
  ('Yaoundé I', 'YDE1'), ('Yaoundé II', 'YDE2'), ('Yaoundé III', 'YDE3'), ('Yaoundé IV', 'YDE4'),
  ('Yaoundé V', 'YDE5'), ('Yaoundé VI', 'YDE6'), ('Yaoundé VII', 'YDE7'),
  ('Douala I', 'DLA1'), ('Douala II', 'DLA2'), ('Douala III', 'DLA3'),
  ('Douala IV', 'DLA4'), ('Douala V', 'DLA5'), ('Douala VI', 'DLA6')
on conflict (code) do nothing;

-- La liste des communes est publique : le formulaire « Accès Mairie » la
-- propose avant toute création de compte.
drop policy if exists "communes_read_public" on public.communes;
create policy "communes_read_public"
  on public.communes for select to anon
  using (true);
grant select on public.communes to anon;

-- -----------------------------------------------------------------------------
-- R8. Noms : même règle qu'à la saisie (lib/metier.ts → normaliserNom)
-- -----------------------------------------------------------------------------
create or replace function public.normaliser_nom(p text) returns text
language sql immutable as $$
  select nullif(initcap(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

update public.clients   set nom = public.normaliser_nom(nom)          where nom is distinct from public.normaliser_nom(nom);
update public.employes  set nom = public.normaliser_nom(nom)          where nom is distinct from public.normaliser_nom(nom);
update public.profiles  set nom_complet = public.normaliser_nom(nom_complet)
  where nom_complet is distinct from public.normaliser_nom(nom_complet) and public.normaliser_nom(nom_complet) is not null;

-- -----------------------------------------------------------------------------
-- Zones robustes : géométrie toujours valide pour les recherches
-- -----------------------------------------------------------------------------
create or replace function public.geom_zone(p_contour jsonb) returns geometry
language sql immutable set search_path = public, extensions as $$
  select ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(p_contour::text), 4326))
$$;

create or replace function public.precollecteurs_du_point(p_lat double precision, p_lng double precision)
returns table (zone_id uuid, zone_nom text, entreprise_id uuid, entreprise_nom text, entreprise_telephone text)
language sql stable security definer set search_path = public, extensions as $$
  select z.id, z.nom, e.id, e.nom, e.telephone
  from public.zones z
  join public.zone_affectations a on a.zone_id = z.id
  join public.entreprises e on e.id = a.entreprise_id and e.statut <> 'suspendu'
  where ST_Intersects(public.geom_zone(z.contour), ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  order by e.nom
$$;

create or replace function public.zone_du_point(p_lat double precision, p_lng double precision)
returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select z.id from public.zones z
  where ST_Intersects(public.geom_zone(z.contour), ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  limit 1
$$;

create or replace function public.zones_en_conflit(p_contour jsonb, p_exclure uuid default null)
returns table (id uuid, nom text, recouvrement_m2 double precision)
language sql stable security definer set search_path = public, extensions as $$
  with nouveau as (select public.geom_zone(p_contour) as g)
  select z.id, z.nom, ST_Area(ST_Intersection(public.geom_zone(z.contour), n.g)::geography)
  from public.zones z, nouveau n
  where (p_exclure is null or z.id <> p_exclure)
    and ST_Intersects(public.geom_zone(z.contour), n.g)
    and ST_Area(ST_Intersection(public.geom_zone(z.contour), n.g)::geography) > 50
$$;

-- -----------------------------------------------------------------------------
-- R3. Demandes d'abonnement sans précollecteur (file d'attente)
-- -----------------------------------------------------------------------------
create table if not exists public.demandes_abonnement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  plan_id uuid references public.plans_tarifaires(id),
  nom text not null,
  telephone text not null,
  adresse text,
  quartier text,
  lat double precision not null,
  lng double precision not null,
  zone_id uuid references public.zones(id) on delete set null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'prise', 'annulee')),
  entreprise_id uuid references public.entreprises(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  prise_at timestamptz
);
create unique index if not exists demandes_abonnement_une_en_attente
  on public.demandes_abonnement (user_id) where statut = 'en_attente';

alter table public.demandes_abonnement enable row level security;
-- Le ménage voit et annule SA demande ; personne d'autre ne lit la table
-- directement (les précollecteurs passent par une fonction qui masque nom et téléphone).
drop policy if exists demandes_abonnement_soi on public.demandes_abonnement;
create policy demandes_abonnement_soi on public.demandes_abonnement for select to authenticated
  using (user_id = auth.uid() or public.est_admin());
drop policy if exists demandes_abonnement_annuler on public.demandes_abonnement;
create policy demandes_abonnement_annuler on public.demandes_abonnement for update to authenticated
  using (user_id = auth.uid() and statut = 'en_attente')
  with check (user_id = auth.uid() and statut in ('en_attente', 'annulee'));

create or replace function public.deposer_demande_abonnement(
  p_plan uuid, p_nom text, p_telephone text, p_adresse text, p_quartier text,
  p_lat double precision, p_lng double precision
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from public.clients where user_id = auth.uid() and statut <> 'resilie') then
    raise exception 'Vous avez déjà un abonnement en cours';
  end if;
  if exists (select 1 from public.demandes_abonnement where user_id = auth.uid() and statut = 'en_attente') then
    raise exception 'Votre demande est déjà enregistrée : un précollecteur va la prendre en charge';
  end if;
  if coalesce(btrim(p_telephone), '') = '' then raise exception 'Le téléphone est obligatoire'; end if;

  insert into public.demandes_abonnement (user_id, plan_id, nom, telephone, adresse, quartier, lat, lng, zone_id)
  values (auth.uid(), p_plan, public.normaliser_nom(p_nom), btrim(p_telephone), nullif(btrim(p_adresse), ''),
          public.normaliser_nom(p_quartier), p_lat, p_lng, public.zone_du_point(p_lat, p_lng))
  returning id into v_id;
  return v_id;
end $$;

-- Vue des précollecteurs : PAS de nom ni de téléphone tant que la demande n'est pas prise.
create or replace function public.demandes_ouvertes()
returns table (id uuid, quartier text, adresse text, lat double precision, lng double precision,
               zone_nom text, plan_nom text, plan_prix integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.quartier, d.adresse, d.lat, d.lng, z.nom, p.nom, p.prix_fcfa, d.created_at
  from public.demandes_abonnement d
  left join public.zones z on z.id = d.zone_id
  left join public.plans_tarifaires p on p.id = d.plan_id
  where d.statut = 'en_attente'
    and (public.mon_entreprise() is not null or public.est_superviseur())
    -- ménage abonné entre-temps par un autre chemin (code client) : plus à proposer
    and not exists (select 1 from public.clients c where c.user_id = d.user_id and c.statut <> 'resilie')
  order by d.created_at
$$;

-- Le précollecteur prend la demande : le ménage devient SON client (actif).
create or replace function public.prendre_demande(p_demande uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ent uuid := public.mon_entreprise();
  d public.demandes_abonnement;
  v_client uuid;
begin
  if v_ent is null then raise exception 'Réservé aux précollecteurs' using errcode = '42501'; end if;
  select * into d from public.demandes_abonnement where id = p_demande for update;
  if not found or d.statut <> 'en_attente' then raise exception 'Cette demande a déjà été prise en charge'; end if;
  if exists (select 1 from public.clients where user_id = d.user_id and statut <> 'resilie') then
    -- (une mise à jour ici serait annulée avec l'exception : la demande reste
    -- visible jusqu'à ce que le ménage la retire, ce qui est sans danger)
    raise exception 'Ce ménage est déjà abonné ailleurs';
  end if;

  insert into public.clients (entreprise_id, user_id, nom, telephone, adresse, quartier, lat, lng, zone_id, plan_id, statut)
  values (v_ent, d.user_id, d.nom, d.telephone, d.adresse, d.quartier, d.lat, d.lng, d.zone_id, d.plan_id, 'actif')
  returning id into v_client;

  update public.demandes_abonnement
     set statut = 'prise', entreprise_id = v_ent, client_id = v_client, prise_at = now()
   where id = d.id;
  return v_client;
end $$;

-- -----------------------------------------------------------------------------
-- R1. Demandes d'accès Mairie
-- -----------------------------------------------------------------------------
create table if not exists public.demandes_acces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  commune_id uuid references public.communes(id) on delete set null,
  fonction text not null,
  service text,
  telephone text,
  message text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'acceptee', 'refusee', 'annulee')),
  created_at timestamptz not null default now(),
  traitee_at timestamptz,
  traitee_par uuid references public.profiles(id) on delete set null
);
create unique index if not exists demandes_acces_une_en_attente
  on public.demandes_acces (user_id) where statut = 'en_attente';

alter table public.demandes_acces enable row level security;
drop policy if exists demandes_acces_lecture on public.demandes_acces;
create policy demandes_acces_lecture on public.demandes_acces for select to authenticated
  using (user_id = auth.uid() or public.est_admin());

create or replace function public.demander_acces_mairie(
  p_commune uuid, p_fonction text, p_service text, p_telephone text, p_message text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if public.role_courant() in ('mairie', 'admin') then raise exception 'Ce compte a déjà un accès Mairie'; end if;
  if coalesce(btrim(p_fonction), '') = '' then raise exception 'Indiquez votre fonction'; end if;
  if exists (select 1 from public.demandes_acces where user_id = auth.uid() and statut = 'en_attente') then
    raise exception 'Votre demande est déjà en cours de traitement';
  end if;
  insert into public.demandes_acces (user_id, commune_id, fonction, service, telephone, message)
  values (auth.uid(), p_commune, btrim(p_fonction), nullif(btrim(p_service), ''), nullif(btrim(p_telephone), ''), nullif(btrim(p_message), ''))
  returning id into v_id;
  return v_id;
end $$;

-- L'auteur peut retirer sa demande tant qu'elle n'est pas traitée.
create or replace function public.annuler_demande_acces() returns void
language sql security definer set search_path = public as $$
  update public.demandes_acces set statut = 'annulee'
   where user_id = auth.uid() and statut = 'en_attente'
$$;

-- Validation par un administrateur MyKlinTown : promotion du compte en « mairie ».
create or replace function public.traiter_demande_acces(p_demande uuid, p_accepter boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.demandes_acces;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs MyKlinTown' using errcode = '42501'; end if;
  select * into d from public.demandes_acces where id = p_demande for update;
  if not found or d.statut <> 'en_attente' then raise exception 'Demande introuvable ou déjà traitée'; end if;
  update public.demandes_acces
     set statut = case when p_accepter then 'acceptee' else 'refusee' end,
         traitee_at = now(), traitee_par = auth.uid()
   where id = d.id;
  if p_accepter then
    update public.profiles set role = 'mairie' where id = d.user_id;
  end if;
end $$;

create or replace function public.demandes_acces_a_traiter()
returns table (id uuid, nom text, email text, telephone text, fonction text, service text,
               commune text, message text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, p.nom_complet, p.email, d.telephone, d.fonction, d.service, c.nom, d.message, d.created_at
  from public.demandes_acces d
  join public.profiles p on p.id = d.user_id
  left join public.communes c on c.id = d.commune_id
  where d.statut = 'en_attente' and public.est_admin()
  order by d.created_at
$$;

-- Supervision Mairie : demandes sans précollecteur (agrégées, sans identité).
create or replace function public.supervision_demandes()
returns table (quartier text, zone_nom text, nombre bigint, plus_ancienne timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(d.quartier, '—'), z.nom, count(*), min(d.created_at)
  from public.demandes_abonnement d
  left join public.zones z on z.id = d.zone_id
  where d.statut = 'en_attente' and public.est_superviseur()
  group by 1, 2
  order by 3 desc
$$;

-- Droits
revoke all on function public.deposer_demande_abonnement(uuid, text, text, text, text, double precision, double precision) from public, anon;
revoke all on function public.demandes_ouvertes() from public, anon;
revoke all on function public.prendre_demande(uuid) from public, anon;
revoke all on function public.demander_acces_mairie(uuid, text, text, text, text) from public, anon;
revoke all on function public.traiter_demande_acces(uuid, boolean) from public, anon;
revoke all on function public.annuler_demande_acces() from public, anon;
revoke all on function public.demandes_acces_a_traiter() from public, anon;
revoke all on function public.supervision_demandes() from public, anon;
grant execute on function public.deposer_demande_abonnement(uuid, text, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.demandes_ouvertes() to authenticated;
grant execute on function public.prendre_demande(uuid) to authenticated;
grant execute on function public.demander_acces_mairie(uuid, text, text, text, text) to authenticated;
grant execute on function public.traiter_demande_acces(uuid, boolean) to authenticated;
grant execute on function public.annuler_demande_acces() to authenticated;
grant execute on function public.demandes_acces_a_traiter() to authenticated;
grant execute on function public.supervision_demandes() to authenticated;

-- Contrôle : 13 communes au moins, 2 nouvelles tables sous RLS.
select (select count(*) from public.communes) as communes,
       (select relrowsecurity from pg_class where relname = 'demandes_abonnement') as rls_demandes_abonnement,
       (select relrowsecurity from pg_class where relname = 'demandes_acces') as rls_demandes_acces;
