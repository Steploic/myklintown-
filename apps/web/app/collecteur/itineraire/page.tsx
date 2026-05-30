import { ChevronRight, Clock, Fuel, Navigation, Play, RouteIcon as RouteI, Truck, ZapOff } from 'lucide-react';
import { Route } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { YaoundeMapLoader } from '@/components/map-yaounde-loader';
import { DEMO_USERS } from '@/lib/portal-config';
import type { MapPoint } from '@/components/map-yaounde';

const PARCOURS: MapPoint[] = [
  { id: '1', position: [3.8324, 11.5067], label: 'Départ camion Δ-217', statut: 'camion' },
  { id: '2', position: [3.8330, 11.5072], label: '1. TSANGA · OK', statut: 'collecte' },
  { id: '3', position: [3.8333, 11.5079], label: '2. MFOULOU · OK', statut: 'collecte' },
  { id: '4', position: [3.8338, 11.5083], label: '3. NDJOM · OK', statut: 'collecte' },
  { id: '5', position: [3.8341, 11.5085], label: '4. ABENA · attente', statut: 'attente' },
  { id: '6', position: [3.8347, 11.5090], label: '5. NGUEMA · attente', statut: 'attente' },
  { id: '7', position: [3.8350, 11.5095], label: '6. École Nsam · attente', statut: 'attente' },
  { id: '8', position: [3.8312, 11.5078], label: 'Bac débordant', statut: 'bac_plein' },
];

const ETAPES = [
  { ordre: 12, foyer: 'Famille ABENA', adresse: 'Rue 1.234 · Nsam-Efoulan', distance: '180 m', eta: '2 min' },
  { ordre: 13, foyer: 'Famille NDJOM', adresse: 'Rue 1.236', distance: '320 m', eta: '4 min' },
  { ordre: 14, foyer: 'Famille NGUEMA', adresse: 'Rue 1.238', distance: '410 m', eta: '5 min' },
  { ordre: 15, foyer: 'École publique Nsam', adresse: 'Av. Charles-Atangana', distance: '620 m', eta: '8 min' },
  { ordre: 16, foyer: 'Famille OWONA', adresse: 'Rue 2.401', distance: '780 m', eta: '11 min' },
];

export default function CollecteurItineraire() {
  return (
    <PortalShell portalKey="collecteur" user={DEMO_USERS.collecteur} currentPath="/collecteur/itineraire">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Itinéraire optimisé</h1>
            <p className="text-body text-muted-foreground">
              Parcours généré par l'algorithme VRP (Vehicle Routing Problem) à 05:30 ce matin.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline">
              <ZapOff size={16} /> Recalculer
            </button>
            <a href="/collecteur/scan" className="btn-primary">
              <Play size={16} /> Démarrer guidage
            </a>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Route} label="Distance restante" value="3,8 km" accent="blue" />
          <StatCard icon={Clock} label="Temps restant" value="48 min" accent="teal" delta={{ value: '−12 % vs estimé', positive: true }} />
          <StatCard icon={Truck} label="Étapes restantes" value="26 / 68" accent="warning" />
          <StatCard icon={Fuel} label="Économie carburant" value="22 %" accent="green" delta={{ value: 'vs parcours libre', positive: true }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Map */}
          <section className="card-soft p-0 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Navigation size={18} className="text-brand-blue" />
                <h2 className="m-0">Carte du parcours</h2>
              </div>
              <div className="flex items-center gap-3 text-small">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand-green" /> Effectué
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-danger" /> À faire
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand-blue" /> Camion
                </span>
              </div>
            </div>
            <YaoundeMapLoader points={PARCOURS} height="520px" />
          </section>

          {/* Étapes */}
          <section className="card-soft p-5">
            <h2>Prochaines étapes</h2>
            <p className="text-body-sm text-muted-foreground">Ordre optimisé.</p>
            <ol className="mt-4 space-y-3">
              {ETAPES.map((e) => (
                <li
                  key={e.ordre}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-brand-blue"
                >
                  <span className="grid h-10 w-10 shrink-0 place-content-center rounded-full bg-brand-blue text-body-sm font-bold text-white">
                    {e.ordre}
                  </span>
                  <div className="flex-1">
                    <p className="text-body-sm font-semibold">{e.foyer}</p>
                    <p className="text-small text-muted-foreground">{e.adresse}</p>
                    <p className="mt-1 text-small text-muted-foreground">
                      {e.distance} · ETA {e.eta}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Algorithme info */}
        <section className="card-soft p-6">
          <h2>À propos de l'optimisation VRP</h2>
          <p className="text-body-sm text-muted-foreground">
            L'algorithme prend en compte la densité des abonnés, la capacité du camion, l'état du trafic
            et la priorité des bacs signalés débordants. Il génère le parcours le plus court qui collecte
            tous les ménages assignés.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-small text-muted-foreground">Économie carburant moyenne</p>
              <p className="text-h2 font-bold text-brand-green">−20 % à −25 %</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-small text-muted-foreground">Réduction temps de tournée</p>
              <p className="text-h2 font-bold text-brand-blue">−15 %</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-small text-muted-foreground">Génération du parcours</p>
              <p className="text-h2 font-bold text-brand-teal">{'< 30 s'}</p>
            </div>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
