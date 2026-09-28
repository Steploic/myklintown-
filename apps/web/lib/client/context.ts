import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSupabase, row } from '@/lib/server';
import type { ClientStatut, Entreprise } from '@/lib/types';

/** Abonnement du ménage connecté (le plus récent non résilié), et son précollecteur. */
export const getMonAbonnement = cache(async () => {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/citoyen');

  const { data } = await supabase
    .from('v_clients_statut')
    .select('*')
    .eq('user_id', user.id)
    .neq('statut', 'resilie')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const client = row<ClientStatut>(data);

  let entreprise: Pick<Entreprise, 'id' | 'nom' | 'telephone'> | null = null;
  if (client) {
    const { data: e } = await supabase.from('entreprises').select('id, nom, telephone').eq('id', client.entreprise_id).maybeSingle();
    entreprise = row<Pick<Entreprise, 'id' | 'nom' | 'telephone'>>(e);
  }
  return { supabase, user, client, entreprise };
});
