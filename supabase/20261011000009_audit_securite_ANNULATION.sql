-- =============================================================================
-- ANNULATION de la migration 20261011000009_audit_securite.sql
-- =============================================================================
-- À n'utiliser QUE si la migration d'audit casse un usage réel en production.
-- Remet la base dans son état du 10/10/2026, À UNE EXCEPTION PRÈS :
-- la protection de `spatial_ref_sys` est conservée (la retirer rouvrirait la
-- faille signalée par Supabase). Pour neutraliser son verrou malgré tout :
--   create or replace function public.spatial_ref_sys_lecture_seule()
--   returns trigger language plpgsql as $$ begin return null; end $$;
--
-- Une seule transaction ; rejouable.
-- =============================================================================

begin;

-- 2. Cohérence entre entreprises
do $$
declare t text;
begin
  foreach t in array array[
    'factures', 'paiements_clients', 'relances', 'tournees_precollecte', 'collectes',
    'incidents_precollecte', 'tournee_equipe', 'invitations_employe', 'positions_tournee',
    'demandes_abonnement', 'paiements_en_ligne', 'liens_paiement'
  ] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists %I on public.%I', t || '_coherence_entreprise', t);
  end loop;
end $$;
drop trigger if exists tricycle_employes_coherence on public.tricycle_employes;
drop function if exists public.verifier_coherence_entreprise();
drop function if exists public.verifier_equipage_tricycle();

-- 3. Colonnes « système »
drop trigger if exists profiles_colonnes_systeme on public.profiles;
drop trigger if exists entreprises_colonnes_systeme on public.entreprises;
drop trigger if exists clients_colonnes_systeme on public.clients;
drop trigger if exists employes_colonnes_systeme on public.employes;
drop trigger if exists collectes_colonnes_systeme on public.collectes;
drop trigger if exists incidents_colonnes_systeme on public.incidents_precollecte;
drop trigger if exists paiements_clients_colonnes_systeme on public.paiements_clients;
drop trigger if exists factures_garde_statut on public.factures;
drop function if exists public.garde_colonnes_systeme();
drop function if exists public.garde_statut_facture();

-- 4. Profils : la Mairie relit tous les profils ; e-mail du profil dans la liste admin
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
  using (auth.uid() = id or public.current_user_role() in ('mairie', 'admin'));

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

-- 5. Liste d'attente : adresse et position exactes
create or replace function public.demandes_ouvertes()
returns table (id uuid, quartier text, adresse text, lat double precision, lng double precision,
               zone_nom text, plan_nom text, plan_prix integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.quartier, d.adresse, d.lat, d.lng, z.nom, p.nom, p.prix_fcfa, d.created_at
  from public.demandes_abonnement d
  left join public.zones z on z.id = d.zone_id
  left join public.plans_tarifaires p on p.id = d.plan_id
  where d.statut = 'en_attente'
    and (public.est_gerant(public.mon_entreprise()) or public.est_superviseur())
    and not exists (select 1 from public.clients c where c.user_id = d.user_id and c.statut <> 'resilie')
  order by d.created_at
$$;

-- 6. Codes d'invitation à 8 caractères hexadécimaux
create or replace function public.normaliser_code_invitation(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.creer_invitation_employe(p_employe uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.employes;
  v_code text;
begin
  select * into e from public.employes where id = p_employe;
  if not found or not public.est_gerant(e.entreprise_id) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if not e.actif then raise exception 'Réactivez d''abord la fiche de cet employé'; end if;
  if e.user_id is not null then raise exception 'Cet employé a déjà son compte'; end if;
  delete from public.invitations_employe where employe_id = e.id and utilisee_at is null;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.invitations_employe where code = v_code);
  end loop;
  insert into public.invitations_employe (entreprise_id, employe_id, code)
  values (e.entreprise_id, e.id, v_code);
  return v_code;
end $$;
drop function if exists public.nouveau_code_invitation();

-- 7. Droits des fonctions et politiques héritées
alter default privileges grant execute on functions to public;
alter default privileges in schema public grant execute on functions to anon;

do $$
declare r record;
begin
  if to_regclass('securite.droits_anon_retires') is not null then
    for r in select signature from securite.droits_anon_retires loop
      begin
        execute format('grant execute on function %s to public, anon', r.signature);
      exception when undefined_function then null;  -- fonction supprimée entre-temps
      end;
    end loop;
  end if;
  if to_regclass('securite.politiques_restreintes') is not null then
    for r in select * from securite.politiques_restreintes loop
      begin
        execute format('alter policy %I on %I.%I to public', r.politique, r.schema_nom, r.table_nom);
      exception when undefined_object or undefined_table then null;
      end;
    end loop;
  end if;
end $$;
drop schema if exists securite cascade;

-- 8. search_path
alter function public.set_updated_at() reset search_path;
alter function public.dossier_entreprise(text) reset search_path;
alter function public.normaliser_nom(text) reset search_path;

commit;
