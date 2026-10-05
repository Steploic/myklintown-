import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSupabase, row, utilisateurCourant } from '@/lib/server';
import type { Entreprise } from '@/lib/types';

/** Lecture unique par requête (la coque et la page la demandent toutes deux). */
const lireContexte = cache(async () => {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) return { supabase, user: null, entreprise: null as Entreprise | null };

  const { data: membre } = await supabase
    .from('entreprise_membres')
    .select('entreprise_id, role_membre, entreprises(*)')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  const m = row<{ entreprises: Entreprise | null }>(membre);
  return { supabase, user, entreprise: m?.entreprises ?? null };
});

/**
 * Entreprise du précollecteur connecté.
 *
 * Un compte précollecteur sans entreprise est renvoyé à l'écran de démarrage :
 * aucune page d'exploitation n'a de sens avant cette étape.
 */
export async function getMonEntreprise() {
  const ctx = await lireContexte();
  if (!ctx.user) redirect('/login?next=/precollecteur');
  return { ...ctx, user: ctx.user };
}

/** Variante stricte : entreprise garantie non nulle. */
export async function requireEntreprise() {
  const ctx = await getMonEntreprise();
  if (!ctx.entreprise) redirect('/precollecteur/demarrage');
  return { ...ctx, entreprise: ctx.entreprise };
}
