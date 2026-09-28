import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader } from '@/components/ui/blocks';
import { IncidentForm } from '@/components/capture/incident-form';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { creerIncidentAction } from '@/lib/precollecteur/actions';
import { rows } from '@/lib/server';
import { CATEGORIES_INCIDENT_PRECOLLECTEUR } from '@/lib/format';

export const metadata = { title: 'Déclarer un incident' };

export default async function NouvelIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; collecte?: string; tournee?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  const { data } = await supabase
    .from('clients')
    .select('id, nom')
    .eq('entreprise_id', entreprise.id)
    .neq('statut', 'resilie')
    .order('nom');

  return (
    <PrecoShell path="/precollecteur/incidents">
      <PageHeader
        titre="Déclarer un incident"
        sousTitre="Photo ou vidéo prise sur place, datée et localisée automatiquement."
        retour={sp.tournee ? { href: `/precollecteur/tournees/${sp.tournee}`, label: 'Tournée' } : { href: '/precollecteur/incidents', label: 'Incidents' }}
      />
      <div className="card-soft p-5 sm:p-6">
        <IncidentForm
          entrepriseId={entreprise.id}
          categories={CATEGORIES_INCIDENT_PRECOLLECTEUR}
          action={creerIncidentAction}
          clients={rows<{ id: string; nom: string }>(data)}
          associations={{ clientId: sp.client ?? null, collecteId: sp.collecte ?? null, tourneeId: sp.tournee ?? null }}
          retour={sp.tournee ? `/precollecteur/tournees/${sp.tournee}` : '/precollecteur/incidents'}
          libelleEnvoi="Enregistrer l’incident"
        />
      </div>
    </PrecoShell>
  );
}
