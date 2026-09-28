import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export const metadata = { title: 'Mentions légales' };

export default function LegalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="container max-w-3xl flex-1 space-y-6 py-12">
        <header>
          <h1>Mentions légales</h1>
          <p className="mt-1 text-body text-muted-foreground">Dernière mise à jour : 28 septembre 2026 · phase pilote</p>
        </header>

        <section className="card-soft space-y-2 p-6">
          <h2>Éditeur</h2>
          <p className="text-body-sm">
            <strong>MyKlinTown</strong> — Yaoundé, Cameroun
            <br />
            Contact : +237 6 53 56 53 48 · +237 6 90 77 76 63
          </p>
        </section>

        <section className="card-soft space-y-2 p-6">
          <h2>Hébergement</h2>
          <p className="text-body-sm">
            Application : Vercel Inc. Base de données, authentification et stockage des preuves : Supabase.
          </p>
        </section>

        <section className="card-soft space-y-2 p-6">
          <h2>Données personnelles</h2>
          <p className="text-body-sm">
            Les données des ménages (nom, téléphone, adresse, position, abonnement, paiements, passages) sont
            collectées pour l’exécution du service de précollecte. Chaque précollecteur ne voit que ses propres
            clients. Les mairies n’accèdent qu’à des statistiques agrégées par zone, sans liste nominative.
            Les photos et vidéos de preuve sont stockées dans un espace privé et ne sont jamais publiques.
          </p>
          <p className="text-body-sm">
            Aucune donnée n’est cédée à un tiers commercial. Pour exercer vos droits d’accès, de rectification ou
            de suppression, contactez MyKlinTown aux numéros ci-dessus.
          </p>
        </section>

        <section className="card-soft space-y-2 p-6">
          <h2>Cookies</h2>
          <p className="text-body-sm">
            Seuls des cookies techniques nécessaires à la connexion sont utilisés. Aucun cookie publicitaire ni de
            traçage tiers.
          </p>
        </section>

        <section className="card-soft space-y-2 p-6">
          <h2>Propriété intellectuelle</h2>
          <p className="text-body-sm">
            Le code, la marque MyKlinTown, son logo et sa charte graphique sont la propriété de MyKlinTown. Toute
            reproduction non autorisée est interdite.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
