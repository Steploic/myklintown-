/**
 * Règles métier pures (sans base, sans réseau) : testées unitairement.
 * Les Server Actions s'appuient dessus pour que la règle n'existe qu'à un endroit.
 */
import { ajouterJours, ajouterMois, dateFr, fcfa, statutAbonnement } from './format';
import type { ConsigneTerrain, GeoPolygon } from './types';

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

/**
 * Statut au scan : que doit faire l'agent devant ce portail ? Même règle que la
 * fonction SQL `consigne_terrain_calculee` (qui fait foi) : recopiée ici pour la
 * liste du jour affichée hors ligne. Un impayé couvert par des espèces déjà
 * remises à l'équipe (à valider par le gérant) est servi.
 */
export function consigneTerrain(statut: string, argent?: { reste?: number | null; aValider?: number | null }): ConsigneTerrain {
  if (statut === 'impaye' && argent) {
    const reste = Number(argent.reste ?? 0);
    if (reste > 0 && Number(argent.aValider ?? 0) >= reste) return 'servir_rappeler';
  }
  return ({ ok: 'servir', relance: 'servir_rappeler', stop: 'ne_pas_servir', neutre: 'verifier' } as const)[
    statutAbonnement(statut).terrain
  ];
}

/** Motif affiché à l'agent sous la consigne (null quand il n'y a rien à dire). */
export function motifTerrain(c: {
  statut_abonnement: string;
  consigne_terrain?: string | null;
  couverture_fin?: string | null;
  fin_grace?: string | null;
  plus_ancienne_echeance?: string | null;
  montant_impaye?: number | null;
}): string | null {
  const jour = (d: string | null | undefined) => dateFr(d, { day: 'numeric', month: 'long' });
  switch (c.statut_abonnement) {
    case 'grace':
      return c.fin_grace ? `Délai de grâce jusqu’au ${jour(c.fin_grace)} : dernier passage, rappeler le paiement` : 'Délai de grâce : dernier passage, rappeler le paiement';
    case 'impaye':
      if (c.consigne_terrain === 'servir_rappeler') return 'Espèces remises, en attente de validation par le gérant';
      return [
        c.plus_ancienne_echeance ? `Facture impayée depuis le ${jour(c.plus_ancienne_echeance)}` : 'Facture impayée',
        Number(c.montant_impaye) > 0 ? `${fcfa(Number(c.montant_impaye))} dus` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'expire':
      return c.couverture_fin ? `Abonnement terminé le ${jour(c.couverture_fin)}, délai de grâce écoulé` : 'Abonnement expiré';
    case 'suspendu':
      return 'Abonnement suspendu par le précollecteur';
    case 'echeance_proche':
      return c.couverture_fin ? `Abonnement payé jusqu’au ${jour(c.couverture_fin)}` : null;
    case 'sans_facture':
      return 'Aucune facture payée : à facturer';
    default:
      return null;
  }
}

/**
 * Chemin de retour acceptable pour une redirection : interne au site uniquement
 * (« /… », jamais « //autre-site » ni « https://… »). Évite les redirections ouvertes.
 */
export function cheminInterne(chemin: string | null | undefined): boolean {
  return !!chemin && /^\/(?![/\\])\S*$/.test(chemin);
}

/**
 * Nom harmonisé : espaces resserrés, « Initiale Majuscule » à chaque mot
 * (après un espace, un tiret ou une apostrophe). Même règle que la fonction SQL
 * `normaliser_nom` (initcap) : « BEKOLO », « motto » et « menage 2 » deviennent
 * « Bekolo », « Motto », « Menage 2 ». Retour à l'avis de l'équipe (R8).
 */
export function normaliserNom(nom: string | null | undefined): string {
  return (nom ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, avant: string, lettre: string) => avant + lettre.toUpperCase());
}
