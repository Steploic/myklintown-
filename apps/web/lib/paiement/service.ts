import { clientService, cleServiceSupabase } from '@/lib/supabase-service';
import { parametre, row, rows } from '@/lib/server';
import { fournisseurActif } from './fournisseur';
import {
  commissionSur,
  DELAI_EXPIRATION_MS,
  STATUTS_FINAUX,
  telephoneMobileMoney,
  type Canal,
  type StatutPaiementEnLigne,
} from './regles';

/**
 * Déroulé d'un paiement en ligne, côté serveur. Les appelants (actions) ont
 * déjà vérifié QUI demande (ménage, gérant, employé, lien valable) : ici on
 * vérifie la facture, on calcule ce qui reste dû, on parle à Notch Pay et on
 * écrit la transaction avec le client service.
 */

export const PAIEMENT_INDISPONIBLE = 'Le paiement en ligne n’est pas encore ouvert.';

export function paiementEnLigneDisponible(): boolean {
  return !!fournisseurActif() && !!cleServiceSupabase();
}

interface FactureAPayer {
  id: string;
  numero: string;
  montant_fcfa: number;
  statut: string;
  entreprise_id: string;
  client_id: string;
  clients: { nom: string; email: string | null } | null;
  entreprises: { nom: string; paiement_statut: string; paiement_compte_id: string | null } | null;
}

/** Ce qu'il reste à payer sur une facture (paiements validés et espèces en attente déduits). */
export async function resteAPayer(factureId: string): Promise<{ facture: FactureAPayer; reste: number } | null> {
  const admin = clientService();
  if (!admin) return null;
  const { data } = await admin
    .from('factures')
    .select('id, numero, montant_fcfa, statut, entreprise_id, client_id, clients(nom, email), entreprises(nom, paiement_statut, paiement_compte_id)')
    .eq('id', factureId)
    .maybeSingle();
  const facture = row<FactureAPayer>(data);
  if (!facture) return null;
  const { data: p } = await admin
    .from('paiements_clients')
    .select('montant_fcfa')
    .eq('facture_id', factureId)
    .in('statut', ['valide', 'a_valider']);
  const deja = rows<{ montant_fcfa: number }>(p).reduce((s, x) => s + x.montant_fcfa, 0);
  return { facture, reste: Math.max(0, facture.montant_fcfa - deja) };
}

