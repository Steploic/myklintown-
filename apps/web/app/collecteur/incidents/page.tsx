import { AlertOctagon, Check } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';
import { CollecteurIncidentForm } from '@/components/collecteur-incident-form';
import { getMesIncidents } from '@/lib/incident-actions';

// Page de données par-utilisateur : rendu à chaque requête (pas de cache statique).
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  bac_detruit: 'Bac détruit',
  bac_inaccessible: 'Bac inaccessible',
  bac_introuvable: 'Bac introuvable',
  camion_panne: 'Camion en panne',
  accident: 'Accident',
  autre: 'Autre',
};

const STATUT_BADGE: Record<string, { label: string; class: string }> = {
  transmis: { label: 'Transmis', class: 'badge-success' },
  en_traitement: { label: 'En traitement', class: 'badge-warning' },
  resolu: { label: 'Résolu', class: 'badge-info' },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default async function CollecteurIncidents() {
  const incidents = await getMesIncidents();

  return (
    <PortalShell portalKey="collecteur" user={DEMO_USERS.collecteur} currentPath="/collecteur/incidents">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Incidents</h1>
            <p className="text-body text-muted-foreground">
              Signalez les bacs inaccessibles, détruits ou tout incident sur votre tournée. Une photo
              servira de preuve de passage (à venir).
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <CollecteurIncidentForm />

          <aside className="space-y-6">
            <section className="card-soft p-5">
              <h2 className="m-0">Quand signaler ?</h2>
              <ul className="mt-3 space-y-2 text-body-sm">
                <li className="flex gap-2">
                  <Check size={16} className="mt-1 text-brand-green" />
                  Bac absent ou détruit
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="mt-1 text-brand-green" />
                  Bac inaccessible (véhicule garé, travaux…)
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="mt-1 text-brand-green" />
                  Incident matériel sur le camion
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="mt-1 text-brand-green" />
                  Tout fait justifiant un non-passage
                </li>
              </ul>
            </section>
          </aside>
        </div>

        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0">Incidents transmis</h2>
          </div>
          {incidents.length === 0 ? (
            <p className="p-6 text-center text-body-sm text-muted-foreground">
              Aucun incident transmis.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {incidents.map((i) => {
                const badge = STATUT_BADGE[i.statut] ?? STATUT_BADGE.transmis!;
                return (
                  <li key={i.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-content-center rounded-md bg-warning/10 text-warning">
                      <AlertOctagon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-semibold">{TYPE_LABEL[i.type] ?? i.type}</p>
                      <p className="truncate text-small text-muted-foreground">
                        {i.description ? `${i.description} · ` : ''}
                        {formatTime(i.created_at)}
                      </p>
                    </div>
                    <span className={badge.class}>{badge.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
