// Empreinte du schéma : la base de production est-elle exactement celle que
// décrivent les migrations du dépôt ?
//
// Les migrations sont jouées à la main dans le SQL Editor. Une migration
// oubliée (0014 l'a été un mois sans que personne ne le voie) ou une retouche
// faite directement dans le tableau de bord ne laissent aucune trace ailleurs.
//
// Ce module rejoue les migrations une à une sur le banc PGlite, relève après
// chacune l'empreinte du catalogue (fonctions, tables et vues, politiques RLS,
// déclencheurs, index, contraintes, types, compartiments de stockage), puis
// génère `supabase/EMPREINTE_SCHEMA.sql` : un script en LECTURE SEULE qui
// embarque l'empreinte attendue, calcule celle de la base où on le colle avec
// la même requête, et ne renvoie que les écarts, chacun rattaché à la
// migration qui a posé l'objet. Aucune donnée personnelle n'est lue.
//
//   npm run empreinte                  régénère le script (après toute nouvelle migration)
//   node empreinte.mjs --verifier      échoue si le script versionné n'est plus à jour
//
// Ce qui est comparé, et pourquoi pas davantage :
//   • fonctions : le CORPS tel qu'écrit dans la migration (prosrc, espaces
//     normalisés), security definer, search_path, droit d'exécution des
//     visiteurs (anon) et des comptes (authenticated) ;
//   • tables et vues : RLS, security_invoker, colonnes (nom, type, non nul),
//     droits du visiteur anonyme ;
//   • politiques, index, contraintes : leur texte tel que Postgres le restitue,
//     sans espaces ni parenthèses (la restitution varie peu d'une version de
//     Postgres à l'autre ; la CI vérifie l'accord entre PGlite et le Postgres de
//     Supabase) ; les contraintes NOT NULL, cataloguées seulement depuis
//     Postgres 18, sont déjà couvertes par les colonnes ;
//   • les objets des extensions (PostGIS, uuid-ossp) et `spatial_ref_sys`
//     sont laissés de côté : ils ne viennent pas des migrations.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerBase } from './banc.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
export const FICHIER_SCRIPT = join(ICI, '..', 'EMPREINTE_SCHEMA.sql');

/** Exclut les objets installés par une extension (PostGIS, uuid-ossp…). */
const HORS_EXTENSION = (classe, oid) =>
  `not exists (select 1 from pg_depend d where d.classid = '${classe}'::regclass and d.objid = ${oid} and d.deptype = 'e')`;

/**
 * La même requête sert à calculer l'empreinte attendue (banc) et l'empreinte
 * réelle (base où l'on colle le script) : trois colonnes, categorie / objet / valeur.
 */
