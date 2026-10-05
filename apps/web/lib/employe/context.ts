import { redirect } from 'next/navigation';
import { getSupabase, row, utilisateurCourant } from '@/lib/server';
import type { Employe } from '@/lib/types';

export interface EspaceEmploye {
  employe: Employe;
  entreprise: { id: string; nom: string; telephone: string | null };
}

/**
 * Fiche employé du compte connecté (avec son entreprise). La sécurité par ligne
 * ne la montre que si la fiche est ACTIVE : une fiche désactivée par le gérant
 * suspend l'accès, sans rien supprimer.
 */
export async function requireEmploye() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) redirect('/login?next=/employe');
  const { data } = await supabase
    .from('employes')
    .select('*, entreprises(id, nom, telephone)')
    .eq('user_id', user.id)
    .eq('actif', true)
    .maybeSingle();
  const e = row<Employe & { entreprises: EspaceEmploye['entreprise'] | null }>(data);
  if (!e || !e.entreprises) redirect('/employe/acces');
  const { entreprises, ...employe } = e;
  return { supabase, user, employe: employe as Employe, entreprise: entreprises };
}
