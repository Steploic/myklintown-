import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { MobileSiteMenu } from './mobile-site-menu';

const NAV = [
  { href: '/#solution', label: 'Solution' },
  { href: '/#ecosysteme', label: 'Écosystème' },
  { href: '/#mairie', label: 'Pour la Mairie' },
  { href: '/#contact', label: 'Contact' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex items-center">
          <Logo size={36} />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-body-sm font-medium text-muted-foreground transition-colors hover:text-brand-blue"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* Desktop CTAs */}
          <Link href="/login" className="btn-outline hidden md:inline-flex">
            Connexion
          </Link>
          <Link href="/signup" className="btn-primary hidden md:inline-flex">
            S'inscrire
          </Link>
          {/* Mobile burger */}
          <MobileSiteMenu nav={NAV} />
        </div>
      </div>
    </header>
  );
}
