import { cn } from './utils';

interface LogoProps {
  className?: string;
  /** Hauteur du logo en px. */
  size?: number;
  /** true = logo horizontal (symbole + « MyKlinTown »). false = symbole seul. */
  showWordmark?: boolean;
  /**
   * - 'badge' (défaut) : version couleur, pour les fonds clairs.
   * - 'bare'  : version blanche monochrome, pour les fonds sombres (barre latérale).
   */
  variant?: 'badge' | 'bare';
}

// Assets dérivés du logo officiel (public/logo-myklintown.png) — voir public/brand/.
const HORIZONTAL = { couleur: '/brand/logo-horizontal.png', blanc: '/brand/logo-horizontal-blanc.png', ratio: 1569 / 400 };
const SYMBOLE = { couleur: '/brand/symbole.png', blanc: '/brand/symbole-blanc.png', ratio: 1 };

/** Logo MyKlinTown — charte V2. */
export function Logo({ className, size = 40, showWordmark = true, variant = 'badge' }: LogoProps) {
  const asset = showWordmark ? HORIZONTAL : SYMBOLE;
  const src = variant === 'bare' ? asset.blanc : asset.couleur;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt="MyKlinTown"
      width={Math.round(size * asset.ratio)}
      height={size}
      className={cn('shrink-0 select-none', className)}
      style={{ height: size, width: 'auto' }}
      draggable={false}
    />
  );
}
