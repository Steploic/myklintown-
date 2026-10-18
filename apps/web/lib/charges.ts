/**
 * Charges d'exploitation mensuelles du précollecteur (table `couts_exploitation`).
 * Elles servent l'indicateur « coût de collecte par ménage servi » et le
 * critère C3 du pilote (livrable Technipole, chapitres 1.3 et 8).
 */

import { FUSEAU } from './format';

export type CategorieCharge = 'carburant' | 'entretien' | 'personnel' | 'autres';

export const CATEGORIES_CHARGES: { cle: CategorieCharge; label: string; aide: string }[] = [
  { cle: 'carburant', label: 'Carburant', aide: 'Essence ou gasoil des tricycles.' },
  { cle: 'entretien', label: 'Entretien et réparations', aide: 'Pneus, vidange, pièces, garage.' },
  { cle: 'personnel', label: 'Équipe', aide: 'Salaires, primes et indemnités des chauffeurs et ramasseurs.' },
  { cle: 'autres', label: 'Autres charges', aide: 'Sacs, gants, crédit téléphone, location, taxes…' },
];

/** Plafond par poste et par mois (garde-fou de saisie, identique à la base). */
export const MONTANT_MAX = 100_000_000;

/** « 30 000 », « 30000 », « 30.000 FCFA » → 30000 ; vide → null ; illisible (« 1,5 ») → NaN. */
export function lireMontant(brut: string | null | undefined): number | null {
  let s = String(brut ?? '').replace(/[\s  ]/g, '').replace(/fcfa$/i, '');
  if (s === '') return null;
  // Le point n'est accepté que comme séparateur de milliers : « 1.5 » est refusé, pas lu 15.
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** Mois en cours à Yaoundé, « AAAA-MM ». */
export function moisCourant(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit' }).format(maintenant);
}

/** Mois saisissable : bien formé, pas dans le futur. */
export function moisValide(mois: string | null | undefined, maintenant: Date = new Date()): mois is string {
  return !!mois && /^\d{4}-(0[1-9]|1[0-2])$/.test(mois) && mois <= moisCourant(maintenant);
}

/** Les `n` derniers mois, du plus récent au plus ancien. */
export function derniersMois(n: number, maintenant: Date = new Date()): string[] {
  const courant = moisCourant(maintenant);
  const a = Number(courant.slice(0, 4));
  const m = Number(courant.slice(5, 7));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Dernier jour du mois « AAAA-MM », « AAAA-MM-JJ ». */
export function finDeMois(mois: string): string {
  return new Date(Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0)).toISOString().slice(0, 10);
}
