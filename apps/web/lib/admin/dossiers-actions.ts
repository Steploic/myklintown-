'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase, rpc } from '@/lib/server';
import type { ActionState } from '@/lib/types';

/**
 * L'équipe MyKlinTown valide ou refuse le dossier d'un précollecteur
 * (`statuer_dossier`, réservé à l'administrateur). Validé : il apparaît dans
 * l'annuaire. Refusé : le motif s'affiche dans son espace.
 */
export async function statuerDossierAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await getSupabase();
  const entreprise = String(fd.get('entreprise_id') ?? '');
  const decision = String(fd.get('decision') ?? '');
  const motif = String(fd.get('motif') ?? '').trim() || null;
  if (decision !== 'valide' && decision !== 'refuse') return { error: 'Décision inconnue.' };
  const { error } = await rpc(supabase, 'statuer_dossier', { p_entreprise: entreprise, p_decision: decision, p_motif: motif });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/precollecteurs');
  return {
    ok: decision === 'valide'
      ? 'Dossier validé : le précollecteur apparaît dans l’annuaire de ses quartiers.'
      : 'Dossier refusé : le motif s’affiche dans son espace.',
  };
}
