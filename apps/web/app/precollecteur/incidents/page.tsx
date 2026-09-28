import Link from 'next/link';
import { Camera, ShieldCheck } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { Preuve } from '@/components/ui/preuve';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { statutIncidentAction } from '@/lib/precollecteur/actions';
import { rows } from '@/lib/server';
import { urlsPreuves } from '@/lib/preuves';
import { CATEGORIES_INCIDENT, dateHeureFr, STATUT_INCIDENT } from '@/lib/format';
import type { Incident } from '@/lib/types';

export const metadata = { title: 'Incidents' };

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { vue = 'ouverts' } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  let q = supabase
    .from('incidents_precollecte')
    .select('*, clients(id, nom)')
    .eq('entreprise_id', entreprise.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (vue === 'ouverts') q = q.neq('statut', 'resolu');
  const { data } = await q;
  const incidents = rows<Incident & { clients: { id: string; nom: string } | null }>(data);
  const urls = await urlsPreuves(supabase, incidents.map((i) => i.media_path));

  return (
    <PrecoShell path="/precollecteur/incidents">
      <PageHeader
        titre="Incidents"
        sousTitre="Terrain et signalements de vos clients, avec leurs preuves."
        actions={
          <Link href="/precollecteur/incidents/nouveau" className="btn-primary">
            <Camera size={16} /> Déclarer un incident
          </Link>
        }
      />
      <div className="mb-4 flex gap-2">
        {[
          { cle: 'ouverts', label: 'À traiter' },
          { cle: 'tous', label: 'Tous' },
        ].map((o) => (
          <Link
            key={o.cle}
            href={`/precollecteur/incidents?vue=${o.cle}`}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-body-sm font-semibold',
              vue === o.cle ? 'border-brand-ink bg-brand-ink text-white' : 'border-border bg-surface text-muted-foreground',
            )}
          >
            {o.label}
          </Link>
        ))}
      </div>
      {incidents.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={ShieldCheck} titre="Rien à signaler" texte="Aucun incident en attente de traitement." />
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
                    <span className="chip-neutre">{i.source === 'client' ? 'Client' : 'Terrain'}</span>
                  </p>
                  {i.clients && (
                    <Link href={`/precollecteur/clients/${i.clients.id}`} className="text-body-sm font-medium text-brand-blue hover:underline">
                      {i.clients.nom}
                    </Link>
                  )}
                  {i.description && <p className="mt-1 text-body-sm text-muted-foreground">{i.description}</p>}
                  <p className="mt-1 text-small text-muted-foreground">
                    {dateHeureFr(i.created_at)}
                    {i.lat != null && i.lng != null && (
                      <>
                        {' · '}
                        <a className="text-brand-blue hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${i.lat},${i.lng}`}>
                          voir le lieu
                        </a>
                      </>
                    )}
                  </p>
                </div>
                {i.statut !== 'resolu' && (
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    {i.statut === 'ouvert' && (
                      <form action={statutIncidentAction}>
                        <input type="hidden" name="incident_id" value={i.id} />
                        <input type="hidden" name="statut" value="en_cours" />
                        <SubmitButton variant="outline" pendingLabel="…">Prendre en charge</SubmitButton>
                      </form>
                    )}
                    <form action={statutIncidentAction}>
                      <input type="hidden" name="incident_id" value={i.id} />
                      <input type="hidden" name="statut" value="resolu" />
                      <SubmitButton pendingLabel="…">Résolu</SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PrecoShell>
  );
}
