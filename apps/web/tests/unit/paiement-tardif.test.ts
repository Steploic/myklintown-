/**
 * Paiement validé sur le téléphone APRÈS son expiration chez nous (revue du
 * 09/11/2026) : l'abonné est débité, la notification de Notch Pay doit
 * l'enregistrer. Base et fournisseur simulés : seul le déroulé est vérifié.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ligne = {
  reference: string;
  fournisseur: string;
  fournisseur_reference: string | null;
  telephone: string;
  statut: string;
  message: string | null;
  created_at: string;
};

const base = vi.hoisted(() => ({
  ligne: null as Ligne | null,
  rpc: [] as string[],
  majs: [] as Record<string, unknown>[],
}));
const statutChezFournisseur = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase-service', () => ({
  cleServiceSupabase: () => 'cle',
  clientService: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: base.ligne, error: null }) }) }),
      update: (valeurs: Record<string, unknown>) => ({
        eq: async () => {
          base.majs.push(valeurs);
          return { error: null };
        },
      }),
    }),
    rpc: async (fonction: string) => {
      base.rpc.push(fonction);
      return { data: 'paiement-1', error: null };
    },
  }),
}));
vi.mock('@/lib/paiement/fournisseur', () => ({
  fournisseurActif: () => ({ nom: 'notchpay', statut: statutChezFournisseur }),
}));
vi.mock('@/lib/server', () => ({
  row: (d: unknown) => d ?? null,
  rows: (d: unknown) => (Array.isArray(d) ? d : []),
  parametre: async () => 0.1,
}));

const { actualiserPaiement, traiterNotification } = await import('@/lib/paiement/service');

const ilYA = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const ligne = (statut: string, minutes = 15): Ligne => ({
  reference: 'MKTREF',
  fournisseur: 'notchpay',
  fournisseur_reference: 'trx.test_1',
  telephone: '+237677000444',
  statut,
  message: null,
  created_at: ilYA(minutes),
});

beforeEach(() => {
  base.ligne = null;
  base.rpc = [];
  base.majs = [];
  statutChezFournisseur.mockReset();
});

describe('paiement noté expiré ici, validé plus tard sur le téléphone', () => {
  it('la notification de Notch Pay revérifie et ENREGISTRE le paiement', async () => {
    base.ligne = ligne('expire');
    statutChezFournisseur.mockResolvedValue({ statut: 'reussi' });
    await traiterNotification({ type: 'payment.complete', data: { trxref: 'MKTREF' } });
    expect(statutChezFournisseur).toHaveBeenCalledOnce();
    expect(base.rpc).toEqual(['enregistrer_paiement_en_ligne']);
  });

  it('le suivi de l’écran, lui, ne réinterroge pas un paiement terminé', async () => {
    base.ligne = ligne('expire');
    expect(await actualiserPaiement('MKTREF')).toEqual({ statut: 'expire', message: null });
    expect(statutChezFournisseur).not.toHaveBeenCalled();
  });

  it('toujours en attente ou échoué chez Notch Pay : rien ne change ici', async () => {
    for (const reponse of ['en_attente', 'echoue', 'annule']) {
      base.ligne = ligne('expire');
      statutChezFournisseur.mockResolvedValue({ statut: reponse });
      await traiterNotification({ type: 'payment.failed', data: { trxref: 'MKTREF' } });
    }
    expect(base.rpc).toEqual([]);
    expect(base.majs).toEqual([]);
  });

  it('un paiement déjà réussi n’est jamais réenregistré', async () => {
    base.ligne = ligne('reussi');
    await traiterNotification({ type: 'payment.complete', data: { trxref: 'MKTREF' } });
    expect(statutChezFournisseur).not.toHaveBeenCalled();
    expect(base.rpc).toEqual([]);
  });
});

describe('déroulé habituel (inchangé)', () => {
  it('en attente depuis plus de 10 min, toujours en attente : noté expiré', async () => {
    base.ligne = ligne('en_attente', 15);
    statutChezFournisseur.mockResolvedValue({ statut: 'en_attente' });
    expect((await actualiserPaiement('MKTREF'))?.statut).toBe('expire');
    expect(base.majs.at(-1)).toMatchObject({ statut: 'expire' });
  });

  it('en attente, réussi chez Notch Pay : enregistré', async () => {
    base.ligne = ligne('en_attente', 2);
    statutChezFournisseur.mockResolvedValue({ statut: 'reussi' });
    expect((await actualiserPaiement('MKTREF'))?.statut).toBe('reussi');
    expect(base.rpc).toEqual(['enregistrer_paiement_en_ligne']);
  });
});
