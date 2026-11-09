/**
 * Demande de devis (migration 20261110000018), d'après la fiche de l'équipe
 * « Formulaires de devis » (docs/produit/Formulaires_Devis_Producteurs.md) :
 * un tronc commun pour tous, puis les questions propres à chaque catégorie.
 *
 * Partagé entre le formulaire (navigateur), l'action serveur qui le valide et
 * la fiche que lit le précollecteur : une seule liste des questions.
 */
import { fcfa } from './format';

export type Categorie = 'residentiel' | 'commerce' | 'entreprise' | 'institution';

export const CATEGORIES: { cle: Categorie; label: string; detail: string }[] = [
  { cle: 'residentiel', label: 'Mon domicile', detail: 'Maison, appartement, concession, immeuble' },
  { cle: 'commerce', label: 'Mon commerce ou restaurant', detail: 'Boutique, restaurant, marché, boulangerie…' },
  { cle: 'entreprise', label: 'Mon entreprise ou atelier', detail: 'Bureaux, menuiserie, garage, couture…' },
  { cle: 'institution', label: 'Mon institution', detail: 'École, université, centre de santé, administration' },
];

export function estCategorie(v: unknown): v is Categorie {
  return typeof v === 'string' && CATEGORIES.some((c) => c.cle === v);
}

export const ACCES_VOIE: Record<string, string> = {
  goudronnee: 'Goudronnée',
  non_bitumee: 'Non bitumée',
  piste_etroite: 'Piste étroite',
  pente_raide: 'Pente raide',
};

export const GABARITS: Record<string, string> = {
  camion: 'Camion',
  camionnette: 'Camionnette',
  tricycle: 'Tricycle-moto',
  brouette: 'Brouette ou portage manuel',
};

export const FREQUENCES: { valeur: number; label: string }[] = [
  { valeur: 1, label: '1 fois par semaine' },
  { valeur: 2, label: '2 fois par semaine' },
  { valeur: 3, label: '3 fois par semaine' },
  { valeur: 7, label: 'Tous les jours' },
];

export const VOLUMES_SACS = [30, 50, 100] as const;

export function libelleFrequence(passages: number | null | undefined): string {
  if (!passages) return '—';
  return FREQUENCES.find((f) => f.valeur === passages)?.label ?? `${passages} fois par semaine`;
}

/** « 3 500 FCFA / mois » ou « 9 500 FCFA / 3 mois ». */
export function libelleTarif(tarif: number | null | undefined, mois: number | null | undefined): string {
  if (tarif == null) return 'Tarif à fixer';
  return `${fcfa(tarif)} / ${!mois || mois === 1 ? 'mois' : `${mois} mois`}`;
}

// -----------------------------------------------------------------------------
// Questions propres à chaque catégorie
// -----------------------------------------------------------------------------

export type Question =
  | { cle: string; label: string; type: 'choix'; options: Record<string, string>; si?: (r: Reponses) => boolean }
  | { cle: string; label: string; type: 'multiple'; options: Record<string, string>; si?: (r: Reponses) => boolean }
  | { cle: string; label: string; type: 'nombre'; min: number; max: number; si?: (r: Reponses) => boolean }
  | { cle: string; label: string; type: 'texte'; max: number; placeholder?: string; si?: (r: Reponses) => boolean }
  | { cle: string; label: string; type: 'oui_non'; si?: (r: Reponses) => boolean };

export type Reponses = Record<string, string | number | boolean | string[]>;

