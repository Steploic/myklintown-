-- =============================================================================
-- MyKlinTown — Retrait des portails de démonstration ; cartes centrées sur
-- la commune de chacun (Yaoundé ET Douala)
-- =============================================================================
-- 1. Portails « Collecteur » et « Partenaire B2B » (maquettes) retirés de
--    l'application. Les comptes qui portaient encore ces rôles redeviennent
--    des comptes ménage (`citoyen`) ; l'ancien rôle est gardé dans
--    `securite.roles_retires` (schéma privé, non exposé par l'API).
-- 2. Inscription : `enterprise` n'est plus auto-attribuable. N'importe qui
--    pouvait l'obtenir en le demandant à l'API d'inscription. Restent
--    `citoyen` et `precollecteur`.
-- 3. Communes : centre et zoom de carte (`centre_lat`, `centre_lng`, `zoom`).
--    Écriture réservée à l'administrateur (la Mairie pouvait les modifier ;
--    aucun écran ne le fait).
-- 4. `centre_carte()` : où centrer une carte vide pour le compte connecté
--    (ses zones, sa commune, ses clients, son domicile…), au lieu de Yaoundé
--    pour tout le monde.
--
-- Additive et rejouable : une transaction, rien n'est supprimé (les objets SQL
-- hérités des maquettes restent : tables, valeurs de l'enum `user_role`).
-- À jouer sur la base de TEST, puis sur la vraie, dans le SQL Editor (compte
-- postgres : le déclencheur `guard_profile_role` laisse passer un changement
-- de rôle fait sans jeton d'API).
--
-- Avant, en lecture seule :  select role, count(*) from public.profiles group by 1;
--
-- Annulation (rend les rôles retirés) :
--   begin;
--   update public.profiles p set role = r.ancien_role
--     from securite.roles_retires r
--    where r.user_id = p.id and p.role = 'citoyen';
--   delete from securite.roles_retires;
--   commit;
-- L'inscription en `enterprise` et l'écriture Mairie sur les communes ne
-- reviennent qu'en rejouant 20260928000004 §12.a et 20260831000003 §2 ; les
-- colonnes `centre_*` et `centre_carte()` peuvent rester (inutilisées).
-- =============================================================================

begin;

-- =============================================================================
-- 1. Rôles des maquettes → compte ménage, avec trace
-- =============================================================================
create schema if not exists securite;
revoke all on schema securite from public, anon, authenticated;

create table if not exists securite.roles_retires (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ancien_role public.user_role not null,
  retire_at timestamptz not null default now()
);
revoke all on securite.roles_retires from public, anon, authenticated;

insert into securite.roles_retires (user_id, ancien_role)
select id, role from public.profiles where role in ('enterprise', 'collecteur')
on conflict (user_id) do nothing;

update public.profiles set role = 'citoyen' where role in ('enterprise', 'collecteur');

-- =============================================================================
-- 2. Inscription : `citoyen` ou `precollecteur`, rien d'autre
-- =============================================================================
-- Copie de 20260928000004 §12.a, sans `enterprise`. `precollecteur` ne donne
-- accès qu'aux données de SA propre entreprise (RLS par appartenance) et ne
-- crée son espace qu'avec un code d'agrément de la Mairie (20261013000012).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_demande text := new.raw_user_meta_data ->> 'role';
  v_role    text;
begin
  if v_demande in ('citoyen', 'precollecteur') then
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

-- =============================================================================
-- 3. Communes : centre de carte ; écriture réservée à l'administrateur
-- =============================================================================
alter table public.communes
  add column if not exists centre_lat double precision check (centre_lat between -90 and 90),
  add column if not exists centre_lng double precision check (centre_lng between -180 and 180),
  add column if not exists zoom smallint check (zoom between 3 and 18);

comment on column public.communes.centre_lat is
  'Centre de carte par défaut pour cette commune (WGS 84). Valeur initiale : centre de la VILLE, à affiner par arrondissement.';

-- Valeurs APPROXIMATIVES (centre-ville, pas de chaque arrondissement), à
-- affiner. Seules les communes sans centre sont renseignées : un centre déjà
-- corrigé n'est jamais écrasé.
update public.communes set centre_lat = 3.848, centre_lng = 11.502, zoom = 13
 where code like 'YDE%' and centre_lat is null;
update public.communes set centre_lat = 4.05, centre_lng = 9.70, zoom = 12
 where code like 'DLA%' and centre_lat is null;

drop policy if exists "communes_write_mairie" on public.communes;
drop policy if exists "communes_write_admin" on public.communes;
create policy "communes_write_admin"
  on public.communes for all to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- =============================================================================
-- 4. centre_carte() : où centrer une carte vide pour le compte connecté
-- =============================================================================
-- Ordre de recherche :
--   précollecteur / employé : emprise des zones de son entreprise, sinon sa
--     commune, sinon l'emprise de ses clients localisés ;
--   ménage : sa fiche client, sinon sa demande en attente (arrondi ≈ 100 m :
--     le résultat est gardé dans le navigateur le temps de la session) ;
--   Mairie : sa commune (demande d'accès) ;
--   Mairie et administrateur : emprise de toutes les zones ;
--   sinon : Yaoundé.
-- Ne renvoie que ce que le compte voit déjà (ses zones, ses clients, son
-- domicile) ou des données publiques (communes).
create or replace function public.centre_carte()
returns table (lat double precision, lng double precision, zoom integer,
               lat_min double precision, lng_min double precision,
               lat_max double precision, lng_max double precision,
               origine text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.role_courant();
  v_ent uuid;
  v_commune uuid;
  b record;
begin
  if v_uid is null then
    return;
  end if;

  if v_role in ('precollecteur', 'employe') then
    select m.entreprise_id into v_ent
      from public.entreprise_membres m
     where m.user_id = v_uid
     order by (m.role_membre = 'gerant') desc, m.created_at
     limit 1;

    if v_ent is not null then
      select min((pt ->> 1)::float8) as s, min((pt ->> 0)::float8) as o,
             max((pt ->> 1)::float8) as n, max((pt ->> 0)::float8) as e
        into b
        from public.zone_affectations a
        join public.zones z on z.id = a.zone_id
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(z.contour #> '{coordinates,0}') = 'array' then z.contour #> '{coordinates,0}' end) pt
       where a.entreprise_id = v_ent
         and jsonb_typeof(pt -> 0) = 'number' and jsonb_typeof(pt -> 1) = 'number';
      if b.s is not null then
        return query select (b.s + b.n) / 2, (b.o + b.e) / 2, null::integer, b.s, b.o, b.n, b.e, 'zones'::text;
        return;
      end if;

      select e.commune_id into v_commune from public.entreprises e where e.id = v_ent;
      return query
        select c.centre_lat, c.centre_lng, coalesce(c.zoom, 13)::integer,
               null::float8, null::float8, null::float8, null::float8, 'commune'::text
          from public.communes c
         where c.id = v_commune and c.centre_lat is not null and c.centre_lng is not null;
      if found then
        return;
      end if;

      select min(cl.lat) as s, min(cl.lng) as o, max(cl.lat) as n, max(cl.lng) as e
        into b
        from public.clients cl
       where cl.entreprise_id = v_ent and cl.statut <> 'resilie'
         and cl.lat is not null and cl.lng is not null;
      if b.s is not null then
        return query select (b.s + b.n) / 2, (b.o + b.e) / 2, null::integer, b.s, b.o, b.n, b.e, 'clients'::text;
        return;
      end if;
    end if;

  elsif v_role = 'citoyen' then
    return query
      select round(cl.lat::numeric, 3)::float8, round(cl.lng::numeric, 3)::float8, 16,
             null::float8, null::float8, null::float8, null::float8, 'domicile'::text
        from public.clients cl
       where cl.user_id = v_uid and cl.statut <> 'resilie'
         and cl.lat is not null and cl.lng is not null
       order by cl.created_at desc
       limit 1;
    if found then
      return;
    end if;

    return query
      select round(d.lat::numeric, 3)::float8, round(d.lng::numeric, 3)::float8, 16,
             null::float8, null::float8, null::float8, null::float8, 'demande'::text
        from public.demandes_abonnement d
       where d.user_id = v_uid and d.statut = 'en_attente'
       order by d.created_at desc
       limit 1;
    if found then
      return;
    end if;

  elsif v_role = 'mairie' then
    select d.commune_id into v_commune
      from public.demandes_acces d
     where d.user_id = v_uid and d.commune_id is not null and d.statut <> 'annulee'
     order by (d.statut = 'acceptee') desc, d.created_at desc
     limit 1;
    return query
      select c.centre_lat, c.centre_lng, coalesce(c.zoom, 13)::integer,
             null::float8, null::float8, null::float8, null::float8, 'commune'::text
        from public.communes c
       where c.id = v_commune and c.centre_lat is not null and c.centre_lng is not null;
    if found then
      return;
    end if;
  end if;

  if v_role in ('mairie', 'admin') then
    select min((pt ->> 1)::float8) as s, min((pt ->> 0)::float8) as o,
           max((pt ->> 1)::float8) as n, max((pt ->> 0)::float8) as e
      into b
      from public.zones z
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(z.contour #> '{coordinates,0}') = 'array' then z.contour #> '{coordinates,0}' end) pt
     where jsonb_typeof(pt -> 0) = 'number' and jsonb_typeof(pt -> 1) = 'number';
    if b.s is not null then
      return query select (b.s + b.n) / 2, (b.o + b.e) / 2, null::integer, b.s, b.o, b.n, b.e, 'zones'::text;
      return;
    end if;
  end if;

  return query select 3.848::float8, 11.502::float8, 13,
                      null::float8, null::float8, null::float8, null::float8, 'defaut'::text;
end $$;

-- Droits : comptes connectés seulement (droits par défaut retirés en 0009 §7.a).
revoke all on function public.centre_carte() from public, anon;
grant execute on function public.centre_carte() to authenticated;

commit;

-- =============================================================================
-- Contrôle (à lire dans le résultat) : chaque ligne doit afficher « OK ».
-- =============================================================================
select controle, case when ok then 'OK' else 'À VÉRIFIER' end as resultat, detail
from (
  select 1 as n, 'Comptes des maquettes convertis en ménage' as controle,
         not exists (select 1 from public.profiles where role in ('enterprise', 'collecteur')) as ok,
         'convertis : ' || count(*) || ' (enterprise : ' || count(*) filter (where ancien_role = 'enterprise')
           || ', collecteur : ' || count(*) filter (where ancien_role = 'collecteur') || ')' as detail
    from securite.roles_retires
  union all
  select 2, 'Inscription : « enterprise » n''est plus accepté',
         pg_get_functiondef('public.handle_new_user()'::regprocedure) not like '%''enterprise''%'
         and pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%(''citoyen'', ''precollecteur'')%',
         'citoyen, precollecteur'
  union all
  select 3, 'Communes avec un centre de carte',
         count(*) filter (where centre_lat is null or centre_lng is null) = 0,
         count(*) filter (where centre_lat is not null) || ' / ' || count(*)
    from public.communes
  union all
  select 4, 'Communes : écriture réservée à l''administrateur',
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'communes' and policyname = 'communes_write_mairie')
         and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'communes' and policyname = 'communes_write_admin'),
         coalesce((select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'communes'), 'aucune')
  union all
  select 5, 'centre_carte() : comptes connectés seulement',
         to_regprocedure('public.centre_carte()') is not null
         and has_function_privilege('authenticated', 'public.centre_carte()', 'execute')
         and not has_function_privilege('anon', 'public.centre_carte()', 'execute'),
         case when to_regprocedure('public.centre_carte()') is null then 'absente' else 'présente' end
) x order by n;
