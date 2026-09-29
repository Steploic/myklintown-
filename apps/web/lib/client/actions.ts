'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabase, row, rpc } from '@/lib/server';
import { cheminInterne } from '@/lib/metier';
import type { ActionState } from '@/lib/types';
import type { IncidentInput } from '@/components/capture/incident-form';

export interface PrecollecteurTrouve {
  zone_id: string;
  zone_nom: string;
  entreprise_id: string;
  entreprise_nom: string;
  entreprise_telephone: string | null;
}

/** Quels précollecteurs desservent ce point ? (zones tracées par la Mairie) */
export async function chercherPrecollecteursAction(lat: number, lng: number): Promise<PrecollecteurTrouve[]> {
  const supabase = await getSupabase();
  const { data } = await rpc(supabase, 'precollecteurs_du_point', { p_lat: lat, p_lng: lng });
  return (Array.isArray(data) ? data : []) as PrecollecteurTrouve[];
}

export async function souscrireAction(input: {
  entrepriseId: string;
  planId: string;
  nom: string;
  telephone: string;
  adresse: string;
  quartier: string;
  lat: number;
  lng: number;
}): Promise<ActionState> {
  const supabase = await getSupabase();
  if (!input.nom.trim()) return { error: 'Indiquez votre nom.' };
  if (!input.telephone.trim()) return { error: 'Indiquez un numéro de téléphone : votre précollecteur vous appellera.' };
  const { error } = await rpc(supabase, 'souscrire_client', {
    p_entreprise: input.entrepriseId,
    p_plan: input.planId,
    p_nom: input.nom.trim(),
    p_telephone: input.telephone.trim(),
    p_adresse: input.adresse.trim() || null,
    p_quartier: input.quartier.trim() || null,
    p_lat: input.lat,
    p_lng: input.lng,
  });
  if (error) return { error: error.message };
  revalidatePath('/citoyen', 'layout');
  redirect('/citoyen?demande=1');
}

export async function confirmerPassageAction(collecteId: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'confirmer_passage', { p_collecte: collecteId, p_confirme: true });
  if (error) return { error: error.message };
  revalidatePath('/citoyen', 'layout');
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
