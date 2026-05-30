import { CheckCircle2 } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';
import { CitoyenSignalerForm } from '@/components/citoyen-signaler-form';
import { getMesSignalements } from '@/lib/signalement-actions';

// Page de données par-utilisateur : rendu à chaque requête (pas de cache statique).
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  bac_plein: 'Bac débordant',
  depot_sauvage: 'Dépôt sauvage',
  retard_collecte: 'Retard collecte',
  incident_collecteur: 'Incident collecteur',
};

const STATUT_BADGE: Record<string, { label: string; class: string }> = {
  nouveau: { label: 'Nouveau', class: 'badge-info' },
  en_traitement: { label: 'En traitement', class: 'badge-warning' },
  resolu: { label: 'Résolu', class: 'badge-success' },
  rejete: { label: 'Rejeté', class: 'badge-danger' },
};

function formatDate(iso: string): string {
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

export default async function CitoyenSignaler() {
  const signalements = await getMesSignalements();

  return (
    <PortalShell portalKey="citoyen" user={DEMO_USERS.citoyen} currentPath="/citoyen/signaler">
      <div className="space-y-6">
        <header>
          <h1>Signaler un problème</h1>
          <p className="text-body text-muted-foreground">
            Aidez la Mairie à intervenir plus vite. Votre signalement est géolocalisé et transmis à
            l'équipe de collecte en charge de votre secteur.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <CitoyenSignalerForm />

          <aside className="space-y-6">
            <section className="card-soft p-5">
              <h2 className="m-0">Comment ça marche ?</h2>
              <ol className="mt-3 space-y-3 text-body-sm">
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-content-center rounded-full bg-brand-blue text-small font-bold text-white">
                    1
                  </span>
                  Vous signalez avec géolocalisation.
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-content-center rounded-full bg-brand-blue text-small font-bold text-white">
                    2
                  </span>
                  Le Service Hygiène de la Mairie reçoit l'alerte.
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-content-center rounded-full bg-brand-blue text-small font-bold text-white">
                    3
                  </span>
                  Une équipe est dépêchée. Vous êtes notifié à la résolution.
                </li>
              </ol>
              <div className="mt-4 flex items-center gap-2 rounded-md bg-brand-green/10 px-3 py-2 text-body-sm text-brand-green">
                <CheckCircle2 size={14} /> +20 points écolo par signalement validé
              </div>
            </section>

            <section className="card-soft p-5">
              <h2 className="m-0">Mes signalements</h2>
              <p className="text-small text-muted-foreground">
                {signalements.length === 0
                  ? 'Aucun signalement pour le moment.'
                  : `Vos ${signalements.length} derniers signalements.`}
              </p>
              {signalements.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {signalements.map((s) => {
                    const badge = STATUT_BADGE[s.statut] ?? STATUT_BADGE.nouveau!;
                    return (
                      <li key={s.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-body-sm font-semibold">
                            {TYPE_LABEL[s.type] ?? s.type}
                          </p>
                          <span className={badge.class}>{badge.label}</span>
                        </div>
                        {s.description && (
                          <p className="truncate text-small text-muted-foreground">{s.description}</p>
                        )}
                        <p className="text-small text-muted-foreground">{formatDate(s.created_at)}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </PortalShell>
  );
}
