import { Filter, Layers, MapPin } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { YaoundeMapLoader } from '@/components/map-yaounde-loader';
import { DEMO_USERS } from '@/lib/portal-config';
import type { MapPoint } from '@/components/map-yaounde';

const POINTS: MapPoint[] = [
  { id: 'c1', position: [3.8324, 11.5067], label: 'Camion Δ-217 · Nsam', statut: 'camion' },
  { id: 'c2', position: [3.8401, 11.5158], label: 'Camion Δ-184 · Mvog-Mbi', statut: 'camion' },
  { id: 'c3', position: [3.8270, 11.4988], label: 'Camion Δ-093 · Efoulan', statut: 'camion' },
  { id: 'c4', position: [3.8450, 11.5210], label: 'Camion Δ-441 · Obobogo', statut: 'camion' },
  { id: 'c5', position: [3.8195, 11.5104], label: 'Camion Δ-558 · Etoa-Meki', statut: 'camion' },
  { id: 'b1', position: [3.8312, 11.5078], label: 'Bac débordant rue Joie', statut: 'bac_plein' },
  { id: 'b2', position: [3.8388, 11.5142], label: 'Bac débordant marché central', statut: 'bac_plein' },
  { id: 'b3', position: [3.8265, 11.5021], label: 'Bac débordant école Nsam', statut: 'bac_plein' },
  { id: 'b4', position: [3.8420, 11.5180], label: 'Bac débordant Mvog-Mbi', statut: 'bac_plein' },
  { id: 's1', position: [3.8351, 11.5106], label: 'Secteur Nsam · 94% collecté', statut: 'collecte' },
  { id: 's2', position: [3.8295, 11.5184], label: 'Secteur Efoulan · 73%', statut: 'attente' },
  { id: 's3', position: [3.8410, 11.5031], label: 'Dépôt sauvage av. Charles-Atangana', statut: 'incident' },
  { id: 's4', position: [3.8470, 11.5095], label: 'Signalement Obobogo', statut: 'incident' },
];

const FILTRES = [
  { id: 'camions', label: 'Camions', count: 5, color: 'bg-brand-blue' },
  { id: 'collecte', label: 'Ménages collectés', count: 3284, color: 'bg-brand-green' },
  { id: 'attente', label: 'En attente', count: 934, color: 'bg-danger' },
  { id: 'bacs_pleins', label: 'Bacs débordants', count: 12, color: 'bg-danger' },
  { id: 'signalements', label: 'Signalements', count: 7, color: 'bg-warning' },
  { id: 'recycleurs', label: 'Recycleurs partenaires', count: 12, color: 'bg-brand-teal' },
];

const SECTEURS = [
  { nom: 'Nsam-Efoulan', taux: 94, menages: 1240, status: 'green' as const },
  { nom: 'Mvog-Mbi', taux: 87, menages: 980, status: 'green' as const },
  { nom: 'Obobogo', taux: 81, menages: 720, status: 'warning' as const },
  { nom: 'Etoa-Meki', taux: 73, menages: 640, status: 'warning' as const },
  { nom: 'Efoulan-Sud', taux: 58, menages: 540, status: 'danger' as const },
];

export default function DashboardTerritoire() {
  return (
    <PortalShell portalKey="mairie" user={DEMO_USERS.mairie} currentPath="/dashboard/territoire">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Vue territoire</h1>
            <p className="text-body text-muted-foreground">
              Cartographie complète et filtrable de Yaoundé III en temps réel.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline">
              <Layers size={16} /> Calques
            </button>
            <button type="button" className="btn-primary">
              <Filter size={16} /> Filtres
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Filtres */}
          <aside className="card-soft p-5">
            <h2 className="m-0">Calques</h2>
            <ul className="mt-4 space-y-2">
              {FILTRES.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="h-4 w-4 accent-brand-blue" />
                      <span className={`h-2.5 w-2.5 rounded-full ${f.color}`} />
                      <span className="text-body-sm font-medium">{f.label}</span>
                    </span>
                    <span className="text-small text-muted-foreground">{f.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </aside>

          {/* Carte */}
          <section className="card-soft p-0 lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-brand-blue" />
                <h2 className="m-0">Yaoundé III</h2>
              </div>
              <span className="text-small text-muted-foreground">Mise à jour temps réel</span>
            </div>
            <YaoundeMapLoader points={POINTS} height="560px" />
          </section>
        </div>

        {/* Secteurs */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0">Taux de couverture par secteur</h2>
          </div>
          <ul className="divide-y divide-border">
            {SECTEURS.map((s) => (
              <li key={s.nom} className="grid grid-cols-12 items-center gap-3 px-5 py-3">
                <span className="col-span-3 text-body-sm font-semibold">{s.nom}</span>
                <span className="col-span-2 text-small text-muted-foreground">{s.menages} ménages</span>
                <div className="col-span-5">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        s.status === 'green' ? 'bg-brand-green' :
                        s.status === 'warning' ? 'bg-warning' : 'bg-danger'
                      }`}
                      style={{ width: `${s.taux}%` }}
                    />
                  </div>
                </div>
                <span className="col-span-1 text-right text-body-sm font-bold">{s.taux}%</span>
                <span className="col-span-1 text-right">
                  <span className={s.status === 'green' ? 'badge-success' : s.status === 'warning' ? 'badge-warning' : 'badge-danger'}>
                    {s.status === 'green' ? 'OK' : s.status === 'warning' ? 'Attention' : 'Critique'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PortalShell>
  );
}
