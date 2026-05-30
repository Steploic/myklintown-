import { Filter, Heart, MapPin, Search, ShoppingBag, Star, Truck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';

const CATEGORIES = [
  { id: 'all', label: 'Tout', count: 24 },
  { id: 'plastique', label: 'Plastique', count: 9 },
  { id: 'metal', label: 'Métal', count: 5 },
  { id: 'carton', label: 'Carton', count: 4 },
  { id: 'verre', label: 'Verre', count: 3 },
  { id: 'organique', label: 'Organique', count: 3 },
];

const PRODUITS = [
  { nom: 'Compost bio · 25 kg', vendeur: 'EcoCycle SARL', prix: '4 500', distance: '2,1 km', note: 4.8, tag: 'Organique' },
  { nom: 'Bac de tri 240 L (occasion)', vendeur: 'GreenWaste Yaoundé', prix: '18 000', distance: '3,8 km', note: 4.6, tag: 'Plastique' },
  { nom: 'Pots de fleurs recyclés (x5)', vendeur: 'Atelier Recyc-Art', prix: '2 500', distance: '1,4 km', note: 4.9, tag: 'Plastique' },
  { nom: 'Pavés autobloquants verts', vendeur: 'EcoBat Cameroun', prix: '750 / m²', distance: '5,7 km', note: 4.7, tag: 'Plastique' },
  { nom: 'Briques compressées plastique', vendeur: 'EcoCycle SARL', prix: '125 / pièce', distance: '2,1 km', note: 4.5, tag: 'Plastique' },
  { nom: 'Sacs cabas en bâche recyclée', vendeur: 'Atelier Recyc-Art', prix: '3 800', distance: '1,4 km', note: 4.9, tag: 'Plastique' },
];

export default function CitoyenMarketplace() {
  return (
    <PortalShell portalKey="citoyen" user={DEMO_USERS.citoyen} currentPath="/citoyen/marketplace">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Marketplace</h1>
            <p className="text-body text-muted-foreground">
              Produits issus du recyclage local — soutenez l'économie circulaire de Yaoundé.
            </p>
          </div>
          <a href="/citoyen/recyclage" className="btn-outline">
            <ShoppingBag size={16} /> Vendre mes déchets triés
          </a>
        </header>

        {/* Search + filters */}
        <section className="card-soft flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Rechercher un produit, un vendeur..."
              className="w-full rounded-md border border-border bg-surface py-2 pl-10 pr-3 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
          <button type="button" className="btn-outline">
            <Filter size={16} /> Filtres
          </button>
        </section>

        {/* Catégories */}
        <nav className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`rounded-full border px-4 py-1.5 text-body-sm font-medium transition-colors ${
                c.id === 'all'
                  ? 'border-brand-blue bg-brand-blue text-white'
                  : 'border-border bg-surface text-foreground hover:border-brand-blue'
              }`}
            >
              {c.label} <span className="text-small opacity-70">({c.count})</span>
            </button>
          ))}
        </nav>

        {/* Grille produits */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUITS.map((p, i) => (
            <article key={i} className="card-soft overflow-hidden">
              <div className="aspect-[4/3] bg-brand-gradient-soft" aria-hidden />
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="badge-info">{p.tag}</span>
                  <button type="button" aria-label="Favori" className="text-muted-foreground hover:text-danger">
                    <Heart size={16} />
                  </button>
                </div>
                <h3 className="text-h2-sm">{p.nom}</h3>
                <p className="flex items-center gap-1 text-small text-muted-foreground">
                  <Truck size={12} /> {p.vendeur} · <MapPin size={12} /> {p.distance}
                </p>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-h2-sm font-bold text-brand-green">{p.prix} FCFA</span>
                  <span className="inline-flex items-center gap-1 text-small text-muted-foreground">
                    <Star size={12} fill="currentColor" className="text-warning" /> {p.note}
                  </span>
                </div>
                <button type="button" className="btn-primary w-full">
                  Voir le produit
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </PortalShell>
  );
}
