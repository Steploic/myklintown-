import { Award, BarChart3, Clock, Medal, Target, Trophy, TrendingUp, Truck, Users } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const SEMAINE = [
  { jour: 'Lun', scans: 64, kg: 280 },
  { jour: 'Mar', scans: 71, kg: 320 },
  { jour: 'Mer', scans: 58, kg: 260 },
  { jour: 'Jeu', scans: 69, kg: 305 },
  { jour: 'Ven', scans: 75, kg: 340 },
  { jour: 'Sam', scans: 42, kg: 195 },
  { jour: 'Aujourd\'hui', scans: 42, kg: 188, partiel: true },
];

const CLASSEMENT = [
  { rang: 1, nom: 'Paul Mvondo', score: 412 },
  { rang: 2, nom: 'Jean Fabrice', score: 387, moi: true },
  { rang: 3, nom: 'Samuel Eyenga', score: 372 },
  { rang: 4, nom: 'André Mbarga', score: 358 },
  { rang: 5, nom: 'Christine Ndi', score: 341 },
];

const BADGES = [
  { code: 'speed', label: 'Vitesse éclair', desc: '> 70 scans en une tournée', icon: Clock, obtenu: true },
  { code: 'streak', label: 'Régularité', desc: '4 semaines consécutives', icon: TrendingUp, obtenu: true },
  { code: 'zero_incident', label: 'Zéro incident', desc: '30 jours sans incident', icon: Award, obtenu: false },
  { code: 'top_3', label: 'Podium', desc: 'Top 3 du secteur', icon: Medal, obtenu: true },
];

const MAX_SCANS = Math.max(...SEMAINE.map((d) => d.scans));

export default function CollecteurPerformance() {
  return (
    <PortalShell portalKey="collecteur" user={DEMO_USERS.collecteur} currentPath="/collecteur/performance">
      <div className="space-y-6">
        <header>
          <h1>Ma performance</h1>
          <p className="text-body text-muted-foreground">
            Indicateurs personnels de la semaine et classement parmi vos collègues.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Ménages scannés (sem.)" value="379" accent="blue" delta={{ value: '+12 % vs S-1', positive: true }} />
          <StatCard icon={Truck} label="Tonnage collecté (sem.)" value="1 700 kg" accent="green" />
          <StatCard icon={Target} label="Taux couverture" value="94 %" accent="teal" delta={{ value: '+3 pts', positive: true }} />
          <StatCard icon={Trophy} label="Rang équipe" value="#2 / 14" accent="warning" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Graphique semaine */}
          <section className="card-soft p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="m-0 flex items-center gap-2">
                <BarChart3 size={18} className="text-brand-blue" /> Scans par jour
              </h2>
              <span className="badge-info">Semaine en cours</span>
            </div>
            <ul className="mt-6 flex h-56 items-end gap-3">
              {SEMAINE.map((d) => {
                const h = (d.scans / MAX_SCANS) * 100;
                return (
                  <li key={d.jour} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-small font-semibold">{d.scans}</span>
                    <div className="relative w-full flex-1 overflow-hidden rounded-md bg-muted">
                      <div
                        className={`absolute bottom-0 w-full rounded-md ${
                          d.partiel ? 'bg-brand-green/60' : 'bg-brand-green'
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="text-small text-muted-foreground">{d.jour}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-small text-muted-foreground">
              Moyenne semaine : 65 scans/jour · objectif quotidien : 60 ✅
            </p>
          </section>

          {/* Classement */}
          <section className="card-soft p-5">
            <h2 className="m-0 flex items-center gap-2">
              <Trophy size={18} className="text-brand-green" /> Classement secteur
            </h2>
            <ul className="mt-4 space-y-2">
              {CLASSEMENT.map((c) => (
                <li
                  key={c.rang}
                  className={`flex items-center gap-3 rounded-lg p-3 ${
                    c.moi ? 'bg-brand-green/10' : 'border border-border'
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 place-content-center rounded-full text-small font-bold ${
                      c.rang === 1
                        ? 'bg-warning text-white'
                        : c.rang === 2
                          ? 'bg-brand-blue text-white'
                          : c.rang === 3
                            ? 'bg-brand-teal text-white'
                            : 'bg-muted text-foreground'
                    }`}
                  >
                    {c.rang}
                  </span>
                  <div className="flex-1">
                    <p className="text-body-sm font-semibold">{c.nom} {c.moi && '(vous)'}</p>
                  </div>
                  <span className="text-body-sm font-bold text-brand-blue">{c.score}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Badges */}
        <section className="card-soft p-6">
          <h2>Récompenses</h2>
          <p className="text-body-sm text-muted-foreground">Badges débloqués via vos performances.</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-4">
            {BADGES.map((b) => {
              const Icon = b.icon;
              return (
                <li
                  key={b.code}
                  className={`flex flex-col items-center gap-2 rounded-lg p-4 text-center ${
                    b.obtenu ? 'bg-brand-green/5' : 'opacity-50'
                  }`}
                >
                  <span
                    className={`grid h-12 w-12 place-content-center rounded-full ${
                      b.obtenu ? 'bg-brand-green text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon size={22} />
                  </span>
                  <p className="text-body-sm font-semibold">{b.label}</p>
                  <p className="text-small text-muted-foreground">{b.desc}</p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </PortalShell>
  );
}
