// Le script de contrôle de la production (supabase/EMPREINTE_SCHEMA.sql) :
// à jour avec les migrations, muet sur une base conforme, et précis quand
// une migration manque ou qu'un objet a été ajouté à la main.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerBase } from './banc.mjs';
import { empreinteAttendue, FICHIER_SCRIPT, genererScript } from './empreinte.mjs';

let attendu;
let script;

const executer = async (db) => (await db.query(script)).rows;
const ecarts = (lignes) => lignes.filter((l) => ['ABSENT', 'DIFFÉRENT', 'EN PLUS'].includes(l.etat));

test('le script versionné est à jour avec les migrations (sinon : npm run empreinte)', async () => {
  attendu = await empreinteAttendue({ garderBase: true });
  script = genererScript(attendu);
  const versionne = readFileSync(FICHIER_SCRIPT, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(versionne === script, 'supabase/EMPREINTE_SCHEMA.sql est périmé : lancer `npm run empreinte` dans supabase/tests-securite');
});

test('base conforme aux migrations : une synthèse « OK », aucun écart', async () => {
  const lignes = await executer(attendu.db);
  assert.deepEqual(ecarts(lignes), []);
  assert.deepEqual(lignes.filter((l) => l.etat !== 'INFO').map((l) => l.etat), ['OK']);
  assert.ok(lignes.some((l) => l.etat === 'INFO' && l.categorie === 'paramètre' && l.objet === 'devis_ouverts'));
});

test('objet créé à la main, ou supprimé par une migration mais encore là : EN PLUS', async () => {
  const db = attendu.db;
  await db.exec(`
    create function public.bricolage() returns int language sql as 'select 1';
    create function public.pointer_passage(p_collecte uuid, p_statut text, p_motif text) returns void language sql as 'select';
  `);
  try {
    const e = ecarts(await executer(db));
    assert.ok(e.some((l) => l.etat === 'EN PLUS' && l.objet === 'bricolage()' && l.migration === 'aucune migration'));
    assert.ok(
      e.some((l) => l.etat === 'EN PLUS' && l.objet.startsWith('pointer_passage(p_collecte uuid, p_statut text, p_motif text)')
        && l.migration === 'supprimé par 20261012000010_terrain_hors_ligne'),
      JSON.stringify(e),
    );
  } finally {
    await db.exec(`drop function public.bricolage(); drop function public.pointer_passage(uuid, text, text);`);
  }
});

test('retouche à la main (droit rendu au visiteur anonyme) : DIFFÉRENT, avec la migration qui avait posé le droit', async () => {
  const db = attendu.db;
  await db.exec(`grant execute on function public.statuer_dossier(uuid, text, text) to anon;`);
  try {
    const e = ecarts(await executer(db));
    const ligne = e.find((l) => l.objet === 'statuer_dossier(p_entreprise uuid, p_decision text, p_motif text)');
    assert.ok(ligne, JSON.stringify(e));
    assert.equal(ligne.etat, 'DIFFÉRENT');
    assert.equal(ligne.migration, '20261109000017_dossier_precollecteur_annuaire');
    assert.match(ligne.detail, /anon=non.*trouvé.*anon=oui/);
  } finally {
    await db.exec(`revoke execute on function public.statuer_dossier(uuid, text, text) from anon;`);
    await attendu.db.close();
  }
});

test('migration non jouée : ses objets sont signalés et rattachés à elle', async () => {
  const sans = await creerBase({ exclure: ['20261110000018'] });
  try {
    const lignes = await executer(sans);
    const e = ecarts(lignes);
    assert.ok(e.length > 0);
    assert.ok(e.every((l) => l.migration === '20261110000018_devis_tarif_abonne'), JSON.stringify(e.filter((l) => l.migration !== '20261110000018_devis_tarif_abonne')));
    assert.ok(e.some((l) => l.etat === 'ABSENT' && l.categorie === 'table' && l.objet === 'demandes_devis'));
    assert.ok(e.some((l) => l.etat === 'DIFFÉRENT' && l.categorie === 'table' && l.objet === 'v_clients_statut'));
    assert.ok(lignes.some((l) => l.etat === 'À VÉRIFIER' && l.migration === '20261110000018_devis_tarif_abonne'));
    assert.ok(!lignes.some((l) => l.etat === 'OK'));
  } finally {
    await sans.close();
  }
});
