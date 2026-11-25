/**
 * Planche d'impression des étiquettes QR, pour l'imprimeur (vinyle
 * autocollant facturé au m²) : étiquettes de 10 × 15 cm espacées de 0,5 cm,
 * une page du PDF = 1 m². Toutes les mesures sont en millimètres.
 */
export interface FormatPlanche {
  /** Côté de la page carrée (1 m² = 1000 mm). */
  page: number;
  largeur: number;
  hauteur: number;
  ecart: number;
}

export const FORMAT_IMPRIMEUR: FormatPlanche = { page: 1000, largeur: 100, hauteur: 150, ecart: 5 };

export interface Disposition {
  colonnes: number;
  rangees: number;
  parPage: number;
  /** Marges pour centrer la grille sur la page (le reste est réparti des deux côtés). */
  margeX: number;
  margeY: number;
}

/** Combien d'étiquettes tiennent sur une page, et où commence la grille. */
export function disposition(f: FormatPlanche = FORMAT_IMPRIMEUR): Disposition {
  const colonnes = Math.max(0, Math.floor((f.page + f.ecart) / (f.largeur + f.ecart)));
  const rangees = Math.max(0, Math.floor((f.page + f.ecart) / (f.hauteur + f.ecart)));
  const occupeX = colonnes * f.largeur + Math.max(0, colonnes - 1) * f.ecart;
  const occupeY = rangees * f.hauteur + Math.max(0, rangees - 1) * f.ecart;
  return { colonnes, rangees, parPage: colonnes * rangees, margeX: (f.page - occupeX) / 2, margeY: (f.page - occupeY) / 2 };
}

/** Découpe une liste en pages de `parPage` éléments. */
export function enPages<T>(elements: T[], parPage: number): T[][] {
  if (parPage <= 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < elements.length; i += parPage) pages.push(elements.slice(i, i + parPage));
  return pages;
}

/** Lit un format depuis l'adresse (?largeur=…), dans des bornes raisonnables ; sinon le format de l'imprimeur. */
export function formatDepuis(params: Record<string, string | undefined>): FormatPlanche {
  const lire = (cle: keyof FormatPlanche, min: number, max: number) => {
    const v = Number(params[cle]);
    return Number.isFinite(v) && v >= min && v <= max ? v : FORMAT_IMPRIMEUR[cle];
  };
  return { page: lire('page', 200, 1500), largeur: lire('largeur', 40, 300), hauteur: lire('hauteur', 40, 300), ecart: lire('ecart', 0, 50) };
}
