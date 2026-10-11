-- =============================================================================
-- MyKlinTown — Audit de sécurité du 11/10/2026 : correctifs de la base
-- =============================================================================
-- Déclencheur : alerte Supabase « rls_disabled_in_public » (relevé du 03/10).
-- La table en cause est `spatial_ref_sys` (installée par PostGIS) : la clé
-- publique pouvait la MODIFIER (vérifié le 11/10). L'audit complet qui a suivi
-- a trouvé d'autres failles, toutes corrigées ici :
--
--   1. spatial_ref_sys modifiable par n'importe qui (avec la clé publique).
--   2. Références croisées entre entreprises : un gérant pouvait rattacher un
--      paiement à la facture d'un AUTRE précollecteur (et la marquer payée),
--      émettre une facture au client d'un autre, inventer des passages chez
--      lui… La RLS ne vérifiait que `entreprise_id`, pas les lignes visées.
--   3. Colonnes « système » modifiables par l'API : statut d'une entreprise
--      (un précollecteur suspendu pouvait se réactiver), compte rattaché à une
--      fiche client ou employé, e-mail du profil (usurpation possible dans la
--      liste des demandes d'accès Mairie), facture marquée payée à la main,
--      confirmation d'un passage par le ménage, preuve d'un incident (photo,
--      heure, position).
--   4. Un compte Mairie lisait tous les profils (nom, e-mail, téléphone de
--      chaque ménage) ; la supervision n'a besoin que d'agrégats.
--   5. Liste d'attente : adresse exacte et position précise d'un ménage
--      visibles par tout compte précollecteur (rôle en libre-service).
--   6. Code d'invitation employé court (8 caractères hexadécimaux) : passé à
--      10 caractères sans ambiguïté (≈ 50 bits) ; les codes en cours restent bons.
--   7. Fonctions exécutables par un visiteur anonyme sans raison, et droits
--      par défaut qui en ouvraient chaque nouvelle à tout le monde.
--   8. Quatre fonctions sans `search_path` fixe (avertissement Supabase).
--
-- Exécution : SQL Editor, en un seul collage. Tout est dans UNE transaction :
-- au moindre échec, rien n'est appliqué. Script IDEMPOTENT (rejouable).
-- Annulation : 20261011000009_audit_securite_ANNULATION.sql (dossier supabase/).
-- Vérifié avant livraison sur une copie locale du schéma (PGlite + PostGIS) :
-- supabase/tests-securite/.
-- =============================================================================

begin;

-- =============================================================================
-- 1. spatial_ref_sys : lecture seule
-- =============================================================================
-- Cette table appartient à l'extension PostGIS (propriétaire : supabase_admin
-- sur Supabase). On essaie d'abord la voie propre (RLS + lecture seule) ; si
-- le propriétaire ne nous permet pas, un déclencheur bloque toute écriture
-- venant de l'API (il ne demande que le droit TRIGGER sur la table).

create or replace function public.spatial_ref_sys_lecture_seule() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'spatial_ref_sys est en lecture seule (référentiel PostGIS)' using errcode = '42501';
  end if;
  return null;
end $$;

do $$
declare
  v_table regclass := to_regclass('public.spatial_ref_sys');
begin
  if v_table is null then
    raise notice '[1] spatial_ref_sys absente : rien à faire';
    return;
  end if;

  -- 1.a Voie propre : RLS + politique de lecture.
  begin
    execute 'alter table public.spatial_ref_sys enable row level security';
    execute 'drop policy if exists spatial_ref_sys_lecture on public.spatial_ref_sys';
    execute 'create policy spatial_ref_sys_lecture on public.spatial_ref_sys for select using (true)';
    raise notice '[1] spatial_ref_sys : RLS activée, lecture seule';
  exception when insufficient_privilege then
    raise notice '[1] spatial_ref_sys : RLS impossible (propriétaire %), verrou par déclencheur',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'spatial_ref_sys');
  end;

  -- 1.b Retrait des droits d'écriture (sans effet si on n'est pas celui qui les a donnés).
  begin
    execute 'revoke insert, update, delete, truncate, references, trigger on table public.spatial_ref_sys from public, anon, authenticated';
    execute 'revoke select on table public.spatial_ref_sys from anon';
  exception when insufficient_privilege then
    null;
  end;

  -- 1.c Verrou par déclencheur (toujours posé : il couvre le cas où 1.a et 1.b échouent).
  if not exists (select 1 from pg_trigger where tgrelid = v_table and tgname = 'spatial_ref_sys_verrou') then
    begin
      execute 'create trigger spatial_ref_sys_verrou
                 before insert or update or delete or truncate on public.spatial_ref_sys
                 for each statement execute function public.spatial_ref_sys_lecture_seule()';
      raise notice '[1] spatial_ref_sys : verrou posé';
    exception when insufficient_privilege then
      raise warning '[1] spatial_ref_sys : verrou IMPOSSIBLE (droit TRIGGER manquant) → ouvrir un ticket au support Supabase';
    end;
  end if;
