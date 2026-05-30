import { Calendar, CheckCircle2, Clock, Play, Plus, Truck, Users } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const EN_COURS = [
  { id: 'T-2026-526-M-A', camion: 'Δ-217', collecteur: 'Jean Fabrice', secteur: 'Nsam-Efoulan', avancement: 62, total: 68 },
  { id: 'T-2026-526-M-B', camion: 'Δ-184', collecteur: 'Paul Mvondo', secteur: 'Mvog-Mbi', avancement: 41, total: 92 },
  { id: 'T-2026-526-M-C', camion: 'Δ-093', collecteur: 'Samuel Eyenga', secteur: 'Efoulan', avancement: 78, total: 54 },
  { id: 'T-2026-526-M-D', camion: 'Δ-441', collecteur: 'André Mbarga', secteur: 'Obobogo', avancement: 23, total: 71 },
];

const PLANIFIEES = [
  { id: 'T-2026-526-S-A', camion: 'Δ-217', collecteur: 'Jean Fabrice', secteur: 'Nsam-Efoulan', creneau: 'Soir 18:00' },
  { id: 'T-2026-527-M-A', camion: 'Δ-217', collecteur: 'Jean Fabrice', secteur: 'Nsam-Efoulan', creneau: 'Matin 06:00' },
];

const TERMINEES = [
  { id: 'T-2026-525-M-A', camion: 'Δ-217', secteur: 'Nsam', tonnage: '3,2 t', duree: '3h12', taux: 96 },
  { id: 'T-2026-525-M-B', camion: 'Δ-184', secteur: 'Mvog-Mbi', tonnage: '4,1 t', duree: '4h05', taux: 88 },
  { id: 'T-2026-525-M-C', camion: 'Δ-093', secteur: 'Efoulan', tonnage: '2,8 t', duree: '2h58', taux: 92 },
];

export default function DashboardTournees() {
  return (
    <PortalShell portalKey="mairie" user={DEMO_USERS.mairie} currentPath="/dashboard/tournees">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Tournées</h1>
            <p className="text-body text-muted-foreground">
              Pilotage de toutes les tournées en cours et planification.
            </p>
          </div>
          <button type="button" className="btn-primary">
            <Plus size={16} /> Planifier une tournée
          </button>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Truck} label="En cours" value="4" accent="blue" />
          <StatCard icon={Calendar} label="Planifiées (24h)" value="9" accent="teal" />
          <StatCard icon={CheckCircle2} label="Terminées aujourd'hui" value="3" accent="green" />
          <StatCard icon={Users} label="Couverture cumulée" value="78 %" accent="warning" />
        </div>

        {/* En cours */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0 flex items-center gap-2">
              <Play size={18} className="text-brand-green" /> Tournées en cours
            </h2>
            <span className="badge-success">4 actives</span>
          </div>
          <ul className="divide-y divide-border">
            {EN_COURS.map((t) => {
              const pct = Math.round((t.avancement / t.total) * 100);
              return (
                <li key={t.id} className="px-5 py-4 hover:bg-muted/40">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-content-center rounded-md bg-brand-blue text-white">
                        <Truck size={18} />
                      </span>
                      <div>
                        <p className="text-body-sm font-semibold">
                          Camion {t.camion} · {t.secteur}
                        </p>
                        <p className="text-small text-muted-foreground">
                          {t.collecteur} · {t.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-body-sm">
                      <span className="font-semibold">
                        {t.avancement} / {t.total} ménages
                      </span>
                      <span className="text-muted-foreground">{pct} %</span>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand-green" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Planifiées */}
          <section className="card-soft overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="m-0 flex items-center gap-2">
                <Calendar size={18} className="text-brand-blue" /> Planifiées
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {PLANIFIEES.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-body-sm font-semibold">{t.secteur}</p>
                    <p className="text-small text-muted-foreground">
                      {t.camion} · {t.collecteur} · {t.id}
                    </p>
                  </div>
                  <span className="badge-info">{t.creneau}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Terminées */}
          <section className="card-soft overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="m-0 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-brand-green" /> Terminées hier
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {TERMINEES.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-body-sm font-semibold">{t.secteur}</p>
                    <p className="text-small text-muted-foreground">
                      {t.camion} · {t.tonnage} · <Clock size={10} className="inline" /> {t.duree}
                    </p>
                  </div>
                  <span className="badge-success">{t.taux}%</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
