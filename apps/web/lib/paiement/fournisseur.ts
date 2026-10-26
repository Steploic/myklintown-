import { createHmac, timingSafeEqual } from 'node:crypto';
import { statutDepuisNotchPay, statutSimule, type Canal, type StatutPaiementEnLigne } from './regles';

/**
 * Fournisseur de paiement : Notch Pay en vrai, ou une simulation pour le
 * développement et les tests (jamais en production).
 *
 * Variables d'environnement (serveur uniquement, jamais NEXT_PUBLIC_) :
 *   NOTCHPAY_PUBLIC_KEY   clé publique (pk_…) — initialiser et suivre un paiement
 *   NOTCHPAY_PRIVATE_KEY  clé privée (sk_…) — en-tête X-Grant (virements de reversement, à venir)
 *   NOTCHPAY_WEBHOOK_HASH clé de signature des notifications
 *   PAIEMENT_SIMULATION=1 mode simulation (poste local seulement, ignoré sur Vercel)
 *
 * L'argent est encaissé sur le compte Notch Pay de MyKlinTown : Notch Pay a
 * supprimé les comptes connectés (`/accounts` répond 410 « X-Sync and
 * sub-accounts are no longer supported », constaté en sandbox le 26/10/2026).
 */

export interface DemandePaiement {
  reference: string;
  montant: number;
  description: string;
  client: { nom: string; email?: string | null };
  canal: Canal;
  telephone: string;
}

export interface Fournisseur {
  nom: 'notchpay' | 'simulation';
  /** Crée le paiement chez le fournisseur puis l'envoie sur le téléphone du payeur. */
  demander(d: DemandePaiement): Promise<{ fournisseurReference: string }>;
  statut(fournisseurReference: string, ctx: { telephone: string; creeLe: string }): Promise<{ statut: StatutPaiementEnLigne; message?: string }>;
}

const API = 'https://api.notchpay.co';

class ErreurFournisseur extends Error {}

async function appel(chemin: string, init: { method: 'GET' | 'POST'; body?: unknown; prive?: boolean }) {
  const pk = process.env.NOTCHPAY_PUBLIC_KEY!;
  const entetes: Record<string, string> = { Authorization: pk, Accept: 'application/json' };
  if (init.body !== undefined) entetes['Content-Type'] = 'application/json';
  if (init.prive && process.env.NOTCHPAY_PRIVATE_KEY) entetes['X-Grant'] = process.env.NOTCHPAY_PRIVATE_KEY;
  const r = await fetch(`${API}${chemin}`, {
    method: init.method,
    headers: entetes,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const message = typeof json.message === 'string' ? json.message : `Notch Pay a répondu ${r.status}`;
    throw new ErreurFournisseur(message);
  }
  return json;
}

export const notchPay: Fournisseur = {
  nom: 'notchpay',

  async demander(d) {
    const corps = {
      amount: d.montant,
      currency: 'XAF',
      customer: { name: d.client.nom, phone: d.telephone, ...(d.client.email ? { email: d.client.email } : {}) },
      description: d.description,
      reference: d.reference,
    };
    const init = await appel('/payments', { method: 'POST', body: corps });
    const trx = init.transaction as { reference?: string } | undefined;
    if (!trx?.reference) throw new ErreurFournisseur('Réponse inattendue de Notch Pay (référence absente).');
    await appel(`/payments/${encodeURIComponent(trx.reference)}`, {
      method: 'POST',
      body: { channel: d.canal, data: { phone: d.telephone } },
    });
    return { fournisseurReference: trx.reference };
  },

  async statut(ref) {
    const r = await appel(`/payments/${encodeURIComponent(ref)}`, { method: 'GET' });
    const trx = r.transaction as { status?: string } | undefined;
    return { statut: statutDepuisNotchPay(trx?.status) };
  },
};

export const simulation: Fournisseur = {
  nom: 'simulation',
  async demander(d) {
    return { fournisseurReference: `sim_${d.reference}` };
  },
  async statut(_ref, ctx) {
    return statutSimule(ctx.telephone, Date.now() - new Date(ctx.creeLe).getTime());
  },
};

/** Référence du projet Supabase de production (publique : elle figure dans son adresse). */
const REF_BASE_PRODUCTION = 'xglomngvjsgbwobiwfqp';

/**
 * Clé de TEST seulement hors de la vraie base, clé réelle seulement sur elle :
 * sinon un paiement de test « réussi » réglerait une vraie facture, ou de
 * l'argent réel serait enregistré dans une base de test.
 */
export function cleCompatibleAvecBase(cle: string, urlSupabase: string): boolean {
  const cleDeTest = /^pk_test[._]/.test(cle);
  const vraieBase = urlSupabase.includes(REF_BASE_PRODUCTION);
  return cleDeTest ? !vraieBase : vraieBase;
}

/** Le fournisseur en service, ou null si le paiement en ligne n'est pas configuré. */
export function fournisseurActif(): Fournisseur | null {
  const cle = process.env.NOTCHPAY_PUBLIC_KEY;
  if (cle) return cleCompatibleAvecBase(cle, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') ? notchPay : null;
  // La simulation ne s'allume jamais sur Vercel, ni en production NI sur une
  // préversion : une préversion partage la vraie base, et de faux paiements y
  // régleraient de vraies factures (audit du 11/10/2026). Poste local seulement,
  // et jamais branché sur la vraie base (`pnpm start` avec .env.local).
  const vraieBase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(REF_BASE_PRODUCTION);
  if (process.env.PAIEMENT_SIMULATION === '1' && !process.env.VERCEL && !vraieBase) return simulation;
  return null;
}

/** Signature d'une notification Notch Pay (en-tête x-notch-signature, HMAC SHA-256 du corps brut). */
export function signatureValide(corpsBrut: string, signature: string | null, cle: string | undefined): boolean {
  if (!signature || !cle) return false;
  const attendue = createHmac('sha256', cle).update(corpsBrut).digest('hex');
  const a = Buffer.from(signature.trim().toLowerCase());
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

export { ErreurFournisseur };
