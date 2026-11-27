'use server';

import { revalidatePath } from 'next/cache';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { rpc } from '@/lib/server';
import type { ActionState } from '@/lib/types';

/** Le gérant demande à être accompagné pour une étape de mise en règle (migration 20261127000029). */
export async function demanderAccompagnementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const etape = String(fd.get('etape') ?? '');
  const commune = String(fd.get('commune_id') ?? '') || null;
  const message = String(fd.get('message') ?? '').trim().slice(0, 500) || null;
  const { error } = await rpc(supabase, 'demander_accompagnement', { p_etape: etape, p_commune: commune, p_message: message });
  if (error) return { error: error.message };
  revalidatePath('/precollecteur/dossier');
  revalidatePath('/dashboard/accompagnements');
  return { ok: 'Demande envoyée : l’équipe MyKlinTown vous recontacte.' };
}

export async function retirerAccompagnementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireEntreprise();
  const { error } = await rpc(supabase, 'retirer_accompagnement', { p_id: String(fd.get('id') ?? '') });
  if (error) return { error: error.message };
  revalidatePath('/precollecteur/dossier');
  revalidatePath('/dashboard/accompagnements');
  return { ok: 'Demande retirée.' };
}
