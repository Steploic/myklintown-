import { randomUUID } from 'node:crypto';
import { clientService, cleServiceSupabase } from '@/lib/supabase-service';
import { parametre, row, rows } from '@/lib/server';
import { fournisseurActif } from './fournisseur';
import {
  commissionSur,
  DELAI_EXPIRATION_MS,
  encaissementEnLigneOuvert,
  INTERVALLE_SUIVI_MS,
  LIMITE_LIEN,
  MESSAGE_EXPIRE,
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
const DEJA_EN_COURS = 'Un paiement est déjà en cours pour cette facture : validez-le sur le téléphone, ou réessayez dans quelques minutes.';
const NON_PREPARE = 'Le paiement n’a pas pu être préparé. Réessayez.';

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
  entreprises: { nom: string; paiement_statut: string; dossier_statut: string; statut: string } | null;
}

/** Ce qu'il reste à payer sur une facture (paiements validés et espèces en attente déduits). */
export async function resteAPayer(factureId: string): Promise<{ facture: FactureAPayer; reste: number } | null> {
  const admin = clientService();
  if (!admin) return null;
  const { data } = await admin
    .from('factures')
    .select('id, numero, montant_fcfa, statut, entreprise_id, client_id, clients(nom, email), entreprises(nom, paiement_statut, dossier_statut, statut)')
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

type Admin = NonNullable<ReturnType<typeof clientService>>;

/**
 * Lien de paiement (public, sans compte) : quelques demandes par heure et par
 * facture, et par numéro payeur. Sans limite, le détenteur d'un lien enverrait
 * des demandes Mobile Money à n'importe quel numéro. En cas de doute (lecture
 * impossible), on refuse.
 */
async function limiteDuLien(admin: Admin, factureId: string, telephone: string): Promise<string | null> {
  const depuis = new Date(Date.now() - LIMITE_LIEN.fenetreMs).toISOString();
  const compter = (colonne: 'facture_id' | 'telephone', valeur: string) =>
    admin
      .from('paiements_en_ligne')
      .select('id', { count: 'exact', head: true })
      .eq(colonne, valeur)
      .eq('origine', 'lien')
      .gte('created_at', depuis);
  const [parFacture, parNumero] = await Promise.all([compter('facture_id', factureId), compter('telephone', telephone)]);
  if (parFacture.error || parNumero.error) return NON_PREPARE;
  if ((parFacture.count ?? 0) >= LIMITE_LIEN.parFacture) {
    return 'Trop de demandes de paiement pour cette facture : réessayez dans une heure, ou réglez auprès de votre précollecteur.';
  }
  if ((parNumero.count ?? 0) >= LIMITE_LIEN.parNumero) return 'Trop de demandes vers ce numéro : réessayez dans une heure.';
  return null;
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
  // Ouvert par le gérant, dossier validé par MyKlinTown, entreprise non suspendue.
  const ent = facture.entreprises;
  if (!ent || !encaissementEnLigneOuvert(ent)) {
    return { error: `${ent?.nom ?? 'Ce précollecteur'} n’accepte pas encore le paiement en ligne.` };
  }
  if (input.origine === 'lien') {
    const limite = await limiteDuLien(admin, facture.id, telephone);
    if (limite) return { error: limite };
  }

  // Une seule demande en cours par facture (index unique de la migration 0023) :
  // celles restées sans réponse au-delà du délai sont d'abord expirées. Une
  // validation tardive reste enregistrée (notification, rapprochement).
  const maintenant = new Date().toISOString();
  const depuis = new Date(Date.now() - DELAI_EXPIRATION_MS).toISOString();
  await admin
    .from('paiements_en_ligne')
    .update({ statut: 'expire', message: MESSAGE_EXPIRE, termine_at: maintenant, maj_at: maintenant })
    .eq('facture_id', facture.id)
    .in('statut', ['initie', 'en_attente'])
    .lt('created_at', depuis);
  const { data: enCours } = await admin
    .from('paiements_en_ligne')
    .select('reference')
    .eq('facture_id', facture.id)
    .in('statut', ['initie', 'en_attente'])
    .limit(1);
  if (rows(enCours).length) return { error: DEJA_EN_COURS };

  const taux = await parametre(admin, 'commission_taux', 0.1);
  const commission = commissionSur(reste, taux);
  // Aléatoire cryptographique : la référence suffit à suivre le paiement (statutPaiementAction).
  const reference = `MKT${randomUUID().replace(/-/g, '').slice(0, 20)}`.toUpperCase();

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
  // 23505 : une autre demande pour cette facture est passée entre la lecture et l'écriture.
  if (e1) return { error: e1.code === '23505' ? DEJA_EN_COURS : NON_PREPARE };

  try {
    const { fournisseurReference } = await fournisseur.demander({
      reference,
      montant: reste,
      description: `${ent.nom} — facture ${facture.numero}`,
      client: { nom: facture.clients?.nom ?? 'Client', email: facture.clients?.email },
      canal: input.canal,
      telephone,
    });
    // Si cette écriture échoue, la notification de Notch Pay (signée) apportera leur référence.
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

export interface EtatPaiement {
  statut: StatutPaiementEnLigne;
  message: string | null;
  /** Vérification inachevée (base ou fournisseur injoignable, enregistrement refusé) : à refaire. */
  incomplet?: boolean;
}

/**
 * Où en est ce paiement ? Interroge le fournisseur tant qu'il n'est pas
 * terminé, et enregistre le paiement (une seule fois) dès qu'il est réussi.
 *
 * `reverifier` (notification de Notch Pay, rapprochement) : interroge le
 * fournisseur même si le paiement est déjà noté expiré, échoué ou annulé ici.
 * L'expiration est NOTRE décision (10 min sans réponse) : un abonné qui valide
 * plus tard sur son téléphone est bel et bien débité, et son paiement doit être
 * enregistré (revue du 09/11/2026 ; auparavant, il ne l'était jamais).
 *
 * `limiter` (écran de suivi, public) : une interrogation du fournisseur toutes
 * les 2 secondes au plus par paiement.
 */
export async function actualiserPaiement(
  reference: string,
  { reverifier = false, limiter = false }: { reverifier?: boolean; limiter?: boolean } = {},
): Promise<EtatPaiement | null> {
  const admin = clientService();
  const fournisseur = fournisseurActif();
  if (!admin) return null;
  const { data, error: eLecture } = await admin
    .from('paiements_en_ligne')
    .select('reference, fournisseur, fournisseur_reference, telephone, statut, message, created_at')
    .eq('reference', reference)
    .maybeSingle();
  if (eLecture) return { statut: 'en_attente', message: null, incomplet: true };
  const t = row<{
    reference: string; fournisseur: string; fournisseur_reference: string | null; telephone: string;
    statut: StatutPaiementEnLigne; message: string | null; created_at: string;
  }>(data);
  if (!t) return null;
  const actuel: EtatPaiement = { statut: t.statut, message: t.message };
  const termine = STATUTS_FINAUX.includes(t.statut);
  if (t.statut === 'reussi' || (termine && !reverifier)) return actuel;
  // Rien à demander au fournisseur : la demande n'est jamais partie chez lui, ou
  // elle vient d'un autre fournisseur (simulation).
  if (!t.fournisseur_reference || (fournisseur && fournisseur.nom !== t.fournisseur)) return actuel;
  // Fournisseur non configuré sur ce déploiement : impossible de vérifier pour l'instant.
  if (!fournisseur) return { ...actuel, incomplet: true };

  if (limiter) {
    const seuil = new Date(Date.now() - INTERVALLE_SUIVI_MS).toISOString();
    const { data: pris, error } = await admin
      .from('paiements_en_ligne')
      .update({ verifie_at: new Date().toISOString() })
      .eq('reference', reference)
      .lt('verifie_at', seuil)
      .select('reference');
    if (!error && !rows(pris).length) return actuel; // interrogé il y a moins de 2 s
  }

  let suite: { statut: StatutPaiementEnLigne; message?: string };
  try {
    suite = await fournisseur.statut(t.fournisseur_reference, { telephone: t.telephone, creeLe: t.created_at });
  } catch {
    return { ...actuel, incomplet: true }; // réseau : on retentera
  }
  if (termine) {
    // Déjà noté terminé ici : seul un succès chez le fournisseur change quelque chose.
    if (suite.statut !== 'reussi') return actuel;
  } else if (suite.statut === 'en_attente' && Date.now() - new Date(t.created_at).getTime() > DELAI_EXPIRATION_MS) {
    suite = { statut: 'expire', message: MESSAGE_EXPIRE };
  }
  if (suite.statut === 'reussi') {
    const { error } = await admin.rpc('enregistrer_paiement_en_ligne', { p_reference: reference });
    if (error) return { ...actuel, incomplet: true };
    // Facture annulée ou déjà réglée entre-temps : la base le note « à rembourser » (migration 0023).
    const { data: apres } = await admin.from('paiements_en_ligne').select('message').eq('reference', reference).maybeSingle();
    return { statut: 'reussi', message: row<{ message: string | null }>(apres)?.message ?? null };
  }
  if (suite.statut !== t.statut) {
    const { error } = await admin
      .from('paiements_en_ligne')
      .update({
        statut: suite.statut,
        message: suite.message ?? null,
        maj_at: new Date().toISOString(),
        ...(STATUTS_FINAUX.includes(suite.statut) ? { termine_at: new Date().toISOString() } : {}),
      })
      .eq('reference', reference);
    if (error) return { ...actuel, incomplet: true };
  }
  return { statut: suite.statut, message: suite.message ?? null };
}

/** Issue d'une notification : `a_reessayer` → réponse 500, Notch Pay la renverra. */
export type IssueNotification = 'traitee' | 'ignoree' | 'a_reessayer';

/**
 * Notification Notch Pay déjà authentifiée (signature vérifiée) : on revérifie
 * le statut à la source, y compris pour un paiement déjà noté expiré ici.
 */
export async function traiterNotification(evenement: { type?: string; data?: Record<string, unknown> }): Promise<IssueNotification> {
  if (!evenement.type?.startsWith('payment.')) return 'ignoree';
  const admin = clientService();
  if (!admin) return 'a_reessayer';
  const d = evenement.data ?? {};
  const notreRef = typeof d.trxref === 'string' ? d.trxref : null;
  const leurRef = typeof d.reference === 'string' ? d.reference : null;
  let reference = notreRef;
  if (!reference && leurRef) {
    const { data, error } = await admin.from('paiements_en_ligne').select('reference').eq('fournisseur_reference', leurRef).maybeSingle();
    if (error) return 'a_reessayer';
    reference = row<{ reference: string }>(data)?.reference ?? null;
  }
  if (!reference) return 'ignoree';
  // Demande partie chez Notch Pay dont la référence n'a pas pu être notée ici :
  // la notification, signée, l'apporte.
  if (notreRef && leurRef) {
    await admin.from('paiements_en_ligne').update({ fournisseur_reference: leurRef }).eq('reference', notreRef).is('fournisseur_reference', null);
  }
  const r = await actualiserPaiement(reference, { reverifier: true });
  if (!r) return 'ignoree'; // référence inconnue ici
  return r.incomplet ? 'a_reessayer' : 'traitee';
}

/**
 * Rapprochement (tâche planifiée, une fois par jour) : les demandes des
 * dernières 48 h restées en cours ou notées expirées ici sont revérifiées chez
 * le fournisseur. Un paiement validé dont la notification s'est perdue est
 * enregistré. `null` : paiement en ligne non configuré sur ce déploiement.
 */
export async function rapprocherPaiements({ heures = 48, max = 200 }: { heures?: number; max?: number } = {}): Promise<{
  verifies: number;
  enregistres: number;
  inacheves: number;
} | null> {
  const admin = clientService();
  const fournisseur = fournisseurActif();
  if (!admin || !fournisseur) return null;
  const { data, error } = await admin
    .from('paiements_en_ligne')
    .select('reference')
    .in('statut', ['initie', 'en_attente', 'expire'])
    .eq('fournisseur', fournisseur.nom)
    .not('fournisseur_reference', 'is', null)
    .gte('created_at', new Date(Date.now() - heures * 3_600_000).toISOString())
    .order('created_at')
    .limit(max);
  if (error) throw new Error(`Rapprochement : lecture impossible (${error.message})`);
  const references = rows<{ reference: string }>(data).map((x) => x.reference);
  const bilan = { verifies: references.length, enregistres: 0, inacheves: 0 };
  // Par paquets de 5 : le fournisseur n'est pas interrogé en rafale.
  for (let i = 0; i < references.length; i += 5) {
    const etats = await Promise.all(references.slice(i, i + 5).map((ref) => actualiserPaiement(ref, { reverifier: true })));
    for (const e of etats) {
      if (e?.incomplet) bilan.inacheves++;
      else if (e?.statut === 'reussi') bilan.enregistres++;
    }
  }
  return bilan;
}
