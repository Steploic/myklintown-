// Preuve par l'exemple : le même catalogue d'attaques joué sur deux copies de
// la base — SANS puis AVEC la migration d'audit — et les parcours normaux
// rejoués sur la seconde.
//
//   node avant-apres.mjs [--migration-en-plus chemin.sql ...]
//
// `--migration-en-plus` ajoute une migration qui n'est pas (encore) dans ce
// dossier, par exemple celle d'une branche non fusionnée déjà jouée en production.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { creerBase } from './banc.mjs';
import { ATTAQUES, PARCOURS, preparer } from './scenario.mjs';

const AUDIT = '20261011000009';
const enPlus = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--migration-en-plus') {
    const chemin = process.argv[++i];
    enPlus.push({ nom: basename(chemin), sql: readFileSync(chemin, 'utf8') });
  }
}

async function jouer(etiquette, options) {
  const db = await creerBase({ ...options, migrationsEnPlus: enPlus });
  const s = await preparer(db);
  const resultats = [];
  for (const a of ATTAQUES) {
    let reussie;
    try {
      reussie = await a.jouer(db, s);
    } catch (e) {
      reussie = `erreur du test : ${e.message}`;
    }
    resultats.push({ id: a.id, titre: a.titre, reussie });
  }
  return { etiquette, db, s, resultats };
}

const avant = await jouer('avant', { exclure: [AUDIT] });
const apres = await jouer('après', {});

console.log('\nATTAQUE'.padEnd(100) + 'AVANT        APRÈS');
let restantes = 0;
let prouvees = 0;
for (const [i, a] of avant.resultats.entries()) {
  const b = apres.resultats[i];
  const f = (r) => (r === true ? '❌ réussit' : r === false ? '✅ bloquée' : `⚠️ ${r}`);
  if (a.reussie === true) prouvees++;
  if (b.reussie !== false) restantes++;
  console.log(`${a.titre.slice(0, 96).padEnd(98)} ${f(a.reussie).padEnd(12)} ${f(b.reussie)}`);
}

console.log('\nPARCOURS NORMAUX (après correctif)');
let casses = 0;
for (const p of PARCOURS) {
  try {
    await p.jouer(apres.db, apres.s);
    console.log(`  ✅ ${p.titre}`);
  } catch (e) {
    casses++;
    console.log(`  ❌ ${p.titre} — ${e.message}`);
  }
}

console.log(`\nFailles reproduites avant : ${prouvees}/${ATTAQUES.length} · encore ouvertes après : ${restantes} · parcours cassés : ${casses}/${PARCOURS.length}`);
process.exit(restantes || casses ? 1 : 0);