export const QUESTIONS: Record<Categorie, Question[]> = {
  residentiel: [
    {
      cle: 'type_logement', label: 'Type de logement', type: 'choix',
      options: { maison: 'Maison individuelle', appartement: 'Appartement', concession: 'Concession partagée', immeuble: 'Immeuble' },
    },
    { cle: 'taille_menage', label: 'Nombre de personnes (ou de ménages pour une concession)', type: 'nombre', min: 1, max: 500 },
    {
      cle: 'contenant', label: 'Contenant actuel', type: 'choix',
      options: {
        poubelle_50l: 'Poubelle standard (50 L)', fut: 'Fût coupé', sacs: 'Sacs poubelles uniquement',
        bac_roulant: 'Bac roulant (120 L et plus)', seaux: 'Vieux seaux ou sacs',
      },
    },
    {
      cle: 'position_poubelle', label: 'Où sera la poubelle au passage ?', type: 'choix',
      options: {
        bord_route: 'En bordure de route',
        cour_fermee: 'Dans la cour fermée (à sortir à l’heure du passage, ou quelqu’un présent)',
      },
    },
  ],
  commerce: [
    {
      cle: 'type_commerce', label: 'Type de commerce', type: 'choix',
      options: {
        restaurant: 'Restaurant ou snack', boutique: 'Boutique ou alimentation', marche: 'Marché',
        supermarche: 'Supermarché', boulangerie: 'Boulangerie',
      },
    },
    {
      cle: 'dechets', label: 'Nature principale des déchets', type: 'multiple',
      options: { organiques: 'Organiques, restes de nourriture', emballages: 'Emballages (cartons, plastiques, bouteilles)', verre: 'Verre', autres: 'Autres' },
    },
    { cle: 'dechets_autres', label: 'Autres déchets (précisez)', type: 'texte', max: 200, si: (r) => Array.isArray(r.dechets) && r.dechets.includes('autres') },
    { cle: 'horaires', label: 'Heures d’ouverture', type: 'texte', max: 120, placeholder: 'ex. 7 h – 21 h, fermé le dimanche' },
    { cle: 'heure_ideale', label: 'Heure idéale de passage', type: 'texte', max: 40, placeholder: 'ex. avant 7 h' },
  ],
  entreprise: [
    {
      cle: 'secteur', label: 'Secteur d’activité', type: 'choix',
      options: { bureaux: 'Bureaux, tertiaire', menuiserie: 'Menuiserie', garage: 'Garage, mécanique', couture: 'Couture, textile', autre: 'Autre' },
    },
    {
      cle: 'dechets', label: 'Nature principale des déchets', type: 'multiple',
      options: {
        papiers: 'Papiers, cartons', deee: 'Électriques et électroniques (ordinateurs, câbles)',
        industriels: 'Industriels (huiles, ferraille, chutes de bois)', menagers: 'Ordures ménagères (espace pause)',
      },
    },
  ],
  institution: [
    {
      cle: 'type_institution', label: 'Type d’institution', type: 'choix',
      options: { scolaire: 'Établissement scolaire ou universitaire', sante: 'Centre de santé ou clinique', administration: 'Administration publique' },
    },
    { cle: 'dasri', label: 'Avez-vous des DASRI (seringues, pansements sanguins…) ?', type: 'oui_non', si: (r) => r.type_institution === 'sante' },
    { cle: 'eleves', label: 'Nombre d’élèves ou d’étudiants', type: 'nombre', min: 0, max: 100000, si: (r) => r.type_institution === 'scolaire' },
    { cle: 'suspendre_vacances', label: 'Suspendre l’abonnement pendant les grandes vacances', type: 'oui_non', si: (r) => r.type_institution === 'scolaire' },
    { cle: 'stockage_centralise', label: 'Local à poubelles ou grand bac commun ?', type: 'oui_non' },
  ],
};

/**
 * Réponses gardées : seulement les questions connues de la catégorie (et
 * applicables), aux valeurs permises. Tout le reste est ignoré.
 */
export function nettoyerReponses(categorie: Categorie, brutes: Reponses): Reponses {
  const propres: Reponses = {};
  for (const q of QUESTIONS[categorie]) {
    if (q.si && !q.si(brutes)) continue;
    const v = brutes[q.cle];
    if (q.type === 'choix' && typeof v === 'string' && v in q.options) propres[q.cle] = v;
    else if (q.type === 'multiple' && Array.isArray(v)) {
      const choix = [...new Set(v.filter((x): x is string => typeof x === 'string' && x in q.options))];
      if (choix.length) propres[q.cle] = choix;
    } else if (q.type === 'nombre' && v !== '' && v != null) {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= q.min && n <= q.max) propres[q.cle] = n;
    } else if (q.type === 'texte' && typeof v === 'string' && v.trim()) propres[q.cle] = v.trim().slice(0, q.max);
    else if (q.type === 'oui_non' && typeof v === 'boolean') propres[q.cle] = v;
  }
  return propres;
}

/** Les réponses en phrases courtes, pour la fiche que lit le précollecteur. */
export function resumerReponses(categorie: string, reponses: Reponses | null | undefined): string[] {
  if (!estCategorie(categorie) || !reponses) return [];
  const lignes: string[] = [];
  for (const q of QUESTIONS[categorie]) {
    const v = reponses[q.cle];
    if (v == null || v === '') continue;
    let texte: string | null = null;
    if (q.type === 'choix' && typeof v === 'string') texte = q.options[v] ?? null;
    else if (q.type === 'multiple' && Array.isArray(v)) texte = v.map((x) => q.options[x] ?? x).join(', ');
    else if (q.type === 'nombre') texte = String(v);
    else if (q.type === 'texte') texte = String(v);
    else if (q.type === 'oui_non') texte = v ? 'oui' : 'non';
    if (texte) lignes.push(`${q.label} : ${texte}`);
  }
  return lignes;
}

/** DASRI déclarés : un précollecteur certifié est obligatoire. */
export function aDesDasri(categorie: string, reponses: Reponses | null | undefined): boolean {
  return categorie === 'institution' && reponses?.type_institution === 'sante' && reponses?.dasri === true;
}
