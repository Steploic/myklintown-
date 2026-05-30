import { cn } from './utils';

interface LogoProps {
  className?: string;
  /** Hauteur du logo en px. Largeur calculée selon l'aspect ratio (2136×1868 → ~1.14). */
  size?: number;
  /** true = symbole + wordmark MyKlinTown. false = symbole seul (carré). */
  showWordmark?: boolean;
  /**
   * - 'badge' (défaut) : affichage direct sans container — le fond blanc du PNG
   *   se fond sur les surfaces claires (header, cartes, login).
   * - 'bare'  : container blanc arrondi — à utiliser sur les surfaces sombres
   *   (sidebar brand-blue, drawer mobile) pour délimiter le logo.
   */
  variant?: 'badge' | 'bare';
}

// Aspect ratio du PNG source : 2136 × 1868
const ASPECT = 2136 / 1868;

const SRC = '/logo-myklintown.png';

/**
 * Logo MyKlinTown — utilise l'asset officiel /public/logo-myklintown.png.
 *
 * Le PNG est sur fond blanc.
 * - variant="badge" (défaut) : affichage direct, sans container — le fond blanc
 *   se fond naturellement sur les surfaces claires (header, login).
 * - variant="bare" : enveloppe dans un container blanc arrondi avec léger padding
 *   pour les surfaces sombres (sidebar brand-blue, drawer mobile).
 */
export function Logo({
  className,
  size = 40,
  showWordmark = true,
  variant = 'badge',
}: LogoProps) {
  const height = size;
  const width = showWordmark ? Math.round(size * ASPECT) : size;

  // Pour la version "symbole seul", on crop l'image sur sa partie centrale-haute
  // où se trouve le symbole circulaire (globe/feuille) via object-position.
  const imgStyle: React.CSSProperties = showWordmark
    ? { width: '100%', height: '100%', objectFit: 'contain' }
    : {
        width: '100%',
        height: 'auto',
        objectFit: 'cover',
        objectPosition: 'center 30%',
        aspectRatio: '1 / 1',
      };

  const inner = (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={SRC}
      alt="MyKlinTown"
      style={imgStyle}
      className={cn(showWordmark ? '' : 'h-full w-full')}
    />
  );

  // Bare : container blanc arrondi pour les surfaces sombres (sidebar, drawer)
  if (variant === 'bare') {
    return (
      <div
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 shadow-soft',
          className,
        )}
        style={{ width, height }}
      >
        {inner}
      </div>
    );
  }

  // Badge (défaut) : pas de container — le fond blanc du PNG se fond sur surfaces claires
  return (
    <div
      className={cn('inline-block overflow-hidden', className)}
      style={{ width, height }}
    >
      {inner}
    </div>
  );
}
