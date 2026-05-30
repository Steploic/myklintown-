'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { LogOut, Menu, Settings, X } from 'lucide-react';
import { Logo, cn } from '@myklintown/ui';
import { PORTALS, type PortalKey } from '@/lib/portal-config';
import { signOutAction } from '@/lib/auth-actions';

interface MobileNavDrawerProps {
  portalKey: PortalKey;
  currentPath: string;
  /** Nom réel de l'utilisateur connecté (fourni par PortalShell). */
  userName?: string;
}

/**
 * Drawer plein-écran qui s'ouvre depuis un bouton burger, visible uniquement sur
 * mobile / tablette (< lg). Récupère lui-même la config via portalKey pour
 * éviter de passer des icônes Lucide à travers la frontière server → client
 * (les composants ne sont pas sérialisables).
 */
export function MobileNavDrawer({ portalKey, currentPath, userName }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const portal = PORTALS[portalKey];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Ouvrir la navigation"
          className="grid h-10 w-10 place-content-center rounded-md text-foreground hover:bg-muted lg:hidden"
        >
          <Menu size={22} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-fade-in lg:hidden" />
        <Dialog.Content
          className={cn(
            'fixed left-0 top-0 z-50 flex h-full w-[82vw] max-w-xs flex-col bg-brand-blue text-white shadow-elevated lg:hidden',
            'data-[state=open]:animate-slide-up',
          )}
        >
          <Dialog.Title className="sr-only">Navigation {portal.name}</Dialog.Title>
          <Dialog.Description className="sr-only">{portal.role}</Dialog.Description>

          <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 text-white">
              <Logo size={28} showWordmark={false} variant="bare" />
              <span className="text-h2-sm font-semibold">MyKlinTown</span>
            </Link>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fermer"
                className="grid h-9 w-9 place-content-center rounded-md text-white/80 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-small uppercase tracking-wider text-white/60">{portal.role}</p>
            <p className="text-body-sm font-semibold">{userName ?? portal.name}</p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {portal.nav.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentPath === item.href || currentPath.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center justify-between rounded-md px-3 py-2.5 text-body-sm font-medium transition-colors',
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
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-body-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Settings size={18} aria-hidden /> Paramètres
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-body-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                <LogOut size={18} aria-hidden /> Déconnexion
              </button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
