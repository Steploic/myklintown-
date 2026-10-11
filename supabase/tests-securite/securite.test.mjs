// Tests de sécurité de la base, hors ligne (node --test).
// Toutes les migrations du dépôt sont rejouées sur une copie locale (PGlite +
// PostGIS) habillée comme Supabase ; puis :
//   1. chaque attaque du catalogue doit être REFUSÉE ;
//   2. chaque parcours normal doit FONCTIONNER ;
//   3. des invariants valables pour TOUTE future migration (une table sans
//      RLS, une fonction privilégiée sans search_path ou ouverte aux visiteurs
//      fait échouer la CI).
//
// Variable MIGRATIONS_EN_PLUS : chemins de migrations hors dossier, séparés
// par « ; » (ex. celle d'une branche non fusionnée déjà jouée en production).

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { comme, creerBase } from './banc.mjs';
import { ATTAQUES, PARCOURS, preparer } from './scenario.mjs';

const enPlus = (process.env.MIGRATIONS_EN_PLUS ?? '')
  .split(';')
  .filter(Boolean)
  .map((chemin) => ({ nom: basename(chemin), sql: readFileSync(chemin, 'utf8') }));

let db;
let s;
before(async () => {
  db = await creerBase({ migrationsEnPlus: enPlus });
  s = await preparer(db);
});

const lignes = async (sql) => (await db.query(sql)).rows;

describe('Attaques : toutes refusées', () => {
  for (const a of ATTAQUES) {
    test(a.titre, async () => {
      assert.equal(await a.jouer(db, s), false, `faille ouverte : ${a.id}`);
    });
  }
});

describe('Parcours normaux : tous fonctionnent', () => {
  for (const p of PARCOURS) {
    test(p.titre, () => p.jouer(db, s));
  }
});

describe('Invariants (valables pour toute future migration)', () => {
  test('aucune table du schéma public sans RLS (hors extensions)', async () => {
    const r = await lignes(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')`);
    assert.deepEqual(r.map((x) => x.relname), []);
  });

  test('toute fonction SECURITY DEFINER fixe son search_path', async () => {
    const r = await lignes(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         -- hors fonctions d'extension (la version de PostGIS de Supabase en a : st_estimatedextent)
         and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`);
    assert.deepEqual(r.map((x) => x.proname), []);
  });

  test('fonctions SECURITY DEFINER ouvertes aux visiteurs : uniquement la liste autorisée', async () => {
    const autorisees = ['apercu_invitation', 'est_admin'];
    const r = await lignes(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
       order by 1`);
    assert.deepEqual(r.map((x) => x.proname).filter((x) => !autorisees.includes(x)), []);
  });

  test('aucune politique d’écriture ne s’applique aux visiteurs anonymes', async () => {
    const r = await lignes(`
      select tablename || '.' || policyname as p from pg_policies
       where schemaname in ('public', 'storage') and cmd <> 'SELECT' and roles && array['anon', 'public']::name[]`);
    assert.deepEqual(r.map((x) => x.p), []);
  });

  test('lecture anonyme : seulement la grille tarifaire, les communes et le référentiel PostGIS', async () => {
    const r = await lignes(`
      select distinct tablename from pg_policies
       where schemaname in ('public', 'storage') and roles && array['anon', 'public']::name[] order by 1`);
    assert.deepEqual(r.map((x) => x.tablename), ['communes', 'plans_tarifaires', 'spatial_ref_sys']);
  });

  test('toute vue du schéma public s’exécute avec les droits de l’appelant', async () => {
    const r = await lignes(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
         and not coalesce(c.reloptions::text, '') like '%security_invoker=true%'`);
    assert.deepEqual(r.map((x) => x.relname), []);
  });

  test('le compte anonyme ne lit aucune donnée personnelle', async () => {
    for (const table of ['profiles', 'clients', 'factures', 'paiements_clients', 'employes', 'demandes_abonnement', 'incidents_precollecte', 'positions_tournee']) {
      const n = await comme(db, 'anon', async (tx) => (await tx.query(`select count(*)::int n from public.${table}`)).rows[0].n);
      assert.equal(n, 0, table);
    }
  });
});

// Cas réel de Supabase : spatial_ref_sys appartient à supabase_admin, qui a
// donné les droits aux rôles de l'API ; la migration tourne sous `postgres`,
// qui N'EST PAS superutilisateur. On rejoue ce montage à part.
describe('spatial_ref_sys quand on n’en est pas propriétaire (montage Supabase)', () => {
  test('le verrou par déclencheur protège la table', async () => {
    const base = await PGlite.create({ extensions: { postgis } });
    await base.exec(`
      create role anon nologin; create role authenticated nologin; create role supabase_admin nologin superuser;
      create role migrateur nologin;
      create extension postgis;
      alter table public.spatial_ref_sys owner to supabase_admin;
      grant usage, create on schema public to migrateur, anon, authenticated;
      set role supabase_admin;
      grant all on public.spatial_ref_sys to anon, authenticated, migrateur;
      reset role;`);
    const migration = readFileSync(new URL('../migrations/20261011000009_audit_securite.sql', import.meta.url), 'utf8');
    const debut = migration.indexOf('create or replace function public.spatial_ref_sys_lecture_seule');
    const fin = migration.indexOf('-- 2. Cohérence entre entreprises');
    const section = migration
      .slice(debut, fin)
      .replace(/^-- =+$/m, '')
      // Ici le « postgres » de Supabase s'appelle migrateur.
      .replace("('postgres', 'supabase_admin')", "('migrateur', 'supabase_admin')");
    await base.exec(`set role migrateur; ${section} reset role;`);

    const rls = (await base.query(`select relrowsecurity r from pg_class where oid = 'public.spatial_ref_sys'::regclass`)).rows[0].r;
    assert.equal(rls, false, 'la RLS ne devrait pas pouvoir être activée sans être propriétaire');
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(
        base.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query(`delete from public.spatial_ref_sys where srid = 4326`);
        }),
        /lecture seule/,
        role,
      );
    }
    const n = (await base.query(`select count(*)::int n from public.spatial_ref_sys where srid = 4326`)).rows[0].n;
    assert.equal(n, 1);
  });
});
