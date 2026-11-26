'use server';

import { revalidatePath } from 'next/cache';
import { contourDepuisPoints } from '@/lib/metier';
import { requireEntreprise } from '@/lib/precollecteur/context';
import type { ActionState } from '@/lib/types';

/**
 * Zones tracées par le précollecteur lui-même (migration 20261126000027 :
 * MyKlinTown fonctionne sans les Mairies). La base garde la règle : il ne
 * touche qu'aux zones de SON entreprise, dans une de ses communes d'activité,
 * cinquante au plus ; chaque zone lui est affectée d'office. Les chevauchements
 * sont permis (deux précollecteurs peuvent servir le même quartier).
 */

function rafraichir() {
  revalidatePath('/precollecteur/zones');
  revalidatePath('/precollecteur/carte');
  revalidatePath('/precollecteur/tournees');
  revalidatePath('/precollecteur/clients', 'layout');
}

function erreurZone(message: string): string {
  if (/zones_contour_valide/.test(message)) {
    return 'Ce tracé n’a pas une taille de zone : entre 100 m² et 5 000 km². Reprenez-le.';
  }
  if (/row-level|42501/.test(message)) return 'Cette zone n’appartient pas à votre entreprise.';
  return message;
}

export async function enregistrerMaZoneAction(input: {
  id?: string | null;
  nom: string;
  couleur: string;
  communeId: string | null;
  points: [number, number][];
}): Promise<ActionState & { id?: string }> {
  const nom = input.nom.trim();
  if (!nom) return { error: 'Donnez un nom à la zone.' };
  if (nom.length > 80) return { error: 'Nom trop long (80 caractères au plus).' };
  const contour = contourDepuisPoints(input.points);
  if (!contour) return { error: 'Une zone a besoin d’au moins 3 points.' };
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.couleur)) return { error: 'Couleur invalide.' };

  const { supabase, entreprise } = await requireEntreprise();
  const ligne = { nom, couleur: input.couleur, commune_id: input.communeId || null, contour };
  const { data, error } = input.id
    ? await supabase.from('zones').update(ligne).eq('id', input.id).eq('entreprise_id', entreprise.id).select('id').single()
    : await supabase.from('zones').insert({ ...ligne, entreprise_id: entreprise.id }).select('id').single();
  if (error) {
    return { error: error.code === 'PGRST116' ? 'Cette zone n’appartient pas à votre entreprise.' : erreurZone(error.message) };
  }
  rafraichir();
  return { ok: input.id ? 'Zone mise à jour.' : 'Zone créée : elle vous est affectée.', id: (data as { id: string }).id };
}

export async function supprimerMaZoneAction(id: string): Promise<ActionState> {
  const { supabase, entreprise } = await requireEntreprise();
  const { data, error } = await supabase.from('zones').delete().eq('id', id).eq('entreprise_id', entreprise.id).select('id');
  if (error) return { error: erreurZone(error.message) };
  if (!data?.length) return { error: 'Cette zone n’appartient pas à votre entreprise.' };
  rafraichir();
  return { ok: 'Zone supprimée.' };
}
