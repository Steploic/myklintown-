-- =============================================================================
-- MyKlinTown — Pivot « précollecteurs » (réunion du 26/09/2026)
-- =============================================================================
-- Le cœur de la plateforme devient l'entreprise de précollecte : ses clients,
-- ses factures, sa flotte, ses tournées, ses preuves de terrain. La Mairie
-- découpe le territoire en zones et supervise ; le ménage (client) s'abonne
-- auprès du précollecteur de sa zone, sur la grille tarifaire unifiée.
--
-- Script ADDITIF et IDEMPOTENT : il ne touche à aucune table existante (sauf
-- la fonction d'inscription `handle_new_user`, réécrite pour accepter le rôle
-- `precollecteur`). Il peut être rejoué sans risque dans le SQL Editor.
--
-- Ordre : ce script s'exécute APRÈS `setup_rls.sql` (qui définit
-- `current_user_role()` durci et le garde-fou de rôle).
--
-- Remarque sur l'enum : la nouvelle valeur `precollecteur` est ajoutée en tête.
-- Postgres interdit d'utiliser une valeur d'enum dans la transaction qui l'a
-- créée ; tout ce qui suit compare donc les rôles en TEXTE
-- (`current_user_role()::text`), jamais par littéral d'enum.
-- =============================================================================

alter type public.user_role add value if not exists 'precollecteur';

-- =============================================================================
-- 0. Fonctions utilitaires de droits
-- =============================================================================

create or replace function public.role_courant() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid()
$$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.role_courant() = 'admin', false)
$$;

create or replace function public.est_superviseur() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.role_courant() in ('mairie', 'admin'), false)
$$;

-- =============================================================================
-- 1. Grille tarifaire unifiée + paramètres plateforme
-- =============================================================================

