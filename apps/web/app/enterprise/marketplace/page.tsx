import { Eye, MoreHorizontal, Pencil, Plus, ShoppingBag, TrendingUp } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const ARTICLES = [
  { nom: 'Granulés PET recyclés (cristal)', cat: 'Plastique', stock: '2 400 kg', prix: '385 FCFA/kg', vues: 142, vendu: '4,2 t', statut: 'En vente' as const },
  { nom: 'Granulés PEHD (couleur)', cat: 'Plastique', stock: '850 kg', prix: '310 FCFA/kg', vues: 81, vendu: '1,8 t', statut: 'En vente' as const },
  { nom: 'Aluminium concassé', cat: 'Métal', stock: '320 kg', prix: '1 200 FCFA/kg', vues: 56, vendu: '0,8 t', statut: 'En vente' as const },
  { nom: 'Carton ondulé compacté', cat: 'Papier', stock: '1 100 kg', prix: '85 FCFA/kg', vues: 38, vendu: '1,2 t', statut: 'En vente' as const },
  { nom: 'Compost mûri 6 mois', cat: 'Organique', stock: '4 200 kg', prix: '180 FCFA/kg', vues: 27, vendu: '0,3 t', statut: 'En vente' as const },
  { nom: 'Verre brun concassé', cat: 'Verre', stock: '0 kg', prix: '95 FCFA/kg', vues: 12, vendu: '—', statut: 'Rupture' as const },
];

const STATUT_BADGE = {
  'En vente': 'badge-success',
  'Rupture': 'badge-warning',
  'Archive': 'badge-info',
} as const;

export default function EnterpriseMarketplace() {
  return (
    <PortalShell portalKey="enterprise" user={DEMO_USERS.enterprise} currentPath="/enterprise/marketplace">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Marketplace vendeur</h1>
            <p className="text-body text-muted-foreground">
              Catalogue de vos produits transformés, visibles par tous les acheteurs B2B.
            </p>
          </div>
          <button type="button" className="btn-primary">
            <Plus size={16} /> Publier un article
          </button>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ShoppingBag} label="Articles publiés" value="5 / 6" accent="blue" />
          <StatCard icon={Eye} label="Vues 30 jours" value="356" accent="teal" delta={{ value: '+24 %', positive: true }} />
          <StatCard icon={TrendingUp} label="Volume vendu (mois)" value="8,3 t" accent="green" />
          <StatCard icon={ShoppingBag} label="CA marketplace" value="3,9 M FCFA" accent="warning" />
        </div>

        {/* Grille catalogue */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ARTICLES.map((a) => (
            <article key={a.nom} className="card-soft overflow-hidden">
              <div className="relative aspect-[4/3] bg-brand-gradient-soft">
                <span className={`absolute right-3 top-3 ${STATUT_BADGE[a.statut]}`}>{a.statut}</span>
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between">
                  <span className="badge-info">{a.cat}</span>
                  <button type="button" aria-label="Plus" className="text-muted-foreground hover:text-foreground">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                <h3 className="text-h2-sm">{a.nom}</h3>
                <p className="text-small text-muted-foreground">
                  Stock {a.stock} · {a.vues} vues · vendu {a.vendu}
                </p>
                <p className="text-h2-sm font-bold text-brand-green">{a.prix}</p>
                <div className="flex gap-2 border-t border-border pt-3">
                  <button type="button" className="btn-outline flex-1">
                    <Pencil size={14} /> Éditer
                  </button>
                  <button type="button" className="btn-primary flex-1">
                    <Eye size={14} /> Voir public
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </PortalShell>
  );
}
