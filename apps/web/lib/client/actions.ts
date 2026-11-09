'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabase, row, rpc } from '@/lib/server';
import { cheminInterne, normaliserNom } from '@/lib/metier';
import { estCategorie, nettoyerReponses, type Reponses } from '@/lib/devis';
import { enregistrerAcceptation } from '@/lib/acceptations';
import { estTypeDocument } from '@/lib/documents';
import type { ActionState } from '@/lib/types';

const MESSAGE_DOCUMENTS = 'Cochez la case pour accepter la charte de l’abonné et le contrat d’abonnement.';
import type { IncidentInput } from '@/components/capture/incident-form';

export async function confirmerPassageAction(collecteId: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'confirmer_passage', { p_collecte: collecteId, p_confirme: true });
  if (error) return { error: error.message };
  // Pas de revalidatePath ici : la liste rafraîchie retirait le passage en même
  // temps que s'affichait « Confirmé », et le ménage ne voyait aucun retour
  // (constaté en production). Le passage reste affiché « Confirmé » jusqu'à la
  // prochaine visite, où il n'apparaît plus parmi ceux à confirmer.
  return { ok: 'Merci, passage confirmé.' };
}

/** Signalement du ménage, preuve capturée sur le moment. Contester un passage exige une preuve. */
export async function signalerIncidentClientAction(input: IncidentInput): Promise<ActionState> {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Session expirée : reconnectez-vous.' };

  const { data } = await supabase
    .from('clients')
    .select('id, entreprise_id')
    .eq('user_id', user.id)
    .neq('statut', 'resilie')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const client = row<{ id: string; entreprise_id: string }>(data);
  if (!client) return { error: 'Aucun abonnement actif : souscrivez d’abord auprès d’un précollecteur.' };

  if (input.mediaPath && !input.mediaPath.startsWith(`${client.entreprise_id}/${user.id}/`)) {
    return { error: 'Preuve invalide.' };
  }
  if (input.collecteId && !input.mediaPath) {
    return { error: 'Pour contester un passage, une photo ou une vidéo est obligatoire.' };
  }

  const { error } = await supabase.from('incidents_precollecte').insert({
    entreprise_id: client.entreprise_id,
    client_id: client.id,
    collecte_id: input.collecteId,
    source: 'client',
    categorie: input.categorie,
    description: input.description,
    media_path: input.mediaPath,
    media_type: input.mediaType,
    capture_at: input.captureAt,
    lat: input.lat,
    lng: input.lng,
  });
  if (error) return { error: error.message };

  if (input.collecteId) {
    await rpc(supabase, 'confirmer_passage', { p_collecte: input.collecteId, p_confirme: false });
  }
  revalidatePath('/citoyen', 'layout');
  if (cheminInterne(input.retour)) redirect(input.retour!);
  return { ok: 'Signalement transmis à votre précollecteur.' };
}

/** Bandeau des ménages déjà inscrits : acceptation en ligne des versions en vigueur. */
export async function accepterDocumentsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get('documents') !== 'on') return { error: MESSAGE_DOCUMENTS };
  const types = fd.getAll('type').filter(estTypeDocument);
  const supabase = await getSupabase();
  const refus = await enregistrerAcceptation(supabase, types.length ? { types } : {});
  if (refus) return { error: refus };
  revalidatePath('/citoyen', 'layout');
  return { ok: 'Merci : votre acceptation est enregistrée, avec sa date.' };
}

// =============================================================================
// Demande de devis (migration 20261110000018)
// =============================================================================

export interface DemandeDevisInput {
  categorie: string;
  nom: string;
  telephone: string;
  whatsapp: string;
  communeId: string;
  quartier: string;
  repere: string;
  accesVoie: string;
  gabaritMax: string;
  inaccessiblePluies: boolean;
  passagesSemaine: number;
  sacsBesoin: boolean;
  sacsVolumeLitres: number | null;
  details: Reponses;
  lat: number | null;
  lng: number | null;
  entrepriseCible: string | null;
  documentsAcceptes: boolean;
}

