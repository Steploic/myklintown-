import { Check, Filter, Inbox, MapPin, Phone, X } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const DEMANDES = [
  { id: 'DC-2148', auteur: 'École publique Nsam', tel: '+237 2 22 ...', type: 'Plastique', volume: '450 kg', adresse: 'Av. Charles-Atangana', distance: '1,2 km', date: 'Demain', statut: 'nouvelle' as const },
  { id: 'DC-2147', auteur: 'Famille NDJOM', tel: '+237 6 53 ...', type: 'Métal', volume: '38 kg', adresse: 'Rue 1.236 · Nsam', distance: '2,8 km', date: 'Sous 3 jours', statut: 'nouvelle' as const },
  { id: 'DC-2146', auteur: 'Pharmacie La Paix', tel: '+237 2 22 ...', type: 'Papier/Carton', volume: '120 kg', adresse: 'Av. Kennedy', distance: '3,1 km', date: 'Cette semaine', statut: 'acceptee' as const },
  { id: 'DC-2145', auteur: 'Marché Mvog-Mbi', tel: '+237 6 90 ...', type: 'Plastique', volume: '780 kg', adresse: 'Marché central', distance: '4,6 km', date: 'Aujourd\'hui', statut: 'en_cours' as const },
  { id: 'DC-2144', auteur: 'Famille EYENGA', tel: '+237 6 78 ...', type: 'Verre', volume: '24 kg', adresse: 'Obobogo · bloc D', distance: '5,1 km', date: 'Demain', statut: 'nouvelle' as const },
];

const STATUT_BADGE = {
  nouvelle: { label: 'Nouvelle', class: 'badge-info' },
  acceptee: { label: 'Acceptée', class: 'badge-warning' },
  en_cours: { label: 'En cours', class: 'badge-success' },
} as const;

export default function EnterpriseDemandes() {
  return (
    <PortalShell portalKey="enterprise" user={DEMO_USERS.enterprise} currentPath="/enterprise/demandes">
      <div className="space-y-6">
        <header>
          <h1>Demandes de collecte</h1>
          <p className="text-body text-muted-foreground">
            Demandes émises par les citoyens et structures via l'app MyKlinTown.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Inbox} label="Nouvelles" value="3" accent="blue" />
          <StatCard icon={Inbox} label="Acceptées" value="1" accent="warning" />
          <StatCard icon={Inbox} label="En cours" value="1" accent="green" />
          <StatCard icon={Inbox} label="Terminées (sem.)" value="14" accent="teal" />
        </div>

        {/* Filtres */}
        <section className="card-soft flex flex-wrap items-center gap-3 p-4">
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
            <option>Tous types</option>
            <option>Plastique</option>
            <option>Métal</option>
            <option>Papier/Carton</option>
            <option>Verre</option>
            <option>Organique</option>
          </select>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
            <option>Distance (≤ 10 km)</option>
            <option>≤ 5 km</option>
            <option>≤ 2 km</option>
          </select>
          <button type="button" className="btn-outline">
            <Filter size={16} /> Plus de filtres
          </button>
        </section>

        {/* Cards demandes */}
        <section className="grid gap-4 lg:grid-cols-2">
          {DEMANDES.map((d) => (
            <article key={d.id} className="card-soft space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-small text-muted-foreground">{d.id}</p>
                  <p className="text-h2-sm font-semibold">{d.auteur}</p>
                </div>
                <span className={STATUT_BADGE[d.statut].class}>{STATUT_BADGE[d.statut].label}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-body-sm">
                <div>
                  <dt className="text-small text-muted-foreground">Matière</dt>
                  <dd className="font-semibold">{d.type}</dd>
                </div>
                <div>
                  <dt className="text-small text-muted-foreground">Volume</dt>
                  <dd className="font-semibold">{d.volume}</dd>
                </div>
                <div>
                  <dt className="text-small text-muted-foreground">Date souhaitée</dt>
                  <dd className="font-semibold">{d.date}</dd>
                </div>
                <div>
                  <dt className="text-small text-muted-foreground">Distance</dt>
                  <dd className="font-semibold">{d.distance}</dd>
                </div>
              </dl>
              <div className="flex items-center gap-3 text-small text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin size={12} /> {d.adresse}</span>
                <span className="inline-flex items-center gap-1"><Phone size={12} /> {d.tel}</span>
              </div>
              {d.statut === 'nouvelle' && (
                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <button type="button" className="btn-outline">
                    <X size={14} /> Refuser
                  </button>
                  <button type="button" className="btn-primary">
                    <Check size={14} /> Accepter
                  </button>
                </div>
              )}
              {d.statut === 'acceptee' && (
                <div className="flex justify-end border-t border-border pt-3">
                  <button type="button" className="btn-primary">Démarrer la collecte</button>
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </PortalShell>
  );
}
