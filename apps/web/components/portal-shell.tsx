import Link from 'next/link';
import { Bell, LogOut, Settings } from 'lucide-react';
import { Logo, cn } from '@myklintown/ui';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { PORTALS, type PortalKey, type PortalNavItem } from '@/lib/portal-config';
import { signOutAction } from '@/lib/auth-actions';

export type { PortalKey, PortalNavItem };

interface PortalShellProps {
  /**
   * Identifiant du portail — détermine la nav, le nom et le rôle affichés.
   * Les icônes Lucide restent dans portal-config et ne traversent jamais la
   * frontière server → client en tant que props (règle React 19 RSC).
   */
  portalKey: PortalKey;
  user: { nom: string; email: string; avatar_url?: string };
  currentPath: string;
  children: React.ReactNode;
}

export function PortalShell({ portalKey, user, currentPath, children }: PortalShellProps) {
  const portal = PORTALS[portalKey];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-blue text-white lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-6">
          <Link href="/" className="flex items-center gap-2 text-white">
            <Logo size={32} showWordmark={false} variant="bare" />
            <span className="text-h2-sm font-semibold">MyKlinTown</span>
          </Link>
        </div>
        <div className="border-b border-white/10 px-6 py-4">
          <p className="text-small uppercase tracking-wider text-white/60">{portal.role}</p>
          <p className="text-body-sm font-semibold">{portal.name}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {portal.nav.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPath === item.href || currentPath.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center justify-between rounded-md px-3 py-2 text-body-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/15 text-white shadow-soft'
                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} aria-hidden />
                  {item.label}
                </span>
                {item.badge !== undefined && (
                  <span className="rounded-full bg-brand-green px-2 py-0.5 text-small font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-body-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Settings size={18} aria-hidden /> Paramètres
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-body-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={18} aria-hidden /> Déconnexion
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNavDrawer portalKey={portalKey} currentPath={currentPath} />
            <Link href="/" className="flex items-center lg:hidden">
              <Logo size={28} showWordmark={false} variant="badge" />
            </Link>
            <div className="hidden min-w-0 lg:block">
              <p className="text-small uppercase tracking-wider text-muted-foreground">{portal.role}</p>
              <p className="truncate text-h2-sm font-semibold">{portal.name}</p>
            </div>
            <div className="min-w-0 lg:hidden">
              <p className="truncate text-small font-semibold uppercase tracking-wider text-muted-foreground">
                {portal.role.replace('Portail ', '').replace('Espace ', '')}
              </p>
              <p className="truncate text-body-sm font-semibold">{portal.name}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="relative grid h-9 w-9 place-content-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
            </button>
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-1 sm:p-1.5 lg:px-3 lg:py-1.5">
              <div className="grid h-8 w-8 place-content-center rounded-full bg-brand-gradient text-small font-semibold text-white">
                {user.nom.slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden text-body-sm leading-tight lg:block">
                <p className="font-medium">{user.nom}</p>
                <p className="truncate text-small text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
