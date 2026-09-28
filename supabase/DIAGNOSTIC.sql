-- =============================================================================
-- MyKlinTown — DIAGNOSTIC après reprise d'un projet Supabase mis en pause
-- =============================================================================
-- À coller dans le SQL Editor APRÈS avoir cliqué sur « Resume project »,
-- et AVANT d'exécuter le moindre script d'installation.
--
-- Ne modifie rien : que des lectures.
--
-- Pourquoi : un projet en pause conserve ses données. Le schéma est donc
-- probablement déjà installé — et dans ce cas `setup_all.sql` ne doit PAS
-- être rejoué (il n'a aucun `if not exists` : il échouerait dès le premier
-- `create type` et laisserait le travail à moitié fait).
-- =============================================================================


-- --- 1. Que contient déjà la base ? --------------------------------------
-- Attendu si le schéma est intact : 20 tables, 23 types, current_user_role = true

select
  (select count(*) from pg_tables
     where schemaname = 'public')                                as tables_publiques,
  (select count(*) from pg_type t
     join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e')              as types_enum,
  (select count(*) from pg_policies
     where schemaname = 'public')                                as politiques,
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_depend d
                       where d.objid = c.oid and d.deptype = 'e')
      and c.relrowsecurity)                                      as tables_avec_rls,
  to_regprocedure('public.current_user_role()') is not null      as fct_role_presente,
  to_regprocedure('public.guard_profile_role()') is not null     as correctif_deja_pose,
  (select count(*) from auth.users)                              as comptes_auth,
  (select count(*) from public.profiles)                         as profils;


-- --- 2. Qui a quel rôle aujourd'hui ? ------------------------------------
-- À regarder de près : le trou d'élévation de privilèges est resté ouvert
-- pendant toute la vie du projet. Tout compte `admin` ou `mairie` que vous
-- ne reconnaissez pas doit être expliqué avant d'aller plus loin.

select p.role,
       count(*) as nb,
       string_agg(p.email, ', ' order by p.created_at) as comptes
  from public.profiles p
 group by p.role
 order by nb desc;


-- --- 3. Y a-t-il de vraies données à préserver ? -------------------------
-- Si tout est à zéro, on peut repartir proprement. Sinon, on ne touche à rien.

select 'menages'      as table_, count(*) from public.menages
union all select 'abonnements',   count(*) from public.abonnements
union all select 'paiements',     count(*) from public.paiements
union all select 'signalements',  count(*) from public.signalements
union all select 'incidents',     count(*) from public.incidents_terrain
union all select 'communes',      count(*) from public.communes
union all select 'secteurs',      count(*) from public.secteurs
union all select 'structures',    count(*) from public.structures
 order by 1;


-- --- 4. Tables sans protection ------------------------------------------
-- Doit renvoyer des lignes AVANT setup_rls.sql, et ZÉRO ligne après.

select c.relname            as table_sans_protection,
       c.relrowsecurity     as rls_active,
       count(p.polname)     as nb_politiques
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public' and c.relkind = 'r'
   -- PostGIS installe `spatial_ref_sys` dans public : cette table appartient à
   -- l'extension, on n'en est pas propriétaire et on ne peut pas lui appliquer
   -- de RLS. Ce n'est pas un défaut de notre schéma, on l'écarte du contrôle.
   and not exists (
     select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e'
   )
 group by c.relname, c.relrowsecurity
having c.relrowsecurity = false or count(p.polname) = 0
 order by 1;
