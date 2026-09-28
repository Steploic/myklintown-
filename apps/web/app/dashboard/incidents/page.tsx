import { ShieldCheck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { Preuve } from '@/components/ui/preuve';
import { statutIncidentMairieAction } from '@/lib/mairie/actions';
import { getSupabase, rows } from '@/lib/server';
import { urlsPreuves } from '@/lib/preuves';
import { CATEGORIES_INCIDENT, dateHeureFr, STATUT_INCIDENT } from '@/lib/format';
import type { Incident } from '@/lib/types';

export const metadata = { title: 'Incidents' };

export default async function IncidentsMairiePage() {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('incidents_precollecte')
    .select('*, entreprises(nom)')
    .order('created_at', { ascending: false })
    .limit(100);
  const incidents = rows<Incident & { entreprises: { nom: string } | null }>(data);
  const urls = await urlsPreuves(supabase, incidents.map((i) => i.media_path));

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/incidents">
      <PageHeader titre="Incidents signalés" sousTitre="Terrain et ménages, toutes entreprises confondues, avec leurs preuves." />
      {incidents.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={ShieldCheck} titre="Aucun incident" />
        </div>
      ) : (
        <ul className="space-y-3">
          {incidents.map((i) => {
            const s = STATUT_INCIDENT[i.statut] ?? STATUT_INCIDENT.ouvert!;
            return (
              <li key={i.id} className="card-soft flex flex-col gap-3 p-4 sm:flex-row">
                <Preuve url={i.media_path ? urls.get(i.media_path) : undefined} type={i.media_type} capture={i.capture_at} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-ink">
                    {CATEGORIES_INCIDENT[i.categorie] ?? i.categorie}
                    <span className={s.chip}>{s.label}</span>
                    <span className="chip-neutre">{i.source === 'client' ? 'Ménage' : 'Terrain'}</span>
                  </p>
                  <p className="text-body-sm text-muted-foreground">{i.entreprises?.nom}</p>
                  {i.description && <p className="mt-1 text-body-sm">{i.description}</p>}
                  <p className="mt-1 text-small text-muted-foreground">
                    {dateHeureFr(i.created_at)}
                    {i.lat != null && i.lng != null && (
                      <>
                        {' · '}
                        <a className="text-brand-blue hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${i.lat},${i.lng}`}>voir le lieu</a>
                      </>
                    )}
                  </p>
                </div>
                {i.statut !== 'resolu' && (
                  <form action={statutIncidentMairieAction} className="shrink-0">
                    <input type="hidden" name="incident_id" value={i.id} />
                    <input type="hidden" name="statut" value="resolu" />
                    <SubmitButton variant="outline" pendingLabel="…">Marquer résolu</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PortalShell>
  );
}
