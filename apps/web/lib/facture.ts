/**
 * Facture conforme (migration 20261019000014) : numéros, TVA.
 *
 * Numéro par émetteur et par exercice, attribué par la base, sans trou :
 * F007-2026-00001 (préfixe de l'entreprise, année de Douala, rang) ;
 * démonstration : DEMO-F007-2026-00012, hors numérotation réelle.
 */

/** Numéros attribués avant la numérotation par émetteur (F2610-00042) : ils restent valables. */
export const ANCIEN_NUMERO = /^F\d{4}-\d{5}$/;

/** Numéro attribué par émetteur : préfixe, exercice, rang sur 5 chiffres. */
export const NUMERO_EMETTEUR = /^([A-Z0-9]{2,8})-(\d{4})-(\d{5,})$/;

/** Taux en pourcentage lisible (0,1925 → « 19,25 % »). */
export function tauxLisible(taux: number | string | null | undefined): string {
  const t = Number(taux ?? 0);
  return `${(t * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
}
