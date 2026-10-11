// Banc de test de la base, hors ligne : une copie locale de Postgres (PGlite +
// PostGIS) habillée comme Supabase (rôles anon / authenticated / service_role,
// auth.uid(), stockage), sur laquelle on rejoue les migrations du dépôt.
//
// Ce que le banc imite de Supabase, et ce qu'il n'imite pas :
//   • les rôles et les droits par défaut du schéma public (tout aux trois rôles
//     de l'API, comme Supabase) ; PostgREST est simulé par `set role` + les
//     « claims » du jeton dans `request.jwt.claims` ;
//   • PAS le propriétaire des tables d'extensions : ici le compte qui installe
//     PostGIS est superutilisateur. Le cas réel (spatial_ref_sys appartenant à
//     supabase_admin) est rejoué à part dans les tests.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const ICI = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_MIGRATIONS = join(ICI, '..', 'migrations');

const HABILLAGE_SUPABASE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_admin nologin superuser;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Droits par défaut du schéma public, comme sur Supabase.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function listeMigrations({ jusqua, exclure = [] } = {}) {
  return readdirSync(DOSSIER_MIGRATIONS)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .sort()
    .filter((f) => !exclure.some((e) => f.startsWith(e)))
    .filter((f) => !jusqua || f.slice(0, 14) <= jusqua);
}

/** Base neuve, habillée comme Supabase, migrations appliquées dans l'ordre. */
export async function creerBase({ jusqua, exclure, migrationsEnPlus = [], journal = () => {} } = {}) {
  const db = await PGlite.create({ extensions: { postgis, uuid_ossp } });
  await db.exec(HABILLAGE_SUPABASE);
  const fichiers = listeMigrations({ jusqua, exclure }).map((f) => ({ nom: f, sql: readFileSync(join(DOSSIER_MIGRATIONS, f), 'utf8') }));
  for (const m of [...fichiers, ...migrationsEnPlus].sort((a, b) => a.nom.localeCompare(b.nom))) {
    try {
      await db.exec(m.sql);
      journal(`✓ ${m.nom}`);
    } catch (e) {
      throw new Error(`Migration ${m.nom} en échec : ${e.message}`);
    }
  }
  return db;
}

// -----------------------------------------------------------------------------
// Jouer une requête « comme » un appelant de l'API
// -----------------------------------------------------------------------------

/**
 * Exécute `fn(tx)` dans une transaction, sous le rôle de l'appelant :
 *   'anon' · 'service' · un uuid d'utilisateur connecté · null (SQL Editor).
 * La transaction est validée si `fn` réussit, annulée sinon.
 */
export async function comme(db, qui, fn) {
  return db.transaction(async (tx) => {
    if (qui === 'anon') {
      await tx.exec(`set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);`);
    } else if (qui === 'service') {
      await tx.exec(`set local role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', true);`);
    } else if (qui) {
      const claims = JSON.stringify({ sub: qui, role: 'authenticated' }).replace(/'/g, "''");
      await tx.exec(`set local role authenticated; select set_config('request.jwt.claims', '${claims}', true);`);
    }
    return fn(tx);
  });
}

/** Une valeur (première colonne de la première ligne). */
export async function valeur(tx, sql, params = []) {
  const r = await tx.query(sql, params);
  const ligne = r.rows[0];
  return ligne ? Object.values(ligne)[0] : undefined;
}

/** Crée un compte (comme une inscription) ; renvoie son id. */
export async function creerCompte(db, email, role = 'citoyen', nom = email.split('@')[0]) {
  const r = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ role, nom_complet: nom })],
  );
  return r.rows[0].id;
}

/** Promotion légitime (SQL Editor). */
export async function promouvoir(db, email, role) {
  await db.query(`select public.promouvoir_utilisateur($1, $2::public.user_role)`, [email, role]);
}
