import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import { Logo, cn } from '@myklintown/ui';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { PORTALS, type PortalKey, type PortalNavItem } from '@/lib/portal-config';
import { signOutAction } from '@/lib/auth-actions';
import { getCurrentProfile } from '@/lib/get-profile';

export type { PortalKey, PortalNavItem };

interface PortalShellProps {
  /**
   * Identifiant du portail — détermine la nav, le nom et le rôle affichés.
   * Les icônes Lucide restent dans portal-config et ne traversent jamais la
   * frontière server → client en tant que props (règle React 19 RSC).
   */
  portalKey: PortalKey;
  /** Fallback uniquement — le profil réel de l'utilisateur connecté est récupéré côté serveur. */
  user?: { nom: string; email: string; avatar_url?: string };
  /** Nom affiché sous le rôle (ex. nom de l'entreprise de précollecte). */
  titre?: string;
  currentPath: string;
  children: React.ReactNode;
}

function estActif(currentPath: string, href: string, racine: string) {
  if (href === racine) return currentPath === href;
  return currentPath === href || currentPath.startsWith(href + '/');
}

export async function PortalShell({ portalKey, user, titre, currentPath, children }: PortalShellProps) {
  const portal = PORTALS[portalKey];
  const profile = await getCurrentProfile();
  const display = profile ?? user ?? { nom: 'Utilisateur', email: '' };
  const racine = portal.nav[0]?.href ?? '/';
  const sousTitre = titre ?? display.nom;
  // Barre d'onglets mobile : les 4 destinations les plus fréquentes, au pouce.
  const onglets = portal.nav.slice(0, 4);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-brand-gradient-ink text-white lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" className="flex items-center gap-2.5 text-white" aria-label="Accueil MyKlinTown">
            <Logo size={30} showWordmark={false} variant="bare" />
            <span className="text-[1.15rem] font-bold tracking-tight">MyKlinTown</span>
          </Link>
        </div>
        <div className="mx-3 mb-2 rounded-lg bg-white/[0.06] px-3 py-3">
          <p className="text-small font-semibold uppercase tracking-wider text-brand-leaf">{portal.role}</p>
          <p className="truncate text-body-sm font-semibold">{sousTitre}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Navigation principale">
          {portal.nav.map((item) => {
            const Icon = item.icon;
            const actif = estActif(currentPath, item.href, racine);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-body-sm font-medium transition-colors',
                  actif ? 'bg-white/[0.12] text-white' : 'text-white/70 hover:bg-white/[0.06] hover:text-white',
                )}
              >
                {actif && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-brand-leaf" aria-hidden />}
                <Icon size={18} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="rounded-full bg-brand-green px-2 py-0.5 text-small font-semibold">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-3 px-3 py-2">
            <span className="grid h-8 w-8 shrink-0 place-content-center rounded-full bg-brand-leaf/20 text-small font-bold text-brand-leaf">
              {display.nom.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-body-sm font-medium">{display.nom}</span>
              <span className="block truncate text-small text-white/50">{display.email}</span>
            </span>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-body-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
          >
            <Settings size={18} aria-hidden /> Paramètres
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-body-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut size={18} aria-hidden /> Déconnexion
            </button>
          </form>
        </div>
      </aside>

      {/* Colonne principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur lg:hidden">
          <MobileNavDrawer portalKey={portalKey} currentPath={currentPath} userName={display.nom} titre={sousTitre} />
          <Link href="/" className="flex items-center" aria-label="Accueil">
            <Logo size={26} showWordmark={false} />
          </Link>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-small font-semibold uppercase tracking-wider text-brand-green">{portal.role}</p>
            <p className="truncate text-body-sm font-semibold text-brand-ink">{sousTitre}</p>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>

        {/* Onglets mobiles */}
        <nav
          aria-label="Navigation rapide"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          style={{ gridTemplateColumns: `repeat(${onglets.length}, minmax(0, 1fr))` }}
        >
          {onglets.map((item) => {
            const Icon = item.icon;
            const actif = estActif(currentPath, item.href, racine);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'flex min-h-[58px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold',
                  actif ? 'text-brand-green' : 'text-muted-foreground',
                )}
              >
                <Icon size={21} aria-hidden />
                <span className="w-full truncate text-center">{item.court ?? item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
