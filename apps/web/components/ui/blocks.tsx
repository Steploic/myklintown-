import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@myklintown/ui';

export function PageHeader({
  titre,
  sousTitre,
  retour,
  actions,
}: {
  titre: string;
  sousTitre?: React.ReactNode;
  retour?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {retour && (
          <Link href={retour.href} className="mb-1 inline-block text-body-sm font-medium text-brand-blue hover:underline">
            ← {retour.label}
          </Link>
        )}
        <h1>{titre}</h1>
        {sousTitre && <p className="mt-1 text-body text-muted-foreground">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Kpi({
  label,
  valeur,
  detail,
  icon: Icon,
  ton = 'neutre',
  href,
}: {
  label: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  icon?: LucideIcon;
  ton?: 'neutre' | 'ok' | 'relance' | 'stop' | 'info';
  href?: string;
}) {
  const tons = {
    neutre: 'bg-muted text-brand-ink',
    ok: 'bg-terrain-ok/10 text-terrain-ok',
    relance: 'bg-terrain-relance/10 text-terrain-relance',
    stop: 'bg-terrain-stop/10 text-terrain-stop',
    info: 'bg-brand-blue/10 text-brand-blue',
  };
  const contenu = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-body-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('grid h-9 w-9 shrink-0 place-content-center rounded-lg', tons[ton])}>
            <Icon size={18} aria-hidden />
          </span>
        )}
      </div>
      <p className="num mt-1 text-[1.75rem] font-bold leading-none text-brand-ink">{valeur}</p>
      {detail && <p className="mt-2 text-small text-muted-foreground">{detail}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card-soft block p-4 transition-shadow hover:shadow-elevated">
      {contenu}
    </Link>
  ) : (
    <div className="card-soft p-4">{contenu}</div>
  );
}

export function Section({
  titre,
  sousTitre,
  actions,
  children,
  className,
  flush,
}: {
  titre?: string;
  sousTitre?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Pas de marge interne (pour un tableau bord à bord). */
  flush?: boolean;
}) {
  return (
    <section className={cn('card-soft', className)}>
      {(titre || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            {titre && <h2 className="text-h2-sm">{titre}</h2>}
            {sousTitre && <p className="text-body-sm text-muted-foreground">{sousTitre}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  titre,
  texte,
  action,
}: {
  icon: LucideIcon;
  titre: string;
  texte?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="relative mb-4 grid h-14 w-14 place-content-center rounded-2xl bg-brand-green/10 text-brand-green">
        <Icon size={26} aria-hidden />
        <PixelDots className="absolute -left-5 -top-2" />
      </span>
      <p className="text-h2-sm font-semibold text-brand-ink">{titre}</p>
      {texte && <p className="mt-1 max-w-md text-body-sm text-muted-foreground">{texte}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Motif signature : quelques pixels qui s'échappent, comme dans le logo. */
export function PixelDots({ className }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className={className}>
      <rect x="0" y="4" width="4" height="4" fill="#2B6CB0" opacity="0.85" />
      <rect x="6" y="0" width="3" height="3" fill="#2B6CB0" opacity="0.6" />
      <rect x="5" y="10" width="3" height="3" fill="#2E7F8E" opacity="0.55" />
      <rect x="11" y="5" width="2" height="2" fill="#2E7F8E" opacity="0.45" />
    </svg>
  );
}
