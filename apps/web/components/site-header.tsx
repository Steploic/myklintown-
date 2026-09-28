import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { MobileSiteMenu } from './mobile-site-menu';

const NAV = [
  { href: '/#precollecteurs', label: 'Précollecteurs' },
  { href: '/#menages', label: 'Ménages' },
  { href: '/#mairies', label: 'Mairies' },
  { href: '/#tarifs', label: 'Tarifs' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-surface/85 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex items-center" aria-label="MyKlinTown — accueil">
          <Logo size={34} />
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Navigation du site">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-body-sm font-semibold text-muted-foreground transition-colors hover:text-brand-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost hidden md:inline-flex">
            Connexion
          </Link>
          <Link href="/signup?role=precollecteur" className="btn-primary hidden md:inline-flex">
            Créer mon espace
          </Link>
          <MobileSiteMenu nav={NAV} />
        </div>
      </div>
    </header>
  );
}
