-- =============================================================================
-- MyKlinTown — Dossier du précollecteur, conditions d'utilisation, annuaire public
-- =============================================================================
-- Retours de l'équipe du 08/11/2026
-- (docs/reunions/MyKlinTown_Corrections_Propositions.pdf, § 1.4 et § 3) :
--
--   • plus de code d'agrément à l'inscription : un DOSSIER administratif le
--     remplace (NIU, adresse du siège social, une autorisation territoriale
--     par commune d'activité, permis environnemental) ;
--   • l'inscription reste libre et se fait sans pièces, pour laisser le temps
--     de les réunir. Mais un précollecteur n'apparaît dans l'annuaire public
--     (et ne recevra de demandes de devis) qu'une fois son dossier VÉRIFIÉ par
--     MyKlinTown : « on ne met pas à disposition des clients des précollecteurs
--     qui ne sont pas reconnus par la mairie et par le ministère » ;
--   • case obligatoire à la création de l'espace : conditions d'utilisation et
--     charte du précollecteur (versions provisoires, textes en rédaction) ;
--   • annuaire public : nom, logo et devise des précollecteurs d'un quartier,
--     aucune autre information.
--
-- Les entreprises existantes passent en dossier « incomplet » : elles
-- continuent de servir leurs clients et n'apparaissent dans l'annuaire
-- qu'après vérification.
--
-- Additive et rejouable. À jouer dans le SQL Editor de Supabase ; le bloc de
-- contrôle final doit afficher « OK » partout.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Migrations préalables
-- =============================================================================
-- Sans elles, la migration échouerait sur une colonne ou une table absente
-- (« column "niu" … does not exist »). On s'arrête avant toute modification,
-- en nommant ce qu'il faut jouer d'abord. Contrôle : supabase/DIAGNOSTIC_MIGRATIONS.sql.
do $$
declare v_manque text[] := '{}';
begin
  if to_regprocedure('public.garde_colonnes_systeme()') is null then
    v_manque := v_manque || '20261011000009_audit_securite'::text;
  end if;
  if to_regprocedure('public.parametre_entier(text, integer)') is null then
    v_manque := v_manque || '20261019000013_delai_grace_blocage'::text;
  end if;
  if to_regclass('public.documents_legaux') is null or to_regclass('public.acceptations_documents') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'entreprises' and column_name = 'niu') then
    v_manque := v_manque || '20261019000014_charte_facture_conforme'::text;
  end if;
  if to_regclass('public.mairie_communes') is null or to_regprocedure('public.supervise_entreprise(uuid)') is null then
    v_manque := v_manque || '20261019000016_mairie_par_commune'::text;
  end if;
  if cardinality(v_manque) > 0 then
    raise exception 'Migrations à jouer d''abord, dans l''ordre : %', array_to_string(v_manque, ', ')
      using hint = 'Rien n''a été modifié. Liste complète : supabase/DIAGNOSTIC_MIGRATIONS.sql';
  end if;
end $$;

