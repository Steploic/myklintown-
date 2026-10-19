/**
 * Charte du ménage et contrat d'abonnement (migration 20261019000014).
 *
 * Le texte d'un document est du texte simple, découpé ici en blocs rendus en
 * nœuds texte React : jamais de HTML injecté (un texte saisi par un
 * administrateur ne doit pas pouvoir exécuter quoi que ce soit chez un ménage).
 *
 *   ## Titre de section        → titre
 *   ### Sous-titre             → sous-titre
 *   - élément (ou « * », « • ») → liste à puces
 *   ligne vide                 → fin du paragraphe ou de la liste
 */
import type { Supa } from './server';

export type TypeDocument = 'charte_menage' | 'contrat_menage';

export const TYPES_DOCUMENTS: readonly TypeDocument[] = ['charte_menage', 'contrat_menage'];

export const DOCUMENTS: Record<TypeDocument, { libelle: string; chemin: string }> = {
  charte_menage: { libelle: 'Charte du ménage', chemin: '/legal/charte' },
  contrat_menage: { libelle: 'Contrat d’abonnement', chemin: '/legal/contrat' },
};

export function estTypeDocument(v: unknown): v is TypeDocument {
  return typeof v === 'string' && (TYPES_DOCUMENTS as readonly string[]).includes(v);
}

export interface DocumentLegal {
  id: string;
  type: TypeDocument;
  version: number;
  titre: string;
  contenu: string;
  provisoire: boolean;
  publie_at: string | null;
  created_at: string;
  updated_at: string;
}

/** État de la charte et du contrat pour une fiche client (`charte_du_client`). */
export interface EtatDocumentClient {
  type: TypeDocument;
  document_id: string;
  version: number;
  titre: string;
  provisoire: boolean;
  acceptee: boolean;
  version_acceptee: number | null;
  accepte_at: string | null;
  mode: 'en_ligne' | 'remise_papier' | null;
}

/** Document que le compte connecté n'a pas encore accepté (`documents_a_accepter`). */
export interface DocumentAAccepter {
  document_id: string;
  type: TypeDocument;
  version: number;
  titre: string;
  provisoire: boolean;
}

export type Bloc =
  | { type: 'titre'; niveau: 2 | 3; texte: string }
  | { type: 'liste'; elements: string[] }
  | { type: 'paragraphe'; texte: string };

/** Découpe le texte d'un document en blocs (titres, listes, paragraphes). */
export function decouperDocument(contenu: string | null | undefined): Bloc[] {
  const blocs: Bloc[] = [];
  let paragraphe: string[] = [];
  let liste: string[] | null = null;

  const fermer = () => {
    if (paragraphe.length) blocs.push({ type: 'paragraphe', texte: paragraphe.join(' ') });
    if (liste?.length) blocs.push({ type: 'liste', elements: liste });
    paragraphe = [];
    liste = null;
  };

  for (const brute of (contenu ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = brute.trim();
    if (!ligne) {
      fermer();
      continue;
    }
    const titre = /^(#{1,3})\s+(.+)$/.exec(ligne);
    if (titre) {
      fermer();
      blocs.push({ type: 'titre', niveau: titre[1]!.length === 3 ? 3 : 2, texte: titre[2]!.trim() });
      continue;
    }
    const puce = /^[-*•]\s+(.+)$/.exec(ligne);
    if (puce) {
      if (paragraphe.length) {
        blocs.push({ type: 'paragraphe', texte: paragraphe.join(' ') });
        paragraphe = [];
      }
      (liste ??= []).push(puce[1]!.trim());
      continue;
    }
    if (liste) {
      blocs.push({ type: 'liste', elements: liste });
      liste = null;
    }
    paragraphe.push(ligne);
  }
  fermer();
  return blocs;
}

/** Version demandée (`?version=N`) : un entier positif, sinon la dernière publiée. */
export function lireVersion(v: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Version d'un document : celle demandée, sinon la dernière publiée. La RLS ne
 * montre que les versions publiées (un administrateur voit aussi les brouillons).
 */
export async function lireDocument(supabase: Supa, type: TypeDocument, version: number | null) {
  const base = supabase.from('documents_legaux').select('*').eq('type', type);
  const { data } = version
    ? await base.eq('version', version).maybeSingle()
    : await base.not('publie_at', 'is', null).order('version', { ascending: false }).limit(1).maybeSingle();
  return (data ?? null) as DocumentLegal | null;
}

/** Versions publiées d'un document, de la plus récente à la plus ancienne. */
export async function versionsPubliees(supabase: Supa, type: TypeDocument) {
  const { data } = await supabase
    .from('documents_legaux')
    .select('version, titre, provisoire, publie_at')
    .eq('type', type)
    .not('publie_at', 'is', null)
    .order('version', { ascending: false });
  return (Array.isArray(data) ? data : []) as Pick<DocumentLegal, 'version' | 'titre' | 'provisoire' | 'publie_at'>[];
}

/**
 * La base ne connaît pas encore la charte (migration 0014 pas jouée) : le
 * parcours continue, l'acceptation sera demandée plus tard par le bandeau.
 */
export function fonctionAbsente(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '');
}
