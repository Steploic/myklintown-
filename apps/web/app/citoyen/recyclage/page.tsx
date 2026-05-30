import { Award, ChevronRight, Leaf, Recycle, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const CATEGORIES = [
  { type: 'Plastique', kg: 18.4, points: 920, couleur: 'text-brand-green', bg: 'bg-brand-green/10' },
  { type: 'Métal', kg: 4.2, points: 420, couleur: 'text-brand-teal', bg: 'bg-brand-teal/10' },
  { type: 'Papier/Carton', kg: 11.7, points: 234, couleur: 'text-brand-blue', bg: 'bg-brand-blue/10' },
  { type: 'Verre', kg: 6.1, points: 122, couleur: 'text-warning', bg: 'bg-warning/10' },
];

const HISTORIQUE = [
  { date: '25 mai', type: 'Plastique', kg: 3.0, points: 150, recycleur: 'EcoCycle SARL' },
  { date: '18 mai', type: 'Carton', kg: 2.4, points: 48, recycleur: 'Papeterie Mvolyé' },
  { date: '11 mai', type: 'Plastique', kg: 4.1, points: 205, recycleur: 'EcoCycle SARL' },
  { date: '04 mai', type: 'Métal', kg: 0.8, points: 80, recycleur: 'CIMENCAM Recycling' },
  { date: '27 avr.', type: 'Verre', kg: 1.5, points: 30, recycleur: 'Verrerie Centrale' },
];

const BADGES = [
  { code: 'first_kg', label: 'Premier kilo', desc: 'Premier dépôt validé', icon: Sparkles, obtenu: true },
  { code: 'plastic_hero', label: 'Héros du plastique', desc: '10 kg de plastique triés', icon: Recycle, obtenu: true },
  { code: 'green_streak', label: 'Série verte', desc: '4 semaines consécutives', icon: Leaf, obtenu: true },
  { code: 'top_10', label: 'Top 10 secteur', desc: 'Classement Nsam', icon: Trophy, obtenu: false },
];

export default function CitoyenRecyclage() {
  return (
    <PortalShell portalKey="citoyen" user={DEMO_USERS.citoyen} currentPath="/citoyen/recyclage">
      <div className="space-y-6">
        <header>
          <h1>Mes recyclages</h1>
          <p className="text-body text-muted-foreground">
            Historique de vos déchets triés et de leur revente aux recycleurs partenaires.
          </p>
        </header>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Recycle} label="Total recyclé" value="40,4 kg" accent="green" delta={{ value: '+12 kg ce mois', positive: true }} />
          <StatCard icon={Sparkles} label="Points cumulés" value="1 696" accent="warning" delta={{ value: '+283 ce mois', positive: true }} />
          <StatCard icon={TrendingUp} label="Revenus déchets" value="6 850 FCFA" accent="blue" />
          <StatCard icon={Trophy} label="Rang secteur" value="#14 / 240" accent="teal" delta={{ value: '↑ 3 places', positive: true }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Catégories */}
          <section className="card-soft p-6 lg:col-span-2">
            <h2>Répartition par matière</h2>
            <ul className="mt-4 space-y-4">
              {CATEGORIES.map((c) => {
                const pct = Math.round((c.kg / 40.4) * 100);
                return (
                  <li key={c.type}>
                    <div className="flex items-center justify-between text-body-sm">
                      <span className="font-semibold">{c.type}</span>
                      <span className="text-muted-foreground">
                        {c.kg} kg · {c.points} pts
                      </span>
                    </div>
                    <div className={`mt-1 h-2 overflow-hidden rounded-full ${c.bg}`}>
                      <div
                        className={`h-full rounded-full ${c.couleur.replace('text-', 'bg-')}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-4 border-t border-border pt-5 md:grid-cols-3">
              <div>
                <p className="text-small text-muted-foreground">CO₂ évité</p>
                <p className="text-h2-sm font-bold text-brand-green">~ 87 kg</p>
              </div>
              <div>
                <p className="text-small text-muted-foreground">Arbres équivalents</p>
                <p className="text-h2-sm font-bold text-brand-green">~ 4 arbres</p>
              </div>
              <div>
                <p className="text-small text-muted-foreground">Eau économisée</p>
                <p className="text-h2-sm font-bold text-brand-blue">~ 320 L</p>
              </div>
            </div>
          </section>

          {/* Badges */}
          <section className="card-soft p-6">
            <h2>Mes badges</h2>
            <ul className="mt-4 grid gap-3">
              {BADGES.map((b) => {
                const Icon = b.icon;
                return (
                  <li
                    key={b.code}
                    className={`flex items-center gap-3 rounded-lg p-3 ${
                      b.obtenu ? 'bg-brand-green/5' : 'opacity-50'
                    }`}
                  >
                    <span
                      className={`grid h-10 w-10 place-content-center rounded-full ${
                        b.obtenu ? 'bg-brand-green text-white' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    <div className="flex-1">
                      <p className="text-body-sm font-semibold">{b.label}</p>
                      <p className="text-small text-muted-foreground">{b.desc}</p>
                    </div>
                    {b.obtenu && <Award size={16} className="text-brand-green" />}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Historique */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="m-0">Historique des dépôts</h2>
              <p className="text-small text-muted-foreground">5 derniers dépôts validés.</p>
            </div>
            <a href="/citoyen/marketplace" className="btn-outline">
              <ChevronRight size={16} /> Vendre à nouveau
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Matière</th>
                  <th className="px-5 py-3 font-medium">Quantité</th>
                  <th className="px-5 py-3 font-medium">Points</th>
                  <th className="px-5 py-3 font-medium">Recycleur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {HISTORIQUE.map((h, i) => (
                  <tr key={i} className="hover:bg-muted/40">
                    <td className="px-5 py-3 text-muted-foreground">{h.date}</td>
                    <td className="px-5 py-3 font-semibold">{h.type}</td>
                    <td className="px-5 py-3">{h.kg} kg</td>
                    <td className="px-5 py-3 text-brand-green font-semibold">+{h.points}</td>
                    <td className="px-5 py-3 text-muted-foreground">{h.recycleur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