end $$;

-- =============================================================================
-- 2. Cohérence entre entreprises : une ligne ne vise que des lignes de SA
--    propre entreprise
-- =============================================================================
-- Contrôle générique, par le contenu de la ligne : chaque colonne connue
-- (client_id, facture_id, tournee_id…) présente et renseignée doit désigner
-- une ligne de la même entreprise. S'applique à TOUS les chemins (API,
-- fonctions, clé service) : c'est un invariant, pas un droit.

create or replace function public.verifier_coherence_entreprise() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v jsonb := to_jsonb(new);
  v_avant jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_entreprise uuid := (v ->> 'entreprise_id')::uuid;
  r record;
  v_ok boolean;
begin
  for r in
    select * from (values
      ('client_id', 'clients'), ('facture_id', 'factures'), ('tournee_id', 'tournees_precollecte'),
      ('collecte_id', 'collectes'), ('employe_id', 'employes'), ('encaisse_par', 'employes'),
      ('tricycle_id', 'tricycles')
    ) as t(colonne, cible)
  loop
    continue when not (v ? r.colonne) or (v ->> r.colonne) is null;
    -- Ligne modifiée sans toucher à cette référence ni à l'entreprise : déjà contrôlée.
    continue when v_avant is not null
      and (v_avant ->> r.colonne) is not distinct from (v ->> r.colonne)
      and (v_avant ->> 'entreprise_id') is not distinct from (v ->> 'entreprise_id');
    execute format('select exists (select 1 from public.%I where id = $1 and entreprise_id = $2)', r.cible)
      into v_ok using (v ->> r.colonne)::uuid, v_entreprise;
    if not v_ok then
      raise exception 'Référence refusée : % ne désigne pas une ligne de votre entreprise', r.colonne
        using errcode = '42501';
    end if;
  end loop;

  -- Paiement ou relance : la facture visée est bien celle de ce client.
  if (v ->> 'facture_id') is not null and (v ->> 'client_id') is not null then
    if not exists (select 1 from public.factures f
                    where f.id = (v ->> 'facture_id')::uuid and f.client_id = (v ->> 'client_id')::uuid) then
      raise exception 'Référence refusée : cette facture n''est pas celle de ce client' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'factures', 'paiements_clients', 'relances', 'tournees_precollecte', 'collectes',
    'incidents_precollecte', 'tournee_equipe', 'invitations_employe', 'positions_tournee',
    'demandes_abonnement', 'paiements_en_ligne', 'liens_paiement'
  ] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists %I on public.%I', t || '_coherence_entreprise', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.verifier_coherence_entreprise()',
      t || '_coherence_entreprise', t);
  end loop;
end $$;

-- Équipage d'un tricycle (table sans entreprise_id) : tricycle et employé de la même entreprise.
create or replace function public.verifier_equipage_tricycle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.tricycles t join public.employes e on e.entreprise_id = t.entreprise_id
     where t.id = new.tricycle_id and e.id = new.employe_id
  ) then
    raise exception 'Référence refusée : ce tricycle et cet employé ne sont pas de la même entreprise'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tricycle_employes_coherence on public.tricycle_employes;
create trigger tricycle_employes_coherence before insert or update on public.tricycle_employes
  for each row execute function public.verifier_equipage_tricycle();

