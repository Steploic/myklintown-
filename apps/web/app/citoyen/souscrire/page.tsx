import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/portal-shell';
import { PageHeader } from '@/components/ui/blocks';
import { DemandeDevis } from '@/components/client/demande-devis';
import { getMonAbonnement } from '@/lib/client/context';
import { row, rows } from '@/lib/server';

export const metadata = { title: 'Demander un devis' };

export default async function SouscrirePage() {
  const { supabase, user, client, demande } = await getMonAbonnement();
  // Déjà abonné, ou une demande déjà en cours : l'accueil la montre.
  if (client || demande) redirect('/citoyen');
  const [{ data: co }, { data: pr }] = await Promise.all([
    supabase.from('communes').select('id, nom').order('nom'),
    supabase.from('profiles').select('nom_complet, telephone').eq('id', user.id).maybeSingle(),
  ]);
  const profil = row<{ nom_complet: string | null; telephone: string | null }>(pr);

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen">
      <PageHeader
        titre="Demander un devis"
        sousTitre="Le lieu, vos coordonnées, vos besoins : les précollecteurs vérifiés de votre quartier vous proposent leur tarif."
        retour={{ href: '/citoyen', label: 'Mon espace' }}
      />
      <DemandeDevis
        communes={rows<{ id: string; nom: string }>(co)}
        nomDefaut={profil?.nom_complet ?? ''}
        telDefaut={profil?.telephone ?? ''}
      />
    </PortalShell>
  );
}
