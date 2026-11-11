/**
 * Garde-fous du paiement en ligne (revue du 10/11/2026), sur une base et un
 * fournisseur simulés : seul un précollecteur vérifié encaisse (W1) ; une
 * notification inachevée est retentée et un rapprochement quotidien rattrape
 * les notifications perdues (W2) ; une seule demande en cours par facture (W3) ;
 * le lien de paiement public et le suivi de l'écran sont limités (W11).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fausseBase, ilYA, type FausseBase, type Ligne } from '../support/fausse-base';

const etat = vi.hoisted(() => ({
  base: null as unknown as { client: unknown },
  fournisseur: null as null | { nom: string; demander: ReturnType<typeof vi.fn>; statut: ReturnType<typeof vi.fn> },
}));

vi.mock('@/lib/supabase-service', () => ({
  cleServiceSupabase: () => 'cle',
  clientService: () => etat.base.client,
}));
vi.mock('@/lib/paiement/fournisseur', () => ({
  fournisseurActif: () => etat.fournisseur,
}));
vi.mock('@/lib/server', () => ({
  row: (d: unknown) => d ?? null,
  rows: (d: unknown) => (Array.isArray(d) ? d : []),
  parametre: async () => 0.1,
}));

const { actualiserPaiement, demarrerPaiement, rapprocherPaiements, traiterNotification } = await import('@/lib/paiement/service');
const { MESSAGE_EXPIRE } = await import('@/lib/paiement/regles');

const FACTURE = 'facture-1';
const MINUTE = 60_000;
let base: FausseBase;
let demander: ReturnType<typeof vi.fn>;
let statutChezFournisseur: ReturnType<typeof vi.fn>;

function facture(entreprise: Ligne = {}, extra: Ligne = {}): Ligne {
  return {
    id: FACTURE, numero: 'F001-2611-00001', montant_fcfa: 3500, statut: 'emise', entreprise_id: 'ent-1', client_id: 'client-1',
    clients: { nom: 'Foyer Test', email: null },
    entreprises: { nom: 'Propreté Test', paiement_statut: 'actif', dossier_statut: 'valide', statut: 'actif', ...entreprise },
    ...extra,
  };
}

function demande(extra: Ligne = {}): Ligne {
  return {
    reference: 'MKTANCIEN', facture_id: FACTURE, entreprise_id: 'ent-1', client_id: 'client-1', statut: 'en_attente',
    origine: 'menage', telephone: '+237677000444', fournisseur: 'notchpay', fournisseur_reference: 'trx.ancien',
    message: null, created_at: ilYA(2 * MINUTE), verifie_at: ilYA(MINUTE), ...extra,
  };
}

const payer = (extra: Partial<Parameters<typeof demarrerPaiement>[0]> = {}) =>
  demarrerPaiement({ factureId: FACTURE, canal: 'cm.mtn', telephone: '677000444', origine: 'menage', initiePar: 'gerant-1', ...extra });

const transactions = () => base.tables.paiements_en_ligne!;
const ligne = (reference: string) => transactions().find((l) => l.reference === reference)!;

beforeEach(() => {
  base = fausseBase({ factures: [facture()], paiements_clients: [], paiements_en_ligne: [] });
  base.rpc.enregistrer_paiement_en_ligne = ({ p_reference }) => {
    Object.assign(ligne(String(p_reference)), { statut: 'reussi' });
    return { data: 'paiement-1', error: null };
  };
  etat.base = base;
  demander = vi.fn(async () => ({ fournisseurReference: 'trx.nouveau' }));
  statutChezFournisseur = vi.fn();
  etat.fournisseur = { nom: 'notchpay', demander, statut: statutChezFournisseur };
});

describe('W1 — seul un précollecteur vérifié par MyKlinTown encaisse en ligne', () => {
  it.each([
    ['dossier soumis, pas encore validé', { dossier_statut: 'soumis' }],
    ['dossier incomplet', { dossier_statut: 'incomplet' }],
    ['dossier refusé', { dossier_statut: 'refuse' }],
    ['entreprise suspendue', { statut: 'suspendu' }],
    ['paiement en ligne fermé par le gérant', { paiement_statut: 'inactif' }],
  ])('%s : aucune demande ne part', async (_cas, entreprise) => {
    base.tables.factures = [facture(entreprise)];
    expect((await payer()).error).toMatch(/n’accepte pas encore le paiement en ligne/);
    expect(demander).not.toHaveBeenCalled();
    expect(transactions()).toEqual([]);
  });

  it('dossier validé, entreprise active, paiement ouvert : la demande part', async () => {
    const r = await payer();
    expect(r).toMatchObject({ montant: 3500 });
    expect(r.reference).toMatch(/^MKT[0-9A-F]{20}$/);
    expect(demander).toHaveBeenCalledOnce();
    expect(ligne(r.reference!)).toMatchObject({ statut: 'en_attente', fournisseur_reference: 'trx.nouveau', montant_fcfa: 3500 });
  });
});

describe('W3 — une seule demande en cours par facture', () => {
  it('une demande récente en cours : la seconde est refusée', async () => {
    transactions().push(demande());
    expect((await payer()).error).toMatch(/déjà en cours/);
    expect(demander).not.toHaveBeenCalled();
  });

  it('une demande restée sans réponse plus de 10 min : expirée, la nouvelle part', async () => {
    transactions().push(demande({ created_at: ilYA(15 * MINUTE) }));
    const r = await payer();
    expect(r.error).toBeUndefined();
    expect(ligne('MKTANCIEN')).toMatchObject({ statut: 'expire', message: MESSAGE_EXPIRE });
    expect(demander).toHaveBeenCalledOnce();
  });

  it('deux demandes simultanées : celle qui arrive en second à l’écriture est refusée (index unique)', async () => {
    base.avantInsertion = () => {
      base.avantInsertion = null;
      transactions().push(demande({ reference: 'MKTCONCURRENTE', created_at: new Date().toISOString() }));
    };
    expect((await payer()).error).toMatch(/déjà en cours/);
    expect(demander).not.toHaveBeenCalled();
    expect(transactions().map((l) => l.reference)).toEqual(['MKTCONCURRENTE']);
  });

  it('une facture déjà réglée ne se paie pas', async () => {
    base.tables.paiements_clients = [{ facture_id: FACTURE, montant_fcfa: 3500, statut: 'valide' }];
    expect((await payer()).error).toBe('Cette facture est déjà réglée.');
  });
});

describe('W11 — lien de paiement public : demandes limitées', () => {
  const anciennes = (n: number, extra: (i: number) => Ligne) =>
    Array.from({ length: n }, (_, i) => demande({ reference: `MKTL${i}`, origine: 'lien', statut: 'echoue', ...extra(i) }));

  it('5 demandes par lien sur cette facture dans l’heure : refusé ; depuis l’espace de l’abonné : accepté', async () => {
    transactions().push(...anciennes(5, (i) => ({ telephone: `+23767700010${i}`, created_at: ilYA(10 * MINUTE) })));
    expect((await payer({ origine: 'lien', initiePar: null })).error).toMatch(/Trop de demandes de paiement pour cette facture/);
    expect(demander).not.toHaveBeenCalled();
    expect((await payer()).error).toBeUndefined();
  });

  it('5 demandes par lien vers ce numéro dans l’heure (autres factures) : refusé', async () => {
    transactions().push(...anciennes(5, () => ({ facture_id: 'autre-facture', created_at: ilYA(10 * MINUTE) })));
    expect((await payer({ origine: 'lien', initiePar: null })).error).toMatch(/Trop de demandes vers ce numéro/);
  });

  it('les demandes de plus d’une heure ne comptent plus', async () => {
    transactions().push(...anciennes(5, () => ({ created_at: ilYA(2 * 60 * MINUTE) })));
    expect((await payer({ origine: 'lien', initiePar: null })).error).toBeUndefined();
  });

  it('comptage impossible : refusé par prudence', async () => {
    base.panne = { table: 'paiements_en_ligne', action: 'select' };
    expect((await payer({ origine: 'lien', initiePar: null })).error).toBe('Le paiement n’a pas pu être préparé. Réessayez.');
    expect(demander).not.toHaveBeenCalled();
  });
});

describe('W2 — notification de Notch Pay : une vérification inachevée est retentée', () => {
  const notification = (data: Record<string, unknown>, type = 'payment.complete') => traiterNotification({ type, data });

  it('paiement réussi : enregistré une fois, notification traitée', async () => {
    transactions().push(demande());
    statutChezFournisseur.mockResolvedValue({ statut: 'reussi' });
    expect(await notification({ trxref: 'MKTANCIEN' })).toBe('traitee');
    expect(base.appelsRpc.map((a) => a.fonction)).toEqual(['enregistrer_paiement_en_ligne']);
  });

  it('Notch Pay injoignable pendant la revérification : à retenter (réponse 500)', async () => {
    transactions().push(demande());
    statutChezFournisseur.mockRejectedValue(new Error('timeout'));
    expect(await notification({ trxref: 'MKTANCIEN' })).toBe('a_reessayer');
    expect(ligne('MKTANCIEN').statut).toBe('en_attente');
  });

  it('enregistrement refusé par la base : à retenter', async () => {
    transactions().push(demande());
    statutChezFournisseur.mockResolvedValue({ statut: 'reussi' });
    base.rpc.enregistrer_paiement_en_ligne = () => ({ data: null, error: { message: 'connexion perdue' } });
    expect(await notification({ trxref: 'MKTANCIEN' })).toBe('a_reessayer');
  });

  it('base illisible : à retenter', async () => {
    transactions().push(demande());
    base.panne = { table: 'paiements_en_ligne', action: 'select' };
    expect(await notification({ trxref: 'MKTANCIEN' })).toBe('a_reessayer');
    expect(statutChezFournisseur).not.toHaveBeenCalled();
  });

  it('échec chez Notch Pay noté ; si la note ne s’écrit pas : à retenter', async () => {
    transactions().push(demande());
    statutChezFournisseur.mockResolvedValue({ statut: 'echoue', message: 'Solde insuffisant.' });
    base.panne = { table: 'paiements_en_ligne', action: 'update' };
    expect(await notification({ trxref: 'MKTANCIEN' }, 'payment.failed')).toBe('a_reessayer');
    expect(await notification({ trxref: 'MKTANCIEN' }, 'payment.failed')).toBe('traitee');
    expect(ligne('MKTANCIEN')).toMatchObject({ statut: 'echoue', message: 'Solde insuffisant.' });
  });

  it('référence inconnue ici, ou autre événement que « payment.* » : rien à retenter', async () => {
    expect(await notification({ trxref: 'MKTINCONNUE' })).toBe('ignoree');
    expect(await notification({ reference: 'trx.inconnue' })).toBe('ignoree');
    expect(await notification({ trxref: 'MKTANCIEN' }, 'transfer.complete')).toBe('ignoree');
    expect(statutChezFournisseur).not.toHaveBeenCalled();
  });

  it('demande partie chez Notch Pay sans que leur référence ait été notée : la notification signée l’apporte', async () => {
    transactions().push(demande({ statut: 'initie', fournisseur_reference: null }));
    statutChezFournisseur.mockResolvedValue({ statut: 'reussi' });
    expect(await notification({ trxref: 'MKTANCIEN', reference: 'trx.signee' })).toBe('traitee');
    expect(statutChezFournisseur).toHaveBeenCalledWith('trx.signee', expect.anything());
    expect(ligne('MKTANCIEN')).toMatchObject({ fournisseur_reference: 'trx.signee', statut: 'reussi' });
  });

  it('une référence déjà notée n’est jamais remplacée', async () => {
    transactions().push(demande());
    statutChezFournisseur.mockResolvedValue({ statut: 'en_attente' });
    await notification({ trxref: 'MKTANCIEN', reference: 'trx.autre' });
    expect(ligne('MKTANCIEN').fournisseur_reference).toBe('trx.ancien');
  });
});

describe('W11 — suivi de l’écran : Notch Pay interrogé toutes les 2 s au plus par paiement', () => {
  it('interrogé il y a moins de 2 s : réponse sans appel à Notch Pay', async () => {
    transactions().push(demande({ verifie_at: ilYA(500) }));
    expect(await actualiserPaiement('MKTANCIEN', { limiter: true })).toEqual({ statut: 'en_attente', message: null });
    expect(statutChezFournisseur).not.toHaveBeenCalled();
  });

  it('au-delà : Notch Pay interrogé, l’heure de vérification notée', async () => {
    transactions().push(demande({ verifie_at: ilYA(5_000) }));
    statutChezFournisseur.mockResolvedValue({ statut: 'en_attente' });
    await actualiserPaiement('MKTANCIEN', { limiter: true });
    expect(statutChezFournisseur).toHaveBeenCalledOnce();
    expect(Date.now() - new Date(String(ligne('MKTANCIEN').verifie_at)).getTime()).toBeLessThan(1_000);
  });

  it('notification et rapprochement ne sont jamais limités', async () => {
    transactions().push(demande({ verifie_at: new Date().toISOString() }));
    statutChezFournisseur.mockResolvedValue({ statut: 'en_attente' });
    await traiterNotification({ type: 'payment.complete', data: { trxref: 'MKTANCIEN' } });
    expect(statutChezFournisseur).toHaveBeenCalledOnce();
  });
});

describe('W2 — rapprochement quotidien', () => {
  beforeEach(() => {
    transactions().push(
      demande({ reference: 'MKTVALIDE', statut: 'en_attente', created_at: ilYA(20 * MINUTE), fournisseur_reference: 'trx.valide' }),
      demande({ reference: 'MKTEXPIRE', statut: 'expire', created_at: ilYA(3 * 60 * MINUTE), fournisseur_reference: 'trx.expire' }),
      demande({ reference: 'MKTREUSSI', statut: 'reussi', fournisseur_reference: 'trx.reussi' }),
      demande({ reference: 'MKTJAMAISPARTI', statut: 'initie', fournisseur_reference: null }),
      demande({ reference: 'MKTVIEUX', statut: 'expire', created_at: ilYA(3 * 24 * 60 * MINUTE), fournisseur_reference: 'trx.vieux' }),
      demande({ reference: 'MKTSIMULE', statut: 'en_attente', fournisseur: 'simulation', fournisseur_reference: 'sim_x' }),
    );
  });

  it('revérifie les demandes des dernières 48 h en cours ou expirées, enregistre celles validées', async () => {
    statutChezFournisseur.mockImplementation(async (ref: string) => ({ statut: ref === 'trx.valide' ? 'reussi' : 'echoue' }));
    expect(await rapprocherPaiements()).toEqual({ verifies: 2, enregistres: 1, inacheves: 0 });
    expect(statutChezFournisseur.mock.calls.map((c) => c[0]).sort()).toEqual(['trx.expire', 'trx.valide']);
    expect(base.appelsRpc).toEqual([{ fonction: 'enregistrer_paiement_en_ligne', args: { p_reference: 'MKTVALIDE' } }]);
    expect(ligne('MKTEXPIRE').statut).toBe('expire');
  });

  it('Notch Pay injoignable pour l’une : comptée comme inachevée', async () => {
    statutChezFournisseur.mockImplementation(async (ref: string) => {
      if (ref === 'trx.expire') throw new Error('timeout');
      return { statut: 'reussi' };
    });
    expect(await rapprocherPaiements()).toEqual({ verifies: 2, enregistres: 1, inacheves: 1 });
  });

  it('paiement en ligne non configuré : rien à faire', async () => {
    etat.fournisseur = null;
    expect(await rapprocherPaiements()).toBeNull();
  });
});
