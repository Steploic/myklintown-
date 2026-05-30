import {
  ArrowRight,
  Filter,
  MapPin,
  Phone,
  Recycle,
  Scale,
  Warehouse,
} from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

/**
 * Chaîne de valeur : ménages → collecteurs → centres de tri → entreprises B2B (EcoCycle SARL)
 * Les centres de tri affichent leurs matières triées disponibles à l'achat.
 */

const CENTRES = [
  {
    id: 'CT-001',
    nom: 'Centre de tri Nsam',
    adresse: 'Av. Charles-Atangana · Nsam-Efoulan',
    tel: '+237 2 22 12 45',
    distance: '1,2 km',
    statut: 'ouvert' as const,
    materiaux: [
      { type: 'Plastique mélangé', quantite: '3 200 kg', prix: '45 FCFA/kg', categorie: 'Plastique', dispo: true },
      { type: 'Métal mélangé', quantite: '820 kg', prix: '120 FCFA/kg', categorie: 'Métal', dispo: true },
      { type: 'Papier / Carton', quantite: '1 100 kg', prix: '25 FCFA/kg', categorie: 'Papier', dispo: true },
    ],
  },
  {
    id: 'CT-002',
    nom: 'Centre de tri Mvog-Mbi',
    adresse: 'Rue du Marché · Mvog-Mbi',
    tel: '+237 6 90 34 67',
    distance: '3,1 km',
    statut: 'ouvert' as const,
    materiaux: [
      { type: 'Plastique mélangé', quantite: '1 800 kg', prix: '45 FCFA/kg', categorie: 'Plastique', dispo: true },
      { type: 'Verre brun', quantite: '300 kg', prix: '15 FCFA/kg', categorie: 'Verre', dispo: false },
    ],
  },
  {
    id: 'CT-003',
    nom: 'Centre de tri Obobogo',
    adresse: 'Zone industrielle · Obobogo',
    tel: '+237 6 53 88 14',
    distance: '5,4 km',
    statut: 'ferme' as const,
    materiaux: [
      { type: 'Compost organique mûri', quantite: '4 200 kg', prix: '35 FCFA/kg', categorie: 'Organique', dispo: true },
      { type: 'Métal mélangé', quantite: '1 200 kg', prix: '120 FCFA/kg', categorie: 'Métal', dispo: true },
    ],
  },
];

const CAT_COLORS: Record<string, string> = {
  Plastique: 'badge-info',
  Métal:     'badge-warning',
  Papier:    'badge-success',
  Verre:     'badge-info',
  Organique: 'badge-success',
};

export default function EnterpriseCentresTri() {
  const totalDispo = CENTRES.flatMap((c) => c.materiaux.filter((m) => m.dispo)).length;
  const totalKg = CENTRES.flatMap((c) => c.materiaux.filter((m) => m.dispo))
    .reduce((acc, m) => acc + Number(m.quantite.replace(/\s/g, '').replace('kg', '')), 0);

  return (
    <PortalShell
      portalKey="enterprise"
      user={DEMO_USERS.enterprise}
      currentPath="/enterprise/centres-tri"
    >
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Centres de tri</h1>
            <p className="text-body text-muted-foreground">
              Matières triées disponibles à l'achat. Chaîne de valeur :{' '}
              <span className="text-foreground font-medium">
                ménages → collecteurs → centres de tri → vous
              </span>
            </p>
          </div>
          <button type="button" className="btn-outline">
            <Filter size={16} /> Filtrer par matière
          </button>
        </header>

        {/* Chaîne de valeur visuelle */}
        <section className="card-soft p-5">
          <div className="flex flex-wrap items-center justify-center gap-2 text-body-sm">
            {[
              { emoji: '🏠', label: 'Ménages', sub: 'déposent leurs déchets' },
              { emoji: '🚛', label: 'Collecteurs', sub: 'ramassent et livrent' },
              { emoji: '🏭', label: 'Centres de tri', sub: 'trient et stockent' },
              { emoji: '🏢', label: 'Vous (B2B)', sub: 'achetez et transformez' },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1 rounded-lg border border-border px-4 py-2">
                  <span className="text-xl">{step.emoji}</span>
                  <p className="font-semibold">{step.label}</p>
                  <p className="text-small text-muted-foreground">{step.sub}</p>
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight size={18} className="shrink-0 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard icon={Warehouse} label="Centres actifs" value="2 / 3" accent="blue" />
          <StatCard icon={Recycle} label="Lots disponibles" value={String(totalDispo)} accent="green" />
          <StatCard icon={Scale} label="Volume total dispo" value={`${(totalKg / 1000).toFixed(1)} t`} accent="teal" />
        </div>

        {/* Cartes des centres */}
        <div className="space-y-5">
          {CENTRES.map((c) => (
            <section key={c.id} className="card-soft overflow-hidden">
              {/* En-tête centre */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-small text-muted-foreground">{c.id}</p>
                    <span className={c.statut === 'ouvert' ? 'badge-success' : 'badge-warning'}>
                      {c.statut === 'ouvert' ? 'Ouvert' : 'Fermé'}
                    </span>
                  </div>
                  <h2 className="m-0 text-h2-sm">{c.nom}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-small text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {c.adresse} · {c.distance}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} /> {c.tel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Matières disponibles */}
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-medium">Matière</th>
                      <th className="px-5 py-3 font-medium">Catégorie</th>
                      <th className="px-5 py-3 font-medium">Quantité</th>
                      <th className="px-5 py-3 font-medium">Prix indicatif</th>
                      <th className="px-5 py-3 font-medium">Disponibilité</th>
                      <th className="px-5 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {c.materiaux.map((m, i) => (
                      <tr key={i} className="hover:bg-muted/40">
                        <td className="px-5 py-3 font-semibold">{m.type}</td>
                        <td className="px-5 py-3">
                          <span className={CAT_COLORS[m.categorie] ?? 'badge-info'}>
                            {m.categorie}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold text-brand-blue">{m.quantite}</td>
                        <td className="px-5 py-3 font-semibold text-brand-green">{m.prix}</td>
                        <td className="px-5 py-3">
                          <span className={m.dispo ? 'badge-success' : 'badge-warning'}>
                            {m.dispo ? 'Disponible' : 'Réservé'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {m.dispo && (
                            <button
                              type="button"
                              className="text-body-sm font-medium text-brand-blue hover:underline"
                            >
                              Commander →
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}
