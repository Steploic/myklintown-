import {
  ArrowRight,
  Building2,
  CheckCircle2,
  DollarSign,
  Package,
  Recycle,
  Scale,
  ShoppingBag,
  TrendingUp,
  Truck,
  Warehouse,
} from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';

/** Matières disponibles dans les centres de tri partenaires */
const MATERIAUX = [
  { centre: 'CT-Nsam', type: 'Plastique mélangé', quantite: '3,2 t', prix: '45 FCFA/kg', statut: 'disponible' as const },
  { centre: 'CT-Mvog-Mbi', type: 'Métal mélangé', quantite: '0,8 t', prix: '120 FCFA/kg', statut: 'disponible' as const },
  { centre: 'CT-Nsam', type: 'Papier / Carton', quantite: '1,1 t', prix: '25 FCFA/kg', statut: 'disponible' as const },
  { centre: 'CT-Obobogo', type: 'Compost organique', quantite: '4,2 t', prix: '35 FCFA/kg', statut: 'reserve' as const },
];

const ARTICLES = [
  { id: 'A1', nom: 'Granulés PET recyclés (cristal)', stock: '2 400 kg', prix: '385 FCFA/kg', vues: 142 },
  { id: 'A2', nom: 'Granulés PEHD (couleur)', stock: '850 kg', prix: '310 FCFA/kg', vues: 81 },
  { id: 'A3', nom: 'Aluminium concassé', stock: '320 kg', prix: '1 200 FCFA/kg', vues: 56 },
  { id: 'A4', nom: 'Carton ondulé compacté', stock: '1 100 kg', prix: '85 FCFA/kg', vues: 38 },
];

export default function EnterpriseDashboard() {
  return (
    <PortalShell
      portalKey="enterprise"
      user={{ nom: 'Paul Essomba', email: 'p.essomba@ecocycle.cm' }}
      currentPath="/enterprise"
    >
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Tableau de bord</h1>
            <p className="text-body text-muted-foreground">
              Suivi des flux de matière et opportunités commerciales pour EcoCycle SARL.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/enterprise/marketplace" className="btn-outline">
              <ShoppingBag size={16} /> Publier un article
            </a>
            <a href="/enterprise/centres-tri" className="btn-primary">
              <Warehouse size={16} /> Centres de tri
            </a>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Scale} label="Volume entrant (mois)" value="14,8 t" accent="blue" delta={{ value: '+22% vs M-1', positive: true }} />
          <StatCard icon={Recycle} label="Produits transformés" value="9,6 t" accent="green" delta={{ value: 'Rendement 65%', positive: true }} />
          <StatCard icon={DollarSign} label="CA marketplace (mois)" value="3,9 M FCFA" accent="teal" delta={{ value: '+18%', positive: true }} />
          <StatCard icon={Warehouse} label="Centres de tri actifs" value="3" accent="warning" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Matières disponibles aux centres de tri */}
          <section className="card-soft overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="m-0">Matières disponibles aux centres de tri</h2>
                <p className="text-small text-muted-foreground">
                  Chaîne de valeur : ménages → collecteurs → centres de tri → vous
                </p>
              </div>
              <a href="/enterprise/centres-tri" className="text-body-sm font-medium text-brand-blue hover:underline">
                Voir tout <ArrowRight size={14} className="inline" />
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Centre</th>
                    <th className="px-5 py-3 font-medium">Matière</th>
                    <th className="px-5 py-3 font-medium">Quantité</th>
                    <th className="px-5 py-3 font-medium">Prix indicatif</th>
                    <th className="px-5 py-3 font-medium">Statut</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {MATERIAUX.map((m, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className="px-5 py-3 font-mono text-small text-muted-foreground">{m.centre}</td>
                      <td className="px-5 py-3 font-semibold">{m.type}</td>
                      <td className="px-5 py-3 font-semibold text-brand-blue">{m.quantite}</td>
                      <td className="px-5 py-3 text-brand-green font-semibold">{m.prix}</td>
                      <td className="px-5 py-3">
                        <span className={m.statut === 'disponible' ? 'badge-success' : 'badge-warning'}>
                          {m.statut === 'disponible' ? 'Disponible' : 'Réservé'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" className="text-body-sm font-medium text-brand-blue hover:underline">
                          Commander →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Performance side */}
          <div className="space-y-6">
            <section className="card-soft p-5">
              <div className="flex items-center justify-between">
                <h2>Top acheteurs</h2>
                <TrendingUp size={18} className="text-brand-green" />
              </div>
              <ul className="mt-3 space-y-3 text-body-sm">
                {[
                  { nom: 'Plastica Cameroun', volume: '4,2 t', tag: 'Plastique' },
                  { nom: 'CIMENCAM Recycling', volume: '2,8 t', tag: 'Métal' },
                  { nom: 'Papeterie Mvolyé', volume: '1,9 t', tag: 'Carton' },
                ].map((b) => (
                  <li key={b.nom} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{b.nom}</p>
                      <p className="text-small text-muted-foreground">{b.tag}</p>
                    </div>
                    <span className="font-semibold text-brand-blue">{b.volume}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card-soft p-5">
              <h2>Engagements ESG</h2>
              <p className="mt-1 text-body-sm text-muted-foreground">Indicateurs du mois.</p>
              <ul className="mt-3 space-y-3">
                <li className="flex items-center gap-3 rounded-lg bg-brand-green/10 px-3 py-2 text-body-sm text-brand-green">
                  <CheckCircle2 size={16} /> 9,6 t détournées de la décharge
                </li>
                <li className="flex items-center gap-3 rounded-lg bg-brand-blue/10 px-3 py-2 text-body-sm text-brand-blue">
                  <Building2 size={16} /> 12 structures partenaires actives
                </li>
                <li className="flex items-center gap-3 rounded-lg bg-brand-teal/10 px-3 py-2 text-body-sm text-brand-teal">
                  <Truck size={16} /> 87 collectes effectuées
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* Marketplace */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="m-0">Articles en vente sur la marketplace</h2>
              <p className="text-small text-muted-foreground">
                Visibles par tous les acheteurs B2B du réseau MyKlinTown
              </p>
            </div>
            <a href="/enterprise/marketplace" className="btn-outline">
              <Package size={16} /> Gérer le catalogue
            </a>
          </div>
          <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-4">
            {ARTICLES.map((a) => (
              <div key={a.id} className="border-b border-border p-5 last:border-b-0 md:border-r md:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0">
                <div className="aspect-video rounded-lg bg-brand-gradient-soft" aria-hidden />
                <p className="mt-3 text-body-sm font-semibold">{a.nom}</p>
                <p className="text-small text-muted-foreground">Stock {a.stock} · {a.vues} vues</p>
                <p className="mt-1 text-h2-sm font-bold text-brand-green">{a.prix}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
