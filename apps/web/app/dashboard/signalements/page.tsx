import { AlertTriangle, CheckCircle2, ChevronRight, Filter, Search } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const TOUS = [
  { id: 'SIG-1521', type: 'Bac débordant', adresse: 'Marché central · Mvog-Mbi', auteur: 'Mme Atangana + 2', age: '42 min', statut: 'nouveau' as const },
  { id: 'SIG-1520', type: 'Dépôt sauvage', adresse: 'Av. Charles-Atangana', auteur: 'Anonyme', age: '2 h', statut: 'nouveau' as const },
  { id: 'SIG-1519', type: 'Retard collecte', adresse: 'Obobogo · bloc D', auteur: '5 ménages', age: '3 h', statut: 'en_traitement' as const },
  { id: 'SIG-1518', type: 'Bac débordant', adresse: 'École Nsam', auteur: 'M. Mvondo', age: '5 h', statut: 'en_traitement' as const },
  { id: 'SIG-1517', type: 'Incident collecteur', adresse: 'Rue 2.401 · Nsam', auteur: 'Famille OWONA', age: '1 j', statut: 'resolu' as const },
  { id: 'SIG-1516', type: 'Bac débordant', adresse: 'Rue Joie · Nsam', auteur: 'Famille TSANGA', age: '2 j', statut: 'resolu' as const },
];

const STATUT_BADGE = {
  nouveau: 'badge-danger',
  en_traitement: 'badge-warning',
  resolu: 'badge-success',
} as const;

const STATUT_LABEL = {
  nouveau: 'Nouveau',
  en_traitement: 'En traitement',
  resolu: 'Résolu',
} as const;

export default function DashboardSignalements() {
  return (
    <PortalShell portalKey="mairie" user={DEMO_USERS.mairie} currentPath="/dashboard/signalements">
      <div className="space-y-6">
        <header>
          <h1>Signalements</h1>
          <p className="text-body text-muted-foreground">
            Tous les signalements émis par les citoyens et le terrain. Affectez les équipes en un clic.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={AlertTriangle} label="Nouveaux" value="3" accent="danger" />
          <StatCard icon={AlertTriangle} label="En traitement" value="4" accent="warning" />
          <StatCard icon={CheckCircle2} label="Résolus (semaine)" value="28" accent="green" delta={{ value: 'Délai moyen 3h12', positive: true }} />
          <StatCard icon={CheckCircle2} label="Taux résolution" value="92 %" accent="blue" />
        </div>

        {/* Filtres */}
        <section className="card-soft flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Rechercher par ID, adresse, auteur..."
              className="w-full rounded-md border border-border bg-surface py-2 pl-10 pr-3 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
            <option>Tous types</option>
            <option>Bac débordant</option>
            <option>Dépôt sauvage</option>
            <option>Retard collecte</option>
            <option>Incident collecteur</option>
          </select>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
            <option>Tous statuts</option>
            <option>Nouveau</option>
            <option>En traitement</option>
            <option>Résolu</option>
          </select>
          <button type="button" className="btn-outline">
            <Filter size={16} /> Plus
          </button>
        </section>

        {/* Liste */}
        <section className="card-soft overflow-hidden">
          <ul className="divide-y divide-border">
            {TOUS.map((s) => (
              <li key={s.id} className="grid grid-cols-12 items-center gap-3 px-5 py-4 hover:bg-muted/40">
                <span className="col-span-2 font-mono text-small text-muted-foreground">{s.id}</span>
                <span className="col-span-3 text-body-sm font-semibold">{s.type}</span>
                <span className="col-span-3 text-body-sm text-muted-foreground">{s.adresse}</span>
                <span className="col-span-2 text-body-sm text-muted-foreground">{s.auteur}</span>
                <span className="col-span-1 text-small text-muted-foreground">{s.age}</span>
                <div className="col-span-1 flex items-center justify-end gap-2">
                  <span className={STATUT_BADGE[s.statut]}>{STATUT_LABEL[s.statut]}</span>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PortalShell>
  );
}
