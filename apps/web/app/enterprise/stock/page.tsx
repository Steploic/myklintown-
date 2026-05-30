import { ArrowDownToLine, ArrowUpFromLine, Boxes, Package, Plus, Search } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const STOCK = [
  { matiere: 'Granulés PET cristal', categorie: 'Plastique', kg: 2400, lot: 'L-2026-21', pct: 80 },
  { matiere: 'Granulés PEHD couleur', categorie: 'Plastique', kg: 850, lot: 'L-2026-19', pct: 42 },
  { matiere: 'Aluminium concassé', categorie: 'Métal', kg: 320, lot: 'L-2026-22', pct: 64 },
  { matiere: 'Acier balles', categorie: 'Métal', kg: 980, lot: 'L-2026-20', pct: 71 },
  { matiere: 'Carton ondulé compacté', categorie: 'Papier', kg: 1100, lot: 'L-2026-18', pct: 88 },
  { matiere: 'Compost mûri 6 mois', categorie: 'Organique', kg: 4200, lot: 'L-2026-17', pct: 93 },
];

const MOUVEMENTS = [
  { date: '26 mai · 11:42', type: 'entree' as const, matiere: 'Plastique mélangé', qte: '3,2 t', notes: 'Camion Δ-217 · Nsam' },
  { date: '26 mai · 09:18', type: 'sortie' as const, matiere: 'Granulés PET', qte: '0,8 t', notes: 'Vers Plastica Cameroun' },
  { date: '25 mai · 18:33', type: 'entree' as const, matiere: 'Métaux mélangés', qte: '0,9 t', notes: 'Camion Δ-184' },
  { date: '25 mai · 14:12', type: 'sortie' as const, matiere: 'Carton compacté', qte: '1,2 t', notes: 'Vers Papeterie Mvolyé' },
  { date: '24 mai · 10:48', type: 'entree' as const, matiere: 'Organique', qte: '2,4 t', notes: 'Camion Δ-093' },
];

export default function EnterpriseStock() {
  return (
    <PortalShell portalKey="enterprise" user={DEMO_USERS.enterprise} currentPath="/enterprise/stock">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Stock entrepôt</h1>
            <p className="text-body text-muted-foreground">
              État des lots transformés et mouvements d'inventaire en temps réel.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline">
              <ArrowDownToLine size={16} /> Saisir entrée
            </button>
            <button type="button" className="btn-primary">
              <ArrowUpFromLine size={16} /> Saisir sortie
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Boxes} label="Stock total" value="9,85 t" accent="blue" />
          <StatCard icon={Package} label="Lots actifs" value="6" accent="teal" />
          <StatCard icon={ArrowDownToLine} label="Entrées (mois)" value="68,4 t" accent="green" />
          <StatCard icon={ArrowUpFromLine} label="Sorties (mois)" value="53,0 t" accent="warning" />
        </div>

        {/* Recherche */}
        <section className="card-soft flex items-center gap-3 p-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Rechercher une matière, un numéro de lot..."
              className="w-full rounded-md border border-border bg-surface py-2 pl-10 pr-3 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
          <button type="button" className="btn-outline">
            <Plus size={16} /> Nouveau lot
          </button>
        </section>

        {/* Stocks */}
        <section className="card-soft overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="m-0">Lots en stock</h2>
          </div>
          <ul className="divide-y divide-border">
            {STOCK.map((s, i) => (
              <li key={i} className="grid grid-cols-12 items-center gap-3 px-5 py-4">
                <span className="col-span-3 text-body-sm font-semibold">{s.matiere}</span>
                <span className="col-span-2"><span className="badge-info">{s.categorie}</span></span>
                <span className="col-span-2 font-mono text-small text-muted-foreground">{s.lot}</span>
                <span className="col-span-2 text-body-sm">
                  <strong>{s.kg}</strong> kg
                </span>
                <div className="col-span-2">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${s.pct >= 80 ? 'bg-brand-green' : s.pct >= 50 ? 'bg-warning' : 'bg-danger'}`}
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                </div>
                <span className="col-span-1 text-right text-small text-muted-foreground">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Mouvements */}
        <section className="card-soft overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="m-0">Derniers mouvements</h2>
          </div>
          <ul className="divide-y divide-border">
            {MOUVEMENTS.map((m, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-3">
                <span
                  className={`grid h-10 w-10 place-content-center rounded-md ${
                    m.type === 'entree' ? 'bg-brand-blue/10 text-brand-blue' : 'bg-brand-green/10 text-brand-green'
                  }`}
                >
                  {m.type === 'entree' ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
                </span>
                <div className="flex-1">
                  <p className="text-body-sm font-semibold">{m.matiere}</p>
                  <p className="text-small text-muted-foreground">
                    {m.date} · {m.notes}
                  </p>
                </div>
                <span className={`text-body-sm font-bold ${m.type === 'entree' ? 'text-brand-blue' : 'text-brand-green'}`}>
                  {m.type === 'entree' ? '+' : '−'}{m.qte}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PortalShell>
  );
}
