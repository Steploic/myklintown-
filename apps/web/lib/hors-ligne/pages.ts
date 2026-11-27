/**
 * Pages du terrain qui s'ouvrent SANS RÉSEAU.
 *
 * Le middleware marque leur réponse (`x-mkt-hors-ligne: 1`) ; le service worker
 * (public/sw.js) n'enregistre sur le téléphone que les pages ainsi marquées,
 * sous le compte qui les a ouvertes. Toute autre page reste en ligne seulement :
 * on ne garde sur un téléphone que ce dont l'équipe a besoin dans la rue.
 */
export const PAGES_HORS_LIGNE: readonly RegExp[] = [
  /^\/employe$/,
  /^\/employe\/tournees\/[0-9a-f-]{36}$/,
  /^\/precollecteur\/tournees$/,
  /^\/precollecteur\/tournees\/[0-9a-f-]{36}$/,
];

export function pageHorsLigne(pathname: string): boolean {
  return PAGES_HORS_LIGNE.some((r) => r.test(pathname));
}
