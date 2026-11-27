/**
 * Accompagnement des précollecteurs vers la conformité (migration 20261127000029).
 *
 * Seuls des précollecteurs habilités sont présentés aux abonnés (0028) : le
 * gérant à qui il manque une pièce demande de l'aide depuis son dossier, et
 * l'équipe MyKlinTown suit sa demande. Déposer la pièce au dossier clôt la
 * demande d'elle-même (« obtenue »).
 */

export type EtapeConformite = 'structure' | 'niu' | 'autorisation' | 'permis';
export type StatutAccompagnement = 'demande' | 'contacte' | 'en_cours' | 'obtenue' | 'close';

export const ETAPES_CONFORMITE: { cle: EtapeConformite; titre: string; aide: string }[] = [
  { cle: 'structure', titre: 'Créer une structure légale', aide: 'GIC, association, entreprise individuelle ou société : la forme qui convient à votre activité.' },
  { cle: 'niu', titre: 'Obtenir le NIU', aide: 'Le numéro d’identifiant unique de votre structure.' },
  { cle: 'autorisation', titre: 'Autorisation de la commune', aide: 'Pour chaque commune où vous collectez.' },
  { cle: 'permis', titre: 'Permis environnemental', aide: 'Le permis en matière de gestion des déchets.' },
];

export function titreEtape(etape: string): string {
  return ETAPES_CONFORMITE.find((e) => e.cle === etape)?.titre ?? etape;
}

/** Une demande encore à traiter. */
export const STATUTS_OUVERTS: readonly StatutAccompagnement[] = ['demande', 'contacte', 'en_cours'];

export function estOuverte(statut: string): boolean {
  return (STATUTS_OUVERTS as readonly string[]).includes(statut);
}

/** Ce que lit le gérant. */
export const STATUT_POUR_GERANT: Record<StatutAccompagnement, { label: string; chip: string }> = {
  demande: { label: 'Demande envoyée', chip: 'chip-neutre' },
  contacte: { label: 'L’équipe vous a contacté', chip: 'chip-relance' },
  en_cours: { label: 'Démarches en cours', chip: 'chip-relance' },
  obtenue: { label: 'Obtenue', chip: 'chip-ok' },
  close: { label: 'Close', chip: 'chip-neutre' },
};

/** Ce que lit l'équipe MyKlinTown. */
export const STATUT_POUR_EQUIPE: Record<StatutAccompagnement, string> = {
  demande: 'Nouvelle demande',
  contacte: 'Contacté',
  en_cours: 'Démarches en cours',
  obtenue: 'Pièce obtenue',
  close: 'Close',
};

export interface Accompagnement {
  id: string;
  etape: EtapeConformite;
  commune_id: string | null;
  statut: StatutAccompagnement;
  message: string | null;
  message_equipe: string | null;
  created_at: string;
  updated_at: string;
}
