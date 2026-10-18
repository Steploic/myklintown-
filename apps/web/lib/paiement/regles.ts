/**
 * Règles du paiement Mobile Money, sans réseau ni base (testées à part).
 */

export type Canal = 'cm.mtn' | 'cm.orange';

export const CANAUX: Record<Canal, { label: string; court: string; code: string }> = {
  'cm.mtn': { label: 'MTN Mobile Money', court: 'MTN MoMo', code: 'mtn_momo' },
  'cm.orange': { label: 'Orange Money', court: 'Orange Money', code: 'orange_money' },
};

/** « 6 77 12 34 56 », « 00237677123456 », « +237 677… » → « +237677123456 » ; sinon null. */
export function telephoneMobileMoney(tel: string | null | undefined): string | null {
  const chiffres = (tel ?? '').replace(/\D/g, '').replace(/^00/, '');
  const local = chiffres.length === 12 && chiffres.startsWith('237') ? chiffres.slice(3) : chiffres;
  return /^6\d{8}$/.test(local) ? `+237${local}` : null;
}

/**
 * Opérateur probable d'après le préfixe, pour pré-cocher le bon choix. On ne
 * devine que les préfixes sûrs (67 et 650-654 : MTN ; 69 et 655-659 : Orange) ;
 * pour les autres, le ménage choisit lui-même.
 */
export function operateurProbable(tel: string | null | undefined): Canal | null {
  const t = telephoneMobileMoney(tel);
  if (!t) return null;
  const local = t.slice(4);
  if (local.startsWith('67') || /^65[0-4]/.test(local)) return 'cm.mtn';
  if (local.startsWith('69') || /^65[5-9]/.test(local)) return 'cm.orange';
  return null;
}

/** Commission MyKlinTown prélevée à la source (arrondie au franc). */
export function commissionSur(montant: number, taux: number): number {
  if (!(montant > 0) || !(taux > 0)) return 0;
  return Math.min(montant, Math.round(montant * taux));
}

export type StatutPaiementEnLigne = 'initie' | 'en_attente' | 'reussi' | 'echoue' | 'annule' | 'expire';

export const STATUTS_FINAUX: StatutPaiementEnLigne[] = ['reussi', 'echoue', 'annule', 'expire'];

/** Statut Notch Pay → statut MyKlinTown. */
export function statutDepuisNotchPay(s: string | null | undefined): StatutPaiementEnLigne {
  switch ((s ?? '').toLowerCase()) {
    case 'complete':
    case 'completed':
    case 'success':
      return 'reussi';
    case 'failed':
      return 'echoue';
    case 'canceled':
    case 'cancelled':
      return 'annule';
    case 'expired':
      return 'expire';
    default:
      return 'en_attente';
  }
}

/**
 * Mode simulation (développement et tests) : le résultat dépend de la fin du
 * numéro, comme les numéros de test de Notch Pay.
 *   …000001 → solde insuffisant ; …000002 → refusé ; …000004 → annulé par le
 *   client ; …000003 → jamais de réponse ; sinon → réussi au bout de 5 s.
 */
export function statutSimule(telephone: string, ecouleMs: number): { statut: StatutPaiementEnLigne; message?: string } {
  if (telephone.endsWith('000001')) return { statut: 'echoue', message: 'Solde insuffisant.' };
  if (telephone.endsWith('000002')) return { statut: 'echoue', message: 'Paiement refusé par l’opérateur.' };
  if (telephone.endsWith('000004')) return { statut: 'annule', message: 'Paiement annulé sur le téléphone.' };
  if (telephone.endsWith('000003')) return { statut: 'en_attente' };
  return ecouleMs >= 5_000 ? { statut: 'reussi' } : { statut: 'en_attente' };
}

/** Délai au-delà duquel une demande restée sans réponse est considérée comme expirée. */
export const DELAI_EXPIRATION_MS = 10 * 60_000;
