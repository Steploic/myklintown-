import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Download,
  Receipt,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { DEMO_USERS } from '@/lib/portal-config';

const FORMULES = [
  { id: 'mensuel', label: 'Mensuel', prix: '3 500 FCFA', sub: '/ mois', features: ['Collecte 2 fois/sem', 'Support SMS'], current: true },
  { id: 'trimestriel', label: 'Trimestriel', prix: '9 500 FCFA', sub: '/ 3 mois', features: ['Collecte 2 fois/sem', '-10 % vs mensuel', 'Support prioritaire'], current: false, popular: true },
  { id: 'annuel', label: 'Annuel', prix: '35 000 FCFA', sub: '/ an', features: ['Collecte 2 fois/sem', '-17 % vs mensuel', 'Bac neuf offert'], current: false },
];

const PAIEMENTS = [
  { ref: 'PAY-2026-05-241', date: '24 mai 2026', montant: '3 500', methode: 'MTN MoMo', statut: 'Validé' },
  { ref: 'PAY-2026-04-238', date: '24 avr. 2026', montant: '3 500', methode: 'MTN MoMo', statut: 'Validé' },
  { ref: 'PAY-2026-03-211', date: '24 mars 2026', montant: '3 500', methode: 'Orange Money', statut: 'Validé' },
  { ref: 'PAY-2026-02-194', date: '24 févr. 2026', montant: '3 500', methode: 'Espèces', statut: 'Validé' },
];

export default function CitoyenAbonnement() {
  return (
    <PortalShell portalKey="citoyen" user={DEMO_USERS.citoyen} currentPath="/citoyen/abonnement">
      <div className="space-y-6">
        <header>
          <h1>Mon abonnement</h1>
          <p className="text-body text-muted-foreground">
            Gestion de votre formule de collecte et historique de paiements.
          </p>
        </header>

        {/* Carte abonnement actif */}
        <section className="card-soft overflow-hidden bg-brand-gradient p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-small uppercase tracking-wider text-white/70">Formule active</p>
              <p className="text-h1-sm font-bold">Mensuel · 3 500 FCFA</p>
              <p className="mt-2 text-body-sm text-white/85">
                Valide jusqu'au <strong>24 juin 2026</strong> · prochain prélèvement automatique
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-outline border-white/40 bg-white/10 text-white hover:bg-white/20">
                <Calendar size={16} /> Renouveler maintenant
              </button>
              <button type="button" className="btn-outline border-white/40 bg-transparent text-white hover:bg-white/10">
                Changer de formule
              </button>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-white/20 pt-5 text-body-sm">
            <div>
              <dt className="text-white/70">Foyer</dt>
              <dd className="font-semibold">Famille TSANGA</dd>
            </div>
            <div>
              <dt className="text-white/70">Secteur</dt>
              <dd className="font-semibold">Nsam-Efoulan</dd>
            </div>
            <div>
              <dt className="text-white/70">QR Code</dt>
              <dd className="font-mono font-semibold">MKT-YDE3-NSAM-C0427</dd>
            </div>
          </dl>
        </section>

        {/* Choix de formules */}
        <section className="space-y-3">
          <h2>Changer ma formule</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {FORMULES.map((f) => (
              <article
                key={f.id}
                className={`card-soft relative p-5 ${f.current ? 'border-brand-green bg-brand-green/5' : ''}`}
              >
                {f.popular && (
                  <span className="absolute -top-3 right-4 rounded-full bg-brand-blue px-3 py-1 text-small font-semibold text-white">
                    Recommandée
                  </span>
                )}
                <p className="text-body-sm font-semibold text-muted-foreground">{f.label}</p>
                <p className="mt-1 text-h1-sm font-bold text-foreground">
                  {f.prix} <span className="text-body-sm font-normal text-muted-foreground">{f.sub}</span>
                </p>
                <ul className="mt-4 space-y-1.5 text-body-sm">
                  {f.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-brand-green" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={f.current}
                  className={`mt-5 w-full ${f.current ? 'btn-outline' : 'btn-primary'}`}
                >
                  {f.current ? 'Formule actuelle' : 'Choisir cette formule'}
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* Historique paiements */}
        <section className="card-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="m-0">Historique des paiements</h2>
              <p className="text-small text-muted-foreground">Téléchargeable au format PDF.</p>
            </div>
            <button type="button" className="btn-outline">
              <Download size={16} /> Exporter
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-muted text-left text-small uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Référence</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Montant</th>
                  <th className="px-5 py-3 font-medium">Méthode</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PAIEMENTS.map((p) => (
                  <tr key={p.ref} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-small text-muted-foreground">{p.ref}</td>
                    <td className="px-5 py-3">{p.date}</td>
                    <td className="px-5 py-3 font-semibold">{p.montant} FCFA</td>
                    <td className="px-5 py-3 flex items-center gap-1.5 text-muted-foreground">
                      <Smartphone size={14} /> {p.methode}
                    </td>
                    <td className="px-5 py-3">
                      <span className="badge-success">{p.statut}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" className="inline-flex items-center gap-1 text-brand-blue hover:underline">
                        <Receipt size={14} /> Reçu
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Moyens de paiement */}
        <section className="card-soft p-6">
          <h2>Moyens de paiement enregistrés</h2>
          <p className="text-body-sm text-muted-foreground">Pour le prélèvement automatique mensuel.</p>
          <ul className="mt-4 space-y-2">
            {[
              { label: 'MTN MoMo', num: '·· ·· ·· 4827', defaut: true },
              { label: 'Orange Money', num: '·· ·· ·· 1903', defaut: false },
            ].map((m) => (
              <li key={m.num} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-content-center rounded-md bg-brand-blue/10 text-brand-blue">
                    <Wallet size={18} />
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold">{m.label}</p>
                    <p className="text-small font-mono text-muted-foreground">{m.num}</p>
                  </div>
                </div>
                {m.defaut ? (
                  <span className="badge-success">Par défaut</span>
                ) : (
                  <button type="button" className="text-body-sm text-brand-blue hover:underline">
                    Définir par défaut
                  </button>
                )}
              </li>
            ))}
            <li>
              <button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-body-sm text-muted-foreground hover:border-brand-blue hover:text-brand-blue">
                + Ajouter un moyen de paiement <ChevronRight size={16} />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </PortalShell>
  );
}
