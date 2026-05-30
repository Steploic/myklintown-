import {
  AlertTriangle,
  BarChart3,
  Building2,
  Home,
  Receipt,
  Recycle,
  Truck,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { YaoundeMapLoader } from '@/components/map-yaounde-loader';
import type { MapPoint } from '@/components/map-yaounde';

const MAP_POINTS: MapPoint[] = [
  { id: 'c1', position: [3.8324, 11.5067], label: 'Camion Δ-217 · Nsam', statut: 'camion' },
  { id: 'c2', position: [3.8401, 11.5158], label: 'Camion Δ-184 · Mvog-Mbi', statut: 'camion' },
  { id: 'c3', position: [3.8270, 11.4988], label: 'Camion Δ-093 · Efoulan', statut: 'camion' },
  { id: 'b1', position: [3.8312, 11.5078], label: 'Bac débordant rue Joie', statut: 'bac_plein' },
  { id: 'b2', position: [3.8388, 11.5142], label: 'Bac débordant marché central', statut: 'bac_plein' },
  { id: 'b3', position: [3.8265, 11.5021], label: 'Bac débordant école Nsam', statut: 'bac_plein' },
  { id: 's1', position: [3.8351, 11.5106], label: 'Secteur Nsam · 94% collecté', statut: 'collecte' },
  { id: 's2', position: [3.8295, 11.5184], label: 'Secteur Efoulan · attente', statut: 'attente' },
  { id: 's3', position: [3.8410, 11.5031], label: 'Signalement dépôt sauvage', statut: 'incident' },
];

export default function DashboardMairie() {
  return (
    <PortalShell
      portalKey="mairie"
      user={{ nom: 'Chef Service', email: 'hygiene@yaounde3.cm' }}
      currentPath="/dashboard"
    >
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Vue d'ensemble · 26 mai 2026</h1>
            <p className="text-body text-muted-foreground">
              Indicateurs consolidés en temps réel pour Yaoundé III.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline">
              <Receipt size={16} /> Exporter PDF
            </button>
            <button type="button" className="btn-primary">
              <BarChart3 size={16} /> Rapport mensuel
            </button>
          </div>
        </header>

        {/* KPI Row */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Ménages actifs" value="4 218" accent="blue" delta={{ value: '+184 ce mois', positive: true }} />
          <StatCard icon={Truck} label="Tournées en cours" value="7 / 12" accent="teal" delta={{ value: 'Couverture 78%', positive: true }} />
          <StatCard icon={Recycle} label="Tonnage du jour" value="14,2 t" accent="green" delta={{ value: '+9% vs hier', positive: true }} />
          <StatCard icon={Wallet} label="Recouvrement" value="91 %" accent="green" delta={{ value: '+4 pts', positive: true }} />
        </div>

        {/* Carte + side panel */}
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card-soft p-0 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h2 className="m-0">Carte territoriale de Yaoundé III</h2>
                <p className="text-small text-muted-foreground">
                  Camions · bacs débordants · signalements · couverture par secteur
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
                <span className="whitespace-nowrap">🚛 Camion</span>
                <span className="whitespace-nowrap">🏠 Collecté</span>
                <span className="whitespace-nowrap">🏠 En attente</span>
                <span className="whitespace-nowrap">🗑️ Bac plein</span>
                <span className="whitespace-nowrap">⚠️ Signalement</span>
              </div>
            </div>
            <YaoundeMapLoader points={MAP_POINTS} height="520px" />
          </section>

          <div className="space-y-6">
            <section className="card-soft p-5">
              <h2>Top secteurs</h2>
              <ul className="mt-3 space-y-3">
                {[
                  { nom: 'Nsam-Efoulan', taux: 94, tonnage: '4,1 t' },
                  { nom: 'Mvog-Mbi', taux: 87, tonnage: '3,8 t' },
                  { nom: 'Obobogo', taux: 81, tonnage: '2,9 t' },
                  { nom: 'Etoa-Meki', taux: 73, tonnage: '2,4 t' },
                ].map((s) => (
                  <li key={s.nom}>
                    <div className="flex items-center justify-between text-body-sm">
                      <span className="font-semibold">{s.nom}</span>
                      <span className="text-muted-foreground">
                        {s.taux}% · {s.tonnage}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand-green"
                        style={{ width: `${s.taux}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card-soft p-5">
              <div className="flex items-center justify-between">
                <h2>Signalements ouverts</h2>
                <a href="/dashboard/signalements" className="text-body-sm font-medium text-brand-blue hover:underline">
                  Voir tout
                </a>
              </div>
              <ul className="mt-3 space-y-2">
                <li className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <AlertTriangle size={16} className="mt-0.5 text-warning" />
                  <div>
                    <p className="text-body-sm font-semibold">Bac débordant marché central</p>
                    <p className="text-small text-muted-foreground">
                      Mvog-Mbi · signalé il y a 42 min · 3 citoyens
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <AlertTriangle size={16} className="mt-0.5 text-danger" />
                  <div>
                    <p className="text-body-sm font-semibold">Dépôt sauvage av. Charles-Atangana</p>
                    <p className="text-small text-muted-foreground">
                      Photo · 2 h · à affecter à une équipe
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <AlertTriangle size={16} className="mt-0.5 text-warning" />
                  <div>
                    <p className="text-body-sm font-semibold">Retard collecte Obobogo</p>
                    <p className="text-small text-muted-foreground">
                      5 ménages · camion Δ-093
                    </p>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* Flux entrepôt */}
        <section className="card-soft p-6">
          <div className="flex items-center justify-between">
            <h2>Flux entrepôt — semaine en cours</h2>
            <a href="/dashboard/transformation" className="text-body-sm font-medium text-brand-blue hover:underline">
              Détails
            </a>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-small text-muted-foreground">Entrées (tonnage brut)</p>
              <p className="text-h2 font-bold text-brand-blue">68,4 t</p>
              <p className="text-small text-muted-foreground">↑ 12% vs S-1</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-small text-muted-foreground">Plastique trié</p>
              <p className="text-h2 font-bold text-brand-green">14,7 t</p>
              <p className="text-small text-muted-foreground">→ Granulés PET</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-small text-muted-foreground">Métal trié</p>
              <p className="text-h2 font-bold text-brand-teal">4,1 t</p>
              <p className="text-small text-muted-foreground">→ Vente recycleurs</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-small text-muted-foreground">Taux transformation</p>
              <p className="text-h2 font-bold text-brand-green">31 %</p>
              <p className="text-small text-muted-foreground">Cible 40%</p>
            </div>
          </div>
        </section>

        {/* Opérateurs sur le territoire */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="m-0">Opérateurs sur le territoire</h2>
              <p className="text-small text-muted-foreground">
                Collecteurs actifs et entreprises affiliées à Yaoundé III
              </p>
            </div>
          </div>
          <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
            {/* Collecteurs */}
            <div>
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Truck size={16} className="text-brand-blue" />
                <p className="text-body-sm font-semibold">Collecteurs · engins</p>
              </div>
              <table className="w-full text-body-sm">
                <thead className="bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 font-medium">Engin</th>
                    <th className="px-5 py-2 font-medium">Agent</th>
                    <th className="px-5 py-2 font-medium">Entreprise</th>
                    <th className="px-5 py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { id: 'Δ-217', agent: 'Jean Fabrice', entreprise: 'MKT Nsam SARL', statut: 'En service', ok: true },
                    { id: 'Δ-184', agent: 'Paul Mvondo', entreprise: 'EcoCycle SARL', statut: 'En service', ok: true },
                    { id: 'Δ-093', agent: 'Simon Abena', entreprise: 'MKT Nsam SARL', statut: 'En retard', ok: false },
                    { id: 'Δ-112', agent: 'Marie Ngo', entreprise: 'GreenCity CM', statut: 'Hors service', ok: false },
                  ].map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3 font-mono font-semibold text-brand-blue">{c.id}</td>
                      <td className="px-5 py-3">{c.agent}</td>
                      <td className="px-5 py-3 text-muted-foreground">{c.entreprise}</td>
                      <td className="px-5 py-3">
                        <span className={c.ok ? 'badge-success' : 'badge-warning'}>{c.statut}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Entreprises */}
            <div>
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Building2 size={16} className="text-brand-teal" />
                <p className="text-body-sm font-semibold">Entreprises partenaires</p>
              </div>
              <table className="w-full text-body-sm">
                <thead className="bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 font-medium">Entreprise</th>
                    <th className="px-5 py-2 font-medium">Type</th>
                    <th className="px-5 py-2 font-medium">Engins</th>
                    <th className="px-5 py-2 font-medium">Zones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { nom: 'MKT Nsam SARL', type: 'Pré-collecte', engins: ['Δ-217', 'Δ-093'], zones: 2 },
                    { nom: 'EcoCycle SARL', type: 'Collecte + tri', engins: ['Δ-184'], zones: 1 },
                    { nom: 'GreenCity CM', type: 'Collecte', engins: ['Δ-112'], zones: 1 },
                  ].map((e) => (
                    <tr key={e.nom} className="hover:bg-muted/40">
                      <td className="px-5 py-3 font-semibold">{e.nom}</td>
                      <td className="px-5 py-3 text-muted-foreground">{e.type}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {e.engins.map((g) => (
                            <span key={g} className="rounded bg-brand-blue/10 px-1.5 py-0.5 font-mono text-small text-brand-blue">
                              {g}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center font-semibold">{e.zones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
