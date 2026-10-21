'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase, rpc } from '@/lib/server';
import { contourDepuisPoints } from '@/lib/metier';
import { formaterCode } from '@/lib/agrement';
import type { ActionState } from '@/lib/types';

function rafraichir() {
  revalidatePath('/dashboard', 'layout');
}

/** Refus de la base (RLS) : depuis 20261019000016, une Mairie n'agit que sur sa commune. */
const refusRls = (message: string) => /row-level|42501/.test(message);
const HORS_COMMUNE_ZONE = 'Cette zone n’est pas dans une commune rattachée à votre compte : une Mairie ne découpe que le territoire de sa commune.';

export interface Conflit {
  id: string;
  nom: string;
  recouvrement_m2: number;
}

export async function verifierConflitsAction(points: [number, number][], exclure?: string | null): Promise<Conflit[]> {
  const contour = contourDepuisPoints(points);
  if (!contour) return [];
  const supabase = await getSupabase();
  const { data } = await rpc(supabase, 'zones_en_conflit', { p_contour: contour, p_exclure: exclure ?? null });
  return (Array.isArray(data) ? data : []) as Conflit[];
}

export async function enregistrerZoneAction(input: {
  id?: string | null;
  nom: string;
  couleur: string;
  communeId: string | null;
  points: [number, number][];
  chevauchementAutorise: boolean;
}): Promise<ActionState & { id?: string }> {
  const nom = input.nom.trim();
  if (!nom) return { error: 'Donnez un nom à la zone.' };
  const contour = contourDepuisPoints(input.points);
  if (!contour) return { error: 'Une zone a besoin d’au moins 3 points.' };

  const supabase = await getSupabase();
  if (!input.chevauchementAutorise) {
    const conflits = await verifierConflitsAction(input.points, input.id);
    if (conflits.length) {
      return {
        error: `Chevauchement avec : ${conflits.map((c) => `${c.nom} (${Math.round(c.recouvrement_m2).toLocaleString('fr-FR')} m²)`).join(', ')}. Corrigez le tracé ou cochez « chevauchement autorisé ».`,
      };
    }
  }

  const ligne = { nom, couleur: input.couleur, commune_id: input.communeId, contour };
  const { data, error } = input.id
    ? await supabase.from('zones').update(ligne).eq('id', input.id).select('id').single()
    : await supabase.from('zones').insert(ligne).select('id').single();
  if (error) {
    // Hors de ses communes, la base refuse (ou, en modification, ne trouve pas la ligne).
    return { error: refusRls(error.message) || error.code === 'PGRST116' ? HORS_COMMUNE_ZONE : error.message };
  }
  rafraichir();
  return { ok: input.id ? 'Zone mise à jour.' : 'Zone créée.', id: (data as { id: string }).id };
}

export async function supprimerZoneAction(id: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('zones').delete().eq('id', id).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: HORS_COMMUNE_ZONE };
  rafraichir();
  return { ok: 'Zone supprimée.' };
}

export async function affecterZoneAction(zoneId: string, entrepriseId: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('zone_affectations').upsert({ zone_id: zoneId, entreprise_id: entrepriseId });
  if (error) {
    return {
      error: refusRls(error.message)
        ? 'Affectation refusée : la zone et le précollecteur doivent relever de votre commune. Un précollecteur agréé ailleurs est rattaché par l’équipe MyKlinTown.'
        : error.message,
    };
  }
  rafraichir();
  return { ok: 'Précollecteur affecté.' };
}

export async function retirerAffectationAction(zoneId: string, entrepriseId: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('zone_affectations').delete().eq('zone_id', zoneId).eq('entreprise_id', entrepriseId).select('zone_id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: HORS_COMMUNE_ZONE };
  rafraichir();
  return { ok: 'Affectation retirée.' };
}

export async function statutIncidentMairieAction(fd: FormData) {
  const supabase = await getSupabase();
  await supabase
    .from('incidents_precollecte')
    .update({ statut: String(fd.get('statut')) })
    .eq('id', String(fd.get('incident_id')));
  rafraichir();
}

// -----------------------------------------------------------------------------
// Codes d'agrément des précollecteurs
// -----------------------------------------------------------------------------

export async function creerCodeAgrementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const destinataire = String(fd.get('destinataire') ?? '').trim();
  if (destinataire.length < 2) return { error: 'Indiquez à qui ce code est destiné.' };
  const supabase = await getSupabase();
  const { data, error } = await rpc(supabase, 'creer_code_agrement', {
    p_destinataire: destinataire,
    p_telephone: String(fd.get('telephone') ?? '').trim() || null,
    p_commune: String(fd.get('commune_id') ?? '') || null,
  });
  if (error) return { error: error.message };
  rafraichir();
  return { ok: `Code délivré à ${destinataire} : ${formaterCode(String(data))}. Envoyez-le-lui depuis la liste ci-dessous.` };
}

export async function revoquerCodeAgrementAction(fd: FormData) {
  const supabase = await getSupabase();
  await rpc(supabase, 'revoquer_code_agrement', { p_id: String(fd.get('id')) });
  rafraichir();
}
