/**
 * Avant les tests navigateur : données de test connues + caméra simulée.
 * Tout est remis à zéro à chaque exécution.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compte, identifiants, iso, mairie, plans, precollecteur } from '../../apps/web/tests/support/fixtures';
import { genererVideoQr } from '../../apps/web/tests/support/y4m';

export const CODE_SCAN = 'MKT-E2E0SCAN';
export const CODE_LIEN = 'MKT-E2E0LIEN';
export const TEL_LIEN = '677334455';
export const FICHIER_ETAT = path.resolve(__dirname, '..', '.media', 'etat.json');

/** Écriture vérifiée : message clair en cas d'échec, une reprise si le réseau a lâché. */
async function exiger<T>(etape: string, requete: () => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  for (let essai = 1; ; essai++) {
    const { data, error } = await requete();
    if (!error && data !== null) return data;
    const reseau = !error || /fetch failed|network|ECONNRESET|timeout/i.test(error.message);
    if (essai >= 2 || !reseau) throw new Error(`Préparation des tests — ${etape} : ${error?.message ?? 'réponse vide'}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export default async function globalSetup() {
  identifiants();
  const A = await precollecteur('precoA', 'Test Propreté A');
  const B = await precollecteur('precoB', 'Test Concurrent B');
  const [mensuel] = await plans(A.sb);
  const e = A.entrepriseId;
  const client = (etape: string, ligne: Record<string, unknown>) =>
    exiger<{ id: string }>(etape, () => A.sb.from('clients').insert({ entreprise_id: e, plan_id: mensuel!.id, ...ligne }).select('id').single());
  const facture = (etape: string, ligne: Record<string, unknown>) =>
    exiger<{ id: string }>(etape, () => A.sb.from('factures').insert({ entreprise_id: e, montant_fcfa: mensuel!.prix_fcfa, ...ligne }).select('id').single());
  const tournee = (etape: string, date: string) =>
    exiger<{ id: string }>(etape, () => A.sb.from('tournees_precollecte').insert({ entreprise_id: e, date, statut: 'terminee', notes: 'e2e' }).select('id').single());

  // Client scanné pendant la tournée : abonnement payé → « Servir » (vert).
  const scan = await client('client scanné', { nom: 'Famille Scan', code: CODE_SCAN, telephone: '677000999', quartier: 'Nsam', lat: 3.8295, lng: 11.5023 });
  const f = await facture('facture du client scanné', { client_id: scan.id, periode_debut: iso(-5), periode_fin: iso(25), echeance: iso(2) });
  await exiger('paiement du client scanné', () =>
    A.sb.from('paiements_clients').insert({ facture_id: f.id, entreprise_id: e, client_id: scan.id, montant_fcfa: mensuel!.prix_fcfa, methode: 'especes' }).select('id').single(),
  );

  // Client en retard : doit apparaître au recouvrement.
  const retard = await client('client en retard', { nom: 'Famille Retard', telephone: '677000888', lat: 3.8331, lng: 11.4987 });
  await facture('facture en retard', { client_id: retard.id, periode_debut: iso(-30), periode_fin: iso(-1), echeance: iso(-23) });

  // Fiche que le ménage de test rattachera depuis l'interface, avec deux passages à confirmer / contester.
  const lien = await client('fiche à rattacher', { nom: 'Foyer Lien', code: CODE_LIEN, telephone: TEL_LIEN });
  const t = await tournee('tournée d’hier', iso(-1));
  const t2 = await tournee('tournée d’il y a 4 jours', iso(-4));
  const passage = (tid: string, cid: string, jour: number) => ({
    entreprise_id: e, tournee_id: tid, client_id: cid, date_prevue: iso(jour), statut: 'realisee', realisee_at: new Date().toISOString(),
  });
  await exiger('passages', () => A.sb.from('collectes').insert([passage(t.id, lien.id, -1), passage(t2.id, lien.id, -4), passage(t.id, scan.id, -1)]).select('id'));
  await facture('facture de la fiche à rattacher', { client_id: lien.id, periode_debut: iso(0), periode_fin: iso(29), echeance: iso(7) });

  // Comptes utilisés par les tests (créés au besoin).
  await compte('menage', 'citoyen');
  const S = await compte('souscripteur', 'citoyen');
  const acces = await compte('acces', 'citoyen');
  await compte('deconnexion', 'citoyen');
  const ADM = await compte('admin', 'citoyen');
  const adminPromu = ADM.role === 'admin';
  const M = await mairie();

  // Migration 20261004000006 (liste d'attente, accès Mairie) jouée ? Sinon
  // les tests qui en dépendent sont ignorés, avec la consigne.
  const sonde = await A.sb.rpc('demandes_ouvertes');
  const migration0006 = !sonde.error;
  if (migration0006) {
    // Rien ne reste « en attente » d'un essai précédent.
    await S.sb.from('demandes_abonnement').update({ statut: 'annulee' }).eq('statut', 'en_attente');
    await acces.sb.rpc('annuler_demande_acces');
  }

  genererVideoQr(CODE_SCAN, path.resolve(__dirname, '..', '.media', 'qr.y4m'));
  fs.writeFileSync(
    FICHIER_ETAT,
    JSON.stringify({ precoA: A.entrepriseId, precoB: B.entrepriseId, clientScan: scan.id, clientLien: lien.id, mairiePromue: M.promue, mairieEmail: M.email, migration0006, adminPromu, adminEmail: ADM.email }, null, 2),
  );
  if (!migration0006) {
    console.warn('\n⚠️  Tests « liste d’attente » et « accès Mairie » ignorés : exécuter supabase/migrations/20261004000006_retours_tests_equipe.sql\n');
  }
  if (!adminPromu) {
    console.warn(`\n⚠️  Tests « Changer d’espace » (administrateur) ignorés : select public.promouvoir_utilisateur('${ADM.email}', 'admin');\n`);
  }
  if (!M.promue) {
    console.warn(`\n⚠️  Tests Mairie ignorés : select public.promouvoir_utilisateur('${M.email}', 'mairie');\n`);
  }
}