export const REQUETE_EMPREINTE = String.raw`
  -- Fonctions : corps, sécurité, search_path, droits d'exécution
  select 'fonction'::text as categorie,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as objet,
         left(md5(btrim(regexp_replace(coalesce(p.prosrc, ''), '\s+', ' ', 'g'))), 12)
           || case when p.prosecdef then '|definer' else '|invoker' end
           || '|' || coalesce(array_to_string(p.proconfig, ';'), '-')
           || '|anon=' || case when has_function_privilege('anon', p.oid, 'execute') then 'oui' else 'non' end
           || '|connecte=' || case when has_function_privilege('authenticated', p.oid, 'execute') then 'oui' else 'non' end as valeur
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and ${HORS_EXTENSION('pg_proc', 'p.oid')}
  union all
  -- Tables et vues : RLS, security_invoker, colonnes, droits du visiteur anonyme
  select 'table', c.relname,
         case when c.relkind in ('v', 'm') then 'vue' else 'table' end
           || '|rls=' || case when c.relrowsecurity then 'oui' else 'non' end
           || case when c.relkind = 'v'
                   then '|invoker=' || case when coalesce(c.reloptions::text, '') ~ 'security_invoker=(true|on|1)' then 'oui' else 'non' end
                   else '' end
           || '|colonnes=' || left(md5(coalesce((
                select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' nn' else '' end,
                                  ',' order by a.attname)
                  from pg_attribute a
                 where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '')), 12)
           || '|anon=' || coalesce(nullif(concat(
                case when has_table_privilege('anon', c.oid, 'select') then 's' end,
                case when has_table_privilege('anon', c.oid, 'insert') then 'i' end,
                case when has_table_privilege('anon', c.oid, 'update') then 'u' end,
                case when has_table_privilege('anon', c.oid, 'delete') then 'd' end), ''), '-')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and ${HORS_EXTENSION('pg_class', 'c.oid')}
  union all
  -- Politiques RLS (schémas public et storage)
  select 'politique', pol.schemaname || '.' || pol.tablename || ' · ' || pol.policyname,
         lower(pol.cmd) || '|' || lower(pol.permissive)
           || '|' || array_to_string(array(select r::text from unnest(pol.roles) r order by 1), ',')
           || '|using=' || left(md5(lower(regexp_replace(coalesce(pol.qual, ''), '[\s()]+', '', 'g'))), 8)
           || '|check=' || left(md5(lower(regexp_replace(coalesce(pol.with_check, ''), '[\s()]+', '', 'g'))), 8)
    from pg_policies pol
   where pol.schemaname in ('public', 'storage') and pol.tablename <> 'spatial_ref_sys'
  union all
  -- Déclencheurs (dont celui qui crée le profil à l'inscription, sur auth.users)
  select 'déclencheur', n.nspname || '.' || c.relname || ' · ' || t.tgname,
         p.proname || '|type=' || t.tgtype::text || '|etat=' || t.tgenabled::text
           || '|colonnes=' || coalesce((select string_agg(a.attname, ',' order by a.attname)
                                          from pg_attribute a where a.attrelid = t.tgrelid and a.attnum = any (t.tgattr)), '-')
           || '|args=' || left(md5(encode(t.tgargs, 'escape')), 8)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and n.nspname in ('public', 'auth')
     and ${HORS_EXTENSION('pg_class', 'c.oid')}
  union all
  -- Index
  select 'index', ci.relname,
         left(md5(lower(regexp_replace(pg_get_indexdef(i.indexrelid), '[\s()]+', '', 'g'))), 12)
    from pg_index i
    join pg_class ci on ci.oid = i.indexrelid
    join pg_class ct on ct.oid = i.indrelid
    join pg_namespace n on n.oid = ct.relnamespace
   where n.nspname = 'public'
     and ${HORS_EXTENSION('pg_class', 'ct.oid')}
  union all
  -- Contraintes (clés, uniques, vérifications ; NOT NULL : voir les colonnes)
  select 'contrainte', ct.relname || ' · ' || co.conname,
         co.contype::text || '|' || left(md5(lower(regexp_replace(pg_get_constraintdef(co.oid), '[\s()]+', '', 'g'))), 12)
    from pg_constraint co
    join pg_class ct on ct.oid = co.conrelid
    join pg_namespace n on n.oid = ct.relnamespace
   where n.nspname = 'public' and co.contype <> 'n'
     and ${HORS_EXTENSION('pg_class', 'ct.oid')}
  union all
  -- Types énumérés (rôles…)
  select 'type', x.typname, x.valeurs
    from (select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) as valeurs
            from pg_type t
            join pg_enum e on e.enumtypid = t.oid
            join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public'
           group by t.typname) x
  union all
  -- Compartiments de stockage
  select 'stockage', b.id,
         case when b.public then 'public' else 'privé' end
           || '|taille=' || coalesce(b.file_size_limit::text, '-')
           || '|types=' || coalesce(array_to_string(array(select m from unnest(b.allowed_mime_types) m order by 1), ','), '-')
    from storage.buckets b`;

const cle = (categorie, objet) => `${categorie}\u0000${objet}`;

/** Empreinte d'une base : Map « catégorie + objet » → valeur. */
export async function calculerEmpreinte(db) {
  const r = await db.query(`select categorie, objet, valeur from (${REQUETE_EMPREINTE}) e`);
  return new Map(r.rows.map((l) => [cle(l.categorie, l.objet), l.valeur]));
}

/**
 * Empreinte attendue : les migrations rejouées une à une. Pour chaque objet,
 * la DERNIÈRE migration qui l'a créé ou modifié ; pour chaque objet disparu en
 * cours de route, la migration qui l'a supprimé.
 */