create table if not exists public.plans_tarifaires (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  nom text not null,
  description text,
  duree_mois int not null check (duree_mois > 0),
  prix_fcfa int not null check (prix_fcfa >= 0),
  passages_semaine int not null default 2 check (passages_semaine between 1 and 7),
  avantages text[] not null default '{}',
  ordre int not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists plans_tarifaires_updated_at on public.plans_tarifaires;
create trigger plans_tarifaires_updated_at before update on public.plans_tarifaires
for each row execute function public.set_updated_at();

-- Grille PROPOSÉE dans la planification pilote (hypothèse H1, décision D1 en attente).
-- Modifiable ici par un admin : l'application ne code aucun prix en dur.
insert into public.plans_tarifaires (code, nom, description, duree_mois, prix_fcfa, passages_semaine, avantages, ordre) values
  ('MENSUEL', 'Mensuel', 'La formule de référence, sans engagement.', 1, 3500, 2,
     array['Collecte 2 fois par semaine', 'Suivi des passages dans l''application', 'Signalement avec photo'], 1),
  ('TRIMESTRIEL', 'Trimestriel', 'Trois mois de collecte, 10 % moins cher.', 3, 9500, 2,
     array['Collecte 2 fois par semaine', 'Support prioritaire', 'Économie de 10 %'], 2),
  ('ANNUEL', 'Annuel', 'Une année complète, 17 % moins cher.', 12, 35000, 2,
     array['Collecte 2 fois par semaine', 'Bac fourni', 'Économie de 17 %'], 3)
on conflict (code) do nothing;

create table if not exists public.parametres_plateforme (
  cle text primary key,
  valeur jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.parametres_plateforme (cle, valeur, description) values
  ('commission_taux', '0.10', 'Commission MyKlinTown sur les encaissements du précollecteur. Fourchette 10-15 % (réunion du 26/09/2026) — à valider pendant le pilote.'),
  ('rappel_echeance_jours', '7', 'Nombre de jours avant la fin de couverture à partir duquel un abonnement est signalé « à échéance ».'),
  ('delai_grace_jours', '7', 'Jours de tolérance après l''échéance d''une facture avant de la considérer en retard (décision D6).')
on conflict (cle) do nothing;

-- =============================================================================
-- 2. Territoire : communes supplémentaires + zones de collecte
-- =============================================================================

insert into public.communes (nom, code) values ('Yaoundé IV', 'YDE4')
on conflict (code) do nothing;

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  commune_id uuid references public.communes(id) on delete set null,
  nom text not null,
  couleur text not null default '#2E7F8E',
  -- Géométrie GeoJSON { "type": "Polygon", "coordinates": [[[lng, lat], ...]] }
  contour jsonb not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists zones_updated_at on public.zones;
create trigger zones_updated_at before update on public.zones
for each row execute function public.set_updated_at();

-- =============================================================================
-- 3. Entreprises de précollecte et leurs membres
-- =============================================================================

create table if not exists public.entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text,
  email text,
  siege text,
  commune_id uuid references public.communes(id) on delete set null,
  statut text not null default 'essai' check (statut in ('essai', 'actif', 'suspendu')),
  proprietaire_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists entreprises_updated_at on public.entreprises;
create trigger entreprises_updated_at before update on public.entreprises
for each row execute function public.set_updated_at();

create table if not exists public.entreprise_membres (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_membre text not null default 'gerant' check (role_membre in ('gerant', 'agent')),
  created_at timestamptz not null default now(),
  primary key (entreprise_id, user_id)
);

create or replace function public.est_membre(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entreprise_membres
    where entreprise_id = p_entreprise and user_id = auth.uid()
  )
$$;

create or replace function public.mon_entreprise() returns uuid
language sql stable security definer set search_path = public as $$
  select entreprise_id from public.entreprise_membres
  where user_id = auth.uid() order by created_at limit 1
$$;

create table if not exists public.zone_affectations (
  zone_id uuid not null references public.zones(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (zone_id, entreprise_id)
);

-- =============================================================================
-- 4. Flotte et employés
-- =============================================================================

create table if not exists public.employes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  nom text not null,
  telephone text,
  fonction text not null default 'collecteur' check (fonction in ('chauffeur', 'collecteur', 'superviseur', 'autre')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists employes_entreprise_idx on public.employes (entreprise_id);

create table if not exists public.tricycles (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  nom text not null,
  immatriculation text,
  capacite_kg int,
  statut text not null default 'actif' check (statut in ('actif', 'maintenance', 'hors_service')),
  created_at timestamptz not null default now()
);
create index if not exists tricycles_entreprise_idx on public.tricycles (entreprise_id);

create table if not exists public.tricycle_employes (
  tricycle_id uuid not null references public.tricycles(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete cascade,
  primary key (tricycle_id, employe_id)
);

-- =============================================================================
-- 5. Clients (ménages abonnés auprès d'un précollecteur)
-- =============================================================================

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  code text not null unique
    default ('MKT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  nom text not null,
  telephone text,
  email text,
  adresse text,
  quartier text,
  lat double precision,
  lng double precision,
  zone_id uuid references public.zones(id) on delete set null,
  plan_id uuid references public.plans_tarifaires(id),
  statut text not null default 'actif' check (statut in ('demande', 'actif', 'suspendu', 'resilie')),
  notes text,
  est_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_entreprise_idx on public.clients (entreprise_id);
create index if not exists clients_user_idx on public.clients (user_id);
create index if not exists clients_zone_idx on public.clients (zone_id);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();

create or replace function public.est_client_de(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients where entreprise_id = p_entreprise and user_id = auth.uid()
  )
$$;

-- =============================================================================
-- 6. Facturation : factures, paiements, relances
-- =============================================================================

create sequence if not exists public.factures_numero_seq;

create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  numero text not null unique
    default ('F' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.factures_numero_seq')::text, 5, '0')),
  plan_id uuid references public.plans_tarifaires(id),
  libelle text,
  periode_debut date not null,
  periode_fin date not null,
  montant_fcfa int not null check (montant_fcfa >= 0),
  echeance date not null,
  statut text not null default 'emise' check (statut in ('emise', 'payee', 'annulee')),
  created_at timestamptz not null default now(),
  check (periode_fin >= periode_debut)
);
create index if not exists factures_entreprise_idx on public.factures (entreprise_id, statut);
create index if not exists factures_client_idx on public.factures (client_id);

create table if not exists public.paiements_clients (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  montant_fcfa int not null check (montant_fcfa > 0),
  methode text not null default 'especes' check (methode in ('especes', 'mtn_momo', 'orange_money', 'virement')),
  reference text,
  encaisse_par uuid references public.employes(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists paiements_clients_entreprise_idx on public.paiements_clients (entreprise_id, created_at desc);
create index if not exists paiements_clients_facture_idx on public.paiements_clients (facture_id);

-- Le statut « payée » se DÉDUIT des encaissements : personne ne le coche à la main.
create or replace function public.maj_statut_facture() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_facture uuid := coalesce(new.facture_id, old.facture_id);
  v_total int;
begin
  select coalesce(sum(montant_fcfa), 0) into v_total
  from public.paiements_clients where facture_id = v_facture;

  update public.factures f
     set statut = case when v_total >= f.montant_fcfa then 'payee' else 'emise' end
   where f.id = v_facture and f.statut <> 'annulee';
  return null;
end $$;

drop trigger if exists paiements_clients_statut on public.paiements_clients;
create trigger paiements_clients_statut
after insert or update or delete on public.paiements_clients
for each row execute function public.maj_statut_facture();

create table if not exists public.relances (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid references public.factures(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  canal text not null check (canal in ('whatsapp', 'sms', 'appel', 'visite')),
  niveau int not null default 1,
  message text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists relances_entreprise_idx on public.relances (entreprise_id, created_at desc);

-- =============================================================================
-- 7. Tournées et collectes
-- =============================================================================

create table if not exists public.tournees_precollecte (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  date date not null default current_date,
  zone_id uuid references public.zones(id) on delete set null,
  tricycle_id uuid references public.tricycles(id) on delete set null,
  employe_id uuid references public.employes(id) on delete set null,
  statut text not null default 'planifiee' check (statut in ('planifiee', 'en_cours', 'terminee', 'annulee')),
  debut_at timestamptz,
  fin_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists tournees_pc_entreprise_idx on public.tournees_precollecte (entreprise_id, date desc);

create table if not exists public.collectes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  tournee_id uuid references public.tournees_precollecte(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  date_prevue date not null default current_date,
  statut text not null default 'prevue' check (statut in ('prevue', 'realisee', 'non_realisee')),
  motif text,
  realisee_at timestamptz,
  employe_id uuid references public.employes(id) on delete set null,
  confirmation_client text check (confirmation_client in ('confirmee', 'contestee')),
  confirmation_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournee_id, client_id)
);
create index if not exists collectes_entreprise_idx on public.collectes (entreprise_id, date_prevue desc);
create index if not exists collectes_client_idx on public.collectes (client_id, date_prevue desc);

-- =============================================================================
-- 8. Incidents avec preuve photo / vidéo
-- =============================================================================

create table if not exists public.incidents_precollecte (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  collecte_id uuid references public.collectes(id) on delete set null,
  tournee_id uuid references public.tournees_precollecte(id) on delete set null,
  auteur_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  source text not null check (source in ('precollecteur', 'client')),
  categorie text not null,
  description text,
  media_path text,
  media_type text check (media_type in ('photo', 'video')),
  capture_at timestamptz,
  lat double precision,
  lng double precision,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'en_cours', 'resolu')),
  created_at timestamptz not null default now()
);
create index if not exists incidents_pc_entreprise_idx on public.incidents_precollecte (entreprise_id, created_at desc);

-- =============================================================================
-- 9. Vue : statut d'abonnement CALCULÉ (jamais saisi)
-- =============================================================================

create or replace view public.v_clients_statut with (security_invoker = true) as
select
  c.*,
  p.nom as plan_nom,
  p.prix_fcfa as plan_prix,
  p.duree_mois as plan_duree_mois,
  z.nom as zone_nom,
  cov.couverture_fin,
  coalesce(imp.nb_impayees, 0) as nb_impayees,
  coalesce(imp.montant_impaye, 0) as montant_impaye,
  imp.plus_ancienne_echeance,
  case
    when c.statut in ('demande', 'suspendu', 'resilie') then c.statut
    when coalesce(imp.nb_retard, 0) > 0 then 'impaye'
    when cov.couverture_fin is null then 'sans_facture'
    when cov.couverture_fin < current_date then 'expire'
    when cov.couverture_fin <= current_date + 7 then 'echeance_proche'
    else 'a_jour'
  end as statut_abonnement
from public.clients c
left join public.plans_tarifaires p on p.id = c.plan_id
left join public.zones z on z.id = c.zone_id
left join lateral (
  select max(f.periode_fin) as couverture_fin
  from public.factures f where f.client_id = c.id and f.statut = 'payee'
) cov on true
left join lateral (
  select count(*) as nb_impayees,
         sum(f.montant_fcfa - coalesce((select sum(pc.montant_fcfa) from public.paiements_clients pc where pc.facture_id = f.id), 0)) as montant_impaye,
         min(f.echeance) as plus_ancienne_echeance,
         count(*) filter (where f.echeance < current_date) as nb_retard
  from public.factures f where f.client_id = c.id and f.statut = 'emise'
) imp on true;

-- =============================================================================
-- 10. Row Level Security
-- =============================================================================

alter table public.plans_tarifaires enable row level security;
alter table public.parametres_plateforme enable row level security;
alter table public.zones enable row level security;
alter table public.entreprises enable row level security;
alter table public.entreprise_membres enable row level security;
alter table public.zone_affectations enable row level security;
alter table public.employes enable row level security;
alter table public.tricycles enable row level security;
alter table public.tricycle_employes enable row level security;
alter table public.clients enable row level security;
alter table public.factures enable row level security;
alter table public.paiements_clients enable row level security;
alter table public.relances enable row level security;
alter table public.tournees_precollecte enable row level security;
alter table public.collectes enable row level security;
alter table public.incidents_precollecte enable row level security;

-- Grille : lisible par tous (y compris la page d'accueil publique), écrite par l'admin.
drop policy if exists plans_lecture on public.plans_tarifaires;
create policy plans_lecture on public.plans_tarifaires for select to anon, authenticated
  using (actif or public.est_admin());
drop policy if exists plans_admin on public.plans_tarifaires;
create policy plans_admin on public.plans_tarifaires for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists parametres_lecture on public.parametres_plateforme;
create policy parametres_lecture on public.parametres_plateforme for select to authenticated using (true);
drop policy if exists parametres_admin on public.parametres_plateforme;
create policy parametres_admin on public.parametres_plateforme for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- Zones : le territoire est lisible par tout compte ; seule la Mairie le découpe.
drop policy if exists zones_lecture on public.zones;
create policy zones_lecture on public.zones for select to authenticated using (true);
drop policy if exists zones_ecriture on public.zones;
create policy zones_ecriture on public.zones for all to authenticated
  using (public.est_superviseur()) with check (public.est_superviseur());

drop policy if exists affectations_lecture on public.zone_affectations;
create policy affectations_lecture on public.zone_affectations for select to authenticated using (true);
drop policy if exists affectations_ecriture on public.zone_affectations;
create policy affectations_ecriture on public.zone_affectations for all to authenticated
  using (public.est_superviseur()) with check (public.est_superviseur());

-- Entreprises : les membres, leurs clients et les superviseurs les voient.
drop policy if exists entreprises_lecture on public.entreprises;
create policy entreprises_lecture on public.entreprises for select to authenticated
  using (public.est_membre(id) or public.est_superviseur() or public.est_client_de(id));
drop policy if exists entreprises_maj on public.entreprises;
create policy entreprises_maj on public.entreprises for update to authenticated
  using (public.est_membre(id) or public.est_admin())
  with check (public.est_membre(id) or public.est_admin());
-- (création : uniquement par la fonction `creer_mon_entreprise`)

drop policy if exists membres_lecture on public.entreprise_membres;
create policy membres_lecture on public.entreprise_membres for select to authenticated
  using (user_id = auth.uid() or public.est_membre(entreprise_id) or public.est_superviseur());

-- Données d'exploitation : réservées aux membres de l'entreprise.
do $$
declare t text;
begin
  foreach t in array array['employes', 'tricycles', 'factures', 'paiements_clients', 'relances'] loop
    execute format('drop policy if exists %I on public.%I', t || '_membres', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.est_membre(entreprise_id) or public.est_admin())
         with check (public.est_membre(entreprise_id) or public.est_admin())',
      t || '_membres', t);
  end loop;
end $$;

drop policy if exists tricycle_employes_membres on public.tricycle_employes;
create policy tricycle_employes_membres on public.tricycle_employes for all to authenticated
  using (exists (select 1 from public.tricycles t where t.id = tricycle_id and public.est_membre(t.entreprise_id)))
  with check (exists (select 1 from public.tricycles t where t.id = tricycle_id and public.est_membre(t.entreprise_id)));

-- Le client voit SES factures et SES paiements (lecture seule).
drop policy if exists factures_client on public.factures;
create policy factures_client on public.factures for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));
drop policy if exists paiements_client on public.paiements_clients;
create policy paiements_client on public.paiements_clients for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- Clients : le précollecteur gère les siens ; le ménage voit sa propre fiche.
drop policy if exists clients_membres on public.clients;
create policy clients_membres on public.clients for all to authenticated
  using (public.est_membre(entreprise_id) or public.est_admin())
  with check (public.est_membre(entreprise_id) or public.est_admin());
drop policy if exists clients_soi on public.clients;
create policy clients_soi on public.clients for select to authenticated
  using (user_id = auth.uid());

-- Tournées : membres ; la Mairie lit (supervision).
drop policy if exists tournees_pc_membres on public.tournees_precollecte;
create policy tournees_pc_membres on public.tournees_precollecte for all to authenticated
  using (public.est_membre(entreprise_id) or public.est_admin())
  with check (public.est_membre(entreprise_id) or public.est_admin());
drop policy if exists tournees_pc_superviseur on public.tournees_precollecte;
create policy tournees_pc_superviseur on public.tournees_precollecte for select to authenticated
  using (public.est_superviseur());

-- Collectes : membres ; le client lit les siennes ; la Mairie lit.
drop policy if exists collectes_membres on public.collectes;
create policy collectes_membres on public.collectes for all to authenticated
  using (public.est_membre(entreprise_id) or public.est_admin())
  with check (public.est_membre(entreprise_id) or public.est_admin());
drop policy if exists collectes_client on public.collectes;
create policy collectes_client on public.collectes for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));
drop policy if exists collectes_superviseur on public.collectes;
create policy collectes_superviseur on public.collectes for select to authenticated
  using (public.est_superviseur());

-- Incidents : l'auteur écrit ; membres, auteur et Mairie lisent ; membres et Mairie traitent.
drop policy if exists incidents_pc_insert on public.incidents_precollecte;
create policy incidents_pc_insert on public.incidents_precollecte for insert to authenticated
  with check (
    auteur_id = auth.uid()
    and (
      (source = 'precollecteur' and public.est_membre(entreprise_id))
      or (source = 'client' and public.est_client_de(entreprise_id))
    )
  );
drop policy if exists incidents_pc_lecture on public.incidents_precollecte;
create policy incidents_pc_lecture on public.incidents_precollecte for select to authenticated
  using (auteur_id = auth.uid() or public.est_membre(entreprise_id) or public.est_superviseur());
drop policy if exists incidents_pc_maj on public.incidents_precollecte;
create policy incidents_pc_maj on public.incidents_precollecte for update to authenticated
  using (public.est_membre(entreprise_id) or public.est_superviseur())
  with check (public.est_membre(entreprise_id) or public.est_superviseur());

-- =============================================================================
-- 11. Stockage des preuves (photos / vidéos capturées dans l'application)
-- =============================================================================
-- Chemin imposé : {entreprise_id}/{auth.uid()}/{fichier}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('preuves', 'preuves', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.dossier_entreprise(p_nom text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_nom, '/', 1)::uuid;
exception when others then
  return null;
end $$;

drop policy if exists preuves_depot on storage.objects;
create policy preuves_depot on storage.objects for insert to authenticated
  with check (
    bucket_id = 'preuves'
    and split_part(name, '/', 2) = auth.uid()::text
    and (public.est_membre(public.dossier_entreprise(name))
         or public.est_client_de(public.dossier_entreprise(name)))
  );

drop policy if exists preuves_lecture on storage.objects;
create policy preuves_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'preuves'
    and (split_part(name, '/', 2) = auth.uid()::text
         or public.est_membre(public.dossier_entreprise(name))
         or public.est_superviseur())
  );

-- =============================================================================
-- 12. Fonctions métier (RPC)
-- =============================================================================

-- 12.a Inscription : le rôle `precollecteur` devient auto-attribuable. Il ne
-- donne accès qu'aux données de SA propre entreprise (RLS par appartenance),
-- contrairement à `collecteur`/`mairie`/`admin` qui restent attribués.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_demande text := new.raw_user_meta_data ->> 'role';
  v_role    text;
begin
  if v_demande in ('citoyen', 'enterprise', 'precollecteur') then
    v_role := v_demande;
  else
    v_role := 'citoyen';
  end if;

  insert into public.profiles (id, email, nom_complet, telephone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nom_complet', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'telephone',
    v_role::public.user_role
  );
  return new;
end $$;

-- 12.b Le précollecteur crée son entreprise (une seule par compte).
create or replace function public.creer_mon_entreprise(
  p_nom text, p_telephone text default null, p_siege text default null, p_commune uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if public.role_courant() not in ('precollecteur', 'admin') then
    raise exception 'Réservé aux comptes précollecteur' using errcode = '42501';
  end if;
  if exists (select 1 from public.entreprise_membres where user_id = auth.uid()) then
    raise exception 'Ce compte gère déjà une entreprise';
  end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'Le nom de l''entreprise est obligatoire'; end if;

  insert into public.entreprises (nom, telephone, email, siege, commune_id, proprietaire_id)
  values (trim(p_nom), p_telephone, (select email from public.profiles where id = auth.uid()), p_siege, p_commune, auth.uid())
  returning id into v_id;

  insert into public.entreprise_membres (entreprise_id, user_id, role_membre)
  values (v_id, auth.uid(), 'gerant');
  return v_id;
end $$;

-- 12.c Quelle zone et quels précollecteurs desservent ce point ?
create or replace function public.precollecteurs_du_point(p_lat double precision, p_lng double precision)
returns table (zone_id uuid, zone_nom text, entreprise_id uuid, entreprise_nom text, entreprise_telephone text)
language sql stable security definer set search_path = public, extensions as $$
  select z.id, z.nom, e.id, e.nom, e.telephone
  from public.zones z
  join public.zone_affectations a on a.zone_id = z.id
  join public.entreprises e on e.id = a.entreprise_id and e.statut <> 'suspendu'
  where ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON(z.contour::text), 4326),
                    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  order by e.nom
$$;

-- 12.d Zone contenant un point (sans condition d'affectation).
create or replace function public.zone_du_point(p_lat double precision, p_lng double precision)
returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select z.id from public.zones z
  where ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON(z.contour::text), 4326),
                    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  limit 1
$$;

-- 12.e Le ménage s'abonne auprès du précollecteur de sa zone.
create or replace function public.souscrire_client(
  p_entreprise uuid, p_plan uuid, p_nom text, p_telephone text,
  p_adresse text, p_quartier text, p_lat double precision, p_lng double precision
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_zone uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from public.clients where user_id = auth.uid() and statut <> 'resilie') then
    raise exception 'Vous avez déjà un abonnement en cours';
  end if;
  if not exists (select 1 from public.plans_tarifaires where id = p_plan and actif) then
    raise exception 'Formule inconnue';
  end if;

  select pz.zone_id into v_zone
  from public.precollecteurs_du_point(p_lat, p_lng) pz
  where pz.entreprise_id = p_entreprise limit 1;
  if v_zone is null then
    raise exception 'Ce précollecteur ne dessert pas votre adresse';
  end if;

  insert into public.clients (entreprise_id, user_id, nom, telephone, email, adresse, quartier, lat, lng, zone_id, plan_id, statut)
  values (p_entreprise, auth.uid(), trim(p_nom), p_telephone,
          (select email from public.profiles where id = auth.uid()),
          p_adresse, p_quartier, p_lat, p_lng, v_zone, p_plan, 'demande')
  returning id into v_id;
  return v_id;
end $$;

-- 12.f Le ménage confirme (ou conteste) le passage du précollecteur.
create or replace function public.confirmer_passage(p_collecte uuid, p_confirme boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.collectes co
     set confirmation_client = case when p_confirme then 'confirmee' else 'contestee' end,
         confirmation_at = now()
   where co.id = p_collecte
     and exists (select 1 from public.clients c where c.id = co.client_id and c.user_id = auth.uid());
  if not found then raise exception 'Collecte introuvable'; end if;
end $$;

-- 12.g Contrôle de chevauchement des zones (Mairie).
create or replace function public.zones_en_conflit(p_contour jsonb, p_exclure uuid default null)
returns table (id uuid, nom text, recouvrement_m2 double precision)
language sql stable security definer set search_path = public, extensions as $$
  with nouveau as (select ST_SetSRID(ST_GeomFromGeoJSON(p_contour::text), 4326) as g)
  select z.id, z.nom,
         ST_Area(ST_Intersection(ST_SetSRID(ST_GeomFromGeoJSON(z.contour::text), 4326), n.g)::geography)
  from public.zones z, nouveau n
  where (p_exclure is null or z.id <> p_exclure)
    and ST_Intersects(ST_SetSRID(ST_GeomFromGeoJSON(z.contour::text), 4326), n.g)
    and ST_Area(ST_Intersection(ST_SetSRID(ST_GeomFromGeoJSON(z.contour::text), 4326), n.g)::geography) > 50
$$;

-- 12.h Supervision Mairie : AGRÉGATS uniquement, jamais de données personnelles.
create or replace function public.supervision_zones()
returns table (
  zone_id uuid, zone_nom text, couleur text, contour jsonb, commune text,
  precollecteurs text[], nb_clients bigint, nb_clients_actifs bigint,
  collectes_30j bigint, collectes_realisees_30j bigint, incidents_ouverts bigint
)
language sql stable security definer set search_path = public as $$
  select z.id, z.nom, z.couleur, z.contour, cm.nom,
    coalesce((select array_agg(e.nom order by e.nom) from public.zone_affectations a
              join public.entreprises e on e.id = a.entreprise_id where a.zone_id = z.id), '{}'),
    (select count(*) from public.clients c where c.zone_id = z.id and not c.est_demo),
    (select count(*) from public.clients c where c.zone_id = z.id and c.statut = 'actif' and not c.est_demo),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where c.zone_id = z.id and co.date_prevue >= current_date - 30 and not c.est_demo),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where c.zone_id = z.id and co.statut = 'realisee' and co.date_prevue >= current_date - 30 and not c.est_demo),
    (select count(*) from public.incidents_precollecte i join public.clients c on c.id = i.client_id
      where c.zone_id = z.id and i.statut <> 'resolu')
  from public.zones z
  left join public.communes cm on cm.id = z.commune_id
  where public.est_superviseur()
  order by z.nom
$$;

create or replace function public.supervision_precollecteurs()
returns table (
  entreprise_id uuid, nom text, telephone text, statut text, zones text[],
  nb_clients bigint, nb_tricycles bigint, nb_employes bigint,
  collectes_30j bigint, collectes_realisees_30j bigint, incidents_ouverts bigint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.nom, e.telephone, e.statut,
    coalesce((select array_agg(z.nom order by z.nom) from public.zone_affectations a
              join public.zones z on z.id = a.zone_id where a.entreprise_id = e.id), '{}'),
    (select count(*) from public.clients c where c.entreprise_id = e.id and c.statut = 'actif' and not c.est_demo),
    (select count(*) from public.tricycles t where t.entreprise_id = e.id and t.statut = 'actif'),
    (select count(*) from public.employes em where em.entreprise_id = e.id and em.actif),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where co.entreprise_id = e.id and co.date_prevue >= current_date - 30 and not c.est_demo),
    (select count(*) from public.collectes co join public.clients c on c.id = co.client_id
      where co.entreprise_id = e.id and co.statut = 'realisee' and co.date_prevue >= current_date - 30 and not c.est_demo),
    (select count(*) from public.incidents_precollecte i where i.entreprise_id = e.id and i.statut <> 'resolu')
  from public.entreprises e
  where public.est_superviseur()
  order by e.nom
$$;

create or replace function public.supervision_activite(p_semaines int default 12)
returns table (semaine date, prevues bigint, realisees bigint, non_realisees bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('week', co.date_prevue)::date,
         count(*),
         count(*) filter (where co.statut = 'realisee'),
         count(*) filter (where co.statut = 'non_realisee')
  from public.collectes co join public.clients c on c.id = co.client_id
  where public.est_superviseur() and not c.est_demo
    and co.date_prevue >= current_date - (p_semaines * 7)
  group by 1 order by 1
$$;

-- Droits d'exécution : jamais pour anon (sauf rien), toujours pour les comptes connectés.
revoke all on function public.creer_mon_entreprise(text, text, text, uuid) from public, anon;
revoke all on function public.souscrire_client(uuid, uuid, text, text, text, text, double precision, double precision) from public, anon;
revoke all on function public.confirmer_passage(uuid, boolean) from public, anon;
revoke all on function public.precollecteurs_du_point(double precision, double precision) from public, anon;
revoke all on function public.zone_du_point(double precision, double precision) from public, anon;
revoke all on function public.zones_en_conflit(jsonb, uuid) from public, anon;
revoke all on function public.supervision_zones() from public, anon;
revoke all on function public.supervision_precollecteurs() from public, anon;
revoke all on function public.supervision_activite(int) from public, anon;
grant execute on function public.creer_mon_entreprise(text, text, text, uuid) to authenticated;
grant execute on function public.souscrire_client(uuid, uuid, text, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.confirmer_passage(uuid, boolean) to authenticated;
grant execute on function public.precollecteurs_du_point(double precision, double precision) to authenticated;
grant execute on function public.zone_du_point(double precision, double precision) to authenticated;
grant execute on function public.zones_en_conflit(jsonb, uuid) to authenticated;
grant execute on function public.supervision_zones() to authenticated;
grant execute on function public.supervision_precollecteurs() to authenticated;
grant execute on function public.supervision_activite(int) to authenticated;

grant select on public.v_clients_statut to authenticated;
grant usage, select on sequence public.factures_numero_seq to authenticated;

-- =============================================================================
-- Contrôle final (doit renvoyer 16 lignes, toutes avec rls = true)
-- =============================================================================
select c.relname as table_pivot, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
  'plans_tarifaires', 'parametres_plateforme', 'zones', 'entreprises', 'entreprise_membres',
  'zone_affectations', 'employes', 'tricycles', 'tricycle_employes', 'clients', 'factures',
  'paiements_clients', 'relances', 'tournees_precollecte', 'collectes', 'incidents_precollecte')
order by 1;