-- =============================================================================
-- 1. Entreprise : vitrine et état du dossier
-- =============================================================================
-- `niu` (20261019000014) et `siege` existent déjà ; `siege` devient l'adresse
-- du siège social.
alter table public.entreprises
  add column if not exists devise text,
  add column if not exists logo_path text,
  add column if not exists quartiers text[] not null default '{}',
  add column if not exists permis_env_path text,
  add column if not exists dossier_statut text not null default 'incomplet',
  add column if not exists dossier_motif text,
  add column if not exists dossier_soumis_at timestamptz,
  add column if not exists dossier_statue_at timestamptz,
  add column if not exists dossier_statue_par uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entreprises_dossier_statut_check') then
    alter table public.entreprises add constraint entreprises_dossier_statut_check
      check (dossier_statut in ('incomplet', 'soumis', 'valide', 'refuse'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entreprises_devise_longueur') then
    alter table public.entreprises add constraint entreprises_devise_longueur
      check (devise is null or char_length(devise) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entreprises_quartiers_nombre') then
    alter table public.entreprises add constraint entreprises_quartiers_nombre
      check (cardinality(quartiers) <= 40);
  end if;
end $$;

comment on column public.entreprises.dossier_statut is
  'Dossier administratif : incomplet → soumis → valide (visible dans l''annuaire) ou refuse (avec motif). Ne change que par les fonctions du dossier.';
comment on column public.entreprises.quartiers is
  'Quartiers desservis, déclarés par le gérant : c''est là que l''annuaire public le montre.';

-- =============================================================================
-- 2. Communes d'activité : une autorisation territoriale par commune
-- =============================================================================
create table if not exists public.entreprise_communes (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  commune_id uuid not null references public.communes(id) on delete cascade,
  -- Photo ou PDF de l'autorisation, dans le stockage privé `dossiers`.
  autorisation_path text,
  created_at timestamptz not null default now(),
  primary key (entreprise_id, commune_id)
);
create index if not exists entreprise_communes_commune_idx on public.entreprise_communes (commune_id);

-- Lecture : l'équipe de l'entreprise, la Mairie qui la supervise, l'administrateur.
-- AUCUNE politique d'écriture : seules les fonctions du dossier écrivent.
alter table public.entreprise_communes enable row level security;
drop policy if exists entreprise_communes_lecture on public.entreprise_communes;
create policy entreprise_communes_lecture on public.entreprise_communes for select to authenticated
  using (public.est_membre(entreprise_id) or public.supervise_entreprise(entreprise_id));

-- La commune déjà connue (code d'agrément ou saisie) devient la première commune d'activité.
insert into public.entreprise_communes (entreprise_id, commune_id)
select id, commune_id from public.entreprises where commune_id is not null
on conflict do nothing;

-- =============================================================================
-- 3. Colonnes du dossier et de la vitrine : jamais modifiées directement
-- =============================================================================
-- Elles passent par les fonctions ci-dessous, qui portent les règles de
-- vérification. Le NIU et le siège restent modifiables depuis les paramètres,
-- mais un dossier validé repart alors en vérification (§ 4).
drop trigger if exists entreprises_colonnes_systeme on public.entreprises;
create trigger entreprises_colonnes_systeme before update on public.entreprises
  for each row execute function public.garde_colonnes_systeme(
    'statut', 'proprietaire_id', 'prefixe_facture', 'commune_id',
    'devise', 'logo_path', 'quartiers', 'permis_env_path',
    'dossier_statut', 'dossier_motif', 'dossier_soumis_at', 'dossier_statue_at', 'dossier_statue_par');

-- =============================================================================
-- 4. Un dossier validé dont l'identité change repart en vérification
-- =============================================================================
-- Déclencheur nommé après `entreprises_colonnes_systeme` : PostgreSQL les
-- exécute par ordre alphabétique, le garde-fou voit donc la demande telle
-- qu'envoyée, puis ce déclencheur remet le dossier en vérification.
create or replace function public.dossier_revalidation() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.dossier_statut = 'valide'
     and (new.niu is distinct from old.niu or new.siege is distinct from old.siege)
     and not public.est_admin() then
    new.dossier_statut := 'soumis';
    new.dossier_soumis_at := now();
  end if;
  return new;
end $$;

drop trigger if exists entreprises_dossier_revalidation on public.entreprises;
create trigger entreprises_dossier_revalidation before update of niu, siege on public.entreprises
  for each row execute function public.dossier_revalidation();

-- =============================================================================
-- 5. Outils : clé de recherche d'un quartier, quartiers saisis, pièces manquantes
-- =============================================================================
-- « Nsam-Efoulan », « NSAM efoulan » et « nsam éfoulan » donnent « nsam efoulan ».
-- Tout ce qui n'est ni lettre ni chiffre tombe : aucun joker possible dans LIKE.
create or replace function public.cle_quartier(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(
           translate(lower(coalesce(p, '')),
                     'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
                     'aaaaaaceeeeiiiinooooouuuuyyoa'),
           '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')), '')
$$;

-- Quartiers saisis par le gérant : noms harmonisés, doublons retirés, ordre gardé.
create or replace function public.quartiers_normalises(p text[]) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(q order by o), '{}')
  from (select distinct on (public.cle_quartier(x)) public.normaliser_nom(left(x, 60)) as q, o
          from unnest(coalesce(p, '{}')) with ordinality t(x, o)
         where public.cle_quartier(x) is not null
         order by public.cle_quartier(x), o) s
$$;

-- Ce qui manque encore au dossier ; tableau vide = dossier complet.
create or replace function public.pieces_manquantes(p_entreprise uuid) returns text[]
language sql stable set search_path = public as $$
  select array_remove(array[
    case when coalesce(btrim(e.niu), '') = '' then 'le NIU' end,
    case when coalesce(btrim(e.siege), '') = '' then 'l''adresse du siège social' end,
    case when not exists (select 1 from public.entreprise_communes ec where ec.entreprise_id = e.id)
         then 'au moins une commune d''activité' end,
    case when exists (select 1 from public.entreprise_communes ec
                       where ec.entreprise_id = e.id and ec.autorisation_path is null)
         then 'l''autorisation territoriale de chaque commune' end,
    case when e.permis_env_path is null then 'le permis environnemental' end
  ], null)
  from public.entreprises e
  where e.id = p_entreprise
    and (public.est_membre(e.id) or public.est_admin())
$$;

-- =============================================================================
-- 6. Inscription d'un précollecteur (remplace la saisie du code d'agrément)
-- =============================================================================
-- `creer_mon_entreprise` (code d'agrément) reste en place pour un retour
-- arrière ; l'application ne l'appelle plus.
create or replace function public.inscrire_mon_entreprise(
  p_nom text,
  p_telephone text default null,
  p_siege text default null,
  p_niu text default null,
  p_devise text default null,
  p_communes uuid[] default '{}',
  p_quartiers text[] default '{}',
  p_conditions_acceptees boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_niu text := nullif(upper(regexp_replace(coalesce(p_niu, ''), '[\s.\-]', '', 'g')), '');
  v_communes uuid[];
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if public.role_courant() not in ('precollecteur', 'admin') then
    raise exception 'Réservé aux comptes précollecteur' using errcode = '42501';
  end if;
  if exists (select 1 from public.entreprise_membres where user_id = auth.uid()) then
    raise exception 'Ce compte gère déjà une entreprise';
  end if;
  if coalesce(btrim(p_nom), '') = '' then raise exception 'Le nom de l''entreprise est obligatoire'; end if;
  if not coalesce(p_conditions_acceptees, false) then
    raise exception 'Cochez la case pour accepter les conditions d''utilisation et la charte du précollecteur';
  end if;
  if v_niu is not null and v_niu !~ '^[A-Z0-9]{6,30}$' then
    raise exception 'NIU illisible : lettres et chiffres seulement (ex. M012345678901A)';
  end if;
  if char_length(btrim(coalesce(p_devise, ''))) > 120 then
    raise exception 'Devise trop longue (120 caractères au plus)';
  end if;
  if cardinality(coalesce(p_quartiers, '{}')) > 40 then raise exception '40 quartiers au plus'; end if;

  select coalesce(array_agg(c order by o), '{}') into v_communes
    from (select c, min(o) as o from unnest(coalesce(p_communes, '{}')) with ordinality t(c, o)
           where c is not null group by c) x;
  if exists (select 1 from unnest(v_communes) c where not exists (select 1 from public.communes where id = c)) then
    raise exception 'Commune inconnue';
  end if;

  insert into public.entreprises (nom, telephone, email, siege, niu, devise, quartiers, commune_id, proprietaire_id)
  values (btrim(p_nom), nullif(btrim(coalesce(p_telephone, '')), ''),
          (select email from public.profiles where id = auth.uid()),
          nullif(btrim(coalesce(p_siege, '')), ''), v_niu,
          nullif(btrim(coalesce(p_devise, '')), ''),
          public.quartiers_normalises(p_quartiers),
          v_communes[1], auth.uid())
  returning id into v_id;

  insert into public.entreprise_membres (entreprise_id, user_id, role_membre)
  values (v_id, auth.uid(), 'gerant');

  insert into public.entreprise_communes (entreprise_id, commune_id)
  select v_id, c from unnest(v_communes) c
  on conflict do nothing;

  -- Conditions d'utilisation et charte : la dernière version publiée de chacune.
  insert into public.acceptations_documents (document_id, user_id, entreprise_id, mode, auteur_id)
  select d.id, auth.uid(), v_id, 'en_ligne', auth.uid()
    from (select distinct on (dl.type) dl.id
            from public.documents_legaux dl
           where dl.type in ('cgu_precollecteur', 'charte_precollecteur') and dl.publie_at is not null
           order by dl.type, dl.version desc) d;
  return v_id;
end $$;

-- =============================================================================
-- 7. Le gérant tient sa vitrine et son dossier
-- =============================================================================
create or replace function public.mettre_a_jour_ma_vitrine(p_devise text, p_quartiers text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_ent uuid := public.mon_entreprise();
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_devise, ''))) > 120 then
    raise exception 'Devise trop longue (120 caractères au plus)';
  end if;
  if cardinality(coalesce(p_quartiers, '{}')) > 40 then raise exception '40 quartiers au plus'; end if;
  update public.entreprises
     set devise = nullif(btrim(coalesce(p_devise, '')), ''),
         quartiers = public.quartiers_normalises(p_quartiers)
   where id = v_ent;
end $$;

-- Communes d'activité. La première devient la commune principale (celle de la
-- Mairie qui supervise) si l'ancienne n'en fait plus partie. Une commune
-- ajoutée ou retirée sur un dossier validé : nouvelle vérification.
create or replace function public.definir_mes_communes(p_communes uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ent uuid := public.mon_entreprise();
  v_communes uuid[];
  v_avant uuid[];
  v_apres uuid[];
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  select coalesce(array_agg(c order by o), '{}') into v_communes
    from (select c, min(o) as o from unnest(coalesce(p_communes, '{}')) with ordinality t(c, o)
           where c is not null group by c) x;
  if exists (select 1 from unnest(v_communes) c where not exists (select 1 from public.communes where id = c)) then
    raise exception 'Commune inconnue';
  end if;

  select coalesce(array_agg(commune_id order by commune_id), '{}') into v_avant
    from public.entreprise_communes where entreprise_id = v_ent;
  select coalesce(array_agg(c order by c), '{}') into v_apres from unnest(v_communes) c;

  delete from public.entreprise_communes
   where entreprise_id = v_ent and not (commune_id = any (v_communes));
  insert into public.entreprise_communes (entreprise_id, commune_id)
  select v_ent, c from unnest(v_communes) c
  on conflict do nothing;

  update public.entreprises e
     set commune_id = case when e.commune_id = any (v_communes) then e.commune_id else v_communes[1] end,
         dossier_statut = case when e.dossier_statut = 'valide' and v_avant is distinct from v_apres
                               then 'soumis' else e.dossier_statut end,
         dossier_soumis_at = case when e.dossier_statut = 'valide' and v_avant is distinct from v_apres
                                  then now() else e.dossier_soumis_at end
   where e.id = v_ent;
end $$;

-- Pièce téléversée par l'application dans le stockage, sous le dossier de
-- l'entreprise : autorisation d'une commune, permis environnemental ou logo.
-- Une autorisation ou un permis remplacé sur un dossier validé : nouvelle vérification.
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

  if p_piece <> 'logo' then
    update public.entreprises set dossier_statut = 'soumis', dossier_soumis_at = now()
     where id = v_ent and dossier_statut = 'valide';
  end if;
end $$;

create or replace function public.soumettre_mon_dossier() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ent uuid := public.mon_entreprise();
  v_manque text[];
begin
  if v_ent is null or not public.est_gerant(v_ent) then
    raise exception 'Réservé au gérant de l''entreprise' using errcode = '42501';
  end if;
  v_manque := public.pieces_manquantes(v_ent);
  if cardinality(v_manque) > 0 then
    raise exception 'Dossier incomplet : il manque %', array_to_string(v_manque, ', ');
  end if;
  update public.entreprises
     set dossier_statut = 'soumis', dossier_soumis_at = now(), dossier_motif = null
   where id = v_ent and dossier_statut in ('incomplet', 'refuse');
end $$;

-- =============================================================================
-- 8. MyKlinTown vérifie le dossier
-- =============================================================================
create or replace function public.statuer_dossier(p_entreprise uuid, p_decision text, p_motif text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_manque text[];
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''équipe MyKlinTown' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('valide', 'refuse') then raise exception 'Décision inconnue'; end if;
  if not exists (select 1 from public.entreprises where id = p_entreprise) then
    raise exception 'Précollecteur introuvable';
  end if;
  if p_decision = 'valide' then
    v_manque := public.pieces_manquantes(p_entreprise);
    if cardinality(v_manque) > 0 then
      raise exception 'Impossible de valider : il manque %', array_to_string(v_manque, ', ');
    end if;
  elsif coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez le motif du refus : le précollecteur le verra';
  end if;
  update public.entreprises
     set dossier_statut = p_decision,
         dossier_motif = case when p_decision = 'refuse' then left(btrim(p_motif), 500) end,
         dossier_statue_at = now(),
         dossier_statue_par = auth.uid()
   where id = p_entreprise;
end $$;

-- =============================================================================
-- 9. Annuaire public : nom, logo, devise des précollecteurs VÉRIFIÉS
-- =============================================================================
-- Seule fonction de ce chantier ouverte aux visiteurs sans compte. Elle ne
-- renvoie rien d'autre que ce qu'une vitrine montre : ni téléphone, ni
-- adresse, ni NIU, ni clients.
create or replace function public.annuaire_precollecteurs(p_recherche text)
returns table (id uuid, nom text, devise text, logo_path text)
language sql stable security definer set search_path = public as $$
  with r as (select public.cle_quartier(p_recherche) as cle)
  select e.id, e.nom, e.devise, e.logo_path
    from public.entreprises e, r
   where char_length(coalesce(r.cle, '')) >= 2
     and e.dossier_statut = 'valide'
     and e.statut <> 'suspendu'
     and (exists (select 1 from unnest(e.quartiers) q where public.cle_quartier(q) like '%' || r.cle || '%')
          or exists (select 1 from public.entreprise_communes ec
                       join public.communes c on c.id = ec.commune_id
                      where ec.entreprise_id = e.id and public.cle_quartier(c.nom) = r.cle))
   order by e.nom
   limit 30
$$;

-- =============================================================================
-- 10. Stockage : pièces du dossier (privées), logos (publics)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dossiers', 'dossiers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Chemin imposé : {entreprise_id}/{fichier}. Ni remplacement ni suppression
-- depuis l'application : chaque envoi est un nouveau fichier (trace des pièces).
drop policy if exists dossiers_depot on storage.objects;
create policy dossiers_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'dossiers' and public.est_gerant(public.dossier_entreprise(name)));

drop policy if exists dossiers_lecture on storage.objects;
create policy dossiers_lecture on storage.objects for select to authenticated
  using (bucket_id = 'dossiers' and (public.est_gerant(public.dossier_entreprise(name)) or public.est_admin()));

-- Les logos sont publics (vitrine) : le stockage les sert sans politique de lecture.
drop policy if exists logos_depot on storage.objects;
create policy logos_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.est_gerant(public.dossier_entreprise(name)));

