import { CheckCircle2, Clock, Filter, MapPin, Package, Plus, Search, Truck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const LIVRAISONS = [
  { id: 'LIV-2026-188', acheteur: 'Plastica Cameroun', produit: 'Granulés PET cristal', qte: '4,2 t', date: '26 mai · 14:00', statut: 'planifiee' as const, transporteur: 'Camion partenaire' },
  { id: 'LIV-2026-187', acheteur: 'CIMENCAM Recycling', produit: 'Aluminium concassé', qte: '0,8 t', date: '26 mai · 09:30', statut: 'en_route' as const, transporteur: 'Δ-441' },
  { id: 'LIV-2026-186', acheteur: 'Papeterie Mvolyé', produit: 'Carton compacté', qte: '1,2 t', date: '25 mai', statut: 'livree' as const, transporteur: 'Δ-558' },
  { id: 'LIV-2026-185', acheteur: 'Plastica Cameroun', produit: 'Granulés PEHD', qte: '0,5 t', date: '23 mai', statut: 'livree' as const, transporteur: 'Camion partenaire' },
  { id: 'LIV-2026-184', acheteur: 'Verrerie Centrale', produit: 'Verre concassé', qte: '0,3 t', date: '21 mai', statut: 'litige' as const, transporteur: 'Camion partenaire' },
];

const STATUT_BADGE = {
  planifiee: { label: 'Planifiée', class: 'badge-info' },
  en_route: { label: 'En route', class: 'badge-warning' },
  livree: { label: 'Livrée', class: 'badge-success' },
  litige: { label: 'Litige', class: 'badge-danger' },
} as const;

export default function EnterpriseLivraisons() {
  return (
    <PortalShell portalKey="enterprise" user={DEMO_USERS.enterprise} currentPath="/enterprise/livraisons">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Livraisons</h1>
            <p className="text-body text-muted-foreground">
              Suivi des expéditions de produits transformés vers les acheteurs B2B.
            </p>
          </div>
          <button type="button" className="btn-primary">
            <Plus size={16} /> Planifier une livraison
          </button>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Clock} label="Planifiées" value="1" accent="blue" />
          <StatCard icon={Truck} label="En route" value="1" accent="warning" />
          <StatCard icon={CheckCircle2} label="Livrées (mois)" value="14" accent="green" delta={{ value: 'OTD 96 %', positive: true }} />
          <StatCard icon={Package} label="Volume livré (mois)" value="8,3 t" accent="teal" />
        </div>

        {/* Filtres */}
        <section className="card-soft flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Rechercher par ID, acheteur, produit..."
              className="w-full rounded-md border border-border bg-surface py-2 pl-10 pr-3 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
            <option>Tous statuts</option>
            <option>Planifiée</option>
            <option>En route</option>
            <option>Livrée</option>
            <option>Litige</option>
          </select>
          <button type="button" className="btn-outline">
            <Filter size={16} /> Plus
          </button>
        </section>

        {/* Tableau */}
        <section className="card-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Référence</th>
                  <th className="px-5 py-3 font-medium">Acheteur</th>
                  <th className="px-5 py-3 font-medium">Produit</th>
                  <th className="px-5 py-3 font-medium">Quantité</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Transporteur</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {LIVRAISONS.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-small text-muted-foreground">{l.id}</td>
                    <td className="px-5 py-3 font-semibold">{l.acheteur}</td>
                    <td className="px-5 py-3">{l.produit}</td>
                    <td className="px-5 py-3 font-semibold">{l.qte}</td>
                    <td className="px-5 py-3 text-muted-foreground">{l.date}</td>
                    <td className="px-5 py-3 inline-flex items-center gap-1">
                      <Truck size={12} /> {l.transporteur}
                    </td>
                    <td className="px-5 py-3">
                      <span className={STATUT_BADGE[l.statut].class}>{STATUT_BADGE[l.statut].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Carte */}
        <section className="card-soft p-6">
          <h2 className="flex items-center gap-2">
            <MapPin size={18} className="text-brand-blue" /> En transit en ce moment
          </h2>
          <div className="mt-4 flex items-center gap-4 rounded-lg border border-border p-4">
            <span className="grid h-12 w-12 place-content-center rounded-md bg-warning/10 text-warning">
              <Truck size={22} />
            </span>
            <div className="flex-1">
              <p className="text-body-sm font-semibold">LIV-2026-187 · CIMENCAM Recycling</p>
              <p className="text-small text-muted-foreground">
                Aluminium concassé · 0,8 t · Δ-441 · ETA 15:42
              </p>
            </div>
            <button type="button" className="btn-outline">Voir sur la carte</button>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
