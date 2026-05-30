import {
  AlertTriangle,
  Calendar,
  Home,
  MessageSquare,
  QrCode,
  ShoppingBag,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { StatCard } from '@/components/stat-card';
import { getCurrentProfile } from '@/lib/get-profile';

const PROCHAINES_COLLECTES = [
  { date: 'Mardi 27 mai', creneau: 'Matin (06:00 - 09:00)', secteur: 'Nsam' },
  { date: 'Vendredi 30 mai', creneau: 'Matin (06:00 - 09:00)', secteur: 'Nsam' },
  { date: 'Mardi 03 juin', creneau: 'Matin (06:00 - 09:00)', secteur: 'Nsam' },
];

const ACTIVITES = [
  { date: 'Hier · 06:42', label: 'Collecte effectuée', detail: 'Scan QR par Agent #C-217', tag: 'success' as const },
  { date: '24 mai · 14:30', label: 'Paiement reçu', detail: 'Abonnement mensuel · 3 500 FCFA · MTN MoMo', tag: 'info' as const },
  { date: '22 mai · 09:10', label: 'Signalement traité', detail: 'Bac plein rue de la Joie · résolu', tag: 'success' as const },
  { date: '20 mai · 18:55', label: '+50 points', detail: 'Tri valorisé · 3 kg plastique', tag: 'warning' as const },
];

export default async function CitoyenDashboard() {
  const profile = await getCurrentProfile();
  const firstName = profile?.nom?.split(' ')[0] ?? '';

  return (
    <PortalShell portalKey="citoyen" currentPath="/citoyen">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>{firstName ? `Bonjour ${firstName} 👋` : 'Bonjour 👋'}</h1>
            <p className="text-body text-muted-foreground">
              Voici l'état de votre service de collecte cette semaine.
            </p>
          </div>
          <a href="/citoyen/signaler" className="btn-primary">
            <AlertTriangle size={16} /> Signaler un problème
          </a>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Wallet} label="Statut abonnement" value="À jour" accent="green" delta={{ value: 'Expire dans 18 j', positive: true }} />
          <StatCard icon={Home} label="Foyer enregistré" value="Nsam · Bloc C" accent="blue" />
          <StatCard icon={Calendar} label="Prochaine collecte" value="Mardi 27" accent="teal" delta={{ value: 'dans 1 jour' }} />
          <StatCard icon={Sparkles} label="Mes points écolo" value="1 240" accent="warning" delta={{ value: '+50 cette semaine', positive: true }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* QR Code */}
          <section className="card-soft p-6">
            <div className="flex items-center justify-between">
              <h2>Mon QR Code de service</h2>
              <a href="/citoyen/qr-code" className="text-body-sm font-medium text-brand-blue hover:underline">
                Imprimer
              </a>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              À afficher sur votre portail. Le collecteur le scanne à chaque passage.
            </p>
            <div className="mt-4 grid place-items-center rounded-xl border-2 border-dashed border-border bg-muted py-8">
              <div className="grid h-40 w-40 place-content-center rounded-md bg-foreground text-surface">
                <QrCode size={120} strokeWidth={1} />
              </div>
              <p className="mt-3 text-small uppercase tracking-wider text-muted-foreground">
                ID : MKT-YDE3-NSAM-C0427
              </p>
            </div>
          </section>

          {/* Prochaines collectes */}
          <section className="card-soft p-6">
            <h2>Prochaines collectes</h2>
            <p className="text-body-sm text-muted-foreground">Planifiées sur votre secteur.</p>
            <ul className="mt-4 space-y-3">
              {PROCHAINES_COLLECTES.map((c, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <span className="grid h-10 w-10 place-content-center rounded-md bg-brand-green/10 text-brand-green">
                    <Calendar size={18} />
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold">{c.date}</p>
                    <p className="text-small text-muted-foreground">{c.creneau}</p>
                    <p className="text-small text-muted-foreground">Secteur {c.secteur}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Activité */}
          <section className="card-soft p-6">
            <h2>Activité récente</h2>
            <ul className="mt-4 space-y-3">
              {ACTIVITES.map((a, i) => {
                const tagClass =
                  a.tag === 'success'
                    ? 'badge-success'
                    : a.tag === 'warning'
                      ? 'badge-warning'
                      : 'badge-info';
                return (
                  <li key={i} className="flex items-start gap-3">
                    <MessageSquare size={16} className="mt-1 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-body-sm font-semibold">{a.label}</p>
                        <span className={tagClass}>
                          {a.tag === 'success' ? '✓' : a.tag === 'warning' ? '★' : 'ℹ'}
                        </span>
                      </div>
                      <p className="text-small text-muted-foreground">{a.detail}</p>
                      <p className="text-small text-muted-foreground">{a.date}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Marketplace CTA */}
        <section className="card-soft overflow-hidden bg-gradient-to-r from-brand-green/15 to-brand-green-light/15 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2>Vos déchets ont de la valeur</h2>
              <p className="text-body-sm text-muted-foreground">
                Triez plastique, métal et carton — proposez-les à un recycleur partenaire et gagnez
                des points + de l'argent.
              </p>
            </div>
            <a href="/citoyen/marketplace" className="btn-primary">
              Voir la marketplace <ShoppingBag size={16} />
            </a>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
