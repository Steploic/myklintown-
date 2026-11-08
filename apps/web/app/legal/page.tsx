import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { CONTACT } from '@/lib/contact';

export const metadata = { title: 'Mentions légales' };

export default function LegalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="container max-w-3xl flex-1 space-y-6 py-12">
        <header>
          <h1>Mentions légales</h1>
          <p className="mt-1 text-body text-muted-foreground">Dernière mise à jour : 9 novembre 2026</p>
        </header>

        <section className="card-soft space-y-2 p-6">
          <h2>Éditeur</h2>
          <p className="text-body-sm">
            <strong>MyKlinTown</strong> — Yaoundé, Cameroun
            <br />
            Appels : {CONTACT.appels.join(' · ')}
            <br />
            WhatsApp : {CONTACT.whatsapp} · E-mail : {CONTACT.email}
          </p>
        </section>

        <section className="card-soft space-y-2 p-6">
          <h2>Hébergement</h2>
          <p className="text-body-sm">
            Application : Vercel Inc. Base de données, authentification et stockage des preuves : Supabase.
          </p>
        </section>

        <section className="card-soft space-y-2 p-6">
          <h2>Charte et contrat de l’abonné</h2>
          <p className="text-body-sm">
            L’abonné accepte la charte de l’abonné et le contrat d’abonnement, en ligne ou sur papier remis par son
            précollecteur. Chaque acceptation est enregistrée avec sa date et la version acceptée.
          </p>
          <ul className="flex flex-wrap gap-2 text-body-sm">
            <li><Link href="/legal/charte" className="btn-outline">Charte de l’abonné</Link></li>
            <li><Link href="/legal/contrat" className="btn-outline">Contrat d’abonnement</Link></li>
          </ul>
        </section>

        <section className="card-soft space-y-2 p-6">
          <h2>Données personnelles</h2>
          <p className="text-body-sm">
            Les données des abonnés (nom, téléphone, adresse, position, abonnement, paiements, passages) sont
            collectées pour l’exécution du service de précollecte. Chaque précollecteur ne voit que ses propres
            clients. Les mairies n’accèdent qu’à des statistiques agrégées par zone, sans liste nominative.
            Les photos et vidéos de preuve sont stockées dans un espace privé et ne sont jamais publiques.
          </p>
          <p className="text-body-sm">
            Aucune donnée n’est cédée à un tiers commercial. Pour exercer vos droits d’accès, de rectification ou
            de suppression, contactez MyKlinTown par e-mail, par WhatsApp ou aux numéros ci-dessus.
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
