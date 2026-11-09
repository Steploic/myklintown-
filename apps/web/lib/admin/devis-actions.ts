'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase, rpc } from '@/lib/server';
import { estErreurReseau, MESSAGE_RESEAU } from '@/lib/format';
import type { ActionState } from '@/lib/types';

/**
 * L'équipe MyKlinTown oriente une demande de devis qu'aucun précollecteur
 * vérifié ne reçoit (`orienter_demande_devis`, réservé à l'administrateur) :
 * elle précise la commune, ou désigne un précollecteur vérifié.
 */
export async function orienterDemandeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const demande = String(fd.get('demande_id') ?? '');
  const commune = String(fd.get('commune_id') ?? '') || null;
  const entreprise = String(fd.get('entreprise_id') ?? '') || null;
  if (!demande) return { error: 'Demande introuvable.' };
  if (!commune && !entreprise) return { error: 'Choisissez la commune de la demande, ou un précollecteur vérifié.' };
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'orienter_demande_devis', {
    p_demande: demande,
    p_commune: commune,
    p_entreprise: entreprise,
  });
  if (error) return { error: estErreurReseau(error) ? MESSAGE_RESEAU : error.message };
  revalidatePath('/dashboard/precollecteurs');
  return {
    ok: entreprise
      ? 'Demande adressée à ce précollecteur : elle apparaît dans ses demandes de devis.'
      : 'Commune précisée : la demande part aux précollecteurs vérifiés qui y travaillent.',
  };
}