export async function demarrerPaiement(input: {
  factureId: string;
  canal: Canal;
  telephone: string;
  origine: 'menage' | 'lien' | 'tournee';
  initiePar: string | null;
}): Promise<{ reference?: string; montant?: number; error?: string }> {
  const admin = clientService();
  const fournisseur = fournisseurActif();
  if (!admin || !fournisseur) return { error: PAIEMENT_INDISPONIBLE };

  const telephone = telephoneMobileMoney(input.telephone);
  if (!telephone) return { error: 'Numéro Mobile Money invalide : 9 chiffres commençant par 6 (ex. 6 77 12 34 56).' };
  if (input.canal !== 'cm.mtn' && input.canal !== 'cm.orange') return { error: 'Choisissez MTN Mobile Money ou Orange Money.' };

  const r = await resteAPayer(input.factureId);
  if (!r) return { error: 'Facture introuvable.' };
  const { facture, reste } = r;
  if (facture.statut !== 'emise' || reste <= 0) return { error: 'Cette facture est déjà réglée.' };
  const ent = facture.entreprises;
  if (!ent || ent.paiement_statut !== 'actif' || !ent.paiement_compte_id) {
    return { error: `${ent?.nom ?? 'Ce précollecteur'} n’accepte pas encore le paiement en ligne.` };
  }

  // Pas deux demandes en même temps pour une même facture.
  const depuis = new Date(Date.now() - DELAI_EXPIRATION_MS).toISOString();
  const { data: enCours } = await admin
    .from('paiements_en_ligne')
    .select('reference')
    .eq('facture_id', facture.id)
    .in('statut', ['initie', 'en_attente'])
    .gte('created_at', depuis)
    .limit(1);
  if (rows(enCours).length) {
    return { error: 'Un paiement est déjà en cours pour cette facture : validez-le sur le téléphone, ou réessayez dans quelques minutes.' };
  }

  const taux = await parametre(admin, 'commission_taux', 0.1);
  const commission = commissionSur(reste, taux);
  const reference = `MKT${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

  const { error: e1 } = await admin.from('paiements_en_ligne').insert({
    entreprise_id: facture.entreprise_id,
    client_id: facture.client_id,
    facture_id: facture.id,
    reference,
    fournisseur: fournisseur.nom,
    canal: input.canal,
    telephone,
    montant_fcfa: reste,
    commission_fcfa: commission,
    origine: input.origine,
    initie_par: input.initiePar,
  });
  if (e1) return { error: 'Le paiement n’a pas pu être préparé. Réessayez.' };

  try {
    const { fournisseurReference } = await fournisseur.demander({
      reference,
      montant: reste,
      commission,
      compteConnecte: ent.paiement_compte_id,
      description: `${ent.nom} — facture ${facture.numero}`,
      client: { nom: facture.clients?.nom ?? 'Client', email: facture.clients?.email },
      canal: input.canal,
      telephone,
    });
    await admin
      .from('paiements_en_ligne')
      .update({ fournisseur_reference: fournisseurReference, statut: 'en_attente', maj_at: new Date().toISOString() })
      .eq('reference', reference);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur du fournisseur de paiement.';
    await admin
      .from('paiements_en_ligne')
      .update({ statut: 'echoue', message, termine_at: new Date().toISOString(), maj_at: new Date().toISOString() })
      .eq('reference', reference);
    return { error: `Le paiement n’a pas pu être lancé : ${message}` };
  }
  return { reference, montant: reste };
}

/**
 * Où en est ce paiement ? Interroge le fournisseur tant qu'il n'est pas
 * terminé, et enregistre le paiement (une seule fois) dès qu'il est réussi.
 */
export async function actualiserPaiement(reference: string): Promise<{ statut: StatutPaiementEnLigne; message: string | null } | null> {
  const admin = clientService();
  const fournisseur = fournisseurActif();
  if (!admin) return null;
  const { data } = await admin
    .from('paiements_en_ligne')
    .select('reference, fournisseur, fournisseur_reference, telephone, statut, message, created_at')
    .eq('reference', reference)
    .maybeSingle();
  const t = row<{
    reference: string; fournisseur: string; fournisseur_reference: string | null; telephone: string;
    statut: StatutPaiementEnLigne; message: string | null; created_at: string;
  }>(data);
  if (!t) return null;
  if (STATUTS_FINAUX.includes(t.statut) || !t.fournisseur_reference || !fournisseur || fournisseur.nom !== t.fournisseur) {
    return { statut: t.statut, message: t.message };
  }

  let suite: { statut: StatutPaiementEnLigne; message?: string };
  try {
    suite = await fournisseur.statut(t.fournisseur_reference, { telephone: t.telephone, creeLe: t.created_at });
  } catch {
    return { statut: t.statut, message: t.message }; // réseau : on retentera
  }
  if (suite.statut === 'en_attente' && Date.now() - new Date(t.created_at).getTime() > DELAI_EXPIRATION_MS) {
    suite = { statut: 'expire', message: 'Aucune validation sur le téléphone : la demande a expiré.' };
  }
  if (suite.statut === 'reussi') {
    const { error } = await admin.rpc('enregistrer_paiement_en_ligne', { p_reference: reference });
    if (error) return { statut: t.statut, message: t.message };
    return { statut: 'reussi', message: null };
  }
  if (suite.statut !== t.statut) {
    await admin
      .from('paiements_en_ligne')
      .update({
        statut: suite.statut,
        message: suite.message ?? null,
        maj_at: new Date().toISOString(),
        ...(STATUTS_FINAUX.includes(suite.statut) ? { termine_at: new Date().toISOString() } : {}),
      })
      .eq('reference', reference);
  }
  return { statut: suite.statut, message: suite.message ?? null };
}

/** Notification Notch Pay déjà authentifiée (signature vérifiée) : on revérifie le statut à la source. */
export async function traiterNotification(evenement: { type?: string; data?: Record<string, unknown> }) {
  const admin = clientService();
  if (!admin || !evenement.type?.startsWith('payment.')) return;
  const d = evenement.data ?? {};
  const notreRef = typeof d.trxref === 'string' ? d.trxref : null;
  const leurRef = typeof d.reference === 'string' ? d.reference : null;
  let reference = notreRef;
  if (!reference && leurRef) {
    const { data } = await admin.from('paiements_en_ligne').select('reference').eq('fournisseur_reference', leurRef).maybeSingle();
    reference = row<{ reference: string }>(data)?.reference ?? null;
  }
  if (reference) await actualiserPaiement(reference);
}

/** Relit chez Notch Pay l'état de la vérification du compte connecté (sans rien invalider : appelé à l'affichage). */
export async function rafraichirEtatCompte(ent: { id: string; paiement_compte_id: string | null; paiement_statut: string }): Promise<string> {
  const admin = clientService();
  const fournisseur = fournisseurActif();
  if (!admin || !fournisseur || !ent.paiement_compte_id) return ent.paiement_statut;
  try {
    const statut = await fournisseur.etatCompte(ent.paiement_compte_id);
    if (statut !== ent.paiement_statut) {
      await admin.from('entreprises').update({ paiement_statut: statut, paiement_maj_at: new Date().toISOString() }).eq('id', ent.id);
    }
    return statut;
  } catch {
    return ent.paiement_statut; // Notch Pay injoignable : dernier état connu
  }
}