export async function empreinteAttendue({ garderBase = false, journal } = {}) {
  let avant = new Map();
  const origine = new Map();
  const supprime = new Map();
  let derniere = '';
  const db = await creerBase({
    journal,
    apresChaque: async (nom, base) => {
      const apres = await calculerEmpreinte(base);
      for (const [k, v] of apres) {
        if (avant.get(k) !== v) {
          origine.set(k, nom.replace(/\.sql$/, ''));
          supprime.delete(k);
        }
      }
      for (const k of avant.keys()) {
        if (!apres.has(k)) {
          supprime.set(k, nom.replace(/\.sql$/, ''));
          origine.delete(k);
        }
      }
      avant = apres;
      derniere = nom.replace(/\.sql$/, '');
    },
  });
  if (!garderBase) await db.close();
  return { finale: avant, origine, supprime, derniere, db: garderBase ? db : null };
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const parCle = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/** Le script SQL à coller dans le SQL Editor (texte complet, fins de ligne LF). */
export function genererScript({ finale, origine, supprime, derniere }) {
  const lignesAttendu = [...finale]
    .sort(parCle)
    .map(([k, v]) => {
      const [categorie, objet] = k.split('\u0000');
      return `    (${lit(categorie)}, ${lit(objet)}, ${lit(v)}, ${lit(origine.get(k) ?? '?')})`;
    });
  const lignesSupprime = [...supprime]
    .sort(parCle)
    .map(([k, m]) => {
      const [categorie, objet] = k.split('\u0000');
      return `    (${lit(categorie)}, ${lit(objet)}, ${lit(m)})`;
    });
  const nb = (c) => [...finale.keys()].filter((k) => k.startsWith(`${c}\u0000`)).length;
  const resume = ['fonction', 'table', 'politique', 'déclencheur', 'index', 'contrainte', 'type', 'stockage']
    .map((c) => `${nb(c)} ${c}${nb(c) > 1 && !c.endsWith('x') ? 's' : ''}`)
    .join(', ');

  return `-- =============================================================================
-- MyKlinTown — Empreinte du schéma : la base est-elle celle des migrations ?
-- =============================================================================
-- LECTURE SEULE : ne modifie rien. Ne lit que le catalogue de Postgres (la
-- description des fonctions, tables, politiques…), les compartiments de
-- stockage et les paramètres de la plateforme : aucune donnée d'abonné.
--
-- Usage : SQL Editor de Supabase → coller TOUT le fichier → Run.
--   • une ligne « OK » : la base est exactement celle des migrations ;
--   • sinon « À VÉRIFIER », puis un écart par ligne, avec la migration en cause :
--       ABSENT     l'objet manque dans la base (migration non jouée, ou annulée) ;
--       DIFFÉRENT  l'objet existe dans une autre version (ancienne migration,
--                  retouche faite à la main dans le tableau de bord) ;
--       EN PLUS    l'objet n'existe dans aucune migration (créé à la main, ou
--                  « supprimé par » une migration qui n'a pas été jouée).
--   • les lignes INFO (version de Postgres, extensions, paramètres) ne sont pas
--     des écarts : elles servent à l'analyse.
--
-- Fichier GÉNÉRÉ par supabase/tests-securite/empreinte.mjs à partir des
-- migrations du dépôt (dernière : ${derniere}). Ne pas le modifier à la main :
-- après toute nouvelle migration, \`npm run empreinte\` dans supabase/tests-securite.
-- Empreinte attendue : ${resume}.
-- =============================================================================
with attendu (categorie, objet, valeur, migration) as (
  values
${lignesAttendu.join(',\n')}
),
supprime (categorie, objet, migration) as (
${lignesSupprime.length ? `  values\n${lignesSupprime.join(',\n')}` : '  select null::text, null::text, null::text where false'}
),
reel as (${REQUETE_EMPREINTE}
),
ecarts as (
  select case when r.objet is null then 'ABSENT'
              when a.objet is null then 'EN PLUS'
              else 'DIFFÉRENT' end as etat,
         coalesce(a.categorie, r.categorie) as categorie,
         coalesce(a.objet, r.objet) as objet,
         coalesce(a.migration, 'supprimé par ' || s.migration, 'aucune migration') as migration,
         case when a.objet is not null and r.objet is not null then 'attendu ' || a.valeur || ' ; trouvé ' || r.valeur
              when a.objet is null then 'trouvé ' || r.valeur
              else 'attendu ' || a.valeur end as detail
    from attendu a
    full join reel r on r.categorie = a.categorie and r.objet = a.objet
    left join supprime s on s.categorie = coalesce(a.categorie, r.categorie) and s.objet = coalesce(a.objet, r.objet)
   where a.valeur is distinct from r.valeur
),
infos (categorie, objet, detail) as (
  select 'base', 'version de Postgres', current_setting('server_version')
  union all
  select 'extension', e.extname::text, e.extversion from pg_extension e
  union all
  select 'paramètre', p.cle, p.valeur::text from public.parametres_plateforme p
)
select etat, categorie, objet, migration, detail
from (
  select 0 as rang, 'OK' as etat, 'synthèse' as categorie, 'aucun écart' as objet,
         ${lit(derniere)} as migration,
         (select count(*) from attendu)::text || ' objets conformes aux migrations' as detail
   where not exists (select 1 from ecarts)
  union all
  select 0, 'À VÉRIFIER', 'synthèse', count(*)::text || ' écart(s)', string_agg(distinct e.migration, ', '),
         'ABSENT = manque dans la base ; DIFFÉRENT = autre version ; EN PLUS = inconnu des migrations'
    from ecarts e
  having count(*) > 0
  union all
  select 1, e.etat, e.categorie, e.objet, e.migration, e.detail from ecarts e
  union all
  select 2, 'INFO', i.categorie, i.objet, '', i.detail from infos i
) x
order by rang, migration, categorie, objet;
`;
}

// -----------------------------------------------------------------------------
// Ligne de commande
// -----------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const verifier = process.argv.includes('--verifier');
  const attendu = await empreinteAttendue({ journal: verifier ? undefined : (m) => console.log(m) });
  const script = genererScript(attendu);
  if (verifier) {
    let actuel = '';
    try {
      actuel = readFileSync(FICHIER_SCRIPT, 'utf8').replace(/\r\n/g, '\n');
    } catch {
      // absent : traité comme périmé
    }
    if (actuel !== script) {
      console.error('supabase/EMPREINTE_SCHEMA.sql n’est plus à jour : lancer `npm run empreinte` dans supabase/tests-securite.');
      process.exit(1);
    }
    console.log('supabase/EMPREINTE_SCHEMA.sql est à jour.');
  } else {
    writeFileSync(FICHIER_SCRIPT, script);
    console.log(`→ ${FICHIER_SCRIPT} (${attendu.finale.size} objets, dernière migration : ${attendu.derniere})`);
  }
}
