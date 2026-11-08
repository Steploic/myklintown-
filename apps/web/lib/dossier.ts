/**
 * Dossier du précollecteur et vitrine de l'annuaire (migration 20261109000017).
 *
 * L'inscription est libre et se fait sans pièces ; l'entreprise n'apparaît
 * dans l'annuaire public qu'une fois son dossier vérifié par MyKlinTown :
 * NIU, adresse du siège social, une autorisation territoriale par commune
 * d'activité, permis environnemental (retours de l'équipe, 08/11/2026).
 */
import type { DossierStatut } from './types';

export const ETATS_DOSSIER: Record<DossierStatut, { label: string; chip: string; texte: string }> = {
  incomplet: {
    label: 'Dossier à compléter',
    chip: 'chip-relance',
    texte: 'Complétez votre dossier pour apparaître dans l’annuaire des abonnés de vos quartiers.',
  },
  soumis: {
    label: 'En vérification',
    chip: 'chip-info',
    texte: 'MyKlinTown vérifie vos pièces. Vous apparaîtrez dans l’annuaire dès la validation.',
  },
  valide: {
    label: 'Dossier vérifié',
    chip: 'chip-ok',
    texte: 'Vous apparaissez dans l’annuaire des quartiers que vous desservez.',
  },
  refuse: {
    label: 'Dossier refusé',
    chip: 'chip-stop',
    texte: 'Corrigez ce qui est signalé, puis soumettez de nouveau votre dossier.',
  },
};

export function etatDossier(statut: string | null | undefined): DossierStatut {
  return statut === 'soumis' || statut === 'valide' || statut === 'refuse' ? statut : 'incomplet';
}

/** Pièces acceptées : photo prise au téléphone ou PDF scanné. */
export const TYPES_PIECE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const TYPES_LOGO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const TAILLE_MAX_PIECE = 5 * 1024 * 1024;
export const TAILLE_MAX_LOGO = 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type Piece = 'autorisation' | 'permis' | 'logo';

/**
 * Chemin d'un fichier du dossier dans le stockage : `{entreprise}/{pièce}-{horodatage}.{ext}`.
 * Chaque envoi est un nouveau fichier (la base garde la trace des pièces) ; le
 * format suit celui que vérifie `enregistrer_piece_dossier`.
 */
export function cheminPiece(entrepriseId: string, piece: Piece, typeMime: string, communeId?: string | null): string {
  const ext = EXTENSIONS[typeMime];
  if (!ext) throw new Error('Format non accepté : photo (JPEG, PNG, WebP) ou PDF.');
  const nom = piece === 'autorisation' && communeId ? `autorisation-${communeId}` : piece;
  return `${entrepriseId}/${nom}-${Date.now()}.${ext}`;
}

/** Vérifie un fichier avant envoi ; renvoie le message d'erreur, ou null. */
export function verifierFichier(piece: Piece, fichier: { type: string; size: number }): string | null {
  const types: readonly string[] = piece === 'logo' ? TYPES_LOGO : TYPES_PIECE;
  if (!types.includes(fichier.type)) {
    return piece === 'logo' ? 'Logo : une image JPEG, PNG ou WebP.' : 'Pièce : une photo (JPEG, PNG, WebP) ou un PDF.';
  }
  const max = piece === 'logo' ? TAILLE_MAX_LOGO : TAILLE_MAX_PIECE;
  if (fichier.size > max) return `Fichier trop lourd : ${max / 1024 / 1024} Mo au plus.`;
  return null;
}

/** Quartiers saisis dans un champ texte : séparés par des virgules, des points-virgules ou des retours à la ligne. */
export function lireQuartiers(texte: string | null | undefined): string[] {
  return (texte ?? '')
    .split(/[,;\n]/)
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 40);
}

/** Adresse publique d'un logo (le compartiment `logos` est public : vitrine). */
export function urlLogo(chemin: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!chemin || !base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/logos/${chemin.split('/').map(encodeURIComponent).join('/')}`;
}
