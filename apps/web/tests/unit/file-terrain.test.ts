import { beforeEach, describe, expect, it } from 'vitest';
import {
  ajouter,
  definirCompte,
  envoyer,
  oublierRefus,
  operations,
  utiliserStockage,
  CLE_STOCKAGE,
  type Executeurs,
  type ResultatEnvoi,
} from '@/lib/hors-ligne/file-terrain';

/** Stockage en mémoire (le vrai localStorage n'existe pas sous Node). */
function memoire() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

let stock: ReturnType<typeof memoire>;
beforeEach(() => {
  stock = memoire();
  utiliserStockage(stock);
});

/** Exécuteurs qui notent l'ordre d'envoi et répondent selon un scénario. */
function executeurs(reponse: (quoi: string) => ResultatEnvoi | 'exception' = () => ({})) {
  const envoyes: string[] = [];
  const jouer = async (quoi: string) => {
    envoyes.push(quoi);
    const r = reponse(quoi);
    if (r === 'exception') throw new TypeError('Failed to fetch');
    return r;
  };
  const ex: Executeurs = {
    pointage: (op) => jouer(`pointage:${op.collecteId}:${op.statut}`),
    scan: (op) => jouer(`scan:${op.code}`),
  };
  return { ex, envoyes };
}

describe('file des gestes faits hors ligne', () => {
  it('garde les gestes sur le téléphone (ils survivent à un rechargement)', () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    ajouter({ type: 'pointage', tourneeId: 't1', collecteId: 'c1', statut: 'realisee', motif: null });
    const relu = JSON.parse(stock.m.get(CLE_STOCKAGE)!);
    expect(relu.map((o: { type: string }) => o.type)).toEqual(['scan', 'pointage']);
    // « Rechargement » : on relit depuis le stockage.
    utiliserStockage(stock);
    expect(operations()).toHaveLength(2);
  });

  it('note l’heure du geste', () => {
    const avant = Date.now();
    const op = ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    expect(new Date(op.horodatage).getTime()).toBeGreaterThanOrEqual(avant);
  });

  it('envoie dans l’ordre des gestes, puis vide la file', async () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    ajouter({ type: 'pointage', tourneeId: 't1', collecteId: 'c2', statut: 'non_realisee', motif: 'Client absent' });
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-BBBB2222' });
    const { ex, envoyes } = executeurs();
    const bilan = await envoyer(ex);
    expect(envoyes).toEqual(['scan:MKT-AAAA1111', 'pointage:c2:non_realisee', 'scan:MKT-BBBB2222']);
    expect(bilan).toMatchObject({ envoyees: 3, refusees: 0, restantes: 0, coupure: false });
    expect(operations()).toHaveLength(0);
  });

  it('une coupure arrête l’envoi : le reste attend le prochain essai, rien n’est perdu', async () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-BBBB2222' });
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-CCCC3333' });
    const { ex } = executeurs((q) => (q === 'scan:MKT-BBBB2222' ? 'exception' : {}));
    const bilan = await envoyer(ex);
    expect(bilan).toMatchObject({ envoyees: 1, coupure: true, restantes: 2 });
    expect(operations().map((o) => (o.type === 'scan' ? o.code : ''))).toEqual(['MKT-BBBB2222', 'MKT-CCCC3333']);
  });

  it('une erreur réseau RENVOYÉE par le serveur (Supabase injoignable) compte aussi comme une coupure', async () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    const { ex } = executeurs(() => ({ error: 'Connexion au serveur impossible.', reseau: true }));
    expect(await envoyer(ex)).toMatchObject({ coupure: true, refusees: 0, restantes: 1 });
    expect(operations()[0]!.refus).toBeUndefined();
  });

  it('un refus du serveur est gardé avec son motif, et l’envoi continue', async () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-INCONNU0' });
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-BBBB2222' });
    const { ex } = executeurs((q) => (q === 'scan:MKT-INCONNU0' ? { error: 'Code MKT-INCONNU0 inconnu' } : {}));
    const bilan = await envoyer(ex);
    expect(bilan).toMatchObject({ envoyees: 1, refusees: 1, restantes: 0 });
    expect(operations()).toHaveLength(1);
    expect(operations()[0]!.refus).toBe('Code MKT-INCONNU0 inconnu');
    // Un refus n'est pas rejoué…
    const second = executeurs();
    await envoyer(second.ex);
    expect(second.envoyes).toEqual([]);
    // … et disparaît quand l'agent l'a lu.
    oublierRefus('t1');
    expect(operations()).toHaveLength(0);
  });

  it('le même QR scanné deux fois hors ligne ne fait qu’un passage', () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    ajouter({ type: 'scan', tourneeId: 't2', code: 'MKT-AAAA1111' });
    expect(operations()).toHaveLength(2);
  });

  it('un nouveau pointage du même passage remplace celui en attente', () => {
    ajouter({ type: 'pointage', tourneeId: 't1', collecteId: 'c1', statut: 'realisee', motif: null });
    ajouter({ type: 'pointage', tourneeId: 't1', collecteId: 'c1', statut: 'prevue', motif: null });
    expect(operations()).toHaveLength(1);
    expect(operations()[0]).toMatchObject({ type: 'pointage', statut: 'prevue' });
  });

  it('un seul envoi à la fois : deux appels simultanés ne doublent rien', async () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    const { ex, envoyes } = executeurs();
    await Promise.all([envoyer(ex), envoyer(ex)]);
    expect(envoyes).toEqual(['scan:MKT-AAAA1111']);
  });
});

