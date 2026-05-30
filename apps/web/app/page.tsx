import Link from 'next/link';
import {
  Building2,
  Recycle,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  QrCode,
  MapPin,
  Leaf,
  ArrowRight,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

const PORTAILS = [
  {
    href: '/citoyen',
    label: 'Citoyen',
    description:
      'Abonnement, QR code de service, signalement de bac plein, marketplace et points écologiques.',
    icon: Users,
    accent: 'from-brand-green/15 to-brand-green/5',
  },
  {
    href: '/collecteur',
    label: 'Collecteur',
    description:
      'Tournée GPS optimisée, scan QR offline, signalement d\'incident, rapport QHSE en fin de service.',
    icon: Truck,
    accent: 'from-brand-blue/15 to-brand-blue/5',
  },
  {
    href: '/dashboard',
    label: 'Mairie',
    description:
      'Vue carte temps réel de Yaoundé III, KPIs, taux de couverture, recouvrement et gestion CRM.',
    icon: Building2,
    accent: 'from-brand-teal/15 to-brand-teal/5',
  },
  {
    href: '/enterprise',
    label: 'Partenaire B2B',
    description:
      'Accès aux centres de tri partenaires, suivi du stock transformé et marketplace vendeur B2B.',
    icon: Recycle,
    accent: 'from-brand-green-light/20 to-brand-green-light/5',
  },
];

const KPIS = [
  { label: 'Ménages potentiels Yaoundé III', value: '100 000+', icon: Users },
  { label: 'Tonnes/jour à orchestrer', value: '300+', icon: Truck },
  { label: 'Réduction carburant visée', value: '20 %', icon: Leaf },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-brand-gradient-soft" aria-hidden />
        <div className="container relative grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div className="space-y-6">
            <span className="badge-info">Partenariat technologique · Mairie de Yaoundé III</span>
            <h1 className="text-h1-sm md:text-h1 text-brand-blue">
              L'intelligence numérique au service de la <span className="text-brand-green">propreté urbaine</span>.
            </h1>
            <p className="text-body text-muted-foreground">
              MyKlinTown orchestre la chaîne de valeur complète de la gestion des déchets — de la
              pré-collecte chez les ménages jusqu'à la transformation en granulés revendus aux
              recycleurs industriels.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className="btn-primary">
                Accéder à la plateforme <ArrowRight size={16} />
              </Link>
              <Link href="/#solution" className="btn-outline">
                Découvrir la solution
              </Link>
            </div>
            <dl className="grid grid-cols-3 gap-6 pt-6">
              {KPIS.map(({ label, value, icon: Icon }) => (
                <div key={label} className="space-y-1">
                  <Icon className="text-brand-green" size={20} />
                  <p className="text-h2-sm font-bold text-brand-blue">{value}</p>
                  <p className="text-small text-muted-foreground">{label}</p>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="card-soft h-full bg-gradient-to-br from-brand-blue to-brand-teal p-1">
              <div className="rounded-[14px] bg-surface p-6">
                <p className="text-small uppercase tracking-wider text-muted-foreground">
                  Aperçu temps réel
                </p>
                <p className="text-h2-sm font-semibold">Yaoundé III · ce matin</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-small text-muted-foreground">Tournées actives</p>
                    <p className="text-h2 font-bold text-brand-blue">7</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-small text-muted-foreground">Ménages collectés</p>
                    <p className="text-h2 font-bold text-brand-green">2 184</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-small text-muted-foreground">Tonnage</p>
                    <p className="text-h2 font-bold text-brand-teal">14,2 t</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-small text-muted-foreground">Signalements</p>
                    <p className="text-h2 font-bold text-warning">3</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-brand-green/10 px-3 py-2 text-body-sm text-brand-green">
                  <ShieldCheck size={16} /> Taux de couverture : 94 % · Recouvrement : 91 %
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section id="solution" className="container space-y-12 py-20">
        <div className="max-w-3xl space-y-3">
          <span className="badge-success">Notre solution</span>
          <h2 className="text-h1-sm md:text-h1 text-foreground">
            Une infrastructure numérique qui pilote l'infrastructure physique.
          </h2>
          <p className="text-body text-muted-foreground">
            Quatre portails, une seule base de données, des données temps réel partagées entre la
            Mairie, les éboueurs, les ménages et les recycleurs.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PORTAILS.map(({ href, label, description, icon: Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className={`card-soft group relative overflow-hidden bg-gradient-to-br ${accent} p-6 transition-shadow hover:shadow-elevated`}
            >
              <Icon className="text-brand-blue" size={28} aria-hidden />
              <h3 className="mt-4 text-h2-sm">Portail {label}</h3>
              <p className="mt-2 text-body-sm text-muted-foreground">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-body-sm font-semibold text-brand-blue group-hover:gap-2 group-hover:transition-all">
                Accéder <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ECOSYSTEME */}
      <section id="ecosysteme" className="border-y border-border bg-surface py-20">
        <div className="container space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="badge-info">Écosystème intégré</span>
            <h2 className="text-h1-sm md:text-h1 text-foreground">De la poubelle au granulé</h2>
            <p className="text-body text-muted-foreground">
              Chaque kilo collecté est tracé : du scan QR du collecteur, jusqu'à la pesée à
              l'entrepôt, jusqu'à la vente sur la marketplace.
            </p>
          </div>

          <ol className="grid gap-5 md:grid-cols-5">
            {[
              { icon: QrCode, title: '1. Identification', desc: 'QR code sur portail du ménage' },
              { icon: Truck, title: '2. Collecte', desc: 'Tournée GPS optimisée VRP' },
              { icon: MapPin, title: '3. Tracking', desc: 'Boîtier GPS indépendant camion' },
              { icon: Wallet, title: '4. Paiement', desc: 'Mobile Money intégré' },
              { icon: Recycle, title: '5. Valorisation', desc: 'Marketplace recycleurs' },
            ].map(({ icon: Icon, title, desc }) => (
              <li key={title} className="card-soft p-5">
                <Icon className="text-brand-green" size={24} aria-hidden />
                <p className="mt-3 text-h2-sm">{title}</p>
                <p className="mt-1 text-body-sm text-muted-foreground">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* MAIRIE */}
      <section id="mairie" className="container space-y-8 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="space-y-5">
            <span className="badge-info">Pour la Mairie</span>
            <h2 className="text-h1-sm md:text-h1">Devenir un opérateur économique majeur</h2>
            <p className="text-body text-muted-foreground">
              La Mairie reste propriétaire de l'infrastructure physique et des partenariats.
              MyKlinTown apporte la technologie sous forme de licence d'exploitation —
              plateforme toujours à jour, sécurisée et maintenue par nos ingénieurs.
            </p>
            <ul className="space-y-2 text-body-sm">
              {[
                'Réduction de 20 % des coûts de carburant grâce à l\'optimisation VRP.',
                'Recouvrement automatisé via Mobile Money (MTN MoMo, Orange Money).',
                'Traçabilité légale des volumes entrants et sortants en entrepôt.',
                'Indicateurs ESG pour les bailleurs : tonnage évité, GES réduits.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-soft space-y-4 p-8">
            <h3 className="text-h2-sm">Modèle de partenariat</h3>
            <div className="space-y-3 text-body-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Mairie</span>
                <span className="font-medium">Infrastructures physiques</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">MyKlinTown</span>
                <span className="font-medium">Code, algorithmes, IP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modèle économique</span>
                <span className="font-medium">Licence ou commission au volume</span>
              </div>
            </div>
            <Link href="/#contact" className="btn-primary w-full">
              Demander une démonstration
            </Link>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="bg-brand-gradient py-20 text-white">
        <div className="container max-w-3xl space-y-5 text-center">
          <h2 className="text-h1-sm md:text-h1 text-white">Discutons de votre commune.</h2>
          <p className="text-body text-white/85">
            Mairies, structures de pré-collecte, écoles, entreprises productrices de déchets —
            contactez-nous pour évaluer ensemble le déploiement sur votre territoire.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="tel:+237653565348" className="btn-outline border-white/40 bg-white/10 text-white hover:bg-white/20">
              +237 6 53 56 53 48
            </a>
            <a href="tel:+237690777663" className="btn-outline border-white/40 bg-white/10 text-white hover:bg-white/20">
              +237 6 90 77 76 63
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
