import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commissionSur,
  operateurProbable,
  statutDepuisNotchPay,
  statutSimule,
  telephoneMobileMoney,
} from '@/lib/paiement/regles';
import { fournisseurActif, notchPay, signatureValide } from '@/lib/paiement/fournisseur';

describe('numéro Mobile Money', () => {
  it('normalise les écritures courantes', () => {
    for (const t of ['677123456', '6 77 12 34 56', '+237 677 12 34 56', '00237677123456', '237677123456']) {
      expect(telephoneMobileMoney(t)).toBe('+237677123456');
    }
  });
  it('refuse un numéro qui n’est pas un mobile camerounais', () => {
    for (const t of ['', null, '22123456', '7771234567', '+33612345678', '67712345']) {
      expect(telephoneMobileMoney(t)).toBeNull();
    }
  });
  it('devine l’opérateur seulement sur les préfixes sûrs', () => {
    expect(operateurProbable('677123456')).toBe('cm.mtn');
    expect(operateurProbable('651234567')).toBe('cm.mtn');
    expect(operateurProbable('699123456')).toBe('cm.orange');
    expect(operateurProbable('656234567')).toBe('cm.orange');
    expect(operateurProbable('620123456')).toBeNull(); // préfixe non tranché : le ménage choisit
    expect(operateurProbable('abc')).toBeNull();
  });
});

describe('commission prélevée à la source', () => {
  it('arrondit au franc et ne dépasse jamais le montant', () => {
    expect(commissionSur(3500, 0.1)).toBe(350);
    expect(commissionSur(9500, 0.15)).toBe(1425);
    expect(commissionSur(3333, 0.1)).toBe(333);
    expect(commissionSur(100, 2)).toBe(100);
    expect(commissionSur(0, 0.1)).toBe(0);
    expect(commissionSur(3500, 0)).toBe(0);
  });
});

describe('statuts', () => {
  it('traduit les statuts Notch Pay', () => {
    expect(statutDepuisNotchPay('complete')).toBe('reussi');
    expect(statutDepuisNotchPay('failed')).toBe('echoue');
    expect(statutDepuisNotchPay('canceled')).toBe('annule');
    expect(statutDepuisNotchPay('expired')).toBe('expire');
    expect(statutDepuisNotchPay('pending')).toBe('en_attente');
    expect(statutDepuisNotchPay('processing')).toBe('en_attente');
    expect(statutDepuisNotchPay(undefined)).toBe('en_attente');
  });
  it('simulation : le résultat dépend de la fin du numéro', () => {
    expect(statutSimule('+237677000001', 60_000)).toMatchObject({ statut: 'echoue', message: 'Solde insuffisant.' });
    expect(statutSimule('+237677000002', 60_000).statut).toBe('echoue');
    expect(statutSimule('+237677000004', 60_000).statut).toBe('annule');
    expect(statutSimule('+237677000003', 60_000).statut).toBe('en_attente');
    expect(statutSimule('+237677123456', 1_000).statut).toBe('en_attente');
    expect(statutSimule('+237677123456', 6_000).statut).toBe('reussi');
  });
});

describe('notifications Notch Pay', () => {
  const corps = JSON.stringify({ type: 'payment.complete', data: { reference: 'trx.1', trxref: 'MKT1' } });
  const cle = 'cle-de-signature-test';
  const signature = createHmac('sha256', cle).update(corps).digest('hex');

  it('accepte une signature exacte', () => {
    expect(signatureValide(corps, signature, cle)).toBe(true);
    expect(signatureValide(corps, signature.toUpperCase(), cle)).toBe(true);
  });
  it('refuse un corps modifié, une mauvaise clé, une signature absente', () => {
    expect(signatureValide(corps.replace('MKT1', 'MKT2'), signature, cle)).toBe(false);
    expect(signatureValide(corps, signature, 'autre-cle')).toBe(false);
    expect(signatureValide(corps, null, cle)).toBe(false);
    expect(signatureValide(corps, signature, undefined)).toBe(false);
    expect(signatureValide(corps, 'abc', cle)).toBe(false);
  });
});

describe('choix du fournisseur', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('aucun sans configuration', () => {
    vi.stubEnv('NOTCHPAY_PUBLIC_KEY', '');
    vi.stubEnv('PAIEMENT_SIMULATION', '');
    expect(fournisseurActif()).toBeNull();
  });
  it('simulation en développement, jamais sur la production Vercel', () => {
    vi.stubEnv('NOTCHPAY_PUBLIC_KEY', '');
    vi.stubEnv('PAIEMENT_SIMULATION', '1');
    vi.stubEnv('VERCEL_ENV', '');
    expect(fournisseurActif()?.nom).toBe('simulation');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(fournisseurActif()).toBeNull();
  });
  it('Notch Pay dès que sa clé est là', () => {
    vi.stubEnv('NOTCHPAY_PUBLIC_KEY', 'pk_test_x');
    expect(fournisseurActif()?.nom).toBe('notchpay');
  });
});

describe('requêtes envoyées à Notch Pay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('initialise avec le compte du précollecteur et la commission, puis envoie sur MTN', async () => {
    vi.stubEnv('NOTCHPAY_PUBLIC_KEY', 'pk_test_abc');
    const appels: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      appels.push({ url, init });
      const corps = appels.length === 1
        ? { transaction: { reference: 'trx.42', status: 'pending' } }
        : { transaction: { reference: 'trx.42', status: 'processing' } };
      return new Response(JSON.stringify(corps), { status: appels.length === 1 ? 201 : 202 });
    });
    const r = await notchPay.demander({
      reference: 'MKTREF1',
      montant: 3500,
      commission: 350,
      compteConnecte: 'acct_123',
      description: 'Test Propreté A — facture F2610-00001',
      client: { nom: 'Famille Test', email: null },
      canal: 'cm.mtn',
      telephone: '+237677123456',
    });
    expect(r.fournisseurReference).toBe('trx.42');
    expect(appels[0]!.url).toBe('https://api.notchpay.co/payments');
    expect((appels[0]!.init.headers as Record<string, string>).Authorization).toBe('pk_test_abc');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({
      amount: 3500,
      currency: 'XAF',
      customer: { name: 'Famille Test', phone: '+237677123456' },
      description: 'Test Propreté A — facture F2610-00001',
      reference: 'MKTREF1',
      application_fee: 350,
      destination: { account: 'acct_123', amount: 3150 },
    });
    expect(appels[1]!.url).toBe('https://api.notchpay.co/payments/trx.42');
    expect(JSON.parse(appels[1]!.init.body as string)).toEqual({ channel: 'cm.mtn', data: { phone: '+237677123456' } });
  });

  it('remonte le message d’erreur de Notch Pay', async () => {
    vi.stubEnv('NOTCHPAY_PUBLIC_KEY', 'pk_test_abc');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'Invalid phone number' }), { status: 422 }));
    await expect(
      notchPay.demander({
        reference: 'X', montant: 100, commission: 10, compteConnecte: null, description: 'x',
        client: { nom: 'x' }, canal: 'cm.orange', telephone: '+237699000000',
      }),
    ).rejects.toThrow('Invalid phone number');
  });

  it('lit le statut d’un paiement', async () => {
    vi.stubEnv('NOTCHPAY_PUBLIC_KEY', 'pk_test_abc');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ transaction: { status: 'complete' } }), { status: 202 }));
    expect(await notchPay.statut('trx.42', { telephone: '', creeLe: '' })).toEqual({ statut: 'reussi' });
  });
});
