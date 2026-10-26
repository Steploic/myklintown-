'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabase, row, rpc, utilisateurCourant } from '@/lib/server';
import { clientService } from '@/lib/supabase-service';
import { estErreurReseau, MESSAGE_RESEAU } from '@/lib/format';
import { actualiserPaiement, demarrerPaiement, PAIEMENT_INDISPONIBLE, paiementEnLigneDisponible } from './service';
import type { Canal, StatutPaiementEnLigne } from './regles';

export interface ResultatDemande {
  reference?: string;
  montant?: number;
  error?: string;
}

/**
 * Chaque usage vérifie d'abord QUI paie, avec la session de l'utilisateur
 * (sécurité par ligne) ; le déroulé du paiement est commun (service.ts).
 */

/** Le ménage règle sa facture depuis son espace. */
export async function payerFactureAction(factureId: string, canal: Canal, telephone: string): Promise<ResultatDemande> {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) return { error: 'Session expirée : reconnectez-vous.' };
  const { data } = await supabase.from('factures').select('id, clients!inner(user_id)').eq('id', factureId).maybeSingle();
  const f = row<{ id: string; clients: { user_id: string | null } }>(data);
  if (!f || f.clients.user_id !== user.id) return { error: 'Facture introuvable.' };
  return demarrerPaiement({ factureId, canal, telephone, origine: 'menage', initiePar: user.id });
}

/** Lien de paiement reçu par WhatsApp : payable sans compte. */
export async function payerParLienAction(jeton: string, canal: Canal, telephone: string): Promise<ResultatDemande> {
  const admin = clientService();
  if (!admin) return { error: PAIEMENT_INDISPONIBLE };
  const { data } = await admin.from('liens_paiement').select('facture_id, expire_at').eq('jeton', jeton).maybeSingle();
  const lien = row<{ facture_id: string; expire_at: string }>(data);
  if (!lien || new Date(lien.expire_at) < new Date()) return { error: 'Ce lien de paiement a expiré : demandez-en un nouveau à votre précollecteur.' };
  return demarrerPaiement({ factureId: lien.facture_id, canal, telephone, origine: 'lien', initiePar: null });
}

/** Pendant la tournée : demande de paiement sur le téléphone du ménage (gérant ou employé). */
export async function demanderPaiementTourneeAction(clientId: string, canal: Canal, telephone: string): Promise<ResultatDemande> {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) return { error: 'Session expirée : reconnectez-vous.' };
  const { data: m } = await supabase.from('entreprise_membres').select('entreprise_id').eq('user_id', user.id).limit(1).maybeSingle();
  const entreprise = row<{ entreprise_id: string }>(m)?.entreprise_id;
  if (!entreprise) return { error: 'Réservé à l’équipe du précollecteur.' };
  const { data } = await supabase
    .from('factures')
    .select('id')
    .eq('client_id', clientId)
    .eq('entreprise_id', entreprise)
    .eq('statut', 'emise')
    .order('echeance')
    .limit(1)
    .maybeSingle();
  const f = row<{ id: string }>(data);
  if (!f) return { error: 'Aucune facture à régler pour ce client.' };
  return demarrerPaiement({ factureId: f.id, canal, telephone, origine: 'tournee', initiePar: user.id });
}

/**
 * Où en est le paiement ? (la référence, aléatoire, n'est connue que de celui qui l'a lancé)
 *
 * Ne revalide rien : une revalidation redessine la page courante dans la réponse
 * même, où la facture désormais payée n'a plus son bloc de paiement — la
 * confirmation « Paiement reçu » disparaissait avant d'apparaître. La mise à
 * jour passe par `rafraichirApresPaiementAction`, une fois la confirmation lue.
 */
export async function statutPaiementAction(reference: string): Promise<{ statut: StatutPaiementEnLigne; message: string | null }> {
  const r = await actualiserPaiement(reference);
  return r ?? { statut: 'echoue', message: 'Paiement introuvable.' };
}

/** Après un paiement réussi : espaces du ménage, du précollecteur et de l'employé à jour (page courante comprise). */
export async function rafraichirApresPaiementAction() {
  revalidatePath('/citoyen', 'layout');
  revalidatePath('/precollecteur', 'layout');
  revalidatePath('/employe', 'layout');
}

/** Le gérant (ou un employé) crée le lien de paiement d'une facture, à envoyer par WhatsApp. */
export async function creerLienPaiementAction(fd: FormData) {
  const supabase = await getSupabase();
  const factureId = String(fd.get('facture_id'));
  const clientId = String(fd.get('client_id'));
  const { data, error } = await rpc(supabase, 'creer_lien_paiement', { p_facture: factureId });
  if (error) redirect(`/precollecteur/clients/${clientId}?erreur=${encodeURIComponent(estErreurReseau(error) ? MESSAGE_RESEAU : error.message)}`);
  redirect(`/precollecteur/clients/${clientId}?lien=${data as string}&facture=${factureId}`);
}

// -----------------------------------------------------------------------------
// Ouverture du paiement en ligne pour une entreprise : MyKlinTown encaisse sur
// son compte Notch Pay, puis reverse au précollecteur.
// -----------------------------------------------------------------------------

const PAGE_PAIEMENT = '/precollecteur/paiement-en-ligne';

async function gerantConnecte() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) redirect(`/login?next=${PAGE_PAIEMENT}`);
  const { data } = await supabase
    .from('entreprise_membres')
    .select('entreprise_id, role_membre, entreprises(id)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const m = row<{ role_membre: string; entreprises: { id: string } | null }>(data);
  if (!m?.entreprises || m.role_membre !== 'gerant') redirect('/precollecteur');
  return m.entreprises;
}

/** Statut modifiable par le serveur seulement (déclencheur de la migration 0008) : passe par le client service. */
async function changerStatutPaiement(statut: 'actif' | 'inactif') {
  const ent = await gerantConnecte();
  const admin = clientService();
  if (!admin || !paiementEnLigneDisponible()) redirect(`${PAGE_PAIEMENT}?erreur=${encodeURIComponent(PAIEMENT_INDISPONIBLE)}`);
  const { error } = await admin
    .from('entreprises')
    .update({ paiement_statut: statut, paiement_maj_at: new Date().toISOString() })
    .eq('id', ent.id);
  if (error) redirect(`${PAGE_PAIEMENT}?erreur=${encodeURIComponent('Le changement n’a pas pu être enregistré. Réessayez.')}`);
  revalidatePath('/precollecteur', 'layout');
  redirect(PAGE_PAIEMENT);
}

/** Le gérant ouvre le paiement Mobile Money à ses clients. */
export async function activerPaiementEnLigneAction() {
  await changerStatutPaiement('actif');
}

/** Le gérant le referme (les paiements déjà lancés suivent leur cours). */
export async function desactiverPaiementEnLigneAction() {
  await changerStatutPaiement('inactif');
}
