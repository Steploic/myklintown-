import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { SiteFooter } from '@/components/site-footer';

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/">
            <Logo size={36} />
          </Link>
        </div>
      </header>

      <main className="container max-w-3xl space-y-8 py-12">
        <header>
          <h1>Mentions légales</h1>
          <p className="text-body text-muted-foreground">
            Dernière mise à jour : 27 mai 2026
          </p>
        </header>

        <section className="card-soft space-y-3 p-6">
          <h2>Éditeur</h2>
          <p className="text-body-sm">
            <strong>MyKlinTown</strong> — Yaoundé, Cameroun
            <br />
            Contact : +237 6 53 56 53 48 · +237 6 90 77 76 63
          </p>
        </section>

        <section className="card-soft space-y-3 p-6">
          <h2>Hébergement</h2>
          <p className="text-body-sm">
            Vercel Inc. (frontend) et Supabase (backend, base de données et stockage).
            Les données sont hébergées dans des centres de données conformes au RGPD.
          </p>
        </section>

        <section className="card-soft space-y-3 p-6">
          <h2>Propriété intellectuelle</h2>
          <p className="text-body-sm">
            L'ensemble du code source, des algorithmes (notamment l'algorithme VRP d'optimisation
            des tournées) et des éléments graphiques (charte V1.0, logo) sont la propriété
            exclusive de MyKlinTown. Toute reproduction ou exploitation non autorisée est interdite.
          </p>
          <p className="text-body-sm">
            Le partenariat avec la Mairie de Yaoundé III repose sur un modèle de licence
            d'exploitation, la Mairie restant propriétaire des infrastructures physiques.
          </p>
        </section>

        <section className="card-soft space-y-3 p-6">
          <h2>Protection des données</h2>
          <p className="text-body-sm">
            Les données personnelles des ménages (nom, téléphone, localisation GPS, historique de
            collecte) sont collectées exclusivement pour l'exécution du service de gestion des
            déchets. Elles ne sont jamais cédées à un tiers commercial sans consentement explicite.
          </p>
          <p className="text-body-sm">
            Chaque utilisateur peut exercer son droit d'accès, de rectification et de suppression
            en contactant <a href="mailto:privacy@myklintown.cm" className="text-brand-blue hover:underline">privacy@myklintown.cm</a>.
          </p>
        </section>

        <section className="card-soft space-y-3 p-6">
          <h2>Cookies</h2>
          <p className="text-body-sm">
            Le site utilise uniquement des cookies techniques nécessaires au fonctionnement
            (session, préférences). Aucun cookie tiers de traçage publicitaire n'est déposé.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