/** Précollecteurs vérifiés d'un quartier (annuaire public), proposés dans la demande. */
export async function chercherAnnuaireAction(quartier: string): Promise<{ id: string; nom: string; devise: string | null; logo_path: string | null }[]> {
  if (quartier.trim().length < 2) return [];
  const supabase = await getSupabase();
  const { data } = await rpc(supabase, 'annuaire_precollecteurs', { p_recherche: quartier.trim().slice(0, 60) });
  return (Array.isArray(data) ? data : []) as { id: string; nom: string; devise: string | null; logo_path: string | null }[];
}

/**
 * L'abonné demande un devis : la charte et le contrat sont acceptés AVANT,
 * puis la demande part aux précollecteurs vérifiés de sa commune ou de son
 * quartier (ou à celui qu'il a choisi). La position n'est gardée que si
 * l'abonné l'a enregistrée sur place.
 */
export async function deposerDemandeDevisAction(input: DemandeDevisInput): Promise<ActionState> {
  if (!estCategorie(input.categorie)) return { error: 'Choisissez le type de lieu à collecter.' };
  if (!input.nom.trim()) return { error: 'Indiquez votre nom ou celui de la structure.' };
  if (!input.telephone.trim()) return { error: 'Indiquez un numéro de téléphone : le précollecteur vous appellera.' };
  if (!input.communeId) return { error: 'Choisissez votre arrondissement (commune) : la demande part aux précollecteurs qui y travaillent.' };
  if (!input.quartier.trim()) return { error: 'Indiquez votre quartier.' };
  if (!input.repere.trim()) return { error: 'Indiquez un repère précis : carrefour, bâtiment, couleur du portail…' };
  if (!input.documentsAcceptes) return { error: MESSAGE_DOCUMENTS };
  const supabase = await getSupabase();
  const refus = await enregistrerAcceptation(supabase);
  if (refus) return { error: refus };
  const surPlace = input.lat != null && input.lng != null;
  const { error } = await rpc(supabase, 'deposer_demande_devis', {
    p: {
      categorie: input.categorie,
      nom: normaliserNom(input.nom),
      telephone: input.telephone.trim(),
      whatsapp: input.whatsapp.trim() || null,
      commune_id: input.communeId || null,
      quartier: normaliserNom(input.quartier),
      repere: input.repere.trim(),
      acces_voie: input.accesVoie || null,
      gabarit_max: input.gabaritMax || null,
      inaccessible_pluies: input.inaccessiblePluies,
      passages_semaine: input.passagesSemaine,
      sacs_besoin: input.sacsBesoin,
      sacs_volume_litres: input.sacsBesoin ? input.sacsVolumeLitres : null,
      details: nettoyerReponses(input.categorie, input.details),
      lat: surPlace ? input.lat : null,
      lng: surPlace ? input.lng : null,
      position_sur_place: surPlace,
      entreprise_cible: input.entrepriseCible || null,
    },
  });
  if (error) return { error: error.message };
  revalidatePath('/citoyen', 'layout');
  redirect('/citoyen?demande=1');
}

export async function accepterDevisAction(fd: FormData) {
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'accepter_devis', { p_devis: String(fd.get('devis_id')) });
  revalidatePath('/citoyen', 'layout');
  redirect(error ? `/citoyen?erreur=${encodeURIComponent(error.message)}` : '/citoyen?devis=accepte');
}

export async function refuserDevisAction(fd: FormData) {
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'refuser_devis', { p_devis: String(fd.get('devis_id')) });
  revalidatePath('/citoyen', 'layout');
  if (error) redirect(`/citoyen?erreur=${encodeURIComponent(error.message)}`);
}

export async function annulerDemandeDevisAction() {
  const supabase = await getSupabase();
  await rpc(supabase, 'annuler_demande_devis');
  revalidatePath('/citoyen', 'layout');
}
