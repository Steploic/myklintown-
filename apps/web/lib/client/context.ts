import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSupabase, row, rows, rpc, utilisateurCourant } from '@/lib/server';
import type { ClientStatut, DemandeDevis, DevisRecu, Entreprise } from '@/lib/types';

/** Abonnement de l'abonné connecté (le plus récent non résilié), et son précollecteur. */
export const getMonAbonnement = cache(async () => {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
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
  // Demande de devis ouverte (migration 20261110000018) et devis reçus.
  let demande: DemandeDevis | null = null;
  let devis: DevisRecu[] = [];
  if (!client) {
    const { data: d } = await supabase
      .from('demandes_devis')
      .select('id, categorie, quartier, passages_semaine, statut, created_at')
      .eq('user_id', user.id)
      .in('statut', ['en_attente', 'devis_recu'])
      .maybeSingle();
    demande = row<DemandeDevis>(d);
    if (demande) devis = rows<DevisRecu>((await rpc(supabase, 'mes_devis')).data);
  }
  return { supabase, user, client, entreprise, demande, devis };
});
