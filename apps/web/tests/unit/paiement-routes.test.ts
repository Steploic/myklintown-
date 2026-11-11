/**
 * Routes du paiement en ligne (revue du 10/11/2026) : la notification de Notch
 * Pay répond 500 quand la vérification est inachevée, pour être renvoyée ; le
 * rapprochement quotidien n'obéit qu'à la tâche planifiée de Vercel.
 */
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ traiterNotification: vi.fn(), rapprocherPaiements: vi.fn() }));
vi.mock('@/lib/paiement/service', () => service);

const { POST } = await import('@/app/api/paiements/notchpay/route');
const { GET } = await import('@/app/api/paiements/rapprochement/route');

const CLE = 'cle-de-signature-test';
const notification = (corps: string, signature = createHmac('sha256', CLE).update(corps).digest('hex')) =>
  POST(new Request('http://test/api/paiements/notchpay', { method: 'POST', body: corps, headers: { 'x-notch-signature': signature } }));
const corps = JSON.stringify({ type: 'payment.complete', data: { trxref: 'MKT1', reference: 'trx.1' } });

beforeEach(() => {
  service.traiterNotification.mockReset();
  service.rapprocherPaiements.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('notification Notch Pay', () => {
  beforeEach(() => vi.stubEnv('NOTCHPAY_WEBHOOK_HASH', CLE));

  it('vérification inachevée : 500, pour que Notch Pay la renvoie', async () => {
    service.traiterNotification.mockResolvedValue('a_reessayer');
    expect((await notification(corps)).status).toBe(500);
    expect(service.traiterNotification).toHaveBeenCalledWith({ type: 'payment.complete', data: { trxref: 'MKT1', reference: 'trx.1' } });
  });

  it('traitée ou sans objet : 200', async () => {
    for (const issue of ['traitee', 'ignoree']) {
      service.traiterNotification.mockResolvedValue(issue);
      expect((await notification(corps)).status).toBe(200);
    }
  });

  it('signature fausse : 401, rien n’est traité ; corps illisible : 400', async () => {
    expect((await notification(corps, 'abc')).status).toBe(401);
    expect((await notification('{pas du json')).status).toBe(400);
    expect(service.traiterNotification).not.toHaveBeenCalled();
  });
});

describe('rapprochement quotidien (tâche planifiée de Vercel)', () => {
  const appel = (autorisation?: string) =>
    GET(new Request('http://test/api/paiements/rapprochement', { headers: autorisation ? { authorization: autorisation } : {} }));

  it('fermé sans CRON_SECRET, et sans le bon jeton', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await appel('Bearer ')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', 'secret-du-planificateur');
    for (const mauvais of [undefined, 'secret-du-planificateur', 'Bearer autre', 'Bearer secret-du-planificateu']) {
      expect((await appel(mauvais)).status).toBe(401);
    }
    expect(service.rapprocherPaiements).not.toHaveBeenCalled();
  });

  it('appel planifié : rapprochement fait, bilan rendu ; 500 s’il reste des vérifications inachevées', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-du-planificateur');
    service.rapprocherPaiements.mockResolvedValue({ verifies: 3, enregistres: 1, inacheves: 0 });
    const r = await appel('Bearer secret-du-planificateur');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, actif: true, verifies: 3, enregistres: 1, inacheves: 0 });

    service.rapprocherPaiements.mockResolvedValue({ verifies: 3, enregistres: 1, inacheves: 1 });
    expect((await appel('Bearer secret-du-planificateur')).status).toBe(500);

    service.rapprocherPaiements.mockResolvedValue(null);
    expect(await (await appel('Bearer secret-du-planificateur')).json()).toEqual({ ok: true, actif: false });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.rapprocherPaiements.mockRejectedValue(new Error('base injoignable'));
    expect((await appel('Bearer secret-du-planificateur')).status).toBe(500);
  });
});
