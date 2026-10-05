import { PortalShell } from '@/components/portal-shell';
import { PageHeader } from '@/components/ui/blocks';
import { IncidentForm } from '@/components/capture/incident-form';
import { requireEmploye } from '@/lib/employe/context';
import { creerIncidentAction } from '@/lib/precollecteur/actions';
import { rows } from '@/lib/server';
import { CATEGORIES_INCIDENT_PRECOLLECTEUR } from '@/lib/format';

export const metadata = { title: 'Déclarer un incident' };

/** Incident de terrain, preuve prise sur le moment ; visible du gérant et de l'équipe de la tournée. */
export default async function IncidentEmploye({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; collecte?: string; tournee?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, entreprise } = await requireEmploye();
  const { data } = await supabase
    .from('clients')
    .select('id, nom')
    .eq('entreprise_id', entreprise.id)
    .neq('statut', 'resilie')
    .order('nom');
  const retour = sp.tournee ? `/employe/tournees/${sp.tournee}` : '/employe/historique';

  return (
    <PortalShell portalKey="employe" currentPath="/employe/incidents/nouveau" titre={entreprise.nom}>
      <PageHeader
        titre="Déclarer un incident"
        sousTitre="Photo ou vidéo prise sur place, datée et localisée automatiquement."
        retour={sp.tournee ? { href: `/employe/tournees/${sp.tournee}`, label: 'Tournée' } : { href: '/employe', label: 'Aujourd’hui' }}
      />
      <div className="card-soft p-5 sm:p-6">
        <IncidentForm
          entrepriseId={entreprise.id}
          categories={CATEGORIES_INCIDENT_PRECOLLECTEUR}
          action={creerIncidentAction}
          clients={rows<{ id: string; nom: string }>(data)}
          associations={{ clientId: sp.client ?? null, collecteId: sp.collecte ?? null, tourneeId: sp.tournee ?? null }}
          retour={retour}
          libelleEnvoi="Envoyer au gérant"
        />
      </div>
    </PortalShell>
  );
}
