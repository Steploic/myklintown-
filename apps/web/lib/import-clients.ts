/**
 * Import des clients depuis un tableur (étape 6 du processus précollecteur :
 * recensement → intégration). Fonctions pures, utilisées à l'identique pour
 * l'aperçu dans le navigateur et pour la revalidation sur le serveur : ce que
 * le gérant voit « prêt » est exactement ce qui sera enregistré.
 */
import { normaliserNom } from './metier';

export const MAX_LIGNES_IMPORT = 1000;

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const cleEntete = (s: string) => sansAccents(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export type CleColonne = 'nom' | 'telephone' | 'quartier' | 'adresse' | 'tarif' | 'mois' | 'passages' | 'zone' | 'lat' | 'lng' | 'gps' | 'notes';

interface Colonne {
  cle: CleColonne;
  titre: string;
  alias: string[];
  obligatoire?: boolean;
  aide: string;
}

/** Colonnes reconnues. Les en-têtes de l'export « Exporter » sont reconnus aussi. */
export const COLONNES: Colonne[] = [
  { cle: 'nom', titre: 'Nom', alias: ['nom', 'noms', 'nomduclient', 'nomdelabonne', 'nomcomplet', 'client', 'abonne', 'menage', 'foyer'], obligatoire: true, aide: 'Personne ou structure, ex. Famille Ateba.' },
  { cle: 'telephone', titre: 'Téléphone', alias: ['telephone', 'tel', 'numero', 'numerodetelephone', 'contact', 'portable', 'mobile', 'whatsapp'], aide: '9 chiffres, avec ou sans +237 : sert au ménage pour rattacher son compte.' },
  { cle: 'quartier', titre: 'Quartier', alias: ['quartier'], aide: 'ex. Nsam.' },
  { cle: 'adresse', titre: 'Repère / adresse', alias: ['repereadresse', 'adresserepere', 'repere', 'adresse', 'description'], aide: 'ex. Portail bleu après la boulangerie.' },
  { cle: 'tarif', titre: 'Tarif (FCFA)', alias: ['tariffcfa', 'tarif', 'tarifconvenu', 'montant', 'montantfcfa', 'prix', 'prixfcfa'], obligatoire: true, aide: 'Montant de chaque facture, en FCFA (nombre entier).' },
  { cle: 'mois', titre: 'Période facturée (mois)', alias: ['periodefactureemois', 'periodefacturee', 'periode', 'mois', 'duree', 'frequence', 'facturation'], aide: '1, 3, 6 ou 12 (1 si vide).' },
  { cle: 'passages', titre: 'Passages / semaine', alias: ['passagessemaine', 'passagesparsemaine', 'passages', 'nombredepassages'], aide: 'De 1 à 7 (2 si vide).' },
  { cle: 'zone', titre: 'Zone', alias: ['zone', 'zonedecollecte'], aide: 'Nom exact d’une de vos zones ; vide = déduite de la position, si elle est donnée.' },
  { cle: 'lat', titre: 'Latitude', alias: ['latitude', 'lat'], aide: 'ex. 3.8285 (facultatif).' },
  { cle: 'lng', titre: 'Longitude', alias: ['longitude', 'lng', 'lon', 'long'], aide: 'ex. 11.4985 (facultatif).' },
  { cle: 'gps', titre: 'GPS', alias: ['gps', 'position', 'coordonnees', 'coordonneesgps', 'positiongps'], aide: 'Latitude et longitude dans une seule case, ex. 3.8285, 11.4985.' },
  { cle: 'notes', titre: 'Notes internes', alias: ['notesinternes', 'notes', 'note', 'remarques', 'remarque', 'commentaire', 'commentaires', 'observations'], aide: 'Visibles de votre équipe seulement.' },
];

/** Colonnes du modèle à télécharger (GPS en deux colonnes, plus simple à remplir). */
export const COLONNES_MODELE: CleColonne[] = ['nom', 'telephone', 'quartier', 'adresse', 'tarif', 'mois', 'passages', 'zone', 'lat', 'lng', 'notes'];

const PAR_ALIAS = new Map<string, CleColonne>(COLONNES.flatMap((c) => c.alias.map((a) => [a, c.cle] as const)));

/** Une ligne du fichier, telle que lue (tout en texte). */
export type LigneBrute = { numero: number } & Partial<Record<CleColonne, string>>;

export interface Lecture {
  lignes: LigneBrute[];
  reconnues: CleColonne[];
  ignorees: string[];
  /** Numéro (1 = première ligne du fichier) de la ligne d'en-têtes. */
  ligneEntete: number;
}

/** Repère la ligne d'en-têtes (dans les 10 premières) et lit les lignes qui suivent. */
export function lireLignes(tableau: string[][]): Lecture | { error: string } {
  let entete = -1;
  let carte: (CleColonne | null)[] = [];
  for (let i = 0; i < Math.min(10, tableau.length); i++) {
    const c = (tableau[i] ?? []).map((v) => PAR_ALIAS.get(cleEntete(v ?? '')) ?? null);
    if (c.includes('nom')) {
      entete = i;
      carte = c;
      break;
    }
  }
  if (entete < 0) {
    return { error: 'Colonne « Nom » introuvable : la première ligne du fichier doit porter les titres des colonnes (Nom, Téléphone, Quartier, Tarif…). Partez du modèle à télécharger.' };
  }
  // Une colonne reconnue deux fois : seule la première compte.
  const vues = new Set<CleColonne>();
  carte = carte.map((c) => {
    if (!c || vues.has(c)) return null;
    vues.add(c);
    return c;
  });
  const titres = tableau[entete] ?? [];
  const ignorees = titres.filter((t, j) => t && !carte[j]);
  const lignes: LigneBrute[] = [];
  for (let i = entete + 1; i < tableau.length; i++) {
    const l = tableau[i] ?? [];
    if (!l.some((v) => v && v.trim())) continue;
    const brute: LigneBrute = { numero: i + 1 };
    carte.forEach((cle, j) => {
      const v = (l[j] ?? '').trim();
      if (cle && v) brute[cle] = v;
    });
    lignes.push(brute);
  }
  return { lignes, reconnues: [...vues], ignorees, ligneEntete: entete + 1 };
}

// =============================================================================
// Contrôle d'une ligne
// =============================================================================

/** Téléphone camerounais → 9 chiffres (2… ou 6…) ; `null` si vide ; `false` si invalide. */
export function normaliserTelephone(v: string | undefined): string | null | false {
  if (!v || !v.trim()) return null;
  let d = v.replace(/\D/g, '').replace(/^00/, '');
  if (d.length === 12 && d.startsWith('237')) d = d.slice(3);
  return /^[26]\d{8}$/.test(d) ? d : false;
}

/** Clé de comparaison d'un téléphone (9 derniers chiffres, comme le rattachement du ménage). */
export const cleTelephone = (t: string | null | undefined) => {
  const d = (t ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : null;
};

/** Clé « même nom, même quartier », pour les foyers sans téléphone. */
export const cleNomQuartier = (nom: string | null | undefined, quartier: string | null | undefined) =>
  `${cleEntete(nom ?? '')}|${cleEntete(quartier ?? '')}`;

/** « 3 500 », « 3.500 », « 3500 FCFA » → 3500. */
export function lireTarif(v: string | undefined): number | null {
  if (!v) return null;
  let s = v.replace(/f\s*cfa|xaf|cfa|frs?\b|f\b/gi, '').replace(/[\s  ]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  s = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
}

const PERIODES: Record<string, number> = { mensuel: 1, mensuelle: 1, trimestriel: 3, trimestrielle: 3, semestriel: 6, semestrielle: 6, annuel: 12, annuelle: 12 };

export function lireMois(v: string | undefined): number | null {
  if (!v) return 1;
  const s = cleEntete(v);
  if (PERIODES[s]) return PERIODES[s]!;
  const n = Number(/^\d+/.exec(s)?.[0]);
  return [1, 3, 6, 12].includes(n) ? n : null;
}

function lireEntier(v: string | undefined, defaut: number, min: number, max: number): number | null {
  if (!v) return defaut;
  const n = Number(v.replace(',', '.').trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function lireNombre(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** « 3.8285, 11.4985 » ou « 3,8285 ; 11,4985 » → [lat, lng]. */
function lireGps(v: string): [number, number] | null {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,;/\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(v);
  if (!m) return null;
  return [Number(m[1]!.replace(',', '.')), Number(m[2]!.replace(',', '.'))];
}

/** Cadre du Cameroun (avec une marge) : attrape les latitudes et longitudes inversées. */
const DANS_LE_CAMEROUN = (lat: number, lng: number) => lat >= 1.5 && lat <= 13.2 && lng >= 8.3 && lng <= 16.3;

export interface ZoneImport {
  id: string;
  nom: string;
}

/** Client prêt à être enregistré (colonnes de la table `clients`). */
export interface ClientImport {
  nom: string;
  telephone: string | null;
  quartier: string | null;
  adresse: string | null;
  tarif_fcfa: number;
  facturation_mois: number;
  passages_semaine: number;
  zone_id: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
}

const LIMITES = { nom: 120, quartier: 80, adresse: 200, notes: 500 } as const;

export function validerLigne(l: LigneBrute, zones: ZoneImport[]): { client: ClientImport } | { erreurs: string[] } {
  const erreurs: string[] = [];

  const nom = normaliserNom(l.nom);
  if (!nom) erreurs.push('Nom manquant.');
  else if (nom.length > LIMITES.nom) erreurs.push(`Nom trop long (${LIMITES.nom} caractères au plus).`);

  const telephone = normaliserTelephone(l.telephone);
  if (telephone === false) erreurs.push(`Téléphone invalide « ${l.telephone} » : 9 chiffres attendus, ex. 6 77 12 34 56.`);

  const quartier = normaliserNom(l.quartier) || null;
  if (quartier && quartier.length > LIMITES.quartier) erreurs.push(`Quartier trop long (${LIMITES.quartier} caractères au plus).`);
  const adresse = l.adresse?.replace(/\s+/g, ' ').trim() || null;
  if (adresse && adresse.length > LIMITES.adresse) erreurs.push(`Repère trop long (${LIMITES.adresse} caractères au plus).`);
  const notes = l.notes?.trim() || null;
  if (notes && notes.length > LIMITES.notes) erreurs.push(`Notes trop longues (${LIMITES.notes} caractères au plus).`);

  const tarif = lireTarif(l.tarif);
  if (!l.tarif) erreurs.push('Tarif manquant : montant de chaque facture, en FCFA.');
  else if (tarif === null) erreurs.push(`Tarif invalide « ${l.tarif} » : un nombre entier de FCFA, ex. 3500.`);

  const mois = lireMois(l.mois);
  if (mois === null) erreurs.push(`Période facturée invalide « ${l.mois} » : 1, 3, 6 ou 12 mois.`);
  const passages = lireEntier(l.passages, 2, 1, 7);
  if (passages === null) erreurs.push(`Passages par semaine invalides « ${l.passages} » : de 1 à 7.`);

  let lat: number | null = null;
  let lng: number | null = null;
  if (l.lat || l.lng) {
    lat = lireNombre(l.lat);
    lng = lireNombre(l.lng);
    if (lat === null || lng === null) erreurs.push('Position incomplète : latitude ET longitude, ou aucune des deux.');
  } else if (l.gps) {
    const p = lireGps(l.gps);
    if (p) [lat, lng] = p;
    else erreurs.push(`Position GPS illisible « ${l.gps} » : ex. 3.8285, 11.4985.`);
  }
  if (lat !== null && lng !== null && !DANS_LE_CAMEROUN(lat, lng)) {
    erreurs.push('Position hors du Cameroun : vérifiez la latitude (≈ 3,8 à Yaoundé) et la longitude (≈ 11,5).');
    lat = lng = null;
  }

  let zone_id: string | null = null;
  if (l.zone) {
    const z = zones.find((x) => cleEntete(x.nom) === cleEntete(l.zone!));
    if (z) zone_id = z.id;
    else if (zones.length) erreurs.push(`Zone inconnue « ${l.zone} » : vos zones sont ${zones.map((x) => x.nom).join(', ')}.`);
    else erreurs.push('Aucune zone ne vous est encore affectée : laissez la colonne Zone vide.');
  }

  if (erreurs.length) return { erreurs };
  return {
    client: {
      nom,
      telephone: telephone || null,
      quartier,
      adresse,
      tarif_fcfa: tarif!,
      facturation_mois: mois!,
      passages_semaine: passages!,
      zone_id,
      lat,
      lng,
      notes,
    },
  };
}

// =============================================================================
// Analyse du fichier entier
// =============================================================================

export type EtatLigne =
  | { numero: number; etat: 'pret'; client: ClientImport; brute: LigneBrute }
  | { numero: number; etat: 'erreur'; erreurs: string[]; brute: LigneBrute }
  | { numero: number; etat: 'doublon'; raison: string; brute: LigneBrute };

export interface Existants {
  telephones: Iterable<string>;
  nomsQuartiers: Iterable<string>;
}

/**
 * Contrôle chaque ligne, puis écarte les doublons : déjà enregistrés (même
 * téléphone, ou même nom et même quartier sans téléphone) ou répétés dans le
 * fichier. Un doublon n'est jamais importé : il se règle à la main.
 */
export function analyserImport(lignes: LigneBrute[], zones: ZoneImport[], existants: Existants): EtatLigne[] {
  const tels = new Set(existants.telephones);
  const nq = new Set(existants.nomsQuartiers);
  const vusTel = new Map<string, number>();
  const vusNq = new Map<string, number>();
  return lignes.map((brute) => {
    const r = validerLigne(brute, zones);
    if ('erreurs' in r) return { numero: brute.numero, etat: 'erreur', erreurs: r.erreurs, brute };
    const c = r.client;
    const tel = cleTelephone(c.telephone);
    if (tel) {
      if (tels.has(tel)) return { numero: brute.numero, etat: 'doublon', raison: 'Déjà dans vos clients (même téléphone).', brute };
      const avant = vusTel.get(tel);
      if (avant) return { numero: brute.numero, etat: 'doublon', raison: `Même téléphone que la ligne ${avant}.`, brute };
      vusTel.set(tel, brute.numero);
    } else {
      const k = cleNomQuartier(c.nom, c.quartier);
      if (nq.has(k)) return { numero: brute.numero, etat: 'doublon', raison: 'Déjà dans vos clients (même nom, même quartier).', brute };
      const avant = vusNq.get(k);
      if (avant) return { numero: brute.numero, etat: 'doublon', raison: `Même nom et même quartier que la ligne ${avant}.`, brute };
      vusNq.set(k, brute.numero);
    }
    return { numero: brute.numero, etat: 'pret', client: c, brute };
  });
}

/** Clés des clients déjà enregistrés, pour repérer les doublons. */
export function clesExistants(clients: { nom: string | null; quartier: string | null; telephone: string | null }[]): { telephones: string[]; nomsQuartiers: string[] } {
  const telephones: string[] = [];
  const nomsQuartiers: string[] = [];
  for (const c of clients) {
    const t = cleTelephone(c.telephone);
    if (t) telephones.push(t);
    nomsQuartiers.push(cleNomQuartier(c.nom, c.quartier));
  }
  return { telephones, nomsQuartiers };
}

/** Ligne brute nettoyée de ce qui arrive du navigateur (le serveur ne fait confiance à rien). */
export function assainirLigne(x: unknown): LigneBrute | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const numero = Number(o.numero);
  if (!Number.isInteger(numero) || numero < 1 || numero > 100_000) return null;
  const l: LigneBrute = { numero };
  for (const c of COLONNES) {
    const v = o[c.cle];
    if (typeof v === 'string' && v.trim()) l[c.cle] = v.slice(0, 1000);
  }
  return l;
}
