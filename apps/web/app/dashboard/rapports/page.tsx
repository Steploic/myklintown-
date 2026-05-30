import { BarChart3, Calendar, Download, FileText, Mail, Send } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';

const TEMPLATES = [
  { id: 'mensuel', label: 'Rapport mensuel ESG', desc: 'Vue d\'ensemble : tonnage, recouvrement, signalements, impact CO₂', icon: BarChart3 },
  { id: 'tournees', label: 'Bilan des tournées', desc: 'Performance par camion, taux couverture, écarts au planning', icon: Calendar },
  { id: 'financier', label: 'Rapport financier', desc: 'Encaissements Mobile Money, créances, projections', icon: FileText },
  { id: 'qhse', label: 'Compilation QHSE', desc: 'Rapports terrain agrégés, incidents, EPI', icon: FileText },
];

const HISTORIQUE = [
  { date: 'Avril 2026', titre: 'Rapport mensuel · Avril', auteur: 'Système', taille: '2.4 Mo' },
  { date: 'Mars 2026', titre: 'Rapport mensuel · Mars', auteur: 'Système', taille: '2.1 Mo' },
  { date: 'Févr. 2026', titre: 'Rapport mensuel · Février', auteur: 'Système', taille: '1.9 Mo' },
  { date: '14 mai 2026', titre: 'Bilan tournées · semaine 19', auteur: 'Chef Service', taille: '880 Ko' },
];

export default function DashboardRapports() {
  return (
    <PortalShell portalKey="mairie" user={DEMO_USERS.mairie} currentPath="/dashboard/rapports">
      <div className="space-y-6">
        <header>
          <h1>Rapports</h1>
          <p className="text-body text-muted-foreground">
            Génération automatisée de rapports pour vos bailleurs, votre tutelle ou l'assemblée
            municipale.
          </p>
        </header>

        {/* Génération */}
        <section className="card-soft p-6">
          <h2>Générer un nouveau rapport</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.id} className="flex items-start gap-4 rounded-lg border border-border p-4 transition-shadow hover:shadow-soft">
                  <span className="grid h-10 w-10 shrink-0 place-content-center rounded-md bg-brand-blue/10 text-brand-blue">
                    <Icon size={18} />
                  </span>
                  <div className="flex-1">
                    <p className="text-body-sm font-semibold">{t.label}</p>
                    <p className="text-small text-muted-foreground">{t.desc}</p>
                    <button type="button" className="btn-primary mt-3 w-fit">
                      Générer maintenant
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Historique */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="m-0">Rapports archivés</h2>
            <button type="button" className="btn-outline">
              <Mail size={16} /> Envoyer par email
            </button>
          </div>
          <ul className="divide-y divide-border">
            {HISTORIQUE.map((h, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-content-center rounded-md bg-brand-green/10 text-brand-green">
                    <FileText size={18} />
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold">{h.titre}</p>
                    <p className="text-small text-muted-foreground">
                      {h.date} · {h.auteur} · {h.taille}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="inline-flex items-center gap-1 text-body-sm text-brand-blue hover:underline">
                    <Download size={14} /> PDF
                  </button>
                  <button type="button" className="inline-flex items-center gap-1 text-body-sm text-brand-blue hover:underline">
                    <Send size={14} /> Partager
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PortalShell>
  );
}
