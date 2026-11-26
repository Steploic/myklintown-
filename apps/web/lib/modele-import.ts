import { COLONNES, COLONNES_MODELE } from './import-clients';
import { ecrireXlsx, STYLE, type Cellule } from './tableur';

const LARGEURS: Record<string, number> = { nom: 28, telephone: 16, quartier: 18, adresse: 36, tarif: 13, mois: 12, passages: 12, zone: 20, lat: 11, lng: 11, notes: 32 };

/**
 * Modèle Excel à remplir pour importer ses clients : l'onglet « Clients »
 * (titres, listes déroulantes, téléphone au format texte), le mode d'emploi,
 * et les zones de l'entreprise (proposées dans la colonne Zone).
 */
export function modeleImportClients(nomEntreprise: string, zones: string[]): Uint8Array {
  const colonnes = COLONNES_MODELE.map((cle) => COLONNES.find((c) => c.cle === cle)!);
  const idx = (cle: (typeof COLONNES_MODELE)[number]) => COLONNES_MODELE.indexOf(cle);
  const triees = [...zones].sort((a, b) => a.localeCompare(b, 'fr'));

  return ecrireXlsx([
    {
      nom: 'Clients',
      lignes: [colonnes.map((c): Cellule => ({ v: c.obligatoire ? `${c.titre} *` : c.titre, s: STYLE.entete }))],
      largeurs: COLONNES_MODELE.map((c) => LARGEURS[c] ?? 14),
      stylesColonnes: { [idx('telephone')]: STYLE.texte },
      figerEntete: true,
      listes: [
        { colonne: idx('mois'), source: '"1,3,6,12"', message: 'Période facturée : 1, 3, 6 ou 12 mois.' },
        ...(triees.length ? [{ colonne: idx('zone'), source: `Zones!$A$2:$A$${triees.length + 1}`, message: 'Choisissez une de vos zones, ou laissez vide.' }] : []),
      ],
      entiers: [
        { colonne: idx('tarif'), min: 0, max: 10_000_000, message: 'Tarif : un nombre entier de FCFA, ex. 3500.' },
        { colonne: idx('passages'), min: 1, max: 7, message: 'Passages par semaine : de 1 à 7.' },
      ],
      lignesSaisie: 1000,
    },
    {
      nom: 'Mode d’emploi',
      largeurs: [26, 13, 90],
      stylesColonnes: { 2: STYLE.paragraphe },
      lignes: [
        [{ v: `Importer vos clients dans MyKlinTown · ${nomEntreprise}`, s: STYLE.titre }],
        [],
        [{ v: '1. Remplissez l’onglet « Clients » : une ligne par foyer, à partir de la ligne 2. Ne modifiez pas les titres de la ligne 1.', s: STYLE.normal }],
        [{ v: '2. Seuls le Nom et le Tarif sont obligatoires (*). Sans téléphone, le ménage ne pourra pas rattacher son compte lui-même.', s: STYLE.normal }],
        [{ v: '3. Enregistrez au format Excel (.xlsx), puis dans MyKlinTown : Clients → Importer (Excel) → choisissez ce fichier.', s: STYLE.normal }],
        [{ v: '4. Un aperçu montre chaque ligne avant l’enregistrement ; rien n’est créé avant votre confirmation. Les erreurs et les doublons sont écartés.', s: STYLE.normal }],
        [],
        [{ v: 'Colonne', s: STYLE.entete }, { v: 'Obligatoire', s: STYLE.entete }, { v: 'Ce qu’il faut y mettre', s: STYLE.entete }],
        ...colonnes.map((c): Cellule[] => [c.titre, c.obligatoire ? 'Oui' : 'Non', c.aide]),
      ],
    },
    {
      nom: 'Zones',
      largeurs: [40],
      lignes: [
        [{ v: 'Vos zones de collecte', s: STYLE.entete }],
        ...(triees.length ? triees.map((z): Cellule[] => [z]) : [['Aucune zone affectée pour l’instant : laissez la colonne Zone vide.']]),
      ],
    },
  ]);
}