-- =============================================================================
-- 3. Colonnes « système » : jamais modifiées directement par l'API
-- =============================================================================
-- Une écriture faite PAR UNE FONCTION CONTRÔLÉE (security definer, exécutée en
-- tant que propriétaire) ou avec la clé service passe ; une écriture envoyée
-- directement par un compte (rôle `authenticated`) sur ces colonnes est
-- refusée, sauf pour un administrateur MyKlinTown.
-- ⚠️ Fonction volontairement SECURITY INVOKER : elle doit voir le rôle de
-- l'appelant (`current_user`), pas celui du propriétaire.

create or replace function public.garde_colonnes_systeme() returns trigger
language plpgsql set search_path = public as $$
declare
  i int;
  v_colonne text;
  v_avant jsonb := to_jsonb(old);
  v_apres jsonb := to_jsonb(new);
begin
  if current_user not in ('anon', 'authenticated') or public.est_admin() then
    return new;
  end if;
  for i in 0 .. tg_nargs - 1 loop
    v_colonne := tg_argv[i];
    if (v_avant -> v_colonne) is distinct from (v_apres -> v_colonne) then
      raise exception 'Modification refusée : « % » ne se change pas depuis l''application (%).', v_colonne, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists profiles_colonnes_systeme on public.profiles;
create trigger profiles_colonnes_systeme before update on public.profiles
  for each row execute function public.garde_colonnes_systeme('email');

drop trigger if exists entreprises_colonnes_systeme on public.entreprises;
create trigger entreprises_colonnes_systeme before update on public.entreprises
  for each row execute function public.garde_colonnes_systeme('statut', 'proprietaire_id');

drop trigger if exists clients_colonnes_systeme on public.clients;
create trigger clients_colonnes_systeme before update on public.clients
  for each row execute function public.garde_colonnes_systeme('user_id');

drop trigger if exists employes_colonnes_systeme on public.employes;
create trigger employes_colonnes_systeme before update on public.employes
  for each row execute function public.garde_colonnes_systeme('user_id');

drop trigger if exists collectes_colonnes_systeme on public.collectes;
create trigger collectes_colonnes_systeme before update on public.collectes
  for each row execute function public.garde_colonnes_systeme('confirmation_client', 'confirmation_at');

-- Une preuve de terrain ne se retouche pas : seul le statut de l'incident évolue.
drop trigger if exists incidents_colonnes_systeme on public.incidents_precollecte;
create trigger incidents_colonnes_systeme before update on public.incidents_precollecte
  for each row execute function public.garde_colonnes_systeme(
    'auteur_id', 'source', 'categorie', 'description', 'media_path', 'media_type', 'capture_at', 'lat', 'lng', 'created_at');

-- Validation des espèces : uniquement par la fonction `valider_paiement`.
drop trigger if exists paiements_clients_colonnes_systeme on public.paiements_clients;
create trigger paiements_clients_colonnes_systeme before update on public.paiements_clients
  for each row execute function public.garde_colonnes_systeme('statut', 'valide_par', 'valide_at', 'montant_fcfa', 'facture_id');

-- Facture : « payée » se DÉDUIT des encaissements. Par l'API, un compte crée
-- une facture « émise » et peut l'annuler ; rien d'autre sur le statut.
create or replace function public.garde_statut_facture() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') or public.est_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.statut <> 'emise' then
    raise exception 'Une facture est créée « émise » : elle devient payée par ses encaissements' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.statut is distinct from old.statut
     and not (old.statut = 'emise' and new.statut = 'annulee') then
    raise exception 'Statut de facture refusé (% → %) : « payée » se déduit des encaissements', old.statut, new.statut
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists factures_garde_statut on public.factures;
create trigger factures_garde_statut before insert or update on public.factures
  for each row execute function public.garde_statut_facture();

-- =============================================================================
-- 4. Profils : chacun le sien, l'administrateur tous (plus la Mairie)
-- =============================================================================
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
  using (auth.uid() = id or public.est_admin());

