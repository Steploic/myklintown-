import Link from 'next/link';
import { Logo } from '@myklintown/ui';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="container grid gap-10 py-12 md:grid-cols-4">
        <div className="space-y-3">
          <Logo size={32} />
          <p className="text-body-sm text-muted-foreground">
            Digitalisation de la chaîne de valeur de la gestion des déchets.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="text-h2-sm">Plateforme</h3>
          <ul className="space-y-1 text-body-sm text-muted-foreground">
            <li><Link href="/citoyen" className="hover:text-brand-blue">Portail Citoyen</Link></li>
            <li><Link href="/collecteur" className="hover:text-brand-blue">Portail Collecteur</Link></li>
            <li><Link href="/dashboard" className="hover:text-brand-blue">Dashboard Mairie</Link></li>
            <li><Link href="/enterprise" className="hover:text-brand-blue">Espace Partenaires</Link></li>
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-h2-sm">Société</h3>
          <ul className="space-y-1 text-body-sm text-muted-foreground">
            <li>Yaoundé III, Cameroun</li>
            <li>+237 6 53 56 53 48</li>
            <li>+237 6 90 77 76 63</li>
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-h2-sm">Ressources</h3>
          <ul className="space-y-1 text-body-sm text-muted-foreground">
            <li><Link href="/#contact" className="hover:text-brand-blue">Devenir partenaire</Link></li>
            <li><Link href="/legal" className="hover:text-brand-blue">Mentions légales</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container flex h-12 items-center justify-between text-small text-muted-foreground">
          <span>© {new Date().getFullYear()} MyKlinTown. Tous droits réservés.</span>
          <span>v0.1.0 · MVP</span>
        </div>
      </div>
    </footer>
  );
}
