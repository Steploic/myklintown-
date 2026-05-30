import { AlertTriangle, BadgeCheck, DollarSign, Download, Send, TrendingUp, Wallet } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const MOIS = [
  { mois: 'Janv.', collecte: 4.2 },
  { mois: 'Févr.', collecte: 5.1 },
  { mois: 'Mars', collecte: 6.7 },
  { mois: 'Avril', collecte: 7.9 },
  { mois: 'Mai', collecte: 9.4, encours: true },
];

const EN_RETARD = [
  { nom: 'Famille NGUEMA', tel: '+237 6 52 ...', secteur: 'Mvog-Mbi', impaye: '3 500', jours: 14 },
  { nom: 'Famille EYENGA', tel: '+237 6 78 ...', secteur: 'Obobogo', impaye: '10 500', jours: 54 },
  { nom: 'Famille KAMGA', tel: '+237 6 99 ...', secteur: 'Efoulan', impaye: '7 000', jours: 28 },
];

const MAX_M = Math.max(...MOIS.map((m) => m.collecte));

export default function DashboardRecouvrement() {
  return (
    <PortalShell portalKey="mairie" user={DEMO_USERS.mairie} currentPath="/dashboard/recouvrement">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Recouvrement</h1>
            <p className="text-body text-muted-foreground">
              Suivi des paiements via Mobile Money et créances en cours.
            </p>
          </div>
          <button type="button" className="btn-outline">
            <Download size={16} /> Exporter
          </button>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={DollarSign} label="Encaissé ce mois" value="9,4 M FCFA" accent="green" delta={{ value: '+19 % vs M-1', positive: true }} />
          <StatCard icon={BadgeCheck} label="Taux recouvrement" value="91 %" accent="blue" delta={{ value: '+4 pts', positive: true }} />
          <StatCard icon={Wallet} label="Créances ouvertes" value="2,1 M FCFA" accent="warning" />
          <StatCard icon={AlertTriangle} label="Ménages critiques" value="38" accent="danger" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Courbe */}
          <section className="card-soft p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="m-0 flex items-center gap-2">
                <TrendingUp size={18} className="text-brand-green" /> Évolution mensuelle (M FCFA)
              </h2>
            </div>
            <ul className="mt-6 flex h-56 items-end gap-4">
              {MOIS.map((m) => {
                const h = (m.collecte / MAX_M) * 100;
                return (
                  <li key={m.mois} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-small font-semibold">{m.collecte} M</span>
                    <div className="relative w-full flex-1 overflow-hidden rounded-md bg-muted">
                      <div
                        className={`absolute bottom-0 w-full rounded-md ${m.encours ? 'bg-brand-green/60' : 'bg-brand-green'}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="text-small text-muted-foreground">{m.mois}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-small text-muted-foreground">
              Croissance moyenne : +18 %/mois — alignée sur l'objectif du modèle économique.
            </p>
          </section>

          {/* Répartition */}
          <section className="card-soft p-6">
            <h2 className="m-0">Méthodes utilisées</h2>
            <ul className="mt-4 space-y-3">
              {[
                { nom: 'MTN MoMo', pct: 58, color: 'bg-warning' },
                { nom: 'Orange Money', pct: 31, color: 'bg-brand-blue' },
                { nom: 'Espèces (terrain)', pct: 8, color: 'bg-brand-teal' },
                { nom: 'Virement', pct: 3, color: 'bg-brand-green' },
              ].map((m) => (
                <li key={m.nom}>
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="font-semibold">{m.nom}</span>
                    <span className="text-muted-foreground">{m.pct} %</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Créances */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0">Créances en retard (top 3)</h2>
            <a href="/dashboard/menages" className="text-body-sm font-medium text-brand-blue hover:underline">
              Voir tous les ménages
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Ménage</th>
                  <th className="px-5 py-3 font-medium">Téléphone</th>
                  <th className="px-5 py-3 font-medium">Secteur</th>
                  <th className="px-5 py-3 font-medium">Impayé</th>
                  <th className="px-5 py-3 font-medium">Retard</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {EN_RETARD.map((r) => (
                  <tr key={r.nom} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-semibold">{r.nom}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.tel}</td>
                    <td className="px-5 py-3">{r.secteur}</td>
                    <td className="px-5 py-3 font-semibold text-danger">{r.impaye} FCFA</td>
                    <td className="px-5 py-3">
                      <span className={r.jours > 30 ? 'badge-danger' : 'badge-warning'}>
                        {r.jours} jours
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button type="button" className="inline-flex items-center gap-1 text-brand-blue hover:underline">
                        <Send size={12} /> Relance SMS
                      </button>
                    </td>
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