-- Demandes d'accès Mairie : l'administrateur voit l'e-mail du COMPTE (auth),
-- pas celui du profil.
create or replace function public.demandes_acces_a_traiter()
returns table (id uuid, nom text, email text, telephone text, fonction text, service text,
               commune text, message text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, p.nom_complet, u.email::text, d.telephone, d.fonction, d.service, c.nom, d.message, d.created_at
  from public.demandes_acces d
  join public.profiles p on p.id = d.user_id
  join auth.users u on u.id = d.user_id
  left join public.communes c on c.id = d.commune_id
  where d.statut = 'en_attente' and public.est_admin()
  order by d.created_at
$$;

-- Remise à niveau des e-mails de profil sur ceux des comptes.
update public.profiles p set email = u.email
  from auth.users u
 where u.id = p.id and u.email is not null and p.email is distinct from u.email;

-- =============================================================================
-- 5. Liste d'attente : position approximative, pas d'adresse avant la prise
-- =============================================================================
create or replace function public.demandes_ouvertes()
returns table (id uuid, quartier text, adresse text, lat double precision, lng double precision,
               zone_nom text, plan_nom text, plan_prix integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.quartier,
         null::text,                         -- adresse exacte : après la prise en charge
         round(d.lat::numeric, 3)::double precision,   -- ≈ 100 m
         round(d.lng::numeric, 3)::double precision,
         z.nom, p.nom, p.prix_fcfa, d.created_at
  from public.demandes_abonnement d
  left join public.zones z on z.id = d.zone_id
  left join public.plans_tarifaires p on p.id = d.plan_id
  where d.statut = 'en_attente'
    and (public.est_gerant(public.mon_entreprise()) or public.est_superviseur())
    and not exists (select 1 from public.clients c where c.user_id = d.user_id and c.statut <> 'resilie')
  order by d.created_at
$$;

-- =============================================================================
-- 6. Codes d'invitation : 10 caractères sans ambiguïté (≈ 50 bits)
-- =============================================================================
-- Alphabet de Crockford (ni I, L, O, U) ; à la saisie, O → 0 et I, L → 1.
-- Les anciens codes (hexadécimaux) restent lisibles par la même normalisation.
create or replace function public.normaliser_code_invitation(p text) returns text
language sql immutable set search_path = public as $$
  select translate(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), 'OIL', '011')
$$;

create or replace function public.nouveau_code_invitation() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_octets bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
  i int;
begin
  -- Octets 0 à 5 et 10 à 13 de l'UUID v4 : entièrement aléatoires (les octets
  -- 6 et 8 portent la version et la variante).
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13] loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_octets, i) % 32), 1);
  end loop;
  return v_code;
end $$;

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
    v_code := public.nouveau_code_invitation();
    exit when not exists (select 1 from public.invitations_employe where code = v_code);
  end loop;
  insert into public.invitations_employe (entreprise_id, employe_id, code)
  values (e.entreprise_id, e.id, v_code);
  return v_code;
end $$;

-- =============================================================================
-- 7. Fonctions : rien pour les visiteurs anonymes sans raison
-- =============================================================================
-- 7.a Désormais, une nouvelle fonction n'est PAS exécutable par tout le monde :
-- l'ouvrir à `anon` demandera un `grant` explicite.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- 7.b Politiques héritées (mai 2026) écrites sans `to …` : elles s'appliquent
-- au rôle `public`, donc aussi aux visiteurs anonymes. Leurs conditions
-- (auth.uid() = …) les bloquaient en pratique ; on les réserve néanmoins aux
-- comptes connectés. Seule exception : la lecture du référentiel PostGIS.
create schema if not exists securite;
revoke all on schema securite from public, anon, authenticated;
create table if not exists securite.politiques_restreintes (
  schema_nom text, table_nom text, politique text,
  restreinte_le timestamptz not null default now(),
  primary key (schema_nom, table_nom, politique)
);

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
     where schemaname in ('public', 'storage') and roles = array['public']::name[]
       and not (tablename = 'spatial_ref_sys')
  loop
    begin
      execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
      insert into securite.politiques_restreintes (schema_nom, table_nom, politique)
      values (p.schemaname, p.tablename, p.policyname) on conflict do nothing;
    exception when insufficient_privilege then
      raise warning '[7] politique %.% non modifiable (propriétaire) : à vérifier', p.tablename, p.policyname;
    end;
  end loop;
