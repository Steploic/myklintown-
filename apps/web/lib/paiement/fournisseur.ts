import { createHmac, timingSafeEqual } from 'node:crypto';
import { statutDepuisNotchPay, statutSimule, type Canal, type StatutPaiementEnLigne } from './regles';

/**
 * Fournisseur de paiement : Notch Pay en vrai, ou une simulation pour le
 * développement et les tests (jamais en production).
 *
 * Variables d'environnement (serveur uniquement, jamais NEXT_PUBLIC_) :
 *   NOTCHPAY_PUBLIC_KEY   clé publique (pk_…) — initialiser et suivre un paiement
 *   NOTCHPAY_PRIVATE_KEY  clé privée (sk_…) — comptes connectés (en-tête X-Grant)
 *   NOTCHPAY_WEBHOOK_HASH clé de signature des notifications
 *   PAIEMENT_SIMULATION=1 mode simulation (ignoré sur la production Vercel)
 *
 * Documentation suivie : developer.notchpay.co (paiement direct Mobile Money,
 * Sync pour les comptes connectés, notifications signées HMAC SHA-256).
 * ⚠️ Quelques points de cette documentation varient d'une page à l'autre
 * (désignation du compte connecté, chemin des comptes) : à confirmer en mode
 * test dès l'ouverture du compte Notch Pay.
 */

export interface DemandePaiement {
  reference: string;
  montant: number;
  commission: number;
  compteConnecte: string | null;
  description: string;
  client: { nom: string; email?: string | null };
  canal: Canal;
  telephone: string;
}

export interface CompteConnecte {
  id: string;
  statut: 'en_verification' | 'actif' | 'refuse';
}

export interface Fournisseur {
  nom: 'notchpay' | 'simulation';
  /** Crée le paiement chez le fournisseur puis l'envoie sur le téléphone du payeur. */
  demander(d: DemandePaiement): Promise<{ fournisseurReference: string }>;
  statut(fournisseurReference: string, ctx: { telephone: string; creeLe: string }): Promise<{ statut: StatutPaiementEnLigne; message?: string }>;
  creerCompte(e: { nom: string; email: string | null; telephone: string | null; entrepriseId: string }): Promise<string>;
  lienVerification(compteId: string, retour: string): Promise<string>;
  etatCompte(compteId: string): Promise<CompteConnecte['statut']>;
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
    const corps: Record<string, unknown> = {
      amount: d.montant,
      currency: 'XAF',
      customer: { name: d.client.nom, phone: d.telephone, ...(d.client.email ? { email: d.client.email } : {}) },
      description: d.description,
      reference: d.reference,
    };
    // Argent versé au précollecteur, commission MyKlinTown prélevée à la source.
    if (d.compteConnecte) {
      corps.application_fee = d.commission;
      corps.destination = { account: d.compteConnecte, amount: d.montant - d.commission };
    }
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

  async creerCompte(e) {
    const r = await appel('/accounts', {
      method: 'POST',
      prive: true,
      body: {
        type: 'express',
        business_profile: { name: e.nom, category: 'services' },
        ...(e.email ? { email: e.email } : {}),
        ...(e.telephone ? { phone: e.telephone } : {}),
        metadata: { entreprise_id: e.entrepriseId },
      },
    });
    const id = (r.account as { id?: string } | undefined)?.id ?? (r.id as string | undefined);
    if (!id) throw new ErreurFournisseur('Réponse inattendue de Notch Pay (compte absent).');
    return id;
  },

  async lienVerification(compteId, retour) {
    const r = await appel(`/accounts/${encodeURIComponent(compteId)}/onboarding`, {
      method: 'POST',
      prive: true,
      body: { callback: retour },
    });
    const url = (r.url as string | undefined) ?? (r.onboarding as { url?: string } | undefined)?.url;
    if (!url) throw new ErreurFournisseur('Réponse inattendue de Notch Pay (lien de vérification absent).');
    return url;
  },

  async etatCompte(compteId) {
    const r = await appel(`/accounts/${encodeURIComponent(compteId)}`, { method: 'GET', prive: true });
    const compte = (r.account ?? r) as { verification?: { status?: string } };
    const s = compte.verification?.status;
    return s === 'verified' ? 'actif' : s === 'rejected' ? 'refuse' : 'en_verification';
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
  async creerCompte(e) {
    return `sim_compte_${e.entrepriseId}`;
  },
  async lienVerification(_compteId, retour) {
    return retour;
  },
  async etatCompte() {
    return 'actif';
  },
};

/** Le fournisseur en service, ou null si le paiement en ligne n'est pas configuré. */
export function fournisseurActif(): Fournisseur | null {
  if (process.env.NOTCHPAY_PUBLIC_KEY) return notchPay;
  // La simulation ne s'allume jamais sur la production Vercel : de faux
  // paiements y régleraient de vraies factures.
  if (process.env.PAIEMENT_SIMULATION === '1' && process.env.VERCEL_ENV !== 'production') return simulation;
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