-- =============================================================================
-- 11. Conditions d'utilisation et charte du précollecteur
-- =============================================================================
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.documents_legaux'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%charte_menage%'
  loop
    execute format('alter table public.documents_legaux drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.documents_legaux add constraint documents_legaux_type_check
  check (type in ('charte_menage', 'contrat_menage', 'cgu_precollecteur', 'charte_precollecteur'));

-- Reprise de 20261019000014 : les textes du précollecteur s'acceptent par le
-- gérant lui-même, pour son entreprise.
create or replace function public.accepter_documents(p_types text[], p_client uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.clients;
  v_ent uuid;
  v_type text;
  v_doc uuid;
  v_n int := 0;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_types is null or cardinality(p_types) = 0 then
    raise exception 'Aucun document à accepter';
  end if;

  if p_client is not null then
    select * into c from public.clients where id = p_client;
    if not found or not (public.est_gerant(c.entreprise_id) or public.est_agent(c.entreprise_id)) then
      raise exception 'Réservé à l''équipe du précollecteur de ce client' using errcode = '42501';
    end if;
  else
    select * into c from public.clients
     where user_id = v_uid and statut <> 'resilie'
     order by created_at desc limit 1;
  end if;

  foreach v_type in array (select array_agg(distinct t) from unnest(p_types) t) loop
    if v_type is null or v_type not in ('charte_menage', 'contrat_menage', 'cgu_precollecteur', 'charte_precollecteur') then
      raise exception 'Document inconnu : %', coalesce(v_type, '(vide)');
    end if;
    select id into v_doc from public.documents_legaux
     where type = v_type and publie_at is not null
     order by version desc limit 1;
    if v_doc is null then
      raise exception 'Aucune version publiée de ce document (%)', v_type;
    end if;

    if v_type in ('cgu_precollecteur', 'charte_precollecteur') then
      v_ent := public.mon_entreprise();
      if p_client is not null or v_ent is null or not public.est_gerant(v_ent) then
        raise exception 'Réservé au gérant d''une entreprise de précollecte' using errcode = '42501';
      end if;
      continue when exists (select 1 from public.acceptations_documents where document_id = v_doc and user_id = v_uid);
      insert into public.acceptations_documents (document_id, user_id, client_id, entreprise_id, mode, auteur_id)
      values (v_doc, v_uid, null, v_ent, 'en_ligne', v_uid);
    elsif p_client is null then
      continue when exists (select 1 from public.acceptations_documents where document_id = v_doc and user_id = v_uid);
      insert into public.acceptations_documents (document_id, user_id, client_id, entreprise_id, mode, auteur_id)
      values (v_doc, v_uid, c.id, c.entreprise_id, 'en_ligne', v_uid);
    else
      continue when exists (select 1 from public.acceptations_documents where document_id = v_doc and client_id = c.id);
      insert into public.acceptations_documents (document_id, user_id, client_id, entreprise_id, mode, auteur_id)
      values (v_doc, c.user_id, c.id, c.entreprise_id, 'remise_papier', v_uid);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Reprise de 20261019000014 : chacun ses textes. Ceux du précollecteur ne sont
-- présentés qu'au gérant d'une entreprise ; la charte et le contrat de
-- l'abonné, comme avant.
create or replace function public.documents_a_accepter()
returns table (document_id uuid, type text, version integer, titre text, provisoire boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.type, d.version, d.titre, d.provisoire
  from (
    select distinct on (dl.type) dl.*
    from public.documents_legaux dl
    where dl.publie_at is not null
    order by dl.type, dl.version desc
  ) d
  where auth.uid() is not null
    and (d.type not in ('cgu_precollecteur', 'charte_precollecteur')
         or (public.mon_entreprise() is not null and public.est_gerant(public.mon_entreprise())))
    and not exists (
      select 1 from public.acceptations_documents a
       where a.document_id = d.id
         and (a.user_id = auth.uid()
              or a.client_id in (select cl.id from public.clients cl where cl.user_id = auth.uid()))
    )
  order by d.type
$$;

-- Reprise de 20261019000014 : la fiche d'un client ne montre que les textes de
-- l'abonné (charte et contrat), pas ceux du précollecteur.
create or replace function public.charte_du_client(p_client uuid)
returns table (type text, document_id uuid, version integer, titre text, provisoire boolean,
               acceptee boolean, version_acceptee integer, accepte_at timestamptz, mode text)
language sql stable security definer set search_path = public as $$
  with c as (
    select cl.id, cl.user_id
      from public.clients cl
     where cl.id = p_client
       and (public.est_gerant(cl.entreprise_id) or public.est_agent(cl.entreprise_id) or public.est_admin()
            or (cl.user_id is not null and cl.user_id = auth.uid()))
  ),
  courant as (
    select distinct on (dl.type) dl.*
      from public.documents_legaux dl
     where dl.publie_at is not null
       and dl.type in ('charte_menage', 'contrat_menage')
     order by dl.type, dl.version desc
  ),
  acc as (
    select distinct on (dl.type) dl.type, dl.version, a.accepte_at, a.mode
      from public.acceptations_documents a
      join public.documents_legaux dl on dl.id = a.document_id
      join c on a.client_id = c.id or (c.user_id is not null and a.user_id = c.user_id)
     where dl.type in ('charte_menage', 'contrat_menage')
     order by dl.type, dl.version desc, a.accepte_at desc
  )
  select k.type, k.id, k.version, k.titre, k.provisoire,
         coalesce(acc.version = k.version, false), acc.version, acc.accepte_at, acc.mode
    from courant k
   cross join c
    left join acc on acc.type = k.type
   order by k.type
$$;

-- Premières versions, provisoires : l'équipe rédige les textes définitifs et
-- les publie depuis « Charte et contrat » (administrateur).
insert into public.documents_legaux (type, version, titre, contenu, provisoire, publie_at)
values
  ('cgu_precollecteur', 1, 'Conditions d''utilisation de MyKlinTown pour les précollecteurs', $txt$## Objet
Ces conditions encadrent l'utilisation de la plateforme MyKlinTown par les entreprises et groupements de précollecte des déchets. Version provisoire : le texte définitif est en cours de rédaction et vous sera présenté pour acceptation dès sa publication.

## Inscription et dossier
- L'inscription est gratuite et sans engagement jusqu'au lancement officiel.
- Les informations saisies (nom, NIU, adresse du siège social, communes d'activité) et les pièces téléversées (autorisations territoriales, permis environnemental) doivent être exactes et en cours de validité.
- MyKlinTown vérifie le dossier avant de rendre l'entreprise visible dans l'annuaire et de lui transmettre des demandes de devis. Une pièce fausse ou périmée entraîne le refus du dossier ou la suspension du compte.

## Vitrine et annuaire
- L'annuaire public n'affiche que le nom, le logo et la devise de l'entreprise, dans les quartiers qu'elle déclare desservir.
- Le gérant est responsable des textes et des images qu'il publie.

## Données des abonnés
- Les données des abonnés (nom, téléphone, adresse, position, paiements) ne servent qu'à l'exécution du service de précollecte.
- Elles ne sont ni revendues, ni communiquées à des tiers, ni utilisées pour un démarchage sans rapport avec le service.
- Les identifiants d'accès à la plateforme sont personnels : chacun protège les siens.

## Tarifs
- Le précollecteur convient de son tarif avec chaque abonné. Les factures émises dans l'application reprennent ce tarif.
- Les conditions financières entre MyKlinTown et le précollecteur font l'objet d'un contrat séparé.

## Suspension
- MyKlinTown peut suspendre un compte en cas d'informations fausses, de manquement grave à la charte ou de risque pour les abonnés.
- Le précollecteur peut cesser d'utiliser la plateforme à tout moment.

## Évolution
Toute nouvelle version de ces conditions est publiée dans l'application et présentée pour acceptation.$txt$, true, now()),
  ('charte_precollecteur', 1, 'Charte du précollecteur', $txt$## Objet
Cette charte rappelle les engagements pratiques du précollecteur qui utilise MyKlinTown, et ceux de MyKlinTown envers lui. Version provisoire, en cours de rédaction.

## Le précollecteur s'engage à
- Transmettre des informations exactes et complètes sur son entreprise et sur ses abonnés.
- Informer ses abonnés de l'utilisation de leurs données et respecter les règles applicables.
- Veiller à ce que ses agents utilisent correctement la plateforme, et protéger les identifiants d'accès.
- Réaliser les collectes avec diligence et respecter les engagements de service annoncés aux abonnés.
- Signaler les collectes manquées, les incidents et les difficultés opérationnelles.
- Ne pas falsifier les preuves de collecte ni les informations enregistrées.
- Respecter les règles d'hygiène, de sécurité et de protection de l'environnement.
- Adopter un comportement professionnel et respectueux envers les abonnés, MyKlinTown et les autres partenaires.

## MyKlinTown s'engage à
- Mettre à disposition les fonctionnalités de la plateforme et en assurer le support technique.
- Préserver la confidentialité et la sécurité des données traitées.
- Informer des évolutions importantes de la plateforme.
- Faciliter le suivi des prestations et le traitement des signalements.

## Engagements communs
- Communiquer de bonne foi et se transmettre les informations utiles.
- Signaler rapidement les incidents importants.
- Privilégier le dialogue et la recherche de solutions concertées.$txt$, true, now())
on conflict (type, version) do nothing;

-- =============================================================================
-- 12. Droits
-- =============================================================================
revoke all on function public.inscrire_mon_entreprise(text, text, text, text, text, uuid[], text[], boolean) from public, anon;
revoke all on function public.mettre_a_jour_ma_vitrine(text, text[]) from public, anon;
revoke all on function public.definir_mes_communes(uuid[]) from public, anon;
revoke all on function public.enregistrer_piece_dossier(text, text, uuid) from public, anon;
revoke all on function public.soumettre_mon_dossier() from public, anon;
revoke all on function public.statuer_dossier(uuid, text, text) from public, anon;
revoke all on function public.pieces_manquantes(uuid) from public, anon;
revoke all on function public.dossier_revalidation() from public, anon, authenticated;

grant execute on function public.inscrire_mon_entreprise(text, text, text, text, text, uuid[], text[], boolean) to authenticated;
grant execute on function public.mettre_a_jour_ma_vitrine(text, text[]) to authenticated;
grant execute on function public.definir_mes_communes(uuid[]) to authenticated;
grant execute on function public.enregistrer_piece_dossier(text, text, uuid) to authenticated;
grant execute on function public.soumettre_mon_dossier() to authenticated;
grant execute on function public.statuer_dossier(uuid, text, text) to authenticated;
grant execute on function public.pieces_manquantes(uuid) to authenticated;

revoke all on function public.annuaire_precollecteurs(text) from public;
grant execute on function public.annuaire_precollecteurs(text) to anon, authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : chaque ligne doit afficher « OK ».
-- La ligne 7 compte les précollecteurs déjà visibles dans l'annuaire.
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Dossier du précollecteur : colonnes et états' as controle,
         (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'entreprises'
             and column_name in ('devise', 'logo_path', 'quartiers', 'permis_env_path', 'dossier_statut',
                                 'dossier_motif', 'dossier_soumis_at', 'dossier_statue_at', 'dossier_statue_par')) = 9
         and exists (select 1 from pg_constraint where conname = 'entreprises_dossier_statut_check') as ok,
         'incomplet → soumis → valide ou refuse' as detail
  union all
  select 2, 'Communes d''activité : RLS active, aucune écriture directe',
         (select relrowsecurity from pg_class where oid = 'public.entreprise_communes'::regclass)
         and not exists (select 1 from pg_policies
                          where schemaname = 'public' and tablename = 'entreprise_communes' and cmd <> 'SELECT'),
         (select count(*) || ' commune(s) reprise(s) des entreprises existantes' from public.entreprise_communes)
  union all
  select 3, 'Dossier et vitrine protégés (garde-fou « colonnes système »), revérification si le NIU ou le siège change',
         exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.entreprises'::regclass and t.tgname = 'entreprises_colonnes_systeme'
                    and encode(t.tgargs, 'escape') like '%dossier_statut%')
         and exists (select 1 from pg_trigger t
                      where t.tgrelid = 'public.entreprises'::regclass and t.tgname = 'entreprises_dossier_revalidation'),
         'statut, commune, devise, logo, quartiers, permis, dossier_*'
  union all
  select 4, 'Annuaire ouvert aux visiteurs ; inscription et dossier réservés aux comptes',
         has_function_privilege('anon', 'public.annuaire_precollecteurs(text)', 'execute')
         and not has_function_privilege('anon', 'public.inscrire_mon_entreprise(text, text, text, text, text, uuid[], text[], boolean)', 'execute')
         and not has_function_privilege('anon', 'public.statuer_dossier(uuid, text, text)', 'execute')
         and not has_function_privilege('anon', 'public.soumettre_mon_dossier()', 'execute')
         and not has_function_privilege('anon', 'public.enregistrer_piece_dossier(text, text, uuid)', 'execute')
         and not has_function_privilege('anon', 'public.definir_mes_communes(uuid[])', 'execute')
         and not has_function_privilege('anon', 'public.mettre_a_jour_ma_vitrine(text, text[])', 'execute')
         and not has_function_privilege('anon', 'public.pieces_manquantes(uuid)', 'execute'),
         'annuaire_precollecteurs : nom, logo et devise des dossiers validés'
  union all
  select 5, 'Stockage : pièces privées, logos publics',
         exists (select 1 from storage.buckets where id = 'dossiers' and not public)
         and exists (select 1 from storage.buckets where id = 'logos' and public),
         'dossiers (5 Mo, images et PDF), logos (1 Mo, images)'
  union all
  select 6, 'Conditions d''utilisation et charte du précollecteur publiées',
         (select count(distinct type) from public.documents_legaux
           where type in ('cgu_precollecteur', 'charte_precollecteur') and publie_at is not null) = 2,
         'versions provisoires : à remplacer depuis « Charte et contrat » (administrateur)'
  union all
  select 7, 'Précollecteurs visibles dans l''annuaire (dossier validé)', true,
         (select count(*) filter (where dossier_statut = 'valide') || ' sur ' || count(*)
                 || ' ; les autres complètent leur dossier depuis leur espace' from public.entreprises)
) x order by n;
