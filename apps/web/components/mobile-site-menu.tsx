'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { Logo } from '@myklintown/ui';

interface MobileSiteMenuProps {
  nav: { href: string; label: string }[];
}

export function MobileSiteMenu({ nav }: MobileSiteMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Ouvrir le menu"
          className="grid h-10 w-10 place-content-center rounded-md text-foreground hover:bg-muted md:hidden"
        >
          <Menu size={22} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm md:hidden" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-[82vw] max-w-xs flex-col bg-surface shadow-elevated md:hidden">
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <div className="flex h-16 items-center justify-between border-b border-border px-5">
            <Logo size={32} />
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fermer"
                className="grid h-9 w-9 place-content-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-3 text-body-sm font-medium text-foreground hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="space-y-2 border-t border-border p-4">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="btn-outline w-full"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="btn-primary w-full"
            >
              S'inscrire
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
