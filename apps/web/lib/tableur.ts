/**
 * Lecture et écriture de tableurs, sans dépendance : un fichier Excel (.xlsx)
 * n'est qu'une archive ZIP de fichiers XML. On en lit la première feuille en
 * texte brut (ni formules, ni mise en forme), et on sait aussi lire un CSV
 * (« ; », « , » ou tabulation ; UTF-8 ou l'encodage Windows d'Excel).
 *
 * La lecture se fait dans le navigateur (la décompression passe par
 * `DecompressionStream`, natif) : le serveur ne reçoit jamais le fichier,
 * seulement les lignes, qu'il revalide.
 */

export class ErreurTableur extends Error {}

/** Garde-fous : un fichier de clients ne dépasse pas ces tailles. */
const MAX_DECOMPRESSE = 30 * 1024 * 1024;
const MAX_LIGNES = 5000;
const MAX_COLONNES = 40;

// =============================================================================
// ZIP
// =============================================================================

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) + b[o + 3]! * 0x1000000;

interface EntreeZip {
  methode: number;
  taille: number;
  debut: number;
}

function sommaireZip(octets: Uint8Array): Map<string, EntreeZip> {
  // Fin du répertoire central : dans les 22 + 65 535 derniers octets.
  let fin = -1;
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 22 - 0xffff); i--) {
    if (u32(octets, i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErreurTableur('Fichier Excel illisible (archive incomplète ou abîmée).');
  const nombre = u16(octets, fin + 10);
  let p = u32(octets, fin + 16);
  const entrees = new Map<string, EntreeZip>();
  const nom = new TextDecoder();
  for (let n = 0; n < nombre; n++) {
    if (p + 46 > octets.length || u32(octets, p) !== 0x02014b50) throw new ErreurTableur('Fichier Excel illisible (sommaire abîmé).');
    const methode = u16(octets, p + 10);
    const taille = u32(octets, p + 20);
    const lNom = u16(octets, p + 28);
    const lExtra = u16(octets, p + 30);
    const lComm = u16(octets, p + 32);
    const local = u32(octets, p + 42);
    const chemin = nom.decode(octets.subarray(p + 46, p + 46 + lNom));
    if (local + 30 > octets.length || u32(octets, local) !== 0x04034b50) throw new ErreurTableur('Fichier Excel illisible (entrée abîmée).');
    const debut = local + 30 + u16(octets, local + 26) + u16(octets, local + 28);
    if (debut + taille > octets.length) throw new ErreurTableur('Fichier Excel illisible (entrée tronquée).');
    entrees.set(chemin, { methode, taille, debut });
    p += 46 + lNom + lExtra + lComm;
  }
  return entrees;
}

async function decompresser(donnees: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([donnees as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const lecteur = flux.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECOMPRESSE) {
      await lecteur.cancel();
      throw new ErreurTableur('Fichier trop volumineux.');
    }
    morceaux.push(value);
  }
  const sortie = new Uint8Array(total);
  let o = 0;
  for (const m of morceaux) {
    sortie.set(m, o);
    o += m.length;
  }
  return sortie;
}

async function extraire(octets: Uint8Array, entrees: Map<string, EntreeZip>, chemin: string): Promise<string | null> {
  const e = entrees.get(chemin);
  if (!e) return null;
  const brut = octets.subarray(e.debut, e.debut + e.taille);
  let donnees: Uint8Array;
  if (e.methode === 0) donnees = brut;
  else if (e.methode === 8) donnees = await decompresser(brut);
  else throw new ErreurTableur('Fichier Excel compressé d’une façon non prise en charge : réenregistrez-le depuis Excel.');
  return new TextDecoder().decode(donnees);
}

// =============================================================================
// XML (le strict nécessaire de SpreadsheetML)
// =============================================================================

function decoderXml(s: string): string {
  return s
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
      const l = e.toLowerCase();
      if (l === 'lt') return '<';
      if (l === 'gt') return '>';
      if (l === 'amp') return '&';
      if (l === 'quot') return '"';
      if (l === 'apos') return "'";
      const code = l.startsWith('#x') ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    // Excel code certains caractères en _xHHHH_ (retour chariot…).
    .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function attributs(balise: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of balise.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1]!] = decoderXml(m[2] ?? m[3] ?? '');
  return a;
}

/** Texte d'un élément riche (<si>, <is>) : la concaténation de ses <t>, sans les annotations phonétiques. */
function texteRiche(xml: string): string {
  const sansPhonetique = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let t = '';
  for (const m of sansPhonetique.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) t += decoderXml(m[1] ?? '');
  return t;
}

function indexColonne(ref: string): number {
  const lettres = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Nombre stocké par Excel → texte tel qu'on l'a saisi (690000001, pas 6.9E+8). */
function texteNombre(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return String(Number(n.toPrecision(15)));
}

/** Première feuille d'un classeur .xlsx, en lignes de texte. */
export async function lireXlsx(octets: Uint8Array): Promise<string[][]> {
  const entrees = sommaireZip(octets);
  if (!entrees.has('xl/workbook.xml')) {
    if (entrees.has('content.xml')) throw new ErreurTableur('Fichier LibreOffice (.ods) : enregistrez-le au format Excel (.xlsx) ou CSV.');
    throw new ErreurTableur('Ce fichier n’est pas un classeur Excel (.xlsx).');
  }

  // Feuille à lire : la première du classeur, dans l'ordre des onglets.
  let feuille: string | null = null;
  const classeur = (await extraire(octets, entrees, 'xl/workbook.xml')) ?? '';
  const premiere = /<(?:\w+:)?sheet\b[^>]*>/.exec(classeur)?.[0];
  const liens = (await extraire(octets, entrees, 'xl/_rels/workbook.xml.rels')) ?? '';
  if (premiere) {
    const id = Object.entries(attributs(premiere)).find(([k]) => /(^|:)id$/.test(k) && k !== 'sheetId')?.[1];
    for (const m of liens.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
      const a = attributs(m[0]);
      if (a.Id === id && a.Target) {
        feuille = a.Target.startsWith('/') ? a.Target.slice(1) : `xl/${a.Target.replace(/^\.\//, '')}`;
        break;
      }
    }
  }
  if (!feuille || !entrees.has(feuille)) {
    feuille = [...entrees.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0] ?? null;
  }
  if (!feuille) throw new ErreurTableur('Le classeur ne contient aucune feuille.');

  const partages: string[] = [];
  const sst = await extraire(octets, entrees, 'xl/sharedStrings.xml');
  if (sst) {
    for (const m of sst.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)) partages.push(texteRiche(m[1] ?? ''));
  }

  const xml = (await extraire(octets, entrees, feuille)) ?? '';
  const lignes: string[][] = [];
  let numLigne = -1;
  for (const r of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const ar = attributs(r[1] ?? '');
    numLigne = ar.r ? Number(ar.r) - 1 : numLigne + 1;
    if (!Number.isInteger(numLigne) || numLigne < 0) continue;
    if (numLigne >= MAX_LIGNES) throw new ErreurTableur(`Fichier trop long : ${MAX_LIGNES} lignes au plus par import.`);
    const ligne: string[] = [];
    let col = -1;
    for (const c of (r[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ac = attributs(c[1] ?? '');
      col = ac.r ? indexColonne(ac.r) : col + 1;
      if (col < 0 || col >= MAX_COLONNES) continue;
      const contenu = c[2] ?? '';
      const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(contenu)?.[1];
      let valeur = '';
      switch (ac.t) {
        case 's':
          valeur = partages[Number(v)] ?? '';
          break;
        case 'inlineStr': {
          const is = /<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(contenu)?.[1];
          valeur = is ? texteRiche(is) : '';
          break;
        }
        case 'str':
        case 'd':
          valeur = v != null ? decoderXml(v) : '';
          break;
        case 'b':
          valeur = v === '1' ? 'VRAI' : v === '0' ? 'FAUX' : '';
          break;
        case 'e':
          valeur = '';
          break;
        default:
          valeur = v != null ? texteNombre(decoderXml(v)) : '';
      }
      while (ligne.length < col) ligne.push('');
      ligne[col] = valeur.replace(/\r\n?/g, '\n').trim();
    }
    while (lignes.length < numLigne) lignes.push([]);
    lignes[numLigne] = ligne;
  }
  return lignes;
}

// =============================================================================
// CSV
// =============================================================================

/** Texte d'un CSV : UTF-8 si possible, sinon l'encodage Windows qu'Excel utilise pour « CSV (séparateur : point-virgule) ». */
export function decoderTexte(octets: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

export function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  // Séparateur : le plus fréquent hors guillemets sur la première ligne.
  const premiere = t.split(/\r?\n/, 1)[0]!.replace(/"[^"]*"/g, '');
  const sep = ([';', ',', '\t'] as const)
    .map((s) => ({ s, n: premiere.split(s).length - 1 }))
    .sort((a, b) => b.n - a.n)[0]!;
  const separateur = sep.n > 0 ? sep.s : ';';

  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (guillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          champ += '"';
          i++;
        } else guillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"' && champ === '') guillemets = true;
    else if (c === separateur) {
      ligne.push(champ.trim());
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ.trim());
      lignes.push(ligne);
      if (lignes.length > MAX_LIGNES) throw new ErreurTableur(`Fichier trop long : ${MAX_LIGNES} lignes au plus par import.`);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ.trim());
    lignes.push(ligne);
  }
  // Une cellule exportée « 'texte » (protection contre les formules) redevient « texte ».
  return lignes.map((l) => l.slice(0, MAX_COLONNES).map((v) => v.replace(/\r\n?/g, '\n').replace(/^'(?=[=+\-@])/, '')));
}

/** Lit un fichier .xlsx ou .csv, d'après son contenu (pas son extension). */
export async function lireTableur(octets: Uint8Array): Promise<string[][]> {
  if (octets[0] === 0x50 && octets[1] === 0x4b) return lireXlsx(octets);
  if (octets[0] === 0xd0 && octets[1] === 0xcf && octets[2] === 0x11 && octets[3] === 0xe0) {
    throw new ErreurTableur('Ancien format Excel (.xls) : dans Excel, « Enregistrer sous » → « Classeur Excel (.xlsx) », puis réessayez.');
  }
  if (octets.subarray(0, 1024).includes(0)) throw new ErreurTableur('Ce fichier n’est ni un classeur Excel (.xlsx) ni un CSV.');
  return lireCsv(decoderTexte(octets));
}

// =============================================================================
// Écriture d'un classeur (le modèle à remplir)
// =============================================================================

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of d) c = TABLE_CRC[(c ^ o) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archive ZIP sans compression (méthode « stockée »), que tous les tableurs acceptent. */
function zip(fichiers: { chemin: string; contenu: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.chemin);
    const donnees = enc.encode(f.contenu);
    const crc = crc32(donnees);
    const tete = new Uint8Array(30 + nom.length);
    const v = new DataView(tete.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // noms en UTF-8
    v.setUint16(8, 0, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, 0x21, true); // 1er janvier 1980
    v.setUint32(14, crc, true);
    v.setUint32(18, donnees.length, true);
    v.setUint32(22, donnees.length, true);
    v.setUint16(26, nom.length, true);
    tete.set(nom, 30);
    const central = new Uint8Array(46 + nom.length);
    const w = new DataView(central.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(14, 0x21, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, donnees.length, true);
    w.setUint32(24, donnees.length, true);
    w.setUint16(28, nom.length, true);
    w.setUint32(42, decalage, true);
    central.set(nom, 46);
    locaux.push(tete, donnees);
    centraux.push(central);
    decalage += tete.length + donnees.length;
  }
  const tailleCentral = centraux.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, fichiers.length, true);
  f.setUint16(10, fichiers.length, true);
  f.setUint32(12, tailleCentral, true);
  f.setUint32(16, decalage, true);
  const parts = [...locaux, ...centraux, fin];
  const sortie = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    sortie.set(p, o);
    o += p.length;
  }
  return sortie;
}

const echapper = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Caractères de contrôle interdits en XML.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const lettre = (i: number): string => (i >= 26 ? lettre(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

/** Styles : 0 normal · 1 en-tête (blanc sur nuit) · 2 texte (téléphones) · 3 paragraphe · 4 titre. */
export const STYLE = { normal: 0, entete: 1, texte: 2, paragraphe: 3, titre: 4 } as const;

export type Cellule = string | number | null | { v: string | number; s: number };

export interface Feuille {
  nom: string;
  lignes: Cellule[][];
  /** Largeur de chaque colonne (en caractères). */
  largeurs?: number[];
  /** Style par défaut de colonnes entières (ex. téléphone au format texte). */
  stylesColonnes?: Record<number, number>;
  /** Fige la première ligne (en-tête toujours visible). */
  figerEntete?: boolean;
  /** Listes déroulantes : `source` = formule (« "1,3,6,12" » ou « Zones!$A$2:$A$9 »). */
  listes?: { colonne: number; source: string; message?: string }[];
  /** Nombres entiers bornés. */
  entiers?: { colonne: number; min: number; max: number; message?: string }[];
  /** Nombre de lignes couvertes par les listes et les bornes. */
  lignesSaisie?: number;
}

function xmlFeuille(f: Feuille): string {
  const lignes = f.lignes
    .map((l, i) => {
      const cellules = l
        .map((c, j) => {
          if (c == null || c === '') return '';
          const ref = `${lettre(j)}${i + 1}`;
          const { v, s } = typeof c === 'object' ? c : { v: c, s: f.stylesColonnes?.[j] ?? 0 };
          const st = s ? ` s="${s}"` : '';
          return typeof v === 'number'
            ? `<c r="${ref}"${st}><v>${v}</v></c>`
            : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${echapper(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${i + 1}">${cellules}</row>`;
    })
    .join('');
  const vue = f.figerEntete
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = f.largeurs?.length
    ? `<cols>${f.largeurs
        .map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"${f.stylesColonnes?.[j] ? ` style="${f.stylesColonnes[j]}"` : ''}/>`)
        .join('')}</cols>`
    : '';
  const fin = f.lignesSaisie ?? 1000;
  const validations = [
    ...(f.listes ?? []).map(
      (l) =>
        `<dataValidation type="list" allowBlank="1" showErrorMessage="1"${l.message ? ` errorTitle="Valeur refusée" error="${echapper(l.message)}"` : ''} sqref="${lettre(l.colonne)}2:${lettre(l.colonne)}${fin + 1}"><formula1>${echapper(l.source)}</formula1></dataValidation>`,
    ),
    ...(f.entiers ?? []).map(
      (e) =>
        `<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1"${e.message ? ` errorTitle="Valeur refusée" error="${echapper(e.message)}"` : ''} sqref="${lettre(e.colonne)}2:${lettre(e.colonne)}${fin + 1}"><formula1>${e.min}</formula1><formula2>${e.max}</formula2></dataValidation>`,
    ),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    vue +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${lignes}</sheetData>` +
    (validations.length ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : '') +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="13"/><color rgb="FF0B1E3B"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0B1E3B"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** Classeur .xlsx (premier onglet = première feuille). */
export function ecrireXlsx(feuilles: Feuille[]): Uint8Array {
  const n = feuilles.length;
  return zip([
    {
      chemin: '[Content_Types].xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    },
    {
      chemin: '_rels/.rels',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      chemin: 'xl/workbook.xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        feuilles.map((f, i) => `<sheet name="${echapper(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      chemin: 'xl/_rels/workbook.xml.rels',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { chemin: 'xl/styles.xml', contenu: STYLES_XML },
    ...feuilles.map((f, i) => ({ chemin: `xl/worksheets/sheet${i + 1}.xml`, contenu: xmlFeuille(f) })),
  ]);
}
