import { Download, Filter, MapPin, Phone, Plus, Search, Users } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const MENAGES = [
  { qr: 'MKT-YDE3-NSAM-C0427', nom: 'Famille TSANGA', tel: '+237 6 90 ...', secteur: 'Nsam', formule: 'Mensuel', statut: 'A jour' as const, dernier_scan: 'Hier · 06:42' },
  { qr: 'MKT-YDE3-NSAM-C0428', nom: 'Famille NDJOM', tel: '+237 6 53 ...', secteur: 'Nsam', formule: 'Mensuel', statut: 'A jour' as const, dernier_scan: 'Hier · 06:38' },
  { qr: 'MKT-YDE3-NSAM-C0431', nom: 'Famille ABENA', tel: '+237 6 77 ...', secteur: 'Nsam', formule: 'Trimestriel', statut: 'A jour' as const, dernier_scan: 'Hier · 06:25' },
  { qr: 'MKT-YDE3-MVOG-D0102', nom: 'Famille NGUEMA', tel: '+237 6 52 ...', secteur: 'Mvog-Mbi', formule: 'Mensuel', statut: 'Retard' as const, dernier_scan: '12 mai · 17:11' },
  { qr: 'MKT-YDE3-EFOU-E0445', nom: 'Famille OWONA', tel: '+237 6 91 ...', secteur: 'Efoulan', formule: 'Annuel', statut: 'A jour' as const, dernier_scan: 'Aujourd\'hui · 07:12' },
  { qr: 'MKT-YDE3-OBOB-F1281', nom: 'Famille EYENGA', tel: '+237 6 78 ...', secteur: 'Obobogo', formule: 'Mensuel', statut: 'Critique' as const, dernier_scan: '02 avr.' },
  { qr: 'MKT-YDE3-ETOA-G0904', nom: 'École Catholique Etoa', tel: '+237 2 22 ...', secteur: 'Etoa-Meki', formule: 'Annuel', statut: 'A jour' as const, dernier_scan: 'Hier · 08:42' },
  { qr: 'MKT-YDE3-NSAM-C0501', nom: 'Famille MBARGA', tel: '+237 6 90 ...', secteur: 'Nsam', formule: 'Mensuel', statut: 'En test' as const, dernier_scan: '—' },
];

const STATUT_BADGE = {
  'A jour': 'badge-success',
  'Retard': 'badge-warning',
  'Critique': 'badge-danger',
  'En test': 'badge-info',
} as const;

export default function DashboardMenages() {
  return (
    <PortalShell portalKey="mairie" user={DEMO_USERS.mairie} currentPath="/dashboard/menages">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Ménages</h1>
            <p className="text-body text-muted-foreground">
              CRM unifié de tous les ménages enregistrés sur Yaoundé III.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline">
              <Download size={16} /> Exporter CSV
            </button>
            <button type="button" className="btn-primary">
              <Plus size={16} /> Nouveau ménage
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Ménages actifs" value="4 218" accent="blue" />
          <StatCard icon={Users} label="En test (pilote)" value="50" accent="warning" />
          <StatCard icon={Users} label="En retard" value="218" accent="danger" delta={{ value: '−12 % vs M-1', positive: true }} />
          <StatCard icon={MapPin} label="Secteurs couverts" value="5 / 5" accent="green" />
        </div>

        {/* Recherche + filtres */}
        <section className="card-soft flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Rechercher par nom, QR, téléphone..."
              className="w-full rounded-md border border-border bg-surface py-2 pl-10 pr-3 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
            <option>Tous secteurs</option>
            <option>Nsam-Efoulan</option>
            <option>Mvog-Mbi</option>
            <option>Obobogo</option>
            <option>Etoa-Meki</option>
            <option>Efoulan-Sud</option>
          </select>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm">
            <option>Tous statuts</option>
            <option>À jour</option>
            <option>En retard</option>
            <option>Critique</option>
          </select>
          <button type="button" className="btn-outline">
            <Filter size={16} /> Plus de filtres
          </button>
        </section>

        {/* Tableau */}
        <section className="card-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">QR Code</th>
                  <th className="px-5 py-3 font-medium">Ménage</th>
                  <th className="px-5 py-3 font-medium">Téléphone</th>
                  <th className="px-5 py-3 font-medium">Secteur</th>
                  <th className="px-5 py-3 font-medium">Formule</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Dernier scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MENAGES.map((m) => (
                  <tr key={m.qr} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-small text-muted-foreground">{m.qr}</td>
                    <td className="px-5 py-3 font-semibold">{m.nom}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Phone size={12} /> {m.tel}
                      </span>
                    </td>
                    <td className="px-5 py-3">{m.secteur}</td>
                    <td className="px-5 py-3">{m.formule}</td>
                    <td className="px-5 py-3">
                      <span className={STATUT_BADGE[m.statut]}>{m.statut}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{m.dernier_scan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-body-sm text-muted-foreground">
            <span>Affichage 1-8 sur 4 218 ménages</span>
            <div className="flex gap-2">
              <button type="button" className="btn-outline px-3 py-1">Précédent</button>
              <button type="button" className="btn-outline px-3 py-1">Suivant</button>
            </div>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
