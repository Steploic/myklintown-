// Jeu de données (deux précollecteurs concurrents, la Mairie, un administrateur,
// des ménages, un employé) puis le catalogue d'ATTAQUES et de PARCOURS normaux.
//
// Une attaque renvoie `true` si elle a RÉUSSI (faille présente), `false` si la
// base l'a refusée. Un parcours lève une erreur s'il ne fonctionne plus.

import { comme, creerCompte, creerEntreprise, promouvoir, valeur } from './banc.mjs';

const CONTOUR_Z = {
  type: 'Polygon',
  coordinates: [[[11.49, 3.84], [11.51, 3.84], [11.51, 3.86], [11.49, 3.86], [11.49, 3.84]]],
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

  // Entreprises
  s.entA = await creerEntreprise(db, s.gerantA, 'Entreprise A');
  s.entB = await creerEntreprise(db, s.gerantB, 'Entreprise B');
  s.entIntrus = await creerEntreprise(db, s.intrus, 'Intrus SARL');

  // Territoire (Mairie) : zone Z confiée à A
  s.zone = await comme(db, s.mairie, (tx) =>
    valeur(tx, `insert into public.zones (nom, contour) values ('Z', $1) returning id`, [JSON.stringify(CONTOUR_Z)]),
  );
  await comme(db, s.mairie, (tx) => tx.query(`insert into public.zone_affectations (zone_id, entreprise_id) values ($1, $2)`, [s.zone, s.entA]));

  // Exploitation de chaque entreprise (écrite comme le fait l'application)
  for (const [cle, gerant, ent] of [['A', s.gerantA, s.entA], ['B', s.gerantB, s.entB]]) {
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
];

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
      await comme(db, s.mairie, (tx) => tx.query(`update public.incidents_precollecte set statut = 'en_cours' where id = $1`, [s.incidentB]));
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

      await comme(db, s.admin, (tx) => tx.query(`select public.creer_code_agrement('À révoquer')`));
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
];
