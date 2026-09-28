import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/portal-shell';
import { PageHeader } from '@/components/ui/blocks';
import { Souscription } from '@/components/client/souscription';
import { getMonAbonnement } from '@/lib/client/context';
import { row, rows } from '@/lib/server';
import type { Plan } from '@/lib/types';

export const metadata = { title: 'M’abonner' };

export default async function SouscrirePage() {
  const { supabase, user, client } = await getMonAbonnement();
  if (client) redirect('/citoyen');
  const [{ data: pl }, { data: pr }] = await Promise.all([
    supabase.from('plans_tarifaires').select('*').eq('actif', true).order('ordre'),
    supabase.from('profiles').select('nom_complet, telephone').eq('id', user.id).maybeSingle(),
  ]);
  const profil = row<{ nom_complet: string | null; telephone: string | null }>(pr);

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen">
      <PageHeader
        titre="M’abonner à la collecte"
        sousTitre="Trois étapes : votre formule, votre adresse, votre précollecteur."
        retour={{ href: '/citoyen', label: 'Mon espace' }}
      />
      <Souscription plans={rows<Plan>(pl)} nomDefaut={profil?.nom_complet ?? ''} telDefaut={profil?.telephone ?? ''} />
    </PortalShell>
  );
}
