/**
 * Codes d'agrément des précollecteurs (migration 20261013000012) : délivrés par
 * la Mairie, saisis une seule fois à la création de l'espace.
 */

export interface CodeAgrement {
  id: string;
  code: string;
  destinataire: string;
  telephone: string | null;
  created_at: string;
  expire_at: string;
  revoque_at: string | null;
  utilise_at: string | null;
  communes: { nom: string } | null;
  entreprises: { nom: string } | null;
}

export type EtatCode = 'en_attente' | 'utilise' | 'expire' | 'revoque';

export const ETATS_CODE: Record<EtatCode, { label: string; chip: string }> = {
  en_attente: { label: 'À utiliser', chip: 'chip-info' },
  utilise: { label: 'Utilisé', chip: 'chip-ok' },
  expire: { label: 'Expiré', chip: 'chip-neutre' },
  revoque: { label: 'Révoqué', chip: 'chip-neutre' },
};

export function etatCode(c: Pick<CodeAgrement, 'utilise_at' | 'revoque_at' | 'expire_at'>, maintenant: Date = new Date()): EtatCode {
  if (c.utilise_at) return 'utilise';
  if (c.revoque_at) return 'revoque';
  if (new Date(c.expire_at).getTime() < maintenant.getTime()) return 'expire';
  return 'en_attente';
}

/** « ABCDEFGHJK » → « ABCDE-FGHJK » : plus facile à dicter au téléphone. */
export function formaterCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}
