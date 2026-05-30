import {
  AlertOctagon,
  Camera,
  CheckCircle2,
  Clock,
  Map as MapIcon,
  QrCode,
  Route,
} from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { YaoundeMapLoader } from '@/components/map-yaounde-loader';
import type { MapPoint } from '@/components/map-yaounde';

// Points fictifs autour du centre de Yaoundé III (3.8324, 11.5067)
const MAP_POINTS: MapPoint[] = [
  { id: '1', position: [3.8330, 11.5072], label: 'Ménage TSANGA · OK', statut: 'collecte' },
  { id: '2', position: [3.8318, 11.5061], label: 'Ménage MFOULOU · OK', statut: 'collecte' },
  { id: '3', position: [3.8341, 11.5085], label: 'Ménage ABENA · en attente', statut: 'attente' },
  { id: '4', position: [3.8298, 11.5043], label: 'Bac débordant rue Joie', statut: 'bac_plein' },
  { id: '5', position: [3.8350, 11.5095], label: 'Camion Δ-217', statut: 'camion' },
  { id: '6', position: [3.8312, 11.5078], label: 'Ménage NDJOM · en attente', statut: 'attente' },
];

const PROCHAINS_ARRETS = [
  { ordre: 12, foyer: 'Famille ABENA', adresse: 'Rue 1.234 · Nsam-Efoulan', distance: '180 m' },
  { ordre: 13, foyer: 'Famille NDJOM', adresse: 'Rue 1.236 · Nsam-Efoulan', distance: '320 m' },
  { ordre: 14, foyer: 'Famille NGUEMA', adresse: 'Rue 1.238 · Nsam-Efoulan', distance: '410 m' },
  { ordre: 15, foyer: 'École publique Nsam', adresse: 'Av. Charles-Atangana', distance: '620 m' },
];

export default function CollecteurDashboard() {
  return (
    <PortalShell
      portalKey="collecteur"
      user={{ nom: 'Jean Fabrice', email: 'agent-c217@myklintown.cm' }}
      currentPath="/collecteur"
    >
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Ma tournée en cours</h1>
            <p className="text-body text-muted-foreground">
              Secteur Nsam-Efoulan · Camion Δ-217 · démarrée à 06:14
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/collecteur/incidents" className="btn-outline flex-1 justify-center sm:flex-none">
              <Camera size={16} /> Signaler incident
            </a>
            <a href="/collecteur/scan" className="btn-primary flex-1 justify-center sm:flex-none">
              <QrCode size={16} /> Scanner un QR
            </a>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={CheckCircle2} label="Ménages collectés" value="42 / 68" accent="green" delta={{ value: '62 % de la tournée', positive: true }} />
          <StatCard icon={Clock} label="Temps écoulé" value="2 h 14" accent="blue" />
          <StatCard icon={Route} label="Distance parcourue" value="8,3 km" accent="teal" />
          <StatCard icon={AlertOctagon} label="Incidents signalés" value="1" accent="warning" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card-soft p-0 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <MapIcon size={18} className="text-brand-blue" />
                <h2 className="m-0">Carte de tournée</h2>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
                <span className="whitespace-nowrap">🏠 Collectés</span>
                <span className="whitespace-nowrap">🏠 En attente</span>
                <span className="whitespace-nowrap">🚛 Camion</span>
                <span className="whitespace-nowrap">⚠️ Incident</span>
              </div>
            </div>
            <YaoundeMapLoader points={MAP_POINTS} height="480px" />
          </section>

          <section className="card-soft p-6">
            <h2>Prochains arrêts</h2>
            <p className="text-body-sm text-muted-foreground">Optimisés VRP par le serveur.</p>
            <ol className="mt-4 space-y-3">
              {PROCHAINS_ARRETS.map((stop) => (
                <li key={stop.ordre} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <span className="grid h-9 w-9 shrink-0 place-content-center rounded-full bg-brand-blue text-body-sm font-bold text-white">
                    {stop.ordre}
                  </span>
                  <div className="flex-1">
                    <p className="text-body-sm font-semibold">{stop.foyer}</p>
                    <p className="text-small text-muted-foreground">{stop.adresse}</p>
                  </div>
                  <span className="text-small text-muted-foreground">{stop.distance}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="card-soft p-6">
          <h2>Mode hors-ligne</h2>
          <p className="text-body-sm text-muted-foreground">
            Les scans QR sont stockés localement et synchronisés dès qu'une connexion est disponible.
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-brand-green/10 px-4 py-3 text-body-sm text-brand-green">
            <CheckCircle2 size={16} /> 42 scans synchronisés · 0 en attente · dernière synchro il y a 1 min
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
