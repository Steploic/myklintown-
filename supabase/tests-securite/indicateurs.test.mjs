// Indicateurs du pilote (migration 20261013000011), hors ligne (node --test).
//
// Un jeu de données construit à la main, où chaque ménage illustre une règle
// (à jour, en délai de grâce, payé APRÈS le jour de mesure, démo, résilié…),
// puis les huit indicateurs comparés AU CHIFFRE PRÈS à ce que l'on attend.
// Puis les droits : qui lit, qui écrit, qui ne peut rien.
//
// Les dates sont relatives à aujourd'hui (jour de Yaoundé) : T = aujourd'hui,
// D = T − 10 = jour de mesure, P = [D − 6, D] = la semaine mesurée.

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { comme, creerBase, creerCompte, creerEntreprise, promouvoir, valeur } from './banc.mjs';

let db;
let T;
const d = {};

/** Date ISO décalée de n jours par rapport à T. */
const jour = (n) => {
  const x = new Date(`${T}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Horodatage à Yaoundé (UTC+1), n jours après T. */
const heure = (n, hh = '10:00') => `${jour(n)} ${hh}:00+01`;
const D = -10;

const un = async (sql, params = []) => valeur(db, sql, params);

async function entreprise(nom, communeCode = null) {
  const commune = communeCode ? await un(`select id from public.communes where code = $1`, [communeCode]) : null;
  return un(`insert into public.entreprises (nom, commune_id) values ($1, $2) returning id`, [nom, commune]);
}
async function client(ent, nom, { statut = 'actif', demo = false, cree = heure(D - 40) } = {}) {
  return un(
    `insert into public.clients (entreprise_id, nom, statut, est_demo, created_at) values ($1, $2, $3, $4, $5) returning id`,
    [ent, nom, statut, demo, cree],
  );
}
async function facture(ent, cli, debut, fin, montant = 3500) {
  return un(
    `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
     values ($1, $2, $3, $4, $5, $3) returning id`,
    [ent, cli, jour(debut), jour(fin), montant],
  );
}
async function paiement(ent, cli, fac, montant, methode, statut, cree) {
  return un(
    `insert into public.paiements_clients (entreprise_id, client_id, facture_id, montant_fcfa, methode, statut, created_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [ent, cli, fac, montant, methode, statut, cree],
  );
}
async function tournee(ent, date, statut = 'terminee') {
  return un(`insert into public.tournees_precollecte (entreprise_id, date, statut) values ($1, $2, $3) returning id`, [ent, jour(date), statut]);
}
async function collecte(ent, tour, cli, date, statut) {
  return un(
    `insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue, statut) values ($1, $2, $3, $4, $5) returning id`,
    [ent, tour, cli, jour(date), statut],
  );
}
async function incident(ent, cli, source, cree, { resolu = null, statut = resolu ? 'resolu' : 'ouvert' } = {}) {
  return un(
    `insert into public.incidents_precollecte (entreprise_id, client_id, source, categorie, auteur_id, created_at, statut, resolu_at)
     values ($1, $2, $3, 'autre', $4, $5, $6, $7) returning id`,
    [ent, cli, source, d.auteur, cree, statut, resolu],
  );
}
const kpi = async (debut, fin, perimetre = 'pilote', type = 'semaine') =>
  un(`select public.kpi_calculer($1::date, $2::date, $3, $4)`, [jour(debut), jour(fin), perimetre, type]);

before(async () => {
  db = await creerBase();
  T = await un(`select ((now() at time zone 'Africa/Douala')::date)::text`);
  d.auteur = await creerCompte(db, 'auteur@test.cm');

  // --- Trois précollecteurs : Yaoundé (par sa zone), Douala (par son siège), sans ville
  d.A = await entreprise('A Yaoundé');
  const zone = await un(
    `insert into public.zones (nom, commune_id, contour) values ('ZA', (select id from public.communes where code = 'YDE3'), $1) returning id`,
    [JSON.stringify({ type: 'Polygon', coordinates: [[[11.49, 3.84], [11.51, 3.84], [11.51, 3.86], [11.49, 3.84]]] })],
  );
  await db.query(`insert into public.zone_affectations (zone_id, entreprise_id) values ($1, $2)`, [zone, d.A]);
  d.B = await entreprise('B Douala', 'DLA1');
  d.C = await entreprise('C sans ville');
  d.E = await entreprise('E Douala, sans charges', 'DLA2');

  // --- Ménages de A (chacun illustre une règle)
  const A = d.A;
  d.a1 = await client(A, 'a1 à jour');
  const fa1 = await facture(A, d.a1, D - 20, D + 9);
  await paiement(A, d.a1, fa1, 3500, 'especes', 'valide', heure(D - 20));

  d.a2 = await client(A, 'a2 en grâce'); // période finie à D−5, grâce de 7 jours
  const fa2 = await facture(A, d.a2, D - 40, D - 5);
  await paiement(A, d.a2, fa2, 3500, 'especes', 'valide', heure(D - 40));

  d.a3 = await client(A, 'a3 impayé'); // acomptes partiels seulement
  const fa3 = await facture(A, d.a3, D - 20, D + 9);
  await paiement(A, d.a3, fa3, 1000, 'mtn_momo', 'valide', heure(D - 3));
  await paiement(A, d.a3, fa3, 500, 'especes', 'a_valider', heure(D - 9)); // non rapproché depuis > 7 jours

  d.a4 = await client(A, 'a4 payé après D');
  const fa4 = await facture(A, d.a4, D - 20, D + 9);
  await paiement(A, d.a4, fa4, 3500, 'especes', 'valide', heure(D + 1));

  d.a5 = await client(A, 'a5 suspendu', { statut: 'suspendu' });
  d.a6 = await client(A, 'a6 demande', { statut: 'demande' });

  d.a7 = await client(A, 'a7 résilié', { statut: 'resilie' }); // dans la cohorte de rétention, non renouvelé
  const fa7 = await facture(A, d.a7, D - 45, D - 15);
  await paiement(A, d.a7, fa7, 3500, 'especes', 'valide', heure(D - 45));

  d.a8 = await client(A, 'a8 démo', { demo: true });
  const fa8 = await facture(A, d.a8, D - 20, D + 9);
  await paiement(A, d.a8, fa8, 3500, 'orange_money', 'valide', heure(D - 2));

  d.a9 = await client(A, 'a9 inscrit après D', { cree: heure(D + 2) });
  const fa9 = await facture(A, d.a9, D + 2, D + 30);
  await paiement(A, d.a9, fa9, 3500, 'especes', 'valide', heure(D + 2));

  d.a10 = await client(A, 'a10 renouvelé'); // période finie à D−10, suivante payée
  const fa10 = await facture(A, d.a10, D - 50, D - 10);
  await paiement(A, d.a10, fa10, 3500, 'especes', 'valide', heure(D - 50));
  const fa10b = await facture(A, d.a10, D - 9, D + 20);
  await paiement(A, d.a10, fa10b, 3500, 'especes', 'valide', heure(D - 12));

  d.a11 = await client(A, 'a11 non renouvelé'); // période finie à D−10, suivante pas payée
  const fa11 = await facture(A, d.a11, D - 50, D - 10);
  await paiement(A, d.a11, fa11, 3500, 'especes', 'valide', heure(D - 50));
  const fa11b = await facture(A, d.a11, D - 9, D + 20);
  await paiement(A, d.a11, fa11b, 2000, 'especes', 'a_valider', heure(D - 2));
  await paiement(A, d.a11, fa11b, 1500, 'especes', 'valide', heure(D - 1));
  await paiement(A, d.a11, fa11b, 500, 'especes', 'rejete', heure(D - 4));

  // Passages de A dans la semaine P
  const t1 = await tournee(A, D - 3);
  await collecte(A, t1, d.a1, D - 3, 'realisee');
  await collecte(A, t1, d.a2, D - 3, 'realisee');
  await collecte(A, t1, d.a3, D - 3, 'non_realisee');
  await collecte(A, t1, d.a10, D - 3, 'realisee');
  await collecte(A, t1, d.a8, D - 3, 'realisee'); // démo : ignoré
  const t2 = await tournee(A, D - 2, 'annulee');
  await collecte(A, t2, d.a1, D - 2, 'prevue'); // tournée annulée : ignoré
  const t3 = await tournee(A, D - 1, 'en_cours');
  await collecte(A, t3, d.a11, D - 1, 'prevue'); // jamais fait : compte comme non réalisé
  const t0 = await tournee(A, D - 8);
  await collecte(A, t0, d.a1, D - 8, 'realisee'); // hors période

  // Signalements des ménages de A
  await incident(A, d.a1, 'client', heure(D - 5), { resolu: heure(D - 4) }); // 24 h
  await incident(A, d.a2, 'client', heure(D - 6, '08:00'), { resolu: heure(D - 5, '20:00') }); // 36 h
  await incident(A, d.a3, 'client', heure(D - 10, '12:00'), { resolu: heure(D + 3) }); // ouvert au jour D
  await incident(A, d.a4, 'client', heure(D - 2, '00:00')); // ouvert
  await incident(A, d.a8, 'client', heure(D - 5), { resolu: heure(D - 5, '11:00') }); // démo : ignoré
  // Incidents de terrain de A
  await incident(A, null, 'precollecteur', heure(D - 3));
  await incident(A, d.a3, 'precollecteur', heure(D - 1));
  await incident(A, null, 'precollecteur', heure(D - 20)); // hors période

  // --- B (Douala)
  d.b1 = await client(d.B, 'b1 à jour');
  const fb1 = await facture(d.B, d.b1, D - 10, D + 19);
  await paiement(d.B, d.b1, fb1, 3500, 'orange_money', 'valide', heure(D - 10));
  const tb = await tournee(d.B, D - 2);
  await collecte(d.B, tb, d.b1, D - 2, 'realisee');

  // --- C (sans ville) : un inscrit sans facture
  d.c1 = await client(d.C, 'c1 sans facture');

  // --- Coût de collecte : mois M, bien avant tout le reste (T − 100)
  d.M = await un(`select date_trunc('month', $1::date)::date::text`, [jour(-100)]);
  const m = (n) => {
    const x = new Date(`${d.M}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  d.m = m;
  const b2 = await client(d.B, 'b2', { cree: `${m(1)} 09:00:00+01` });
  const b3 = await client(d.B, 'b3 démo', { demo: true });
  const fb2 = await un(
    `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
     values ($1, $2, $3, $4, 3500, $3) returning id`,
    [d.B, b2, m(2), m(27)],
  );
  await paiement(d.B, b2, fb2, 3500, 'especes', 'valide', `${m(3)} 09:00:00+01`);
  for (const [n, cli] of [[5, d.b1], [12, d.b1], [5, b2], [5, b3]]) {
    const t = await un(`insert into public.tournees_precollecte (entreprise_id, date) values ($1, $2) returning id`, [d.B, m(n)]);
    await un(`insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue, statut) values ($1, $2, $3, $4, 'realisee') returning id`, [d.B, t, cli, m(n)]);
  }
  await db.query(
    `insert into public.couts_exploitation (entreprise_id, mois, categorie, montant_fcfa) values ($1, $2, 'carburant', 30000), ($1, $2, 'personnel', 45000)`,
    [d.B, d.M],
  );
  const e1 = await client(d.E, 'e1');
  const te = await un(`insert into public.tournees_precollecte (entreprise_id, date) values ($1, $2) returning id`, [d.E, m(6)]);
  await un(`insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue, statut) values ($1, $2, $3, $4, 'realisee') returning id`, [d.E, te, e1, m(6)]);
});

describe('Les huit indicateurs, au chiffre près', () => {
  test('Yaoundé : abonnés actifs, taux de paiement (délai de grâce, paiement après le jour de mesure, démo)', async () => {
    const v = await kpi(D - 6, D, 'yaounde');
    assert.equal(v.mesure_au, jour(D));
    assert.equal(v.menages_inscrits, 7, 'a1 a2 a3 a4 a5 a10 a11 (ni demande, ni résilié, ni démo, ni inscrit après D)');
    assert.deepEqual(v.abonnes_actifs, { valeur: 3, dont_grace: 1 }, 'a1 et a10 couverts, a2 en grâce');
    assert.deepEqual(v.taux_paiement, { valeur: 0.4286, num: 3, den: 7 });
    assert.equal(v.precollecteurs_actifs, 1);
  });

  test('Yaoundé : exécution (tournée annulée ignorée, passage oublié compté) et incidents pour 1 000 passages', async () => {
    const v = await kpi(D - 6, D, 'yaounde');
    assert.deepEqual(v.taux_execution, { valeur: 0.6, num: 3, den: 5, exclus_refus: 0 });
    assert.deepEqual(v.incidents_1000, { valeur: 666.7, num: 2, den: 3 });
  });

  test('Rétention : période finie (grâce écoulée), la suivante payée ou non', async () => {
    const v = await kpi(D - 6, D, 'yaounde');
    assert.deepEqual(v.retention, { valeur: 0.3333, num: 1, den: 3 }, 'a10 renouvelé ; a7 et a11 non');
  });

  test('Délai de traitement des signalements des ménages, et ceux en attente', async () => {
    const v = await kpi(D - 6, D, 'yaounde');
    assert.deepEqual(v.delai_signalement_h, { valeur: 30, n: 2, en_attente: 2, plus_ancien_h: 252 });
  });

  test('Part du Mobile Money, en montant (rejetés exclus, espèces à valider comptées)', async () => {
    const v = await kpi(D - 6, D, 'yaounde');
    assert.deepEqual(v.part_mobile_money, { valeur: 0.2222, num: 1000, den: 4500, nb: 1, nb_total: 3 });
  });

  test('Circuit espèces (C4) : non rapproché depuis plus de 7 jours, rejeté', async () => {
    const v = await kpi(D - 6, D, 'yaounde');
    assert.deepEqual(v.especes, { a_valider_7j: 1, a_valider_7j_fcfa: 500, rejetees: 1, rejetees_fcfa: 500 });
  });

  test('Périmètres : Douala seul, puis tout le pilote', async () => {
    const dla = await kpi(D - 6, D, 'douala');
    assert.equal(dla.menages_inscrits, 3, 'b1, b2 (période payée finie depuis longtemps), e1 (sans facture)');
    assert.deepEqual(dla.taux_paiement, { valeur: 0.3333, num: 1, den: 3 });
    assert.deepEqual(dla.taux_execution, { valeur: 1, num: 1, den: 1, exclus_refus: 0 });
    assert.equal(dla.precollecteurs_actifs, 2);

    const tout = await kpi(D - 6, D, 'pilote');
    assert.equal(tout.menages_inscrits, 11, 'A : 7, Douala : 3, C : 1');
    assert.deepEqual(tout.taux_paiement, { valeur: 0.3636, num: 4, den: 11 });
    assert.equal(tout.precollecteurs_actifs, 4);
    assert.deepEqual(tout.taux_execution, { valeur: 0.6667, num: 4, den: 6, exclus_refus: 0 });
    assert.deepEqual(tout.incidents_1000, { valeur: 500, num: 2, den: 4 });
  });

  test('Périmètre d’une commune : Yaoundé III = Yaoundé (A seul) ; Douala I et Douala II font Douala', async () => {
    const yde = await kpi(D - 6, D, 'yaounde');
    const yde3 = await kpi(D - 6, D, 'YDE3');
    assert.equal(yde3.perimetre, 'YDE3');
    for (const k of ['precollecteurs_actifs', 'menages_inscrits', 'abonnes_actifs', 'taux_paiement', 'taux_execution', 'retention',
      'delai_signalement_h', 'part_mobile_money', 'incidents_1000', 'especes']) {
      assert.deepEqual(yde3[k], yde[k], k);
    }
    const dla = await kpi(D - 6, D, 'douala');
    const dla1 = await kpi(D - 6, D, 'DLA1');
    const dla2 = await kpi(D - 6, D, 'DLA2');
    assert.equal(dla1.menages_inscrits, 2, 'b1, b2 (B, siège à Douala I)');
    assert.equal(dla2.menages_inscrits, 1, 'e1 (E, siège à Douala II)');
    for (const k of ['menages_inscrits', 'precollecteurs_actifs']) assert.equal(dla1[k] + dla2[k], dla[k], k);
    assert.equal(dla1.taux_execution.num + dla2.taux_execution.num, dla.taux_execution.num);
    assert.equal((await kpi(D - 6, D, 'YDE4')).menages_inscrits, 0, 'commune sans précollecteur');
  });

  test('Coût par ménage servi : relevé mensuel seulement, chez ceux qui ont saisi leurs charges', async () => {
    const fin = await un(`select (date_trunc('month', $1::date) + interval '1 month - 1 day')::date::text`, [d.M]);
    const v = await un(`select public.kpi_calculer($1::date, $2::date, 'douala', 'mois')`, [d.M, fin]);
    assert.deepEqual(v.cout_par_menage, {
      valeur: 37500, // 75 000 FCFA ÷ 2 ménages servis (b1 deux fois, b2 ; la démo ne compte pas)
      charges: 75000,
      menages_mois: 2,
      recette_par_menage: 1575, // 3 500 × (1 − 10 %) ÷ 2
      commission_taux: 0.1,
      entreprises_saisies: 1,
      entreprises_actives: 2, // E a servi sans saisir ses charges
    });
    const semaine = await kpi(D - 6, D, 'douala', 'semaine');
    assert.equal(semaine.cout_par_menage, null);
  });

  test('Période en cours : un passage prévu aujourd’hui n’est pas encore dû ; l’avenir ne se mesure pas', async () => {
    const t4 = await tournee(d.C, -1, 'en_cours');
    await collecte(d.C, t4, d.c1, -1, 'prevue');
    const t5 = await tournee(d.C, 0, 'planifiee');
    const id = await collecte(d.C, t5, d.c1, 0, 'prevue');
    const v = await un(`select public.kpi_calculer($1::date, $2::date, 'pilote', 'libre')`, [jour(-1), jour(30)]);
    assert.equal(v.mesure_au, T);
    assert.deepEqual(v.taux_execution, { valeur: 0, num: 0, den: 1, exclus_refus: 0 });
    assert.equal(await un(`select public.kpi_calculer($1::date, $2::date)`, [jour(1), jour(7)]), null);
    await db.query(`delete from public.collectes where id = $1`, [id]);
  });
});

describe('Relevés historisés', () => {
  test('semaines et mois terminés relevés une seule fois, « rattrapage » quand c’est tardif', async () => {
    await db.query(`update public.parametres_plateforme set valeur = $1 where cle = 'pilote_periode'`, [
      JSON.stringify({ debut: jour(-20), fin: jour(60) }),
    ]);
    const crees = await un(`select public.kpi_releves_a_jour()`);
    assert.ok(crees > 0);
    assert.equal(await un(`select public.kpi_releves_a_jour()`), 0, 'rien n’est recalculé');

    const semaines = (await db.query(`select debut::text, fin::text, mode from public.kpi_releves where type_periode = 'semaine' and perimetre = 'pilote' order by debut`)).rows;
    assert.equal(semaines[0].debut, jour(-20), 'la 1re semaine commence au début du pilote');
    for (const s of semaines) assert.ok(s.fin < T, `semaine terminée : ${s.fin}`);
    const derniere = semaines.at(-1);
    assert.equal(derniere.mode, derniere.fin >= jour(-1) ? 'auto' : 'rattrapage');
    assert.equal(semaines[0].mode, 'rattrapage');
    const communes = await un(`select count(*)::int from public.communes where code ~ '^[A-Z0-9]{2,12}$'`);
    assert.ok(communes >= 13, 'les 13 communes de Yaoundé et Douala');
    assert.equal(
      await un(`select count(*)::int from public.kpi_releves where type_periode = 'semaine'`),
      semaines.length * (3 + communes),
      'trois périmètres et chaque commune, par semaine',
    );
  });

  test('la Mairie lit le tableau DE SA COMMUNE ; un ménage, un précollecteur, un visiteur ne le lisent pas', async () => {
    const mairie = await creerCompte(db, 'mairie.kpi@test.cm');
    await promouvoir(db, 'mairie.kpi@test.cm', 'mairie');
    // Sans commune, la Mairie ne voit rien, et le message le dit.
    await assert.rejects(comme(db, mairie, (tx) => tx.query(`select public.indicateurs_pilote('YDE3')`)), /aucune commune/);
    assert.equal(await comme(db, mairie, (tx) => valeur(tx, `select count(*)::int from public.kpi_releves`)), 0);

    // Rattachée à Yaoundé III (comme le fait l'administrateur depuis le SQL Editor).
    await db.query(`insert into public.mairie_communes (user_id, commune_id) select $1, id from public.communes where code = 'YDE3'`, [mairie]);
    const t = await comme(db, mairie, (tx) => valeur(tx, `select public.indicateurs_pilote('YDE3')`));
    assert.equal(t.perimetre, 'YDE3');
    assert.ok(Array.isArray(t.mois) && t.mois.length >= 3);
    assert.equal(t.cibles.abonnes_actifs[0], 800);
    assert.equal(t.releve_planifie, false, 'pas de pg_cron sur le banc');
    assert.ok(t.semaines.length > 0);
    assert.ok(t.semaine_en_cours, 'semaine en cours calculée en direct');
    for (const p of ['pilote', 'yaounde', 'douala', 'DLA1']) {
      await assert.rejects(comme(db, mairie, (tx) => tx.query(`select public.indicateurs_pilote($1)`, [p])), /Périmètre réservé/, p);
    }
    const lus = (await comme(db, mairie, (tx) => tx.query(`select distinct perimetre from public.kpi_releves`))).rows.map((r) => r.perimetre);
    assert.deepEqual(lus, ['YDE3'], 'relevés de sa commune seulement');

    // L'administrateur lit tous les périmètres.
    const admin = await creerCompte(db, 'admin.lecteur.kpi@test.cm');
    await promouvoir(db, 'admin.lecteur.kpi@test.cm', 'admin');
    for (const p of ['pilote', 'yaounde', 'DLA1']) {
      assert.equal((await comme(db, admin, (tx) => valeur(tx, `select public.indicateurs_pilote($1)`, [p]))).perimetre, p);
    }
    assert.ok((await comme(db, admin, (tx) => valeur(tx, `select count(distinct perimetre)::int from public.kpi_releves`))) > 3);

    const menage = await creerCompte(db, 'menage.kpi@test.cm');
    const gerant = await creerCompte(db, 'gerant.kpi@test.cm', 'precollecteur');
    for (const qui of [menage, gerant]) {
      await assert.rejects(comme(db, qui, (tx) => tx.query(`select public.indicateurs_pilote()`)), /Réservé/);
      assert.equal(await comme(db, qui, (tx) => valeur(tx, `select count(*)::int from public.kpi_releves`)), 0);
    }
    await assert.rejects(comme(db, 'anon', (tx) => tx.query(`select public.indicateurs_pilote()`)), /permission/);
    await assert.rejects(comme(db, mairie, (tx) => tx.query(`select public.kpi_calculer(current_date, current_date)`)), /permission/);
    await assert.rejects(comme(db, mairie, (tx) => tx.query(`select public.kpi_releves_a_jour()`)), /permission/);
  });

  test('un relevé ne se retouche pas par l’API, même par un administrateur', async () => {
    const admin = await creerCompte(db, 'admin.kpi@test.cm');
    await promouvoir(db, 'admin.kpi@test.cm', 'admin');
    for (const sql of [
      `update public.kpi_releves set valeurs = '{}'::jsonb`,
      `delete from public.kpi_releves`,
      `insert into public.kpi_releves (type_periode, debut, fin, perimetre, valeurs, mode) values ('semaine', '2020-01-06', '2020-01-12', 'pilote', '{}', 'auto')`,
    ]) {
      await assert.rejects(comme(db, admin, (tx) => tx.query(sql)), /permission/, sql);
    }
  });
});

describe('Charges d’exploitation et heure de résolution', () => {
  test('le gérant saisit ses charges ; ni un autre gérant, ni son employé, ni la Mairie ne les voient', async () => {
    const gerantX = await creerCompte(db, 'gerant.x@test.cm', 'precollecteur');
    const gerantY = await creerCompte(db, 'gerant.y@test.cm', 'precollecteur');
    const entX = await creerEntreprise(db, gerantX, 'X');
    await creerEntreprise(db, gerantY, 'Y');
    const mois = `${jour(0).slice(0, 7)}-01`;

    await comme(db, gerantX, (tx) =>
      tx.query(
        `insert into public.couts_exploitation (entreprise_id, mois, categorie, montant_fcfa, saisi_par)
         values ($1, $2, 'carburant', 42000, $3)
         on conflict (entreprise_id, mois, categorie) do update set montant_fcfa = excluded.montant_fcfa`,
        [entX, mois, gerantY],
      ),
    );
    assert.equal(await un(`select saisi_par from public.couts_exploitation where entreprise_id = $1`, [entX]), gerantX, 'auteur posé par la base');
    await comme(db, gerantX, (tx) => tx.query(`update public.couts_exploitation set montant_fcfa = 45000 where entreprise_id = $1`, [entX]));
    assert.equal(await un(`select montant_fcfa from public.couts_exploitation where entreprise_id = $1`, [entX]), 45000);

    // Un mois mal formé, un poste qui change, une entreprise qui change : refusés
    await assert.rejects(comme(db, gerantX, (tx) => tx.query(
      `insert into public.couts_exploitation (entreprise_id, mois, categorie, montant_fcfa) values ($1, $2, 'entretien', 1)`, [entX, jour(0).slice(0, 7) + '-15'])));
    await assert.rejects(comme(db, gerantX, (tx) => tx.query(`update public.couts_exploitation set categorie = 'autres' where entreprise_id = $1`, [entX])), /Modification refusée/);

    // Employé de X
    const agent = await creerCompte(db, 'agent.x@test.cm');
    const fiche = await un(`insert into public.employes (entreprise_id, nom, user_id) values ($1, 'Agent X', $2) returning id`, [entX, agent]);
    await db.query(`insert into public.entreprise_membres (entreprise_id, user_id, role_membre) values ($1, $2, 'agent')`, [entX, agent]);
    assert.ok(fiche);

    const mairie = await un(`select id from public.profiles where email = 'mairie.kpi@test.cm'`);
    for (const qui of [gerantY, agent, mairie]) {
      assert.equal(await comme(db, qui, (tx) => valeur(tx, `select count(*)::int from public.couts_exploitation`)), 0);
      const ecrit = await comme(db, qui, (tx) =>
        tx.query(`insert into public.couts_exploitation (entreprise_id, mois, categorie, montant_fcfa) values ($1, $2, 'autres', 1)`, [entX, mois]),
      ).then(() => true, () => false);
      assert.equal(ecrit, false);
    }
    assert.equal(await comme(db, 'anon', (tx) => tx.query(`select 1 from public.couts_exploitation`)).then(() => true, () => false), false);
  });

  test('« résolu » pose l’heure de résolution ; l’API ne peut ni l’écrire ni la garder à la réouverture', async () => {
    const gerant = await creerCompte(db, 'gerant.r@test.cm', 'precollecteur');
    const ent = await creerEntreprise(db, gerant, 'R');
    const id = await comme(db, gerant, (tx) =>
      valeur(tx, `insert into public.incidents_precollecte (entreprise_id, source, categorie, resolu_at)
                  values ($1, 'precollecteur', 'autre', '2020-01-01') returning id`, [ent]),
    );
    assert.equal(await un(`select resolu_at from public.incidents_precollecte where id = $1`, [id]), null, 'valeur envoyée ignorée');

    await comme(db, gerant, (tx) => tx.query(`update public.incidents_precollecte set statut = 'resolu', resolu_at = '2020-01-01' where id = $1`, [id]));
    const resolu = await un(`select resolu_at from public.incidents_precollecte where id = $1`, [id]);
    assert.ok(resolu && Date.now() - new Date(resolu).getTime() < 60_000, 'heure de la base, pas celle envoyée');

    await comme(db, gerant, (tx) => tx.query(`update public.incidents_precollecte set resolu_at = '2020-01-01' where id = $1`, [id]));
    assert.equal(
      new Date(await un(`select resolu_at from public.incidents_precollecte where id = $1`, [id])).getTime(),
      new Date(resolu).getTime(),
      'non modifiable sans changement de statut',
    );

    await comme(db, gerant, (tx) => tx.query(`update public.incidents_precollecte set statut = 'en_cours' where id = $1`, [id]));
    assert.equal(await un(`select resolu_at from public.incidents_precollecte where id = $1`, [id]), null);
  });
});
