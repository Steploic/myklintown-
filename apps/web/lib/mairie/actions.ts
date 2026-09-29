'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase, rpc } from '@/lib/server';
import { contourDepuisPoints } from '@/lib/metier';
import type { ActionState } from '@/lib/types';

function rafraichir() {
  revalidatePath('/dashboard', 'layout');
}

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
    return { error: /row-level|42501/.test(error.message) ? 'Seuls les comptes Mairie peuvent découper le territoire.' : error.message };
  }
  rafraichir();
  return { ok: input.id ? 'Zone mise à jour.' : 'Zone créée.', id: (data as { id: string }).id };
}

export async function supprimerZoneAction(id: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('zones').delete().eq('id', id);
  if (error) return { error: error.message };
  rafraichir();
  return { ok: 'Zone supprimée.' };
}

export async function affecterZoneAction(zoneId: string, entrepriseId: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('zone_affectations').upsert({ zone_id: zoneId, entreprise_id: entrepriseId });
  if (error) return { error: error.message };
  rafraichir();
  return { ok: 'Précollecteur affecté.' };
}

export async function retirerAffectationAction(zoneId: string, entrepriseId: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('zone_affectations').delete().eq('zone_id', zoneId).eq('entreprise_id', entrepriseId);
  if (error) return { error: error.message };
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
