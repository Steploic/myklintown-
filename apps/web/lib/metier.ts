/**
 * Règles métier pures (sans base, sans réseau) : testées unitairement.
 * Les Server Actions s'appuient dessus pour que la règle n'existe qu'à un endroit.
 */
import { ajouterJours, ajouterMois, statutAbonnement } from './format';
import type { GeoPolygon } from './types';

/**
 * Période couverte par la prochaine facture.
 *
 * Paiement avant service : la période démarre aujourd'hui, ou au lendemain de
 * la couverture précédente si celle-ci court encore (pas de jours perdus, pas
 * de chevauchement). L'échéance laisse `grace` jours pour régler.
 */
export function periodeFacture(p: {
  aujourdhui: string;
  finPrecedente?: string | null;
  dureeMois: number;
  grace: number;
}): { debut: string; fin: string; echeance: string } {
  const lendemain = p.finPrecedente ? ajouterJours(p.finPrecedente, 1) : p.aujourdhui;
  const debut = lendemain > p.aujourdhui ? lendemain : p.aujourdhui;
  const fin = ajouterJours(ajouterMois(debut, p.dureeMois), -1);
  return { debut, fin, echeance: ajouterJours(debut, p.grace) };
}

/**
 * Code client lu par le scanner. Tolère un QR contenant une URL
 * (…/MKT-XXXX…), des espaces et des minuscules.
 */
export function extraireCodeClient(texte: string): string {
  const t = texte.trim().toUpperCase();
  const m = t.match(/MKT-[A-Z0-9]+/);
  return m ? m[0] : t;
}

/**
 * Points [lat, lng] saisis sur la carte → polygone GeoJSON fermé ([lng, lat]).
 * `null` s'il n'y a pas au moins 3 sommets distincts.
 */
export function contourDepuisPoints(points: [number, number][]): GeoPolygon | null {
  const distincts = points.filter(
    (p, i) => points.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i,
  );
  if (distincts.length < 3) return null;
  const anneau = distincts.map(([lat, lng]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))] as [number, number]);
  anneau.push([anneau[0]![0], anneau[0]![1]]);
  return { type: 'Polygon', coordinates: [anneau] };
}

/** Statut au scan : que doit faire l'agent devant ce portail ? */
export function consigneTerrain(statut: string): 'servir' | 'servir_rappeler' | 'ne_pas_servir' | 'verifier' {
  return ({ ok: 'servir', relance: 'servir_rappeler', stop: 'ne_pas_servir', neutre: 'verifier' } as const)[
    statutAbonnement(statut).terrain
  ];
}

/**
 * Chemin de retour acceptable pour une redirection : interne au site uniquement
 * (« /… », jamais « //autre-site » ni « https://… »). Évite les redirections ouvertes.
 */
export function cheminInterne(chemin: string | null | undefined): boolean {
  return !!chemin && /^\/(?![/\\])\S*$/.test(chemin);
}