end $$;

-- 7.c Fonctions existantes : on retire `anon` et `public` partout, SAUF :
--   • celles qu'évalue une politique accessible aux visiteurs (ex. est_admin
--     dans la lecture de la grille tarifaire, page d'accueil),
--   • `apercu_invitation` (page publique « Rejoindre une équipe »),
--   • les fonctions des extensions (PostGIS…).
-- Les comptes connectés et la clé service gardent exactement ce qu'ils avaient.
-- La liste des droits retirés est gardée (schéma privé, non exposé par l'API)
-- pour que le script d'annulation les rende exactement.
create table if not exists securite.droits_anon_retires (
  signature text primary key,
  retire_le timestamptz not null default now()
);

do $$
declare
  r record;
  v_auth boolean;
  v_service boolean;
  v_retirees int := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure as signature, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (select 1 from pg_depend d
                       where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    continue when r.proname = 'apercu_invitation';
    continue when exists (
      select 1 from pg_policies pol
       where pol.roles && array['anon', 'public']::name[]
         and coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~* ('\m' || r.proname || '\s*\('));
    continue when not has_function_privilege('anon', r.oid, 'execute');
    v_auth := has_function_privilege('authenticated', r.oid, 'execute');
    v_service := has_function_privilege('service_role', r.oid, 'execute');
    begin
      execute format('revoke execute on function %s from public, anon', r.signature);
      if v_auth then execute format('grant execute on function %s to authenticated', r.signature); end if;
      if v_service then execute format('grant execute on function %s to service_role', r.signature); end if;
      insert into securite.droits_anon_retires (signature) values (r.signature::text) on conflict do nothing;
      v_retirees := v_retirees + 1;
    exception when insufficient_privilege then
      raise warning '[7] fonction % non modifiable (propriétaire) : à vérifier', r.signature;
    end;
  end loop;
  raise notice '[7] fonctions retirées au rôle anon : %', v_retirees;
end $$;

-- Fonctions créées par ce script : internes (déclencheurs) ou serveur.
revoke execute on function public.nouveau_code_invitation() from public, anon, authenticated;

-- =============================================================================
-- 8. search_path fixe (avertissement « function_search_path_mutable »)
-- =============================================================================
alter function public.set_updated_at() set search_path = public;
alter function public.dossier_entreprise(text) set search_path = public;
alter function public.normaliser_nom(text) set search_path = public;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : chaque ligne doit afficher « OK ».
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'spatial_ref_sys protégée en écriture' as controle,
         (c.relrowsecurity or exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'spatial_ref_sys_verrou')) as ok,
         'rls=' || c.relrowsecurity || ', verrou=' || exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'spatial_ref_sys_verrou')
           || ', anon peut modifier (droit)=' || has_table_privilege('anon', c.oid, 'UPDATE') as detail
    from pg_class c where c.oid = to_regclass('public.spatial_ref_sys')
  union all
  select 2, 'Tables publiques sans RLS (hors extensions)',
         count(*) = 0, coalesce(string_agg(c.relname, ', '), 'aucune')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  union all
  select 3, 'Déclencheurs de cohérence entre entreprises', count(*) >= 10, count(*)::text
    from pg_trigger where tgname like '%\_coherence\_entreprise' or tgname = 'tricycle_employes_coherence'
  union all
  select 4, 'Fonctions SECURITY DEFINER sans search_path',
         count(*) = 0, coalesce(string_agg(p.proname, ', '), 'aucune')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  union all
  select 5, 'Fonctions ouvertes au visiteur anonyme (attendu : apercu_invitation, est_admin)',
         count(*) filter (where p.proname not in ('apercu_invitation', 'est_admin')) = 0,
         coalesce(string_agg(p.proname, ', ' order by p.proname), 'aucune')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  union all
  select 6, 'Politiques encore appliquées au rôle public (hors PostGIS)',
         count(*) = 0, coalesce(string_agg(tablename || '.' || policyname, ', '), 'aucune')
    from pg_policies
   where schemaname in ('public', 'storage') and roles = array['public']::name[] and tablename <> 'spatial_ref_sys'
) x order by n;
