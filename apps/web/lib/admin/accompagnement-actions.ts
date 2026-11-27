'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase, rpc } from '@/lib/server';
import type { ActionState } from '@/lib/types';

/**
 * L'équipe MyKlinTown suit une demande d'accompagnement (`suivre_accompagnement`,
 * réservé à l'administrateur) : statut, et message que le gérant lit dans son
 * dossier. Le message envoyé remplace le précédent ; vide, il l'efface.
 */
export async function suivreAccompagnementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'suivre_accompagnement', {
    p_id: String(fd.get('id') ?? ''),
    p_statut: String(fd.get('statut') ?? ''),
    p_message: String(fd.get('message') ?? '').slice(0, 1000),
  });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/accompagnements');
  revalidatePath('/precollecteur/dossier');
  return { ok: 'Suivi enregistré.' };
}
