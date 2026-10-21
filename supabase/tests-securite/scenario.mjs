// Jeu de données (deux précollecteurs concurrents à Yaoundé III, un troisième à
// Douala I, la Mairie de chaque commune, un administrateur, des ménages, un
// employé) puis le catalogue d'ATTAQUES et de PARCOURS normaux.
//
// Une attaque renvoie `true` si elle a RÉUSSI (faille présente), `false` si la
// base l'a refusée. Un parcours lève une erreur s'il ne fonctionne plus.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { comme, creerCompte, creerEntreprise, DOSSIER_MIGRATIONS, promouvoir, valeur } from './banc.mjs';

// Zone Z (Yaoundé III, confiée à A) et zone ZD (Douala I, confiée à D).
const CONTOUR_Z = {
  type: 'Polygon',
  coordinates: [[[11.49, 3.84], [11.51, 3.84], [11.51, 3.86], [11.49, 3.86], [11.49, 3.84]]],
};
const CONTOUR_D = {
  type: 'Polygon',
  coordinates: [[[9.7, 4.04], [9.72, 4.04], [9.72, 4.06], [9.7, 4.06], [9.7, 4.04]]],
};
// Ailleurs dans Yaoundé III et dans Douala I (zones tracées puis effacées par les tests).
const CONTOUR_Z2 = {
  type: 'Polygon',
  coordinates: [[[11.53, 3.84], [11.55, 3.84], [11.55, 3.86], [11.53, 3.86], [11.53, 3.84]]],
};
const CONTOUR_D2 = {
  type: 'Polygon',
  coordinates: [[[9.74, 4.04], [9.76, 4.04], [9.76, 4.06], [9.74, 4.06], [9.74, 4.04]]],
};
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Essaie une écriture ; `true` si la base l'a acceptée. */
async function accepte(db, qui, sql, params = []) {
  try {
    await comme(db, qui, (tx) => tx.query(sql, params));
    return true;
  } catch {
    return false;
  }
}

/** Joue `fn` comme `qui`, puis ANNULE tout ; renvoie ce que `fn` a constaté (false si refusé). */
async function essaiAnnule(db, qui, fn) {
  let constat = false;
  await comme(db, qui, async (tx) => {
    constat = await fn(tx);
    throw new Error('annulation voulue');
  }).catch(() => {});
  return constat;
}

/** Migration 0016 (une Mairie par commune) présente dans la base ? */
const avec0016 = (db) => valeur(db, `select to_regclass('public.mairie_communes') is not null`);
const avecCodes = (db) => valeur(db, `select to_regclass('public.codes_agrement') is not null`);

/**
 * Précollecteur agréé par une Mairie pour sa commune (code d'agrément, depuis
 * 20261013000012) ; avant les codes, l'espace est créé directement dans la commune.
 */
async function entrepriseAgreee(db, mairie, gerant, nom, commune) {
  if (!(await avecCodes(db))) {
    return comme(db, gerant, (tx) => valeur(tx, `select public.creer_mon_entreprise($1, p_commune => $2)`, [nom, commune]));
  }
  const code = await comme(db, mairie, (tx) => valeur(tx, `select public.creer_code_agrement($1, null, $2)`, [`Agrément de ${nom}`, commune]));
  return comme(db, gerant, (tx) => valeur(tx, `select public.creer_mon_entreprise($1, p_code => $2)`, [nom, code]));
}

/** Texte d'une migration du dépôt (par son numéro), ou null si elle n'y est pas. */
function migration(numero) {
  const f = readdirSync(DOSSIER_MIGRATIONS).find((x) => x.startsWith(numero));
  return f ? readFileSync(join(DOSSIER_MIGRATIONS, f), 'utf8') : null;
}