// Revue du 10/11/2026 : un téléphone partagé ne rejoue pas les gestes d'un
// agent sous le nom d'un autre.
describe('téléphone partagé : chaque geste reste à son auteur', () => {
  it('les gestes d’un compte ne sont ni montrés ni envoyés sous un autre compte', async () => {
    definirCompte('agent-a');
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    ajouter({ type: 'pointage', tourneeId: 't1', collecteId: 'c1', statut: 'realisee', motif: null });

    definirCompte('agent-b');
    expect(operations()).toHaveLength(0);
    const b = executeurs();
    expect(await envoyer(b.ex)).toMatchObject({ envoyees: 0, restantes: 0 });
    expect(b.envoyes).toEqual([]);
    // Ils sont toujours sur le téléphone.
    expect(JSON.parse(stock.m.get(CLE_STOCKAGE)!)).toHaveLength(2);

    definirCompte('agent-a');
    expect(operations()).toHaveLength(2);
    const a = executeurs();
    expect(await envoyer(a.ex)).toMatchObject({ envoyees: 2, restantes: 0 });
    expect(a.envoyes).toEqual(['scan:MKT-AAAA1111', 'pointage:c1:realisee']);
  });

  it('chaque compte ne voit et n’efface que ses propres refus ; les doublons se comptent par compte', async () => {
    definirCompte('agent-a');
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    await envoyer(executeurs(() => ({ error: 'Tournée close' })).ex);
    expect(operations().filter((o) => o.refus)).toHaveLength(1);

    definirCompte('agent-b');
    // Le même QR, scanné par un autre agent, n'est pas confondu avec celui de A.
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    expect(operations()).toHaveLength(1);
    oublierRefus();
    expect(operations()).toHaveLength(1);

    definirCompte('agent-a');
    expect(operations().filter((o) => o.refus)).toHaveLength(1);
  });

  it('un geste d’avant cette règle (sans compte) revient au compte qui ouvre l’application', () => {
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111' });
    expect(operations()[0]!.compte).toBeUndefined();
    definirCompte('agent-a');
    expect(operations()).toHaveLength(1);
    expect(operations()[0]!.compte).toBe('agent-a');
    definirCompte('agent-b');
    expect(operations()).toHaveLength(0);
  });

  it('après 30 jours, le geste d’un autre compte est oublié ; les siens restent', () => {
    const vieux = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    definirCompte('agent-a');
    ajouter({ type: 'scan', tourneeId: 't1', code: 'MKT-AAAA1111', horodatage: vieux });
    definirCompte('agent-a');
    expect(operations()).toHaveLength(1);
    definirCompte('agent-b');
    expect(JSON.parse(stock.m.get(CLE_STOCKAGE)!)).toHaveLength(0);
  });
});
