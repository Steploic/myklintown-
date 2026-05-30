import { Clock, DollarSign, Download, FileText, Plus, Receipt, Send, TrendingUp } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { DEMO_USERS } from '@/lib/portal-config';

const FACTURES = [
  { id: 'F-2026-0521', client: 'Plastica Cameroun', date: '21 mai 2026', echeance: '20 juin 2026', montant: '1 617 000', statut: 'payee' as const },
  { id: 'F-2026-0518', client: 'CIMENCAM Recycling', date: '18 mai 2026', echeance: '17 juin 2026', montant: '3 360 000', statut: 'envoyee' as const },
  { id: 'F-2026-0512', client: 'Papeterie Mvolyé', date: '12 mai 2026', echeance: '11 juin 2026', montant: '102 000', statut: 'envoyee' as const },
  { id: 'F-2026-0504', client: 'Verrerie Centrale', date: '04 mai 2026', echeance: '03 juin 2026', montant: '28 500', statut: 'en_retard' as const },
  { id: 'F-2026-0428', client: 'Plastica Cameroun', date: '28 avr. 2026', echeance: '28 mai 2026', montant: '895 000', statut: 'payee' as const },
];

const STATUT_BADGE = {
  brouillon: { label: 'Brouillon', class: 'badge-info' },
  envoyee: { label: 'Envoyée', class: 'badge-warning' },
  payee: { label: 'Payée', class: 'badge-success' },
  en_retard: { label: 'En retard', class: 'badge-danger' },
} as const;

export default function EnterpriseFacturation() {
  return (
    <PortalShell portalKey="enterprise" user={DEMO_USERS.enterprise} currentPath="/enterprise/facturation">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Facturation</h1>
            <p className="text-body text-muted-foreground">
              Émission, suivi et relance des factures clients.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline">
              <Download size={16} /> Exporter
            </button>
            <button type="button" className="btn-primary">
              <Plus size={16} /> Nouvelle facture
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={DollarSign} label="Encaissé (mois)" value="2,5 M FCFA" accent="green" delta={{ value: '+18 %', positive: true }} />
          <StatCard icon={Clock} label="En attente" value="3,5 M FCFA" accent="warning" />
          <StatCard icon={FileText} label="Factures émises" value="14" accent="blue" />
          <StatCard icon={TrendingUp} label="DSO moyen" value="22 j" accent="teal" />
        </div>

        {/* Tableau */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0">Factures</h2>
            <select className="rounded-md border border-border bg-surface px-3 py-1.5 text-body-sm">
              <option>Toutes</option>
              <option>Brouillon</option>
              <option>Envoyée</option>
              <option>Payée</option>
              <option>En retard</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">N° facture</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Échéance</th>
                  <th className="px-5 py-3 font-medium">Montant</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {FACTURES.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-small text-muted-foreground">{f.id}</td>
                    <td className="px-5 py-3 font-semibold">{f.client}</td>
                    <td className="px-5 py-3 text-muted-foreground">{f.date}</td>
                    <td className="px-5 py-3 text-muted-foreground">{f.echeance}</td>
                    <td className="px-5 py-3 font-bold">{f.montant} FCFA</td>
                    <td className="px-5 py-3">
                      <span className={STATUT_BADGE[f.statut].class}>{STATUT_BADGE[f.statut].label}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" aria-label="PDF" className="text-muted-foreground hover:text-brand-blue">
                          <Receipt size={16} />
                        </button>
                        <button type="button" aria-label="Envoyer" className="text-muted-foreground hover:text-brand-blue">
                          <Send size={16} />
                        </button>
                      </div>
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