export async function preparer(db) {
  const s = {};
  // Comptes
  s.admin = await creerCompte(db, 'admin@test.cm');
  await promouvoir(db, 'admin@test.cm', 'admin');
  s.mairie = await creerCompte(db, 'mairie@test.cm');
  await promouvoir(db, 'mairie@test.cm', 'mairie');
  s.gerantA = await creerCompte(db, 'gerant.a@test.cm', 'precollecteur');
  s.gerantB = await creerCompte(db, 'gerant.b@test.cm', 'precollecteur');
  s.intrus = await creerCompte(db, 'intrus@test.cm', 'precollecteur');
  s.menage = await creerCompte(db, 'menage@test.cm');
  s.victime = await creerCompte(db, 'victime@test.cm');
  s.employe = await creerCompte(db, 'employe@test.cm');
  s.demandeur = await creerCompte(db, 'demandeur@test.cm');

  s.plan = await valeur(db, `select id from public.plans_tarifaires where code = 'MENSUEL'`);
  s.yde3 = await valeur(db, `select id from public.communes where code = 'YDE3'`);
  s.dla1 = await valeur(db, `select id from public.communes where code = 'DLA1'`);

  // La Mairie de Yaoundé III, promue depuis le SQL Editor, est rattachée à sa
  // commune par l'administrateur (depuis 20261019000016).
  if (await avec0016(db)) {
    await comme(db, s.admin, (tx) => tx.query(`select public.accorder_commune_mairie($1, $2)`, [s.mairie, s.yde3]));
  }
  // La Mairie de Douala I passe par la demande d'accès, acceptée par l'administrateur.
  s.mairieDouala = await creerCompte(db, 'mairie.douala@test.cm');
  await comme(db, s.mairieDouala, (tx) =>
    tx.query(`select public.demander_acces_mairie($1, 'Chef du service d''hygiène', null, null, null)`, [s.dla1]));
  const demande = await valeur(db, `select id from public.demandes_acces where user_id = $1`, [s.mairieDouala]);
  await comme(db, s.admin, (tx) => tx.query(`select public.traiter_demande_acces($1, true)`, [demande]));
  s.gerantD = await creerCompte(db, 'gerant.d@test.cm', 'precollecteur');

  // Entreprises : A agréée par la Mairie de Yaoundé III, B sans commune ni zone
  // (comme les espaces créés avant les codes d'agrément), D agréée par la
  // Mairie de Douala I.
  s.entA = await entrepriseAgreee(db, s.mairie, s.gerantA, 'Entreprise A', s.yde3);
  s.entB = await creerEntreprise(db, s.gerantB, 'Entreprise B');
  s.entIntrus = await creerEntreprise(db, s.intrus, 'Intrus SARL');
  s.entD = await entrepriseAgreee(db, s.mairieDouala, s.gerantD, 'Entreprise D', s.dla1);

  // Territoire : chaque Mairie trace une zone dans sa commune et la confie.
  s.zone = await comme(db, s.mairie, (tx) =>
    valeur(tx, `insert into public.zones (nom, commune_id, contour) values ('Z', $1, $2) returning id`, [s.yde3, JSON.stringify(CONTOUR_Z)]),
  );
  await comme(db, s.mairie, (tx) => tx.query(`insert into public.zone_affectations (zone_id, entreprise_id) values ($1, $2)`, [s.zone, s.entA]));
  s.zoneD = await comme(db, s.mairieDouala, (tx) =>
    valeur(tx, `insert into public.zones (nom, commune_id, contour) values ('ZD', $1, $2) returning id`, [s.dla1, JSON.stringify(CONTOUR_D)]),
  );
  await comme(db, s.mairieDouala, (tx) => tx.query(`insert into public.zone_affectations (zone_id, entreprise_id) values ($1, $2)`, [s.zoneD, s.entD]));

  // Un code d'agrément de Yaoundé III, en attente.
  if (await avecCodes(db)) {
    await comme(db, s.mairie, (tx) => tx.query(`select public.creer_code_agrement('Propreté Nsam', null, $1)`, [s.yde3]));
    s.codeYde3 = await valeur(db, `select id from public.codes_agrement where destinataire = 'Propreté Nsam'`);
  }

  // Exploitation de chaque entreprise (écrite comme le fait l'application)
  for (const [cle, gerant, ent] of [['A', s.gerantA, s.entA], ['B', s.gerantB, s.entB], ['D', s.gerantD, s.entD]]) {
    await comme(db, gerant, async (tx) => {
      s[`client${cle}`] = await valeur(tx,
        `insert into public.clients (entreprise_id, nom, telephone, plan_id) values ($1, $2, '677112233', $3) returning id`,
        [ent, `Foyer ${cle}`, s.plan]);
      s[`code${cle}`] = await valeur(tx, `select code from public.clients where id = $1`, [s[`client${cle}`]]);
      s[`facture${cle}`] = await valeur(tx,
        `insert into public.factures (entreprise_id, client_id, plan_id, periode_debut, periode_fin, montant_fcfa, echeance)
         values ($1, $2, $3, current_date, current_date + 30, 3500, current_date + 7) returning id`,
        [ent, s[`client${cle}`], s.plan]);
      s[`employe${cle}`] = await valeur(tx, `insert into public.employes (entreprise_id, nom) values ($1, 'Agent ${cle}') returning id`, [ent]);
      s[`tricycle${cle}`] = await valeur(tx, `insert into public.tricycles (entreprise_id, nom) values ($1, 'Tricycle ${cle}') returning id`, [ent]);
      s[`tournee${cle}`] = await valeur(tx,
        `insert into public.tournees_precollecte (entreprise_id, date, tricycle_id, employe_id) values ($1, current_date, $2, $3) returning id`,
        [ent, s[`tricycle${cle}`], s[`employe${cle}`]]);
      await tx.query(`insert into public.tournee_equipe (tournee_id, employe_id, entreprise_id) values ($1, $2, $3)`,
        [s[`tournee${cle}`], s[`employe${cle}`], ent]);
      s[`collecte${cle}`] = await valeur(tx,
        `insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue) values ($1, $2, $3, current_date) returning id`,
        [ent, s[`tournee${cle}`], s[`client${cle}`]]);
      s[`incident${cle}`] = await valeur(tx,
        `insert into public.incidents_precollecte (entreprise_id, source, categorie, description, client_id, media_path, lat, lng)
         values ($1, 'precollecteur', 'depot_sauvage', 'Preuve d''origine', $2, $3, 3.85, 11.5) returning id`,
        [ent, s[`client${cle}`], `${ent}/${gerant}/photo.jpg`]);
    });
  }

  // Le ménage rattache son compte à la fiche « Foyer A » (code + téléphone).
  await comme(db, s.menage, (tx) => tx.query(`select public.rattacher_mon_compte($1, '677112233')`, [s.codeA]));

  // Un employé rejoint l'entreprise A par invitation.
  s.invitation = await comme(db, s.gerantA, (tx) => valeur(tx, `select public.creer_invitation_employe($1)`, [s.employeA]));
  await comme(db, s.employe, (tx) => tx.query(`select public.rejoindre_entreprise($1)`, [s.invitation]));

  // Une demande sur liste d'attente, avec une adresse précise.
  await comme(db, s.demandeur, (tx) =>
    tx.query(`select public.deposer_demande_abonnement($1, 'Famille Ndzana', '699887766', 'Porte bleue, 3e maison après la boulangerie', 'Nsam', 3.851234, 11.501234)`, [s.plan]),
  );
  // Et une autre dans la zone ZD (Douala I).
  s.demandeurD = await creerCompte(db, 'demandeur.d@test.cm');
  await comme(db, s.demandeurD, (tx) =>
    tx.query(`select public.deposer_demande_abonnement($1, 'Famille Ekwalla', '699112244', 'Rue des palmiers', 'Bonanjo', 4.05, 9.71)`, [s.plan]),
  );

  // Les photos des incidents de A et de D, déposées dans le stockage des preuves.
  for (const [ent, gerant] of [[s.entA, s.gerantA], [s.entD, s.gerantD]]) {
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('preuves', $1, $2)`, [`${ent}/${gerant}/photo.jpg`, gerant]);
  }
  return s;
}

// -----------------------------------------------------------------------------
// Attaques : `true` = la faille est exploitable
// -----------------------------------------------------------------------------
export const ATTAQUES = [
  {
    id: 'spatial-anon',
    titre: 'Un visiteur anonyme modifie spatial_ref_sys (PostGIS)',
    async jouer(db) {
      const ok = await accepte(db, 'anon', `update public.spatial_ref_sys set auth_name = 'PIRATE' where srid = 4326`);
      const effet = (await valeur(db, `select auth_name from public.spatial_ref_sys where srid = 4326`)) === 'PIRATE';
      if (effet) await db.query(`update public.spatial_ref_sys set auth_name = 'EPSG' where srid = 4326`);
      return ok && effet;
    },
  },
  {
    id: 'spatial-compte',
    titre: 'Un compte connecté vide spatial_ref_sys',
    async jouer(db, s) {
      const avant = await valeur(db, `select count(*)::int from public.spatial_ref_sys`);
      const ok = await accepte(db, s.victime, `delete from public.spatial_ref_sys where srid = 4326`);
      const apres = await valeur(db, `select count(*)::int from public.spatial_ref_sys`);
      return ok && apres < avant;
    },
  },
  {
    id: 'paiement-facture-concurrent',
    titre: 'Le gérant A enregistre un paiement sur la facture du précollecteur B (elle passe « payée »)',
    async jouer(db, s) {
      await accepte(db, s.gerantA,
        `insert into public.paiements_clients (facture_id, entreprise_id, client_id, montant_fcfa, methode) values ($1, $2, $3, 3500, 'especes')`,
        [s.factureB, s.entA, s.clientB]);
      return (await valeur(db, `select statut from public.factures where id = $1`, [s.factureB])) === 'payee';
    },
  },
  {
    id: 'facture-client-concurrent',
    titre: 'Le gérant A émet une facture au client du précollecteur B',
    jouer: (db, s) => accepte(db, s.gerantA,
      `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
       values ($1, $2, current_date, current_date + 30, 99000, current_date + 1)`, [s.entA, s.clientB]),
  },
  {
    id: 'passage-client-concurrent',
    titre: 'Le gérant A invente un passage chez le client de B',
    jouer: (db, s) => accepte(db, s.gerantA,
      `insert into public.collectes (entreprise_id, client_id, date_prevue, statut) values ($1, $2, current_date, 'realisee')`, [s.entA, s.clientB]),
  },
  {
    id: 'relance-client-concurrent',
    titre: 'Le gérant A relance le client de B sur sa facture',
    jouer: (db, s) => accepte(db, s.gerantA,
      `insert into public.relances (entreprise_id, client_id, facture_id, canal) values ($1, $2, $3, 'sms')`, [s.entA, s.clientB, s.factureB]),
  },
  {
    id: 'tournee-tricycle-concurrent',
    titre: 'Le gérant A planifie une tournée avec le tricycle de B',
    jouer: (db, s) => accepte(db, s.gerantA,
      `insert into public.tournees_precollecte (entreprise_id, tricycle_id) values ($1, $2)`, [s.entA, s.tricycleB]),
  },
  {
    id: 'equipage-concurrent',
    titre: 'Le gérant A affecte l’employé de B à son tricycle',
    jouer: (db, s) => accepte(db, s.gerantA,
      `insert into public.tricycle_employes (tricycle_id, employe_id) values ($1, $2)`, [s.tricycleA, s.employeB]),
  },
  {
    id: 'incident-client-concurrent',
    titre: 'Le gérant A déclare un incident contre le client de B',
    jouer: (db, s) => accepte(db, s.gerantA,
      `insert into public.incidents_precollecte (entreprise_id, source, categorie, client_id) values ($1, 'precollecteur', 'autre', $2)`, [s.entA, s.clientB]),
  },
  {
    id: 'reactivation-suspendu',
    titre: 'Un précollecteur suspendu par l’administrateur se réactive lui-même',
    async jouer(db, s) {
      await comme(db, s.admin, (tx) => tx.query(`update public.entreprises set statut = 'suspendu' where id = $1`, [s.entA]));
      const ok = await accepte(db, s.gerantA, `update public.entreprises set statut = 'actif' where id = $1`, [s.entA]);
      await db.query(`update public.entreprises set statut = 'essai' where id = $1`, [s.entA]);
      return ok;
    },
  },
  {
    id: 'rattacher-compte-etranger',
    titre: 'Le gérant A rattache le compte d’un inconnu à une de ses fiches client',
    async jouer(db, s) {
      const fiche = await comme(db, s.gerantA, (tx) =>
        valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Fiche piège', $2) returning id`, [s.entA, s.plan]));
      return accepte(db, s.gerantA, `update public.clients set user_id = $1 where id = $2`, [s.victime, fiche]);
    },
  },
  {
    id: 'email-profil-usurpe',
    titre: 'Un compte change l’e-mail de son profil (usurpation auprès de l’administrateur)',
    jouer: (db, s) => accepte(db, s.victime, `update public.profiles set email = 'maire@yaounde3.cm' where id = $1`, [s.victime]),
  },
  {
    id: 'facture-payee-main',
    titre: 'Le gérant marque une facture « payée » sans encaissement',
    jouer: (db, s) => accepte(db, s.gerantA, `update public.factures set statut = 'payee' where id = $1`, [s.factureA]),
  },
  {
    id: 'facture-creee-payee',
    titre: 'Le gérant crée une facture directement « payée »',
    jouer: (db, s) => accepte(db, s.gerantA,
      `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance, statut)
       values ($1, $2, current_date, current_date + 30, 3500, current_date + 7, 'payee')`, [s.entA, s.clientA]),
  },
  {
    id: 'confirmation-falsifiee',
    titre: 'Le gérant transforme la contestation d’un ménage en confirmation',
    async jouer(db, s) {
      await comme(db, s.menage, (tx) => tx.query(`select public.confirmer_passage($1, false)`, [s.collecteA]));
      const ok = await accepte(db, s.gerantA, `update public.collectes set confirmation_client = 'confirmee' where id = $1`, [s.collecteA]);
      await db.query(`update public.collectes set confirmation_client = null, confirmation_at = null where id = $1`, [s.collecteA]);
      return ok;
    },
  },
  {
    id: 'preuve-retouchee',
    titre: 'Le gérant retouche la preuve d’un incident (description, photo)',
    jouer: (db, s) => accepte(db, s.gerantA,
      `update public.incidents_precollecte set description = 'Version arrangée', media_path = 'autre.jpg' where id = $1`, [s.incidentA]),
  },
  {
    id: 'paiement-rejete-revalide',
    titre: 'Un paiement rejeté est remis « validé » par l’API, sans passer par la validation',
    async jouer(db, s) {
      // Facture propre à ce test (les attaques précédentes ont pu régler les autres).
      const client = await comme(db, s.gerantA, async (tx) => {
        const id = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer rejet', $2) returning id`, [s.entA, s.plan]);
        await tx.query(`insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7)`, [s.entA, id]);
        return id;
      });
      const p = await comme(db, s.employe, (tx) => valeur(tx, `select public.encaisser_especes($1, 1000)`, [client]));
      await comme(db, s.gerantA, (tx) => tx.query(`select public.valider_paiement($1, false)`, [p]));
      return accepte(db, s.gerantA, `update public.paiements_clients set statut = 'valide' where id = $1`, [p]);
    },
  },
  {
    id: 'mairie-lit-profils',
    titre: 'Un compte Mairie lit les profils de tous les ménages (nom, e-mail, téléphone)',
    async jouer(db, s) {
      const n = await comme(db, s.mairie, (tx) => valeur(tx, `select count(*)::int from public.profiles`));
      return n > 1;
    },
  },
  {
    id: 'liste-attente-adresse',
    titre: 'Un compte précollecteur ouvert en libre-service lit l’adresse et la position exactes d’un ménage en attente',
    async jouer(db, s) {
      const r = await comme(db, s.intrus, (tx) => tx.query(`select adresse, lat from public.demandes_ouvertes()`));
      const d = r.rows[0];
      return !!d && (d.adresse != null || Math.abs(d.lat - 3.851234) < 1e-6);
    },
  },
  {
    id: 'invitation-courte',
    titre: 'Code d’invitation employé devinable (moins de 40 bits)',
    async jouer(db, s) {
      const fiche = await comme(db, s.gerantA, (tx) => valeur(tx, `insert into public.employes (entreprise_id, nom) values ($1, 'Recrue') returning id`, [s.entA]));
      const code = await comme(db, s.gerantA, (tx) => valeur(tx, `select public.creer_invitation_employe($1)`, [fiche]));
      const alphabet = /^[0-9A-F]+$/.test(code) ? 16 : 32;
      return code.length * Math.log2(alphabet) < 40;
    },
  },
  {
    id: 'passage-antidate',
    titre: 'Un passage « fait hors ligne » antidaté de 3 jours (fausse preuve de service)',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regprocedure('public.scanner_passage(uuid, text, timestamptz)') is not null`))) return false;
      const code = await comme(db, s.gerantA, async (tx) => {
        const c = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer antidaté', $2) returning id`, [s.entA, s.plan]);
        return valeur(tx, `select code from public.clients where id = $1`, [c]);
      });
      await comme(db, s.employe, (tx) => tx.query(`select public.scanner_passage($1, $2, now() - interval '3 days')`, [s.tourneeA, code]));
      const quand = await valeur(db, `select extract(epoch from now() - co.realisee_at)::int from public.collectes co join public.clients c on c.id = co.client_id where c.code = $1`, [code]);
      return quand > 47 * 3600;
    },
  },
  {
    id: 'fonction-anon',
    titre: 'Un visiteur anonyme exécute des fonctions internes (ex. mon_entreprise, role_courant)',
    async jouer(db) {
      return accepte(db, 'anon', `select public.mon_entreprise(), public.role_courant()`);
    },
  },
  {
    id: 'fonction-future-anon',
    titre: 'Une NOUVELLE fonction est exécutable par un visiteur anonyme sans qu’on le décide',
    async jouer(db) {
      await db.exec(`create or replace function public.fonction_ajoutee_plus_tard() returns int language sql as 'select 1'`);
      const ok = await accepte(db, 'anon', `select public.fonction_ajoutee_plus_tard()`);
      await db.exec(`drop function public.fonction_ajoutee_plus_tard()`);
      return ok;
    },
  },
  {
    id: 'espace-sans-agrement',
    titre: 'Un compte précollecteur crée son espace sans code d’agrément de la Mairie',
    async jouer(db) {
      const u = await creerCompte(db, `sans.code.${Date.now()}@test.cm`, 'precollecteur');
      return accepte(db, u, `select public.creer_mon_entreprise('Sans agrément')`);
    },
  },
  {
    id: 'agrement-reutilise',
    titre: 'Un second précollecteur réutilise un code d’agrément déjà utilisé',
    async jouer(db) {
      const u = await creerCompte(db, `reutilise.${Date.now()}@test.cm`, 'precollecteur');
      if (!(await valeur(db, `select to_regclass('public.codes_agrement') is not null`))) {
        return accepte(db, u, `select public.creer_mon_entreprise('Code réutilisé')`);
      }
      const code = await valeur(db, `select code from public.codes_agrement where utilise_at is not null limit 1`);
      return accepte(db, u, `select public.creer_mon_entreprise('Code réutilisé', p_code => $1)`, [code]);
    },
  },
  {
    id: 'agrement-expire-revoque',
    titre: 'Un précollecteur utilise un code d’agrément expiré, puis un code révoqué',
    async jouer(db) {
      const u = await creerCompte(db, `expire.${Date.now()}@test.cm`, 'precollecteur');
      if (!(await valeur(db, `select to_regclass('public.codes_agrement') is not null`))) {
        return accepte(db, u, `select public.creer_mon_entreprise('Code expiré')`);
      }
      const expire = await valeur(db, `insert into public.codes_agrement (code, destinataire, expire_at)
        values (public.nouveau_code_invitation(), 'Expiré', now() - interval '1 day') returning code`);
      const revoque = await valeur(db, `insert into public.codes_agrement (code, destinataire, revoque_at)
        values (public.nouveau_code_invitation(), 'Révoqué', now()) returning code`);
      return (await accepte(db, u, `select public.creer_mon_entreprise('Code expiré', p_code => $1)`, [expire]))
        || (await accepte(db, u, `select public.creer_mon_entreprise('Code révoqué', p_code => $1)`, [revoque]));
    },
  },
  {
    id: 'agrement-autodelivre',
    titre: 'Un précollecteur se délivre lui-même un code d’agrément',
    jouer: (db, s) => accepte(db, s.intrus, `select public.creer_code_agrement('Moi-même')`),
  },
  {
    id: 'agrement-lecture',
    titre: 'Un précollecteur lit les codes d’agrément en attente',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regclass('public.codes_agrement') is not null`))) return false;
      await db.query(`insert into public.codes_agrement (code, destinataire) values (public.nouveau_code_invitation(), 'En attente')`);
      const n = await comme(db, s.intrus, (tx) => valeur(tx, `select count(*)::int from public.codes_agrement`)).catch(() => 0);
      return n > 0;
    },
  },
  {
    id: 'inscription-enterprise',
    titre: 'Un visiteur s’inscrit en « enterprise » (portail de démonstration retiré)',
    async jouer(db) {
      const u = await creerCompte(db, `partenaire.${Date.now()}@test.cm`, 'enterprise');
      return (await valeur(db, `select role::text from public.profiles where id = $1`, [u])) === 'enterprise';
    },
  },
  {
    id: 'communes-mairie',
    titre: 'La Mairie modifie le référentiel des communes (réservé à l’administrateur)',
    async jouer(db, s) {
      await accepte(db, s.mairie, `update public.communes set nom = 'Commune pirate' where code = 'DLA1'`);
      const effet = (await valeur(db, `select nom from public.communes where code = 'DLA1'`)) === 'Commune pirate';
      if (effet) await db.query(`update public.communes set nom = 'Douala I' where code = 'DLA1'`);
      return effet;
    },
  },
  {
    id: 'centre-carte-anon',
    titre: 'Un visiteur anonyme interroge centre_carte()',
    jouer: (db) => accepte(db, 'anon', `select * from public.centre_carte()`),
  },
  {
    id: 'refus-excuse-par-le-gerant',
    titre: 'Le gérant « excuse » un passage manqué (refus_abonnement) pour gonfler son taux d’exécution',
    async jouer(db, s) {
      if (!(await valeur(db, `select exists (select 1 from information_schema.columns where table_name = 'collectes' and column_name = 'refus_abonnement')`))) return false;
      await accepte(db, s.gerantA, `update public.collectes set statut = 'non_realisee', motif = 'Client absent' where id = $1`, [s.collecteA]);
      const ok = await accepte(db, s.gerantA, `update public.collectes set refus_abonnement = true where id = $1`, [s.collecteA]);
      const effet = (await valeur(db, `select refus_abonnement from public.collectes where id = $1`, [s.collecteA])) === true;
      if (effet) await db.query(`update public.collectes set refus_abonnement = false where id = $1`, [s.collecteA]);
      return ok && effet;
    },
  },
  {
    id: 'calcul-terrain-ouvert',
    titre: 'Un compte connecté appelle etat_terrain_client (fonction interne au terrain)',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regprocedure('public.etat_terrain_client(uuid, date)') is not null`))) return false;
      return accepte(db, s.intrus, `select * from public.etat_terrain_client($1, current_date)`, [s.clientA]);
    },
  },
  // --- Chantier 3 : facture inaltérable, charte et contrat (migration 0014)
  {
    id: 'facture-montant-gerant',
    titre: 'Le gérant modifie le montant (ou le numéro, l’échéance) d’une facture émise',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return (await accepte(db, s.gerantA, `update public.factures set montant_fcfa = 100 where id = $1`, [s.factureA]))
        || (await accepte(db, s.gerantA, `update public.factures set numero = 'F-ARRANGE' where id = $1`, [s.factureA]))
        || (await accepte(db, s.gerantA, `update public.factures set echeance = echeance + 30 where id = $1`, [s.factureA]));
    },
  },
  {
    id: 'facture-montant-service',
    titre: 'Même la clé de service modifie le montant ou l’instantané de l’émetteur d’une facture',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return (await accepte(db, 'service', `update public.factures set montant_fcfa = 100, montant_ht_fcfa = 100 where id = $1`, [s.factureA]))
        || (await accepte(db, 'service', `update public.factures set emetteur = emetteur || '{"niu":"FAUX"}' where id = $1`, [s.factureA]));
    },
  },
  {
    id: 'facture-supprimee',
    titre: 'Le gérant supprime une facture, puis la clé de service essaie à son tour',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      await accepte(db, s.gerantA, `delete from public.factures where id = $1`, [s.factureA]);
      await accepte(db, 'service', `delete from public.factures where id = $1`, [s.factureA]);
      return !(await valeur(db, `select exists (select 1 from public.factures where id = $1)`, [s.factureA]));
    },
  },
  {
    id: 'client-facture-supprime',
    titre: 'Le gérant supprime un client facturé (et ses factures avec lui)',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      await accepte(db, s.gerantA, `delete from public.clients where id = $1`, [s.clientA]);
      return !(await valeur(db, `select exists (select 1 from public.clients where id = $1)`, [s.clientA]));
    },
  },
  {
    id: 'client-reel-devient-demo',
    titre: 'Le gérant marque un client réel « démo » pour pouvoir supprimer ses factures',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return accepte(db, s.gerantA, `update public.clients set est_demo = true where id = $1`, [s.clientA]);
    },
  },
  {
    id: 'facture-antidatee',
    titre: 'Le gérant émet une facture antidatée d’un an',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      const id = await comme(db, s.gerantA, (tx) => valeur(tx,
        `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance, created_at)
         values ($1, $2, current_date, current_date + 30, 3500, current_date + 7, now() - interval '1 year') returning id`, [s.entA, s.clientA]));
      return (await valeur(db, `select created_at < now() - interval '1 day' from public.factures where id = $1`, [id])) === true;
    },
  },
  {
    id: 'facture-annulee-rouverte',
    titre: 'Une facture annulée est remise « émise » (même par un administrateur)',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      const f = await comme(db, s.gerantA, async (tx) => {
        const id = await valeur(tx, `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7) returning id`, [s.entA, s.clientA]);
        await tx.query(`update public.factures set statut = 'annulee', motif_annulation = 'Erreur de formule' where id = $1`, [id]);
        return id;
      });
      return (await accepte(db, s.admin, `update public.factures set statut = 'emise' where id = $1`, [f]))
        || (await accepte(db, s.gerantA, `update public.factures set motif_annulation = 'Autre motif' where id = $1`, [f]));
    },
  },
  {
    id: 'prefixe-facture-change',
    titre: 'Le gérant change le préfixe de facturation de son entreprise (numéros d’un autre émetteur)',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return accepte(db, s.gerantA, `update public.entreprises set prefixe_facture = 'F999' where id = $1`, [s.entA]);
    },
  },
  {
    id: 'compteur-facture',
    titre: 'Le gérant lit ou remet à zéro le compteur de numérotation',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      const n = await comme(db, s.gerantA, (tx) => valeur(tx, `select count(*)::int from public.factures_compteurs`)).catch(() => 0);
      return n > 0 || (await accepte(db, s.gerantA, `update public.factures_compteurs set dernier = 0 where entreprise_id = $1`, [s.entA])
        && (await valeur(db, `select dernier from public.factures_compteurs where entreprise_id = $1 order by exercice desc limit 1`, [s.entA])) === 0);
    },
  },
  {
    id: 'acceptation-ecrite',
    titre: 'Le gérant écrit lui-même une acceptation de la charte (sans le ménage)',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      const doc = await valeur(db, `select id from public.documents_legaux where type = 'charte_menage' and publie_at is not null order by version desc limit 1`);
      return accepte(db, s.gerantA,
        `insert into public.acceptations_documents (document_id, user_id, client_id, entreprise_id, mode) values ($1, $2, $3, $4, 'en_ligne')`,
        [doc, s.victime, s.clientA, s.entA]);
    },
  },
  {
    id: 'acceptation-pour-autrui',
    titre: 'Le gérant B enregistre une « remise papier » pour le client du précollecteur A',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return accepte(db, s.gerantB, `select public.accepter_documents(array['charte_menage'], $1)`, [s.clientA]);
    },
  },
  {
    id: 'charte-autrui',
    titre: 'Le gérant B lit l’état de la charte d’un client de A',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      const n = await comme(db, s.gerantB, (tx) => valeur(tx, `select count(*)::int from public.charte_du_client($1)`, [s.clientA]));
      return n > 0;
    },
  },
  {
    id: 'document-publie-modifie',
    titre: 'L’administrateur réécrit une version publiée de la charte (déjà acceptée)',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return (await accepte(db, s.admin, `update public.documents_legaux set contenu = 'Texte réécrit' where type = 'charte_menage' and version = 1`))
        || (await accepte(db, 'service', `update public.documents_legaux set titre = 'Titre réécrit' where type = 'charte_menage' and version = 1`));
    },
  },
  {
    id: 'document-ecrit-gerant',
    titre: 'Un gérant publie sa propre version du contrat',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return accepte(db, s.gerantA,
        `insert into public.documents_legaux (type, version, titre, contenu, publie_at) values ('contrat_menage', 50, 'Contrat maison', 'Clauses', now())`);
    },
  },
  {
    id: 'purge-gerant',
    titre: 'Un gérant appelle la purge des données de test',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return accepte(db, s.gerantA, `select public.purger_donnees_de_test($1)`, [s.entA]);
    },
  },
  {
    id: 'purge-vraie-entreprise',
    titre: 'La clé de service purge une entreprise dont les comptes ne sont pas des comptes de test',
    async jouer(db, s) {
      if (!(await avec0014(db))) return false;
      return accepte(db, 'service', `select public.purger_donnees_de_test($1)`, [s.entB]);
    },
  },
  // --- Chantier 4c : chaque Mairie sur sa commune (migration 0016)
  {
    id: 'mairie-zone-autre-commune',
    titre: 'La Mairie de Douala I renomme, déplace, supprime une zone de Yaoundé III, ou en trace une dans Yaoundé III',
    async jouer(db, s) {
      const photo = () => valeur(db, `select nom || '|' || coalesce(commune_id::text, '-') from public.zones where id = $1`, [s.zone]);
      const avant = await photo();
      await accepte(db, s.mairieDouala, `update public.zones set nom = 'Z annexée' where id = $1`, [s.zone]);
      await accepte(db, s.mairieDouala, `update public.zones set commune_id = $2 where id = $1`, [s.zone, s.dla1]);
      const modifiee = (await photo()) !== avant;
      if (modifiee) await db.query(`update public.zones set nom = 'Z', commune_id = $2 where id = $1`, [s.zone, s.yde3]);
      const supprimee = await essaiAnnule(db, s.mairieDouala, async (tx) => {
        await tx.query(`delete from public.zones where id = $1`, [s.zone]);
        return (await tx.query(`select 1 from public.zones where id = $1`, [s.zone])).rows.length === 0;
      });
      const tracee = await accepte(db, s.mairieDouala,
        `insert into public.zones (nom, commune_id, contour) values ('Zone pirate', $1, $2)`, [s.yde3, JSON.stringify(CONTOUR_Z2)]);
      if (tracee) await db.query(`delete from public.zones where nom = 'Zone pirate'`);
      return modifiee || supprimee || tracee;
    },
  },
  {
    id: 'mairie-affectation-autre-commune',
    titre: 'La Mairie de Douala I retire le précollecteur d’une zone de Yaoundé III, y affecte le sien, ou confie sa zone à un précollecteur qu’elle ne supervise pas',
    async jouer(db, s) {
      const retiree = await essaiAnnule(db, s.mairieDouala, async (tx) => {
        await tx.query(`delete from public.zone_affectations where zone_id = $1 and entreprise_id = $2`, [s.zone, s.entA]);
        return (await tx.query(`select 1 from public.zone_affectations where zone_id = $1 and entreprise_id = $2`, [s.zone, s.entA])).rows.length === 0;
      });
      const intruse = await accepte(db, s.mairieDouala, `insert into public.zone_affectations (zone_id, entreprise_id) values ($1, $2)`, [s.zone, s.entD]);
      const etrangere = await accepte(db, s.mairieDouala, `insert into public.zone_affectations (zone_id, entreprise_id) values ($1, $2)`, [s.zoneD, s.entB]);
      await db.query(`delete from public.zone_affectations where (zone_id, entreprise_id) in (($1, $2), ($3, $4))`, [s.zone, s.entD, s.zoneD, s.entB]);
      return retiree || intruse || etrangere;
    },
  },
  {
    id: 'mairie-lit-autre-commune',
    titre: 'La Mairie de Douala I lit les données de Yaoundé III (précollecteur, membres, tournées, passages, incidents, preuves, codes d’agrément)',
    async jouer(db, s) {
      const codes = await avecCodes(db);
      return comme(db, s.mairieDouala, async (tx) => {
        const n = async (sql, p = []) => Number((await tx.query(sql, p)).rows[0].n);
        const vus = [
          await n(`select count(*) n from public.entreprises where id in ($1, $2)`, [s.entA, s.entB]),
          await n(`select count(*) n from public.entreprise_membres where entreprise_id in ($1, $2)`, [s.entA, s.entB]),
          await n(`select count(*) n from public.tournees_precollecte where entreprise_id in ($1, $2)`, [s.entA, s.entB]),
          await n(`select count(*) n from public.collectes where entreprise_id in ($1, $2)`, [s.entA, s.entB]),
          await n(`select count(*) n from public.incidents_precollecte where entreprise_id in ($1, $2)`, [s.entA, s.entB]),
          await n(`select count(*) n from storage.objects where bucket_id = 'preuves' and name like $1`, [`${s.entA}/%`]),
          codes ? await n(`select count(*) n from public.codes_agrement where commune_id is distinct from $1`, [s.dla1]) : 0,
        ];
        return vus.some((x) => x > 0);
      });
    },
  },
  {
    id: 'mairie-supervision-autre-commune',
    titre: 'La Mairie de Douala I voit Yaoundé III dans sa supervision (zones, précollecteurs, activité, ménages en attente)',
    async jouer(db, s) {
      const passagesD = await valeur(db, `select count(*)::int from public.collectes where entreprise_id = $1`, [s.entD]);
      return comme(db, s.mairieDouala, async (tx) => {
        const col = async (sql, c) => (await tx.query(sql)).rows.map((r) => r[c]);
        const zones = await col(`select zone_id from public.supervision_zones()`, 'zone_id');
        const precos = await col(`select entreprise_id from public.supervision_precollecteurs()`, 'entreprise_id');
        const demandes = await col(`select zone_nom from public.supervision_demandes()`, 'zone_nom');
        const attente = await col(`select zone_nom from public.demandes_ouvertes()`, 'zone_nom');
        const activite = Number((await tx.query(`select coalesce(sum(prevues), 0) n from public.supervision_activite(4)`)).rows[0].n);
        return zones.includes(s.zone) || precos.includes(s.entA) || precos.includes(s.entB)
          || demandes.some((z) => z !== 'ZD') || attente.some((z) => z !== 'ZD') || activite > passagesD;
      });
    },
  },
  {
    id: 'mairie-incident-autre-commune',
    titre: 'La Mairie de Douala I clôt un incident d’un précollecteur de Yaoundé III',
    async jouer(db, s) {
      const avant = await valeur(db, `select statut from public.incidents_precollecte where id = $1`, [s.incidentA]);
      await accepte(db, s.mairieDouala, `update public.incidents_precollecte set statut = 'resolu' where id = $1`, [s.incidentA]);
      const apres = await valeur(db, `select statut from public.incidents_precollecte where id = $1`, [s.incidentA]);
      if (apres !== avant) await db.query(`update public.incidents_precollecte set statut = $2 where id = $1`, [s.incidentA, avant]);
      return apres !== avant;
    },
  },
  {
    id: 'mairie-code-autre-commune',
    titre: 'La Mairie de Douala I délivre un code d’agrément pour Yaoundé III, ou révoque un code de Yaoundé III',
    async jouer(db, s) {
      if (!(await avecCodes(db))) return false;
      const delivre = await accepte(db, s.mairieDouala, `select public.creer_code_agrement('Code pirate', null, $1)`, [s.yde3]);
      const revoque = await accepte(db, s.mairieDouala, `select public.revoquer_code_agrement($1)`, [s.codeYde3]);
      if (revoque) await db.query(`update public.codes_agrement set revoque_at = null where id = $1`, [s.codeYde3]);
      return delivre || revoque;
    },
  },
  {
    id: 'mairie-sattribue-commune',
    titre: 'Une Mairie s’ajoute une commune (directement ou par la fonction d’administration) ou retire celle d’une autre Mairie',
    async jouer(db, s) {
      if (!(await avec0016(db))) return false;
      const lien = (u, c) => valeur(db, `select exists (select 1 from public.mairie_communes where user_id = $1 and commune_id = $2)`, [u, c]);
      await accepte(db, s.mairieDouala, `insert into public.mairie_communes (user_id, commune_id) values ($1, $2)`, [s.mairieDouala, s.yde3]);
      await accepte(db, s.mairieDouala, `select public.accorder_commune_mairie($1, $2)`, [s.mairieDouala, s.yde3]);
      const ajoutee = await lien(s.mairieDouala, s.yde3);
      if (ajoutee) await db.query(`delete from public.mairie_communes where user_id = $1 and commune_id = $2`, [s.mairieDouala, s.yde3]);
      await accepte(db, s.mairieDouala, `delete from public.mairie_communes where user_id = $1`, [s.mairie]);
      await accepte(db, s.mairieDouala, `select public.retirer_commune_mairie($1, $2)`, [s.mairie, s.yde3]);
      await accepte(db, s.mairieDouala, `update public.mairie_communes set commune_id = $2 where user_id = $1`, [s.mairie, s.dla1]);
      const retiree = !(await lien(s.mairie, s.yde3));
      if (retiree) await db.query(`insert into public.mairie_communes (user_id, commune_id) values ($1, $2) on conflict do nothing`, [s.mairie, s.yde3]);
      return ajoutee || retiree;
    },
  },
  {
    id: 'mairie-sans-commune',
    titre: 'Un compte Mairie rattaché à aucune commune voit la supervision, trace une zone ou délivre un code',
    async jouer(db, s) {
      const email = `mairie.sans.commune.${Date.now()}@test.cm`;
      const u = await creerCompte(db, email);
      await promouvoir(db, email, 'mairie');
      const voit = await comme(db, u, async (tx) =>
        Number((await tx.query(`select count(*) n from public.supervision_zones()`)).rows[0].n) > 0
        || Number((await tx.query(`select count(*) n from public.entreprises`)).rows[0].n) > 0);
      const trace = await accepte(db, u, `insert into public.zones (nom, commune_id, contour) values ('Zone sans commune', $1, $2)`, [s.yde3, JSON.stringify(CONTOUR_Z2)]);
      if (trace) await db.query(`delete from public.zones where nom = 'Zone sans commune'`);
      const code = (await avecCodes(db)) && (await accepte(db, u, `select public.creer_code_agrement('Sans commune')`));
      return voit || trace || code;
    },
  },
  {
    id: 'ancienne-mairie',
    titre: 'Un compte qui n’est plus Mairie (rôle changé) garde ses communes et continue de superviser',
    async jouer(db, s) {
      if (!(await avec0016(db))) return false;
      const email = `ancienne.mairie.${Date.now()}@test.cm`;
      const u = await creerCompte(db, email);
      await promouvoir(db, email, 'mairie');
      await comme(db, s.admin, (tx) => tx.query(`select public.accorder_commune_mairie($1, $2)`, [u, s.dla1]));
      await promouvoir(db, email, 'citoyen');
      return comme(db, u, async (tx) =>
        Number((await tx.query(`select count(*) n from public.supervision_zones()`)).rows[0].n) > 0
        || Number((await tx.query(`select count(*) n from public.entreprises where id = $1`, [s.entD])).rows[0].n) > 0);
    },
  },
  {
    id: 'indicateurs-autre-commune',
    titre: 'La Mairie de Douala I lit les indicateurs du pilote entier, de Yaoundé ou de Yaoundé III (calcul ou relevés figés)',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regprocedure('public.indicateurs_pilote(text)') is not null`))) return false;
      for (const p of ['pilote', 'yaounde', 'YDE3']) {
        if (await accepte(db, s.mairieDouala, `select public.indicateurs_pilote($1)`, [p])) return true;
      }
      const perimetres = (await avec0016(db)) ? ['pilote', 'YDE3'] : ['pilote'];
      for (const p of perimetres) {
        await db.query(`insert into public.kpi_releves (type_periode, debut, fin, perimetre, valeurs, mode)
          values ('semaine', '2020-01-06', '2020-01-12', $1, '{}', 'auto') on conflict do nothing`, [p]);
      }
      const lus = await comme(db, s.mairieDouala, (tx) => valeur(tx, `select count(*)::int from public.kpi_releves where perimetre <> 'DLA1'`));
      await db.query(`delete from public.kpi_releves where debut = '2020-01-06'`);
      return lus > 0;
    },
  },
];

/** Migration 0014 (facture inaltérable, charte) présente dans la base ? */
const avec0014 = (db) => valeur(db, `select to_regclass('public.documents_legaux') is not null`);

// -----------------------------------------------------------------------------
// Parcours normaux : ils doivent TOUS continuer de fonctionner
// -----------------------------------------------------------------------------
export const PARCOURS = [
  {
    titre: 'Le gérant encaisse un paiement : la facture passe « payée », le client « à jour »',
    async jouer(db, s) {
      const c = await comme(db, s.gerantA, async (tx) => {
        const client = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer payeur', $2) returning id`, [s.entA, s.plan]);
        const f = await valeur(tx, `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7) returning id`, [s.entA, client]);
        await tx.query(`insert into public.paiements_clients (facture_id, entreprise_id, client_id, montant_fcfa, methode, reference) values ($1, $2, $3, 3500, 'mtn_momo', 'MP123')`, [f, s.entA, client]);
        return { client, f };
      });
      const statut = await valeur(db, `select statut from public.factures where id = $1`, [c.f]);
      const abo = await comme(db, s.gerantA, (tx) => valeur(tx, `select statut_abonnement from public.v_clients_statut where id = $1`, [c.client]));
      if (statut !== 'payee' || abo !== 'a_jour') throw new Error(`facture ${statut}, abonnement ${abo}`);
    },
  },
  {
    titre: 'L’employé encaisse des espèces, le gérant valide : facture payée',
    async jouer(db, s) {
      const client = await comme(db, s.gerantA, async (tx) => {
        const id = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer espèces', $2) returning id`, [s.entA, s.plan]);
        await tx.query(`insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7)`, [s.entA, id]);
        return id;
      });
      const p = await comme(db, s.employe, (tx) => valeur(tx, `select public.encaisser_especes($1, 3500)`, [client]));
      await comme(db, s.gerantA, (tx) => tx.query(`select public.valider_paiement($1, true)`, [p]));
      const st = await valeur(db, `select f.statut from public.factures f join public.paiements_clients p on p.facture_id = f.id where p.id = $1`, [p]);
      if (st !== 'payee') throw new Error(`facture ${st}`);
    },
  },
  {
    titre: 'Tournée : l’employé démarre, scanne le QR du ménage, pointe, termine',
    async jouer(db, s) {
      await comme(db, s.employe, async (tx) => {
        await tx.query(`select public.changer_statut_tournee($1, 'en_cours')`, [s.tourneeA]);
        const r = await valeur(tx, `select public.scanner_passage($1, $2)`, [s.tourneeA, s.codeA.toLowerCase()]);
        if (r.deja_fait) throw new Error('scan : déjà fait ?');
        await tx.query(`select public.pointer_passage($1, 'realisee')`, [s.collecteA]);
        await tx.query(`select public.envoyer_position($1, 3.85, 11.5)`, [s.tourneeA]);
        await tx.query(`select public.changer_statut_tournee($1, 'terminee')`, [s.tourneeA]);
      });
      const st = await valeur(db, `select statut from public.collectes where id = $1`, [s.collecteA]);
      if (st !== 'realisee') throw new Error(`passage ${st}`);
      await db.query(`update public.tournees_precollecte set statut = 'planifiee' where id = $1`, [s.tourneeA]);
    },
  },
  {
    titre: 'Le ménage voit ses factures et confirme un passage',
    async jouer(db, s) {
      const n = await comme(db, s.menage, (tx) => valeur(tx, `select count(*)::int from public.factures`));
      if (n < 1) throw new Error('aucune facture visible');
      await comme(db, s.menage, (tx) => tx.query(`select public.confirmer_passage($1, true)`, [s.collecteA]));
      await db.query(`update public.collectes set confirmation_client = null, confirmation_at = null where id = $1`, [s.collecteA]);
    },
  },
  {
    titre: 'Un ménage s’abonne auprès du précollecteur de sa zone (calcul PostGIS)',
    async jouer(db, s) {
      const u = await creerCompte(db, `nouveau.${Date.now()}@test.cm`);
      const id = await comme(db, u, (tx) =>
        valeur(tx, `select public.souscrire_client($1, $2, 'Famille Ewondo', '677000000', 'Rue 1', 'Nsam', 3.85, 11.5)`, [s.entA, s.plan]));
      if (!id) throw new Error('pas de client créé');
    },
  },
  {
    titre: 'Liste d’attente : le gérant voit la demande (position approchée) et la prend',
    async jouer(db, s) {
      const r = await comme(db, s.gerantA, (tx) => tx.query(`select id, lat from public.demandes_ouvertes()`));
      if (!r.rows.length) throw new Error('liste vide');
      const client = await comme(db, s.gerantA, (tx) => valeur(tx, `select public.prendre_demande($1)`, [r.rows[0].id]));
      const adresse = await comme(db, s.gerantA, (tx) => valeur(tx, `select adresse from public.clients where id = $1`, [client]));
      if (!adresse?.includes('Porte bleue')) throw new Error('adresse non transmise à la prise en charge');
    },
  },
  {
    titre: 'Invitation employé : aperçu anonyme (saisie libre), puis adhésion',
    async jouer(db, s) {
      const fiche = await comme(db, s.gerantA, (tx) => valeur(tx, `insert into public.employes (entreprise_id, nom) values ($1, 'Nouvelle recrue') returning id`, [s.entA]));
      const code = await comme(db, s.gerantA, (tx) => valeur(tx, `select public.creer_invitation_employe($1)`, [fiche]));
      const saisie = `${code.slice(0, 5).toLowerCase()}-${code.slice(5)}`;
      const r = await comme(db, 'anon', (tx) => tx.query(`select valide from public.apercu_invitation($1)`, [saisie]));
      if (!r.rows[0]?.valide) throw new Error(`aperçu refusé pour ${saisie}`);
      const u = await creerCompte(db, `recrue.${Date.now()}@test.cm`);
      await comme(db, u, (tx) => tx.query(`select public.rejoindre_entreprise($1)`, [saisie]));
    },
  },
  {
    titre: 'Mairie : supervision et contrôle de chevauchement des zones (ST_Area géographique)',
    async jouer(db, s) {
      await comme(db, s.mairie, async (tx) => {
        const z = await tx.query(`select * from public.supervision_zones()`);
        if (!z.rows.length) throw new Error('supervision vide');
        const c = await tx.query(`select * from public.zones_en_conflit($1)`, [JSON.stringify(CONTOUR_Z)]);
        if (!c.rows.length || !(c.rows[0].recouvrement_m2 > 0)) throw new Error('chevauchement non calculé');
      });
    },
  },
  {
    titre: 'Administrateur : demande d’accès Mairie (e-mail du compte) puis validation',
    async jouer(db, s) {
      await comme(db, s.victime, (tx) => tx.query(`select public.demander_acces_mairie(null, 'Chef de service', null, null, null)`));
      const r = await comme(db, s.admin, (tx) => tx.query(`select id, email from public.demandes_acces_a_traiter()`));
      const d = r.rows.find((x) => x.email === 'victime@test.cm');
      if (!d) throw new Error('demande absente ou e-mail inattendu');
      await comme(db, s.admin, (tx) => tx.query(`select public.traiter_demande_acces($1, true)`, [d.id]));
    },
  },
  {
    titre: 'Le gérant annule une facture émise, change le statut d’un incident, modifie une fiche',
    async jouer(db, s) {
      await comme(db, s.gerantA, async (tx) => {
        const f = await valeur(tx, `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7) returning id`, [s.entA, s.clientA]);
        await tx.query(`update public.factures set statut = 'annulee' where id = $1`, [f]);
        await tx.query(`update public.incidents_precollecte set statut = 'resolu' where id = $1`, [s.incidentA]);
        await tx.query(`update public.clients set nom = 'Foyer A modifié', telephone = '677112233' where id = $1`, [s.clientA]);
        await tx.query(`update public.entreprises set nom = 'Entreprise A SARL' where id = $1`, [s.entA]);
        await tx.query(`update public.profiles set nom_complet = 'Gérant A' where id = $1`, [s.gerantA]);
      });
      // La Mairie de Yaoundé III rouvre l'incident de A (précollecteur de sa commune).
      const traite = await comme(db, s.mairie, (tx) =>
        valeur(tx, `update public.incidents_precollecte set statut = 'en_cours' where id = $1 returning id`, [s.incidentA]));
      if (traite !== s.incidentA) throw new Error('la Mairie n’a pas pu traiter l’incident de son précollecteur');
    },
  },
  {
    titre: 'Données de démonstration : tournée passée, équipe et passages écrits d’un bloc',
    async jouer(db, s) {
      await comme(db, s.gerantA, async (tx) => {
        const t = await valeur(tx, `insert into public.tournees_precollecte (entreprise_id, date, tricycle_id, employe_id, statut)
          values ($1, current_date - 3, $2, $3, 'terminee') returning id`, [s.entA, s.tricycleA, s.employeA]);
        await tx.query(`insert into public.tournee_equipe (tournee_id, employe_id, entreprise_id) values ($1, $2, $3)`, [t, s.employeA, s.entA]);
        await tx.query(`insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue, employe_id, statut, realisee_at)
          values ($1, $2, $3, current_date - 3, $4, 'realisee', now())`, [s.entA, t, s.clientA, s.employeA]);
        await tx.query(`insert into public.tricycle_employes (tricycle_id, employe_id) values ($1, $2)`, [s.tricycleA, s.employeA]);
      });
    },
  },
  {
    titre: 'Gestes faits hors ligne puis envoyés : l’heure du terrain est gardée, l’heure de réception notée à part',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regprocedure('public.pointer_passage(uuid, text, text, timestamptz)') is not null`))) return;
      const ids = await comme(db, s.gerantA, async (tx) => {
        const t = await valeur(tx, `insert into public.tournees_precollecte (entreprise_id, date) values ($1, current_date) returning id`, [s.entA]);
        await tx.query(`insert into public.tournee_equipe (tournee_id, employe_id, entreprise_id) values ($1, $2, $3)`, [t, s.employeA, s.entA]);
        const c1 = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer hors ligne 1', $2) returning id`, [s.entA, s.plan]);
        const c2 = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer hors ligne 2', $2) returning id`, [s.entA, s.plan]);
        const co = await valeur(tx, `insert into public.collectes (entreprise_id, tournee_id, client_id) values ($1, $2, $3) returning id`, [s.entA, t, c1]);
        const code2 = await valeur(tx, `select code from public.clients where id = $1`, [c2]);
        return { t, co, code2 };
      });
      await comme(db, s.employe, async (tx) => {
        // Pointé il y a 2 h (hors ligne), envoyé maintenant.
        await tx.query(`select public.pointer_passage($1, 'realisee', null, now() - interval '2 hours')`, [ids.co]);
        // Heure absurde (demain) : remplacée par l'heure du serveur. Rejoué deux fois : un seul passage.
        await tx.query(`select public.scanner_passage($1, $2, now() + interval '1 day')`, [ids.t, ids.code2]);
        const r = await valeur(tx, `select public.scanner_passage($1, $2, now() - interval '1 hour')`, [ids.t, ids.code2]);
        if (!r.deja_fait) throw new Error('scan rejoué : « déjà fait » attendu');
      });
      const p = (await db.query(
        `select extract(epoch from now() - realisee_at)::int as age, enregistre_at is not null as recu from public.collectes where id = $1`, [ids.co])).rows[0];
      if (Math.abs(p.age - 7200) > 120 || !p.recu) throw new Error(`pointage : âge ${p.age} s, reçu ${p.recu}`);
      const q = (await db.query(
        `select count(*)::int n, max(abs(extract(epoch from now() - co.realisee_at)))::int ecart from public.collectes co join public.clients c on c.id = co.client_id where c.code = $1`, [ids.code2])).rows[0];
      if (q.n !== 1 || q.ecart > 60) throw new Error(`scan : ${q.n} passage(s), écart ${q.ecart} s`);
    },
  },
  {
    titre: 'Paiement en ligne (si la migration 0008 est présente) : lien, puis confirmation par le serveur',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regclass('public.paiements_en_ligne') is not null`))) return;
      const jeton = await comme(db, s.gerantA, (tx) => valeur(tx, `select public.creer_lien_paiement($1)`, [s.factureA]));
      if (!jeton) throw new Error('pas de lien');
      const reste = await valeur(db, `select f.montant_fcfa - coalesce((select sum(montant_fcfa) from public.paiements_clients p where p.facture_id = f.id and p.statut in ('valide','a_valider')), 0) from public.factures f where f.id = $1`, [s.factureA]);
      await comme(db, 'service', async (tx) => {
        await tx.query(`insert into public.paiements_en_ligne (entreprise_id, client_id, facture_id, reference, fournisseur, canal, telephone, montant_fcfa, origine)
          values ($1, $2, $3, 'REF-TEST-1', 'simulation', 'cm.mtn', '677000000', $4, 'lien')`, [s.entA, s.clientA, s.factureA, reste]);
        await tx.query(`select public.enregistrer_paiement_en_ligne('REF-TEST-1')`);
      });
      const st = await valeur(db, `select statut from public.factures where id = $1`, [s.factureA]);
      if (st !== 'payee') throw new Error(`facture ${st}`);
    },
  },
  {
    titre: 'Code d’agrément : la Mairie le délivre, le précollecteur le tape à sa façon, le code est consommé ; révocation',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regclass('public.codes_agrement') is not null`))) return;
      const code = await comme(db, s.mairie, (tx) => valeur(tx, `select public.creer_code_agrement('Propreté Mvog-Ada', '690112233')`));
      const u = await creerCompte(db, `agree.${Date.now()}@test.cm`, 'precollecteur');
      const saisie = `${code.slice(0, 5).toLowerCase()} - ${code.slice(5)}`;
      const ent = await comme(db, u, (tx) => valeur(tx, `select public.creer_mon_entreprise('Propreté Mvog-Ada', p_code => $1)`, [saisie]));
      const c = (await comme(db, s.mairie, (tx) => tx.query(`select id, utilise_par, entreprise_id from public.codes_agrement where code = $1`, [code]))).rows[0];
      if (c?.utilise_par !== u || c?.entreprise_id !== ent) throw new Error('code non consommé');

      await comme(db, s.admin, (tx) => tx.query(`select public.creer_code_agrement('À révoquer', null, $1)`, [s.yde3]));
      const id = await comme(db, s.mairie, (tx) => valeur(tx, `select id from public.codes_agrement where destinataire = 'À révoquer'`));
      await comme(db, s.mairie, (tx) => tx.query(`select public.revoquer_code_agrement($1)`, [id]));
      const utilise = await comme(db, s.mairie, (tx) => tx.query(`select public.revoquer_code_agrement($1)`, [c.id])).then(() => true, () => false);
      if (utilise) throw new Error('un code utilisé ne devrait pas se révoquer');
    },
  },
  {
    titre: 'Un administrateur crée un espace sans code (dépannage)',
    async jouer(db) {
      if (!(await valeur(db, `select to_regclass('public.codes_agrement') is not null`))) return;
      const email = `admin.depannage.${Date.now()}@test.cm`;
      const a = await creerCompte(db, email);
      await promouvoir(db, email, 'admin');
      const ent = await comme(db, a, (tx) => valeur(tx, `select public.creer_mon_entreprise('Démonstration MyKlinTown')`));
      if (!ent) throw new Error('pas d’entreprise');
    },
  },
  {
    titre: 'Carte vide : centrée sur les zones du gérant et de son équipe, la commune de la Mairie, le domicile du ménage ; Yaoundé sinon',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regprocedure('public.centre_carte()') is not null`))) return;
      const centre = (qui) => comme(db, qui, async (tx) => (await tx.query(`select * from public.centre_carte()`)).rows[0]);
      const attendu = (qui, r, ok) => {
        if (!r || !ok(r)) throw new Error(`${qui} : ${JSON.stringify(r)}`);
      };

      // Gérant A et son employé : emprise de la zone Z.
      for (const [qui, id] of [['gérant A', s.gerantA], ['employé de A', s.employe]]) {
        attendu(qui, await centre(id), (r) => r.origine === 'zones' && r.lat_min === 3.84 && r.lat_max === 3.86 && r.lng_min === 11.49 && r.lng_max === 11.51);
      }
      // Gérant B : ni zone, ni commune, ni client localisé → Yaoundé. Puis sa commune (Douala II).
      attendu('gérant B', await centre(s.gerantB), (r) => r.origine === 'defaut' && r.lat === 3.848 && r.lng === 11.502);
      await db.query(`update public.entreprises set commune_id = (select id from public.communes where code = 'DLA2') where id = $1`, [s.entB]);
      attendu('gérant B (Douala II)', await centre(s.gerantB), (r) => r.origine === 'commune' && r.lat === 4.05 && r.lng === 9.7 && r.zoom === 12);
      await db.query(`update public.entreprises set commune_id = null where id = $1`, [s.entB]);

      // Ménage de la liste d'attente : sa demande (ou sa fiche, une fois prise), arrondie à ≈ 100 m.
      attendu('demandeur', await centre(s.demandeur), (r) => ['demande', 'domicile'].includes(r.origine) && r.lat === 3.851 && r.lng === 11.501);
      // Ménage sans position → Yaoundé.
      attendu('ménage', await centre(s.menage), (r) => r.origine === 'defaut');

      // Mairie de Douala I (demande d'accès acceptée) et de Yaoundé III → leur commune ;
      // commune sans centre → les zones de SA commune ; Mairie sans commune → Yaoundé ;
      // administrateur → toutes les zones.
      const u = await creerCompte(db, `mairie.douala.${Date.now()}@test.cm`);
      await comme(db, u, (tx) => tx.query(`select public.demander_acces_mairie((select id from public.communes where code = 'DLA1'), 'Chef de service hygiène', null, null, null)`));
      const d = await comme(db, s.admin, (tx) => valeur(tx, `select id from public.demandes_acces where user_id = $1`, [u]));
      await comme(db, s.admin, (tx) => tx.query(`select public.traiter_demande_acces($1, true)`, [d]));
      attendu('Mairie de Douala I', await centre(u), (r) => r.origine === 'commune' && r.lat === 4.05 && r.lng === 9.7);
      attendu('Mairie de Yaoundé III', await centre(s.mairie), (r) => r.origine === 'commune' && r.lat === 3.848 && r.lng === 11.502);
      const centreYde3 = (await db.query(`select centre_lat, centre_lng, zoom from public.communes where code = 'YDE3'`)).rows[0];
      await db.query(`update public.communes set centre_lat = null, centre_lng = null where code = 'YDE3'`);
      try {
        attendu('Mairie de Yaoundé III (commune sans centre)', await centre(s.mairie),
          (r) => r.origine === 'zones' && r.lat_min === 3.84 && r.lat_max === 3.86 && r.lng_min === 11.49 && r.lng_max === 11.51);
      } finally {
        await db.query(`update public.communes set centre_lat = $1, centre_lng = $2, zoom = $3 where code = 'YDE3'`,
          [centreYde3.centre_lat, centreYde3.centre_lng, centreYde3.zoom]);
      }
      const sansCommune = `mairie.carte.${Date.now()}@test.cm`;
      const m = await creerCompte(db, sansCommune);
      await promouvoir(db, sansCommune, 'mairie');
      attendu('Mairie sans commune', await centre(m), (r) => r.origine === 'defaut');
      attendu('administrateur', await centre(s.admin), (r) => r.origine === 'zones' && r.lng_min === 9.7 && r.lng_max === 11.51);

      // L'administrateur affine le centre d'une commune.
      await comme(db, s.admin, (tx) => tx.query(`update public.communes set centre_lat = 4.061, centre_lng = 9.736 where code = 'DLA1'`));
      attendu('Mairie de Douala I (centre affiné)', await centre(u), (r) => r.lat === 4.061 && r.lng === 9.736);
    },
  },
  // --- Chantier 4c : chaque Mairie sur sa commune (migration 0016)
  {
    titre: 'Mairie de Douala I : trace, renomme et supprime une zone de sa commune, y affecte son précollecteur puis le retire',
    async jouer(db, s) {
      if (!(await avec0016(db))) return;
      await comme(db, s.mairieDouala, async (tx) => {
        const z = await valeur(tx, `insert into public.zones (nom, commune_id, contour) values ('ZD bis', $1, $2) returning id`, [s.dla1, JSON.stringify(CONTOUR_D2)]);
        const fait = {
          renommee: await valeur(tx, `update public.zones set nom = 'ZD bis renommée' where id = $1 returning id`, [z]),
          affectee: await valeur(tx, `insert into public.zone_affectations (zone_id, entreprise_id) values ($1, $2) returning zone_id`, [z, s.entD]),
          retiree: await valeur(tx, `delete from public.zone_affectations where zone_id = $1 returning zone_id`, [z]),
          supprimee: await valeur(tx, `delete from public.zones where id = $1 returning id`, [z]),
        };
        if (Object.values(fait).some((x) => x !== z)) throw new Error(JSON.stringify(fait));
      });
    },
  },
  {
    titre: 'Supervision de chaque Mairie limitée à sa commune ; les contours des autres restent lisibles (chevauchements)',
    async jouer(db, s) {
      if (!(await avec0016(db))) return;
      await comme(db, s.mairieDouala, async (tx) => {
        const zones = (await tx.query(`select zone_id, commune from public.supervision_zones()`)).rows;
        if (zones.length !== 1 || zones[0].zone_id !== s.zoneD || zones[0].commune !== 'Douala I') throw new Error(`zones : ${JSON.stringify(zones)}`);
        const precos = (await tx.query(`select entreprise_id from public.supervision_precollecteurs()`)).rows.map((r) => r.entreprise_id);
        if (precos.join() !== s.entD) throw new Error(`précollecteurs : ${precos.join()}`);
        const attente = (await tx.query(`select zone_nom from public.demandes_ouvertes()`)).rows.map((r) => r.zone_nom);
        const demandes = (await tx.query(`select zone_nom from public.supervision_demandes()`)).rows.map((r) => r.zone_nom);
        if (attente.join() !== 'ZD' || demandes.join() !== 'ZD') throw new Error(`ménages en attente : ${attente.join()} / ${demandes.join()}`);
        const activite = Number((await tx.query(`select coalesce(sum(prevues), 0) n from public.supervision_activite(4)`)).rows[0].n);
        if (activite < 1) throw new Error('activité de Douala I vide');
        const lisible = await valeur(tx, `select count(*)::int from public.zones where id = $1`, [s.zone]);
        const conflits = (await tx.query(`select id from public.zones_en_conflit($1)`, [JSON.stringify(CONTOUR_Z)])).rows.map((r) => r.id);
        if (lisible !== 1 || !conflits.includes(s.zone)) throw new Error('contour de Yaoundé III illisible : chevauchement non détecté');
      });
      await comme(db, s.mairie, async (tx) => {
        const zones = (await tx.query(`select zone_id from public.supervision_zones()`)).rows.map((r) => r.zone_id);
        const precos = (await tx.query(`select entreprise_id from public.supervision_precollecteurs()`)).rows.map((r) => r.entreprise_id);
        if (!zones.includes(s.zone) || zones.includes(s.zoneD)) throw new Error(`zones de Yaoundé III : ${zones.join()}`);
        if (!precos.includes(s.entA) || precos.includes(s.entD) || precos.includes(s.entB)) throw new Error(`précollecteurs de Yaoundé III : ${precos.join()}`);
        if ((await valeur(tx, `select count(*)::int from public.mairie_communes`)) !== 1) throw new Error('la Mairie lit les rattachements des autres');
      });
    },
  },
  {
    titre: 'Mairie de Douala I : lit son précollecteur, ses incidents et leurs preuves, en traite un ; délivre un code (sa commune par défaut), le révoque',
    async jouer(db, s) {
      if (!(await avec0016(db))) return;
      await comme(db, s.mairieDouala, async (tx) => {
        const n = async (sql, p) => Number((await tx.query(sql, p)).rows[0].n);
        const vus = {
          entreprise: await n(`select count(*) n from public.entreprises where id = $1`, [s.entD]),
          membres: await n(`select count(*) n from public.entreprise_membres where entreprise_id = $1`, [s.entD]),
          tournees: await n(`select count(*) n from public.tournees_precollecte where entreprise_id = $1`, [s.entD]),
          passages: await n(`select count(*) n from public.collectes where entreprise_id = $1`, [s.entD]),
          incidents: await n(`select count(*) n from public.incidents_precollecte where entreprise_id = $1`, [s.entD]),
          preuves: await n(`select count(*) n from storage.objects where bucket_id = 'preuves' and name like $1`, [`${s.entD}/%`]),
        };
        if (Object.values(vus).some((x) => x < 1)) throw new Error(JSON.stringify(vus));
        const traite = await valeur(tx, `update public.incidents_precollecte set statut = 'en_cours' where id = $1 returning id`, [s.incidentD]);
        if (traite !== s.incidentD) throw new Error('incident de son précollecteur non traité');
        const code = await valeur(tx, `select public.creer_code_agrement('Propreté Bonanjo', '699000000')`);
        const ligne = (await tx.query(`select id, commune_id from public.codes_agrement where code = $1`, [code])).rows[0];
        if (ligne?.commune_id !== s.dla1) throw new Error(`code délivré pour ${ligne?.commune_id}`);
        await tx.query(`select public.revoquer_code_agrement($1)`, [ligne.id]);
      });
    },
  },
  {
    titre: 'Précollecteur agréé : son espace prend la commune du code ; seul l’administrateur change cette commune',
    async jouer(db, s) {
      if (!(await avec0016(db))) return;
      const g = await creerCompte(db, `agree.akwa.${Date.now()}@test.cm`, 'precollecteur');
      const code = await comme(db, s.mairieDouala, (tx) => valeur(tx, `select public.creer_code_agrement('Propreté Akwa')`));
      const ent = await comme(db, g, (tx) => valeur(tx, `select public.creer_mon_entreprise('Propreté Akwa', p_commune => $1, p_code => $2)`, [s.yde3, code]));
      if ((await valeur(db, `select commune_id from public.entreprises where id = $1`, [ent])) !== s.dla1) throw new Error('commune du formulaire retenue au lieu de celle du code');
      const vu = await comme(db, s.mairieDouala, (tx) => valeur(tx, `select count(*)::int from public.supervision_precollecteurs() where entreprise_id = $1`, [ent]));
      if (vu !== 1) throw new Error('précollecteur agréé (sans zone encore) invisible de sa Mairie');
      if (await accepte(db, g, `update public.entreprises set commune_id = $2 where id = $1`, [ent, s.yde3])) throw new Error('le gérant a changé sa commune');
      await comme(db, s.admin, (tx) => tx.query(`update public.entreprises set commune_id = $2 where id = $1`, [ent, s.yde3]));
    },
  },
  {
    titre: 'Administrateur : toutes les communes ; comptes Mairie listés (sans commune d’abord), commune ajoutée puis retirée ; demande refusée sans rattachement',
    async jouer(db, s) {
      if (!(await avec0016(db))) return;
      const zonesDe = async (qui) => (await comme(db, qui, (tx) => tx.query(`select zone_id from public.supervision_zones()`))).rows.map((r) => r.zone_id);
      await comme(db, s.admin, async (tx) => {
        const precos = (await tx.query(`select entreprise_id from public.supervision_precollecteurs()`)).rows.map((r) => r.entreprise_id);
        if (![s.entA, s.entB, s.entD].every((e) => precos.includes(e))) throw new Error('l’administrateur ne voit pas tous les précollecteurs');
        const comptes = (await tx.query(`select user_id, email, communes from public.comptes_mairie()`)).rows;
        const codes = (u) => comptes.find((c) => c.user_id === u)?.communes.map((c) => c.code).join();
        if (codes(s.mairie) !== 'YDE3' || codes(s.mairieDouala) !== 'DLA1') throw new Error(JSON.stringify(comptes));
        if (comptes.find((c) => c.user_id === s.mairieDouala).email !== 'mairie.douala@test.cm') throw new Error('e-mail du compte attendu');
        const premierAvec = comptes.findIndex((c) => c.communes.length > 0);
        if (comptes.slice(premierAvec).some((c) => c.communes.length === 0)) throw new Error('comptes sans commune pas en tête');
      });
      const tout = await zonesDe(s.admin);
      if (!tout.includes(s.zone) || !tout.includes(s.zoneD)) throw new Error('l’administrateur ne voit pas toutes les zones');

      // Une Mairie peut suivre deux communes : elle choisit alors celle d'un code.
      await comme(db, s.admin, (tx) => tx.query(`select public.accorder_commune_mairie($1, $2)`, [s.mairieDouala, s.yde3]));
      const deux = await zonesDe(s.mairieDouala);
      if (!deux.includes(s.zone) || !deux.includes(s.zoneD)) throw new Error('commune ajoutée sans effet');
      if (await accepte(db, s.mairieDouala, `select public.creer_code_agrement('Deux communes')`)) throw new Error('code sans commune pour une Mairie de deux communes');
      await comme(db, s.admin, (tx) => tx.query(`select public.retirer_commune_mairie($1, $2)`, [s.mairieDouala, s.yde3]));
      if ((await zonesDe(s.mairieDouala)).includes(s.zone)) throw new Error('commune retirée encore supervisée');

      if (await accepte(db, s.admin, `select public.accorder_commune_mairie($1, $2)`, [s.menage, s.yde3])) throw new Error('commune accordée à un compte ménage');
      if (await accepte(db, s.admin, `select public.retirer_commune_mairie($1, $2)`, [s.mairieDouala, s.yde3])) throw new Error('retrait d’une commune absente accepté');
      if ((await comme(db, s.mairie, (tx) => valeur(tx, `select count(*)::int from public.comptes_mairie()`))) !== 0) throw new Error('une Mairie liste les comptes Mairie');

      const r = await creerCompte(db, `refusee.${Date.now()}@test.cm`);
      await comme(db, r, (tx) => tx.query(`select public.demander_acces_mairie($1, 'Agent', null, null, null)`, [s.dla1]));
      const d = await valeur(db, `select id from public.demandes_acces where user_id = $1`, [r]);
      await comme(db, s.admin, (tx) => tx.query(`select public.traiter_demande_acces($1, false)`, [d]));
      if (await valeur(db, `select exists (select 1 from public.mairie_communes where user_id = $1)`, [r])) throw new Error('demande refusée, compte rattaché');
    },
  },
  {
    titre: 'Indicateurs : chaque Mairie suit sa commune (calcul en direct et relevés) ; l’administrateur, tout le pilote',
    async jouer(db, s) {
      if (!(await avec0016(db))) return;
      const perimetre = async (qui, p) => (await comme(db, qui, (tx) => valeur(tx, `select public.indicateurs_pilote($1)`, [p]))).perimetre;
      const lus = [await perimetre(s.mairieDouala, 'DLA1'), await perimetre(s.mairie, 'YDE3'), await perimetre(s.admin, 'pilote'), await perimetre(s.admin, 'DLA1')];
      if (lus.join() !== 'DLA1,YDE3,pilote,DLA1') throw new Error(lus.join());
      await db.query(`insert into public.kpi_releves (type_periode, debut, fin, perimetre, valeurs, mode)
        values ('semaine', '2020-01-06', '2020-01-12', 'DLA1', '{}', 'auto'), ('semaine', '2020-01-06', '2020-01-12', 'YDE3', '{}', 'auto')`);
      try {
        const vus = (await comme(db, s.mairieDouala, (tx) => tx.query(`select distinct perimetre from public.kpi_releves`))).rows.map((r) => r.perimetre);
        if (vus.join() !== 'DLA1') throw new Error(`relevés lus par la Mairie de Douala I : ${vus.join()}`);
      } finally {
        await db.query(`delete from public.kpi_releves where debut = '2020-01-06'`);
      }
    },
  },
  {
    titre: 'Migration 0015 rejouée : comptes « enterprise » et « collecteur » convertis en ménage, rôle d’origine gardé, centre affiné conservé',
    async jouer(db) {
      const sql = migration('20261019000015');
      if (!sql) return;
      const partenaire = await creerCompte(db, `ancien.partenaire.${Date.now()}@test.cm`);
      const collecteur = await creerCompte(db, `ancien.collecteur.${Date.now()}@test.cm`);
      // Comme en production : rôles posés avant la migration (SQL Editor).
      await db.query(`update public.profiles set role = 'enterprise' where id = $1`, [partenaire]);
      await db.query(`update public.profiles set role = 'collecteur' where id = $1`, [collecteur]);
      const affine = await valeur(db, `select centre_lat from public.communes where code = 'DLA1'`);

      await db.exec(sql);
      await db.exec(sql);

      const r = (await db.query(
        `select p.role::text as role, r.ancien_role::text as ancien from public.profiles p
           left join securite.roles_retires r on r.user_id = p.id where p.id = any($1) order by p.email`,
        [[partenaire, collecteur]])).rows;
      if (JSON.stringify(r) !== JSON.stringify([{ role: 'citoyen', ancien: 'collecteur' }, { role: 'citoyen', ancien: 'enterprise' }])) {
        throw new Error(JSON.stringify(r));
      }
      const apres = await valeur(db, `select centre_lat from public.communes where code = 'DLA1'`);
      if (apres !== affine) throw new Error(`centre affiné écrasé : ${affine} → ${apres}`);
    },
  },
  {
    titre: 'Délai de grâce et blocage au passage : orange le dernier passage, rouge non servi, hors taux d’exécution',
    async jouer(db, s) {
      if (!(await valeur(db, `select to_regprocedure('public.terrain_blocage_actif()') is not null`))) return;
      const interrupteur = (v) => db.query(`update public.parametres_plateforme set valeur = $1::jsonb where cle = 'terrain_blocage_actif'`, [v]);
      const passage = (id) => db.query(`select statut, motif, refus_abonnement from public.collectes where id = $1`, [id]).then((r) => r.rows[0]);
      try {
        // Foyers de A, couverture payée finie : hier (grâce), il y a 10 jours (expiré),
        // il y a 8 jours (grâce hier, expiré aujourd'hui) ; plus un impayé couvert
        // par des espèces remises à l'employé (à valider), et un expiré hors planning.
        const f = await comme(db, s.gerantA, async (tx) => {
          const foyer = (nom) =>
            valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, $2, $3) returning id`, [s.entA, nom, s.plan]);
          const payee = async (c, finIlYa) => {
            const fac = await valeur(tx, `insert into public.factures (entreprise_id, client_id, plan_id, periode_debut, periode_fin, montant_fcfa, echeance)
              values ($1, $2, $3, public.jour_douala() - $4::int - 29, public.jour_douala() - $4::int, 3500, public.jour_douala() - $4::int - 22) returning id`,
              [s.entA, c, s.plan, finIlYa]);
            await tx.query(`insert into public.paiements_clients (facture_id, entreprise_id, client_id, montant_fcfa, methode) values ($1, $2, $3, 3500, 'especes')`,
              [fac, s.entA, c]);
          };
          const r = {
            grace: await foyer('Foyer grâce'), expire: await foyer('Foyer expiré'), veille: await foyer('Foyer grâce hier'),
            couvert: await foyer('Foyer espèces à valider'), nonVisite: await foyer('Foyer expiré non visité'), horsPlan: await foyer('Foyer expiré hors planning'),
          };
          await payee(r.grace, 1);
          await payee(r.expire, 10);
          await payee(r.veille, 8);
          await payee(r.nonVisite, 10);
          await payee(r.horsPlan, 10);
          await tx.query(`insert into public.factures (entreprise_id, client_id, plan_id, periode_debut, periode_fin, montant_fcfa, echeance)
            values ($1, $2, $3, public.jour_douala() - 10, public.jour_douala() + 19, 3500, public.jour_douala() - 3)`, [s.entA, r.couvert, s.plan]);
          r.t = await valeur(tx, `insert into public.tournees_precollecte (entreprise_id, date) values ($1, public.jour_douala()) returning id`, [s.entA]);
          await tx.query(`insert into public.tournee_equipe (tournee_id, employe_id, entreprise_id) values ($1, $2, $3)`, [r.t, s.employeA, s.entA]);
          for (const k of ['grace', 'expire', 'veille', 'couvert', 'nonVisite']) {
            r[`co_${k}`] = await valeur(tx, `insert into public.collectes (entreprise_id, tournee_id, client_id, date_prevue) values ($1, $2, $3, public.jour_douala()) returning id`,
              [s.entA, r.t, r[k]]);
          }
          for (const k of ['grace', 'expire', 'veille', 'couvert', 'horsPlan']) r[`code_${k}`] = await valeur(tx, `select code from public.clients where id = $1`, [r[k]]);
          return r;
        });
        // L'employé encaisse les espèces du foyer impayé : « à valider ».
        await comme(db, s.employe, (tx) => tx.query(`select public.encaisser_especes($1, 3500)`, [f.couvert]));

        const vue = async (id) => (await db.query(`select statut_abonnement, consigne_terrain, fin_grace from public.v_clients_statut where id = $1`, [id])).rows[0];
        const attendu = { grace: ['grace', 'servir_rappeler'], expire: ['expire', 'ne_pas_servir'], veille: ['expire', 'ne_pas_servir'], couvert: ['impaye', 'servir_rappeler'] };
        for (const [k, [st, cons]] of Object.entries(attendu)) {
          const v = await vue(f[k]);
          if (v.statut_abonnement !== st || v.consigne_terrain !== cons) throw new Error(`${k} : ${v.statut_abonnement} / ${v.consigne_terrain}`);
        }

        // Blocage ÉTEINT (par défaut) : le scan sert, comme avant.
        const sansBlocage = await comme(db, s.employe, (tx) => valeur(tx, `select public.scanner_passage($1, $2)`, [f.t, f.code_expire]));
        if (sansBlocage.refuse !== false || (await passage(f.co_expire)).statut !== 'realisee') throw new Error('blocage éteint : le passage devait être servi');
        await comme(db, s.gerantA, (tx) => tx.query(`select public.pointer_passage($1, 'prevue')`, [f.co_expire]));

        // Blocage ALLUMÉ.
        await interrupteur('1');
        await comme(db, s.employe, async (tx) => {
          const g = await valeur(tx, `select public.scanner_passage($1, $2)`, [f.t, f.code_grace]);
          if (g.refuse || g.consigne !== 'servir_rappeler' || g.statut_abonnement !== 'grace') throw new Error(`grâce : ${JSON.stringify(g)}`);
          const e = await valeur(tx, `select public.scanner_passage($1, $2)`, [f.t, f.code_expire]);
          if (!e.refuse || e.consigne !== 'ne_pas_servir') throw new Error(`expiré : ${JSON.stringify(e)}`);
          const c = await valeur(tx, `select public.scanner_passage($1, $2)`, [f.t, f.code_couvert]);
          if (c.refuse) throw new Error('espèces à valider : le foyer devait être servi');
          // Geste fait hier, hors ligne : jugé au jour d'hier (encore en grâce), donc servi.
          const h = await valeur(tx, `select public.scanner_passage($1, $2, now() - interval '24 hours')`, [f.t, f.code_veille]);
          if (h.refuse || h.statut_abonnement !== 'grace') throw new Error(`geste d'hier : ${JSON.stringify(h)}`);
          // Expiré hors planning : refusé, rien n'est ajouté à la tournée.
          const x = await valeur(tx, `select public.scanner_passage($1, $2)`, [f.t, f.code_horsPlan]);
          if (!x.refuse) throw new Error('hors planning : refus attendu');
        });
        const pe = await passage(f.co_expire);
        if (pe.statut !== 'non_realisee' || pe.motif !== 'Refus / impayé' || !pe.refus_abonnement) throw new Error(`passage refusé : ${JSON.stringify(pe)}`);
        if ((await valeur(db, `select count(*)::int from public.collectes where client_id = $1`, [f.horsPlan])) !== 0) throw new Error('passage hors planning créé pour un foyer à ne pas servir');
        if ((await passage(f.co_grace)).statut !== 'realisee' || (await passage(f.co_veille)).statut !== 'realisee') throw new Error('grâce : passage non servi');

        // « Collecté » refusé pour un foyer à ne pas servir.
        const collecte = await comme(db, s.employe, (tx) => tx.query(`select public.pointer_passage($1, 'realisee')`, [f.co_nonVisite])).then(() => true, () => false);
        if (collecte) throw new Error('« Collecté » accepté pour un foyer à ne pas servir');

        // Fin de tournée : le foyer à ne pas servir, non visité, est noté refusé (pas « non visité »).
        await comme(db, s.employe, (tx) => tx.query(`select public.changer_statut_tournee($1, 'en_cours')`, [f.t]));
        await comme(db, s.employe, (tx) => tx.query(`select public.changer_statut_tournee($1, 'terminee')`, [f.t]));
        const nv = await passage(f.co_nonVisite);
        if (nv.motif !== 'Refus / impayé' || !nv.refus_abonnement) throw new Error(`non visité : ${JSON.stringify(nv)}`);

        // Indicateur : les passages refusés sortent des passages planifiés, comptés à part.
        const k = await valeur(db, `select public.kpi_calculer(public.jour_douala(), public.jour_douala(), 'pilote', 'libre')`);
        const refus = await valeur(db, `select count(*)::int from public.collectes co join public.clients c on c.id = co.client_id
          where co.refus_abonnement and not c.est_demo and co.date_prevue = public.jour_douala()`);
        const dus = await valeur(db, `select count(*)::int from public.collectes co join public.clients c on c.id = co.client_id
          left join public.tournees_precollecte t on t.id = co.tournee_id
          where not c.est_demo and co.date_prevue = public.jour_douala() and t.statut is distinct from 'annulee'
            and co.statut <> 'prevue' and not co.refus_abonnement`);
        if (k.taux_execution.exclus_refus !== refus || refus < 2 || k.taux_execution.den !== dus) {
          throw new Error(`KPI : ${JSON.stringify(k.taux_execution)} (refus ${refus}, passages dus ${dus})`);
        }
      } finally {
        await interrupteur('0');
      }
    },
  },
  // --- Chantier 3 : charte et contrat, facture conforme (migration 0014)
  {
    titre: 'Charte en ligne : le ménage accepte charte et contrat une seule fois ; son précollecteur voit l’acceptation horodatée',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      const avant = (await comme(db, s.menage, (tx) => tx.query(`select type from public.documents_a_accepter()`))).rows;
      if (avant.length !== 2) throw new Error(`à accepter : ${JSON.stringify(avant)}`);
      const n1 = await comme(db, s.menage, (tx) => valeur(tx, `select public.accepter_documents(array['charte_menage', 'contrat_menage'])`));
      const n2 = await comme(db, s.menage, (tx) => valeur(tx, `select public.accepter_documents(array['contrat_menage', 'charte_menage'])`));
      if (n1 !== 2 || n2 !== 0) throw new Error(`acceptations ajoutées : ${n1} puis ${n2}`);
      const reste = await comme(db, s.menage, (tx) => valeur(tx, `select count(*)::int from public.documents_a_accepter()`));
      if (reste !== 0) throw new Error(`encore ${reste} document(s) à accepter`);
      const etat = (await comme(db, s.gerantA, (tx) => tx.query(`select type, acceptee, mode, accepte_at from public.charte_du_client($1)`, [s.clientA]))).rows;
      if (etat.length !== 2 || !etat.every((x) => x.acceptee && x.mode === 'en_ligne' && x.accepte_at)) throw new Error(JSON.stringify(etat));
      const lues = await comme(db, s.menage, (tx) => valeur(tx, `select count(*)::int from public.acceptations_documents`));
      if (lues !== 2) throw new Error(`le ménage lit ${lues} acceptation(s)`);
    },
  },
  {
    titre: 'Charte remise sur papier : le gérant, puis l’employé, l’enregistrent pour des ménages sans compte',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      const [c1, c2] = await comme(db, s.gerantA, async (tx) => [
        await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer papier 1', $2) returning id`, [s.entA, s.plan]),
        await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer papier 2', $2) returning id`, [s.entA, s.plan]),
      ]);
      await comme(db, s.gerantA, (tx) => tx.query(`select public.accepter_documents(array['charte_menage'], $1)`, [c1]));
      await comme(db, s.employe, (tx) => tx.query(`select public.accepter_documents(array['charte_menage', 'contrat_menage'], $1)`, [c2]));
      const etat = async (c) => Object.fromEntries((await comme(db, s.gerantA, (tx) => tx.query(`select type, acceptee, mode from public.charte_du_client($1)`, [c]))).rows.map((x) => [x.type, x]));
      const e1 = await etat(c1);
      if (!e1.charte_menage?.acceptee || e1.charte_menage.mode !== 'remise_papier' || e1.contrat_menage?.acceptee) throw new Error(JSON.stringify(e1));
      const e2 = await etat(c2);
      if (!e2.charte_menage?.acceptee || !e2.contrat_menage?.acceptee) throw new Error(JSON.stringify(e2));
      const auteur = await valeur(db, `select auteur_id from public.acceptations_documents where client_id = $1 limit 1`, [c2]);
      if (auteur !== s.employe) throw new Error('auteur de la remise papier non tracé');
    },
  },
  {
    titre: 'Numérotation par émetteur : A et B ont chacun leur 00001, sans trou (une émission abandonnée ne consomme pas de numéro)',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      const annee = await valeur(db, `select extract(year from (now() at time zone 'Africa/Douala'))::int`);
      const prefixe = (e) => valeur(db, `select prefixe_facture from public.entreprises where id = $1`, [e]);
      const [pA, pB] = [await prefixe(s.entA), await prefixe(s.entB)];
      if (!/^F\d{3,}$/.test(pA) || pA === pB) throw new Error(`préfixes ${pA} / ${pB}`);
      const numero = (f) => valeur(db, `select numero from public.factures where id = $1`, [f]);
      const [nA, nB] = [await numero(s.factureA), await numero(s.factureB)];
      if (nA !== `${pA}-${annee}-00001` || nB !== `${pB}-${annee}-00001`) throw new Error(`premières factures : ${nA} / ${nB}`);

      const emettre = (tx) => tx.query(
        `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance, numero)
         values ($1, $2, current_date, current_date + 30, 3500, current_date + 7, 'F-CHOISI-PAR-MOI') returning numero, sequence`, [s.entA, s.clientA]);
      const max = () => valeur(db, `select max(sequence) from public.factures where entreprise_id = $1 and exercice = $2`, [s.entA, annee]);
      const avant = await max();
      await comme(db, s.gerantA, async (tx) => {
        await emettre(tx);
        throw new Error('abandon');
      }).catch(() => {});
      const f = (await comme(db, s.gerantA, emettre)).rows[0];
      if (f.sequence !== avant + 1 || f.numero !== `${pA}-${annee}-${String(avant + 1).padStart(5, '0')}`) {
        throw new Error(`après abandon : ${f.numero} (rang ${f.sequence}, précédent ${avant})`);
      }
      const rangs = (await db.query(`select sequence from public.factures where entreprise_id = $1 and exercice = $2 and sequence is not null order by 1`, [s.entA, annee])).rows.map((r) => r.sequence);
      if (rangs.some((x, i) => x !== i + 1)) throw new Error(`numérotation trouée : ${rangs.join(',')}`);
    },
  },
  {
    titre: 'Facture conforme : HT + TVA = TTC selon le taux paramétré, instantanés de l’émetteur et du client gardés',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      await comme(db, s.gerantA, (tx) => tx.query(`update public.entreprises set niu = 'M012345678901A', rccm = 'RC/YAO/2026/B/0001', adresse_fiscale = 'BP 100 Yaoundé' where id = $1`, [s.entA]));
      await comme(db, s.admin, (tx) => tx.query(`update public.parametres_plateforme set valeur = '0.1925' where cle = 'facturation_tva_taux'`));
      const f = await comme(db, s.gerantA, async (tx) => (await tx.query(
        `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
         values ($1, $2, current_date, current_date + 30, 3500, current_date + 7)
         returning id, montant_ht_fcfa, montant_tva_fcfa, tva_taux, emetteur, destinataire`, [s.entA, s.clientA])).rows[0]);
      await comme(db, s.admin, (tx) => tx.query(`update public.parametres_plateforme set valeur = '0' where cle = 'facturation_tva_taux'`));
      if (f.montant_ht_fcfa !== 2935 || f.montant_tva_fcfa !== 565 || Number(f.tva_taux) !== 0.1925) throw new Error(JSON.stringify(f));
      if (f.emetteur.niu !== 'M012345678901A' || f.emetteur.mention_tva !== 'TVA non applicable' || f.destinataire.code !== s.codeA) {
        throw new Error(JSON.stringify({ emetteur: f.emetteur, destinataire: f.destinataire }));
      }
      // L'entreprise change de NIU : la facture déjà émise garde l'ancien.
      await comme(db, s.gerantA, (tx) => tx.query(`update public.entreprises set niu = 'M999999999999Z' where id = $1`, [s.entA]));
      if ((await valeur(db, `select emetteur ->> 'niu' from public.factures where id = $1`, [f.id])) !== 'M012345678901A') throw new Error('instantané modifié');
    },
  },
  {
    titre: 'Annulation tracée : motif, date et auteur gardés',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      const id = await comme(db, s.gerantA, async (tx) => {
        const f = await valeur(tx, `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7) returning id`, [s.entA, s.clientA]);
        await tx.query(`update public.factures set statut = 'annulee', motif_annulation = '  Doublon de facture  ', annulee_par = $2 where id = $1`, [f, s.victime]);
        return f;
      });
      const r = (await db.query(`select annulee_at, annulee_par, motif_annulation from public.factures where id = $1`, [id])).rows[0];
      if (!r.annulee_at || r.annulee_par !== s.gerantA || r.motif_annulation !== 'Doublon de facture') throw new Error(JSON.stringify(r));
    },
  },
  {
    titre: 'Démonstration : facture DEMO-…, hors numérotation réelle, supprimée avec sa fiche',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      const compteur = () => valeur(db, `select coalesce(sum(dernier), 0)::int from public.factures_compteurs where entreprise_id = $1`, [s.entA]);
      const avant = await compteur();
      const r = await comme(db, s.gerantA, async (tx) => {
        const c = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id, est_demo) values ($1, 'Famille démo', $2, true) returning id`, [s.entA, s.plan]);
        const f = (await tx.query(`insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7) returning numero, sequence, est_demo`, [s.entA, c])).rows[0];
        await tx.query(`insert into public.paiements_clients (facture_id, entreprise_id, client_id, montant_fcfa, methode)
          select id, entreprise_id, client_id, 3500, 'especes' from public.factures where client_id = $1`, [c]);
        return { c, f };
      });
      if (!r.f.numero.startsWith('DEMO-') || r.f.sequence !== null || !r.f.est_demo) throw new Error(JSON.stringify(r.f));
      if ((await compteur()) !== avant) throw new Error('la démonstration a consommé un numéro réel');
      await comme(db, s.gerantA, (tx) => tx.query(`delete from public.clients where id = $1`, [r.c]));
      if (await valeur(db, `select exists (select 1 from public.factures where client_id = $1)`, [r.c])) throw new Error('facture de démonstration restée');
    },
  },
  {
    titre: 'Purge des données de test (clé de service) : entreprise mkt.test.… vidée ou fiches ciblées, compteur remis à zéro',
    async jouer(db) {
      if (!(await avec0014(db))) return;
      const g = await creerCompte(db, `mkt.test.purge.${Date.now()}@gmail.com`, 'precollecteur');
      const ent = await creerEntreprise(db, g, 'Test Purge');
      const plan = await valeur(db, `select id from public.plans_tarifaires where code = 'MENSUEL'`);
      const clientFacture = async (tx, nom) => {
        const c = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, $2, $3) returning id`, [ent, nom, plan]);
        await tx.query(`insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7)`, [ent, c]);
        return c;
      };
      const [c1, c2] = await comme(db, g, async (tx) => [await clientFacture(tx, 'Foyer purge 1'), await clientFacture(tx, 'Foyer purge 2')]);

      // Même un gérant de test ne supprime pas un client facturé par l'API…
      await comme(db, g, (tx) => tx.query(`delete from public.clients where id = $1`, [c1])).catch(() => {});
      if (!(await valeur(db, `select exists (select 1 from public.clients where id = $1)`, [c1]))) throw new Error('client facturé supprimé par l’API');
      // … la clé de service, si : d'abord une fiche ciblée, puis tout.
      if ((await comme(db, 'service', (tx) => valeur(tx, `select public.purger_donnees_de_test($1, $2)`, [ent, [c1]]))) !== 1) throw new Error('purge ciblée');
      if (!(await valeur(db, `select exists (select 1 from public.clients where id = $1)`, [c2]))) throw new Error('purge ciblée trop large');
      if ((await comme(db, 'service', (tx) => valeur(tx, `select public.purger_donnees_de_test($1)`, [ent]))) !== 1) throw new Error('purge complète');
      if (await valeur(db, `select exists (select 1 from public.factures_compteurs where entreprise_id = $1)`, [ent])) throw new Error('compteur non remis à zéro');
      const n = await comme(db, g, (tx) => clientFacture(tx, 'Foyer après purge').then((c) => valeur(tx, `select numero from public.factures where client_id = $1`, [c])));
      if (!n.endsWith('-00001')) throw new Error(`après purge : ${n}`);
    },
  },
  {
    titre: 'Nouvelle version du contrat : brouillon modifiable, puis publiée et à accepter de nouveau',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      await comme(db, s.admin, async (tx) => {
        const id = await valeur(tx, `insert into public.documents_legaux (type, version, titre, contenu) values ('contrat_menage', 2, 'Contrat d''abonnement', '## Parties\nBrouillon') returning id`);
        await tx.query(`update public.documents_legaux set contenu = '## Parties\nTexte définitif' where id = $1`, [id]);
        await tx.query(`update public.documents_legaux set publie_at = now(), provisoire = false where id = $1`, [id]);
      });
      const a = (await comme(db, s.menage, (tx) => tx.query(`select type, version from public.documents_a_accepter()`))).rows;
      if (a.length !== 1 || a[0].type !== 'contrat_menage' || a[0].version !== 2) throw new Error(JSON.stringify(a));
      const e = (await comme(db, s.gerantA, (tx) => tx.query(`select acceptee, version, version_acceptee from public.charte_du_client($1) where type = 'contrat_menage'`, [s.clientA]))).rows[0];
      if (e?.acceptee || e?.version !== 2 || e?.version_acceptee !== 1) throw new Error(JSON.stringify(e));
      // Lisible par tous dès sa publication.
      const publique = await comme(db, 'anon', (tx) => valeur(tx, `select count(*)::int from public.documents_legaux where type = 'contrat_menage' and version = 2`));
      if (publique !== 1) throw new Error('version publiée invisible du public');
    },
  },
  {
    titre: 'Compte supprimé : ses annulations et ses publications restent, sans auteur (le reste demeure figé)',
    async jouer(db, s) {
      if (!(await avec0014(db))) return;
      // Un gérant annule une facture, un administrateur publie une version ; puis leurs comptes sont supprimés.
      const g = await creerCompte(db, `gerant.parti.${Date.now()}@test.cm`, 'precollecteur');
      const ent = await creerEntreprise(db, g, 'Entreprise du gérant parti');
      const f = await comme(db, g, async (tx) => {
        const c = await valeur(tx, `insert into public.clients (entreprise_id, nom, plan_id) values ($1, 'Foyer du gérant parti', $2) returning id`, [ent, s.plan]);
        const id = await valeur(tx, `insert into public.factures (entreprise_id, client_id, periode_debut, periode_fin, montant_fcfa, echeance)
          values ($1, $2, current_date, current_date + 30, 3500, current_date + 7) returning id`, [ent, c]);
        await tx.query(`update public.factures set statut = 'annulee', motif_annulation = 'Doublon' where id = $1`, [id]);
        return id;
      });
      const email = `admin.parti.${Date.now()}@test.cm`;
      const a = await creerCompte(db, email);
      await promouvoir(db, email, 'admin');
      const doc = await comme(db, a, async (tx) => {
        const id = await valeur(tx, `insert into public.documents_legaux (type, version, titre, contenu) values ('charte_menage', 70, 'Charte', 'Texte') returning id`);
        await tx.query(`update public.documents_legaux set publie_at = now() where id = $1`, [id]);
        return id;
      });
      await db.query(`delete from auth.users where id = any($1)`, [[g, a]]);
      const r = (await db.query(`select statut, annulee_par, motif_annulation from public.factures where id = $1`, [f])).rows[0];
      if (r?.statut !== 'annulee' || r.annulee_par !== null || r.motif_annulation !== 'Doublon') throw new Error(JSON.stringify(r));
      const d = (await db.query(`select cree_par, publie_at is not null as publie from public.documents_legaux where id = $1`, [doc])).rows[0];
      if (d?.cree_par !== null || !d.publie) throw new Error(JSON.stringify(d));
      // La version reste figée, même sans auteur.
      const reecrite = await accepte(db, s.admin, `update public.documents_legaux set contenu = 'Réécrit' where id = $1`, [doc]);
      if (reecrite) throw new Error('version publiée réécrite après la suppression de son auteur');
    },
  },
  {
    titre: 'Migration 0014 rejouée : préfixes, numéros, montants et documents inchangés',
    async jouer(db) {
      const sql = migration('20261019000014');
      if (!sql) return;
      const photo = async () => JSON.stringify((await db.query(`select
        (select string_agg(prefixe_facture, ',' order by id) from public.entreprises) as prefixes,
        (select string_agg(numero || ':' || montant_ht_fcfa || ':' || exercice, ',' order by id) from public.factures) as factures,
        (select string_agg(type || version || coalesce(publie_at::text, '-'), ',' order by id) from public.documents_legaux) as documents,
        (select string_agg(entreprise_id || ':' || dernier, ',' order by entreprise_id) from public.factures_compteurs) as compteurs`)).rows[0]);
      const avant = await photo();
      await db.exec(sql);
      await db.exec(sql);
      const apres = await photo();
      if (avant !== apres) throw new Error(`avant ${avant}\naprès ${apres}`);
    },
  },
  // En dernier : rétablit aussi ce que les rejeux de 0014 et 0015 ci-dessus ont remis à leur version.
  {
    titre: 'Migration 0016 rejouée : une commune retirée n’est pas rendue ; sur une table vide, reprise des demandes acceptées ; le contrôle liste les Mairies sans commune',
    async jouer(db, s) {
      const sql = migration('20261019000016');
      if (!sql) return;
      const photo = async () => (await db.query(
        `select string_agg(user_id || ':' || commune_id, ',' order by user_id, commune_id) as p from public.mairie_communes`)).rows[0].p;
      // Une Mairie acceptée pour Douala I, dont l'administrateur a ensuite retiré la commune.
      const u = await creerCompte(db, `commune.retiree.${Date.now()}@test.cm`);
      await comme(db, u, (tx) => tx.query(`select public.demander_acces_mairie($1, 'Agent', null, null, null)`, [s.dla1]));
      const d = await valeur(db, `select id from public.demandes_acces where user_id = $1`, [u]);
      await comme(db, s.admin, (tx) => tx.query(`select public.traiter_demande_acces($1, true)`, [d]));
      await comme(db, s.admin, (tx) => tx.query(`select public.retirer_commune_mairie($1, $2)`, [u, s.dla1]));
      // Un précollecteur sans commune, créé avec un code qui en porte une.
      await db.query(`update public.entreprises set commune_id = null where id = $1`, [s.entD]);

      const avant = await photo();
      await db.exec(sql);
      const resultats = await db.exec(sql);
      if ((await photo()) !== avant) throw new Error('rejeu : rattachements modifiés (commune retirée rendue ?)');
      if ((await valeur(db, `select commune_id from public.entreprises where id = $1`, [s.entD])) !== s.dla1) throw new Error('commune du précollecteur non reprise de son code');
      const controle = resultats.at(-1).rows;
      const sansCommune = controle.find((r) => r.controle.startsWith('Comptes Mairie SANS commune'));
      if (sansCommune?.resultat !== 'À VÉRIFIER' || !sansCommune.detail.includes(`commune.retiree.`)) throw new Error(JSON.stringify(sansCommune));
      // Lignes 1, 6 à 9 : la structure (les autres listent ce qui reste à rattacher).
      const autres = controle.filter((r, i) => [1, 6, 7, 8, 9].includes(i + 1) && r.resultat !== 'OK');
      if (autres.length) throw new Error(JSON.stringify(autres));

      // Première exécution (table vide) : chaque demande acceptée redonne sa commune.
      const sauvegarde = (await db.query(`select * from public.mairie_communes`)).rows;
      await db.query(`delete from public.mairie_communes`);
      try {
        await db.exec(sql);
        const repris = (await db.query(`select user_id || ':' || commune_id as l from public.mairie_communes order by 1`)).rows.map((r) => r.l);
        const attendus = (await db.query(`select distinct user_id || ':' || commune_id as l from public.demandes_acces
          where statut = 'acceptee' and commune_id is not null order by 1`)).rows.map((r) => r.l);
        if (repris.join() !== attendus.join() || !repris.includes(`${s.mairieDouala}:${s.dla1}`)) throw new Error(`repris ${repris.join()} / attendus ${attendus.join()}`);
      } finally {
        await db.query(`delete from public.mairie_communes`);
        for (const r of sauvegarde) {
          await db.query(`insert into public.mairie_communes (user_id, commune_id, accorde_at, accorde_par) values ($1, $2, $3, $4)`,
            [r.user_id, r.commune_id, r.accorde_at, r.accorde_par]);
        }
      }
    },
  },
];
