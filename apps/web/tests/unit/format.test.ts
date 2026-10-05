import { describe, expect, it, vi } from 'vitest';
import {
  ajouterJours,
  ajouterMois,
  dateFr,
  fcfa,
  isoJour,
  joursEntre,
  messageEcheance,
  messageRelance,
  niveauRelance,
  NIVEAUX_RELANCE,
  nombre,
  pct,
  STATUT_ABONNEMENT,
  statutAbonnement,
  telInternational,
  telLisible,
} from '@/lib/format';

const espace = (s: string) => s.replace(/[  ]/g, ' ');

describe('montants et nombres', () => {
  it('formate les francs CFA avec séparateur de milliers', () => {
    expect(espace(fcfa(3500))).toBe('3 500 FCFA');
    expect(espace(fcfa(35000))).toBe('35 000 FCFA');
    expect(espace(fcfa(0))).toBe('0 FCFA');
  });
  it('arrondit et tolère null / undefined', () => {
    expect(espace(fcfa(1049.6))).toBe('1 050 FCFA');
    expect(espace(fcfa(null))).toBe('0 FCFA');
    expect(espace(nombre(undefined))).toBe('0');
  });
  it('calcule un pourcentage sans diviser par zéro', () => {
    expect(pct(1, 4)).toBe('25 %');
    expect(pct(2, 3)).toBe('67 %');
    expect(pct(3, 0)).toBe('—');
  });
});

describe('dates (AAAA-MM-JJ)', () => {
  it('ajoute des jours en changeant de mois et d’année', () => {
    expect(ajouterJours('2026-09-28', 7)).toBe('2026-10-05');
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('gère les années bissextiles', () => {
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('ajoute des mois', () => {
    expect(ajouterMois('2026-10-01', 1)).toBe('2026-11-01');
    expect(ajouterMois('2026-10-01', 3)).toBe('2027-01-01');
    expect(ajouterMois('2026-10-01', 12)).toBe('2027-10-01');
  });
  it('compte les jours entre deux dates', () => {
    expect(joursEntre('2026-09-01', '2026-09-28')).toBe(27);
    expect(joursEntre('2026-09-28', '2026-09-01')).toBe(-27);
    expect(joursEntre('2026-10-24', '2026-10-26')).toBe(2);
  });
  it('isoJour renvoie le format attendu', () => {
    expect(isoJour(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
  it('dateFr ne décale pas la date d’un jour (fuseau)', () => {
    expect(dateFr('2026-10-01')).toMatch(/^1 oct/);
    expect(dateFr(null)).toBe('—');
  });
});

describe('téléphones camerounais', () => {
  it('normalise vers l’international sans « + »', () => {
    expect(telInternational('677112233')).toBe('237677112233');
    expect(telInternational('+237 6 77 11 22 33')).toBe('237677112233');
    expect(telInternational('00237677112233')).toBe('237677112233');
    expect(telInternational('(+237) 677-11-22-33')).toBe('237677112233');
    expect(telInternational('')).toBeNull();
    expect(telInternational(null)).toBeNull();
    expect(telInternational('123')).toBeNull();
  });
  it('affiche un numéro lisible', () => {
    expect(telLisible('677112233')).toBe('+237 6 77 11 22 33');
    expect(telLisible(null)).toBe('—');
  });
});

describe('statuts d’abonnement', () => {
  it('chaque statut calculé en base a un libellé et une couleur terrain', () => {
    for (const s of ['a_jour', 'echeance_proche', 'impaye', 'expire', 'sans_facture', 'demande', 'suspendu', 'resilie']) {
      expect(STATUT_ABONNEMENT[s as keyof typeof STATUT_ABONNEMENT]).toBeDefined();
    }
  });
  it('code couleur : à jour = servir, impayé = ne pas servir', () => {
    expect(statutAbonnement('a_jour').terrain).toBe('ok');
    expect(statutAbonnement('echeance_proche').terrain).toBe('relance');
    expect(statutAbonnement('impaye').terrain).toBe('stop');
    expect(statutAbonnement('expire').terrain).toBe('stop');
  });
  it('un statut inconnu ne fait pas planter l’affichage', () => {
    expect(statutAbonnement('nimporte_quoi').label).toBeTruthy();
    expect(statutAbonnement(undefined).label).toBeTruthy();
  });
});

describe('relances graduées', () => {
  it('niveau selon l’ancienneté du retard', () => {
    expect(niveauRelance(1)).toBe(1);
    expect(niveauRelance(7)).toBe(1);
    expect(niveauRelance(8)).toBe(2);
    expect(niveauRelance(21)).toBe(2);
    expect(niveauRelance(22)).toBe(3);
    expect(niveauRelance(90)).toBe(3);
  });
  it('chaque niveau a un libellé', () => {
    expect(NIVEAUX_RELANCE[1].label).toBe('Rappel');
    expect(NIVEAUX_RELANCE[3].label).toBe('Mise en demeure');
  });
  it('les messages citent le client, le montant, la facture et l’entreprise', () => {
    for (const niveau of [1, 2, 3] as const) {
      const m = espace(messageRelance({ niveau, client: 'Famille Ateba', montant: 3500, entreprise: 'Propreté Nsam', numero: 'F2609-00001', echeance: '2026-09-20' }));
      expect(m).toContain('Famille Ateba');
      expect(m).toContain('3 500 FCFA');
      expect(m).toContain('F2609-00001');
      expect(m).toContain('Propreté Nsam');
    }
  });
  it('seule la mise en demeure annonce la suspension effective', () => {
    expect(messageRelance({ niveau: 3, client: 'X', montant: 1, entreprise: 'Y' })).toMatch(/suspendue jusqu/);
    expect(messageRelance({ niveau: 1, client: 'X', montant: 1, entreprise: 'Y' })).not.toMatch(/suspendue/);
  });
  it('le rappel d’échéance donne la date et le prix de renouvellement', () => {
    const m = espace(messageEcheance({ client: 'Mme Ekani', fin: '2026-10-05', entreprise: 'Propreté Nsam', prix: 3500 }));
    expect(m).toContain('Mme Ekani');
    expect(m).toContain('5 oct');
    expect(m).toContain('3 500 FCFA');
  });
});

describe('erreurs réseau', () => {
  it('reconnaît une coupure réseau', async () => {
    const { estErreurReseau } = await import('@/lib/format');
    expect(estErreurReseau({ message: 'fetch failed' })).toBe(true);
    expect(estErreurReseau({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(estErreurReseau({ message: 'x', status: 0 })).toBe(true);
    expect(estErreurReseau({ message: 'read ECONNRESET' })).toBe(true);
    // Appel serveur abandonné après le délai maximal (connexion morte).
    expect(estErreurReseau({ message: 'TimeoutError: The operation was aborted due to timeout' })).toBe(true);
  });
  it('ne confond pas un refus du serveur avec une coupure', async () => {
    const { estErreurReseau } = await import('@/lib/format');
    expect(estErreurReseau({ message: 'Invalid login credentials', status: 400 })).toBe(false);
    expect(estErreurReseau({ message: 'new row violates row-level security policy' })).toBe(false);
    expect(estErreurReseau(null)).toBe(false);
  });
});

describe('fetch borné des appels serveur à Supabase', () => {
  it('abandonne un appel bloqué au lieu de figer la page', async () => {
    const { creerFetchAvecDelai, DELAI_SUPABASE_MS } = await import('@myklintown/db/server');
    expect(DELAI_SUPABASE_MS).toBeLessThanOrEqual(30_000);
    const origine = globalThis.fetch;
    const journal = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Serveur qui ne répond jamais, sauf abandon.
    globalThis.fetch = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, rejeter) => init?.signal?.addEventListener('abort', () => rejeter(init.signal!.reason)))) as typeof fetch;
    try {
      const debut = Date.now();
      await expect(creerFetchAvecDelai(50)('https://exemple.supabase.co/rest/v1/clients?select=id')).rejects.toThrow(/timeout|aborted/i);
      expect(Date.now() - debut).toBeLessThan(2_000);
      expect(journal).toHaveBeenCalledWith(expect.stringMatching(/abandon après 0\.05 s \/rest\/v1\/clients$/));
    } finally {
      journal.mockRestore();
      globalThis.fetch = origine;
    }
  });
  it('laisse passer un abandon demandé par l’appelant', async () => {
    const { fetchAvecDelai } = await import('@myklintown/db/server');
    const origine = globalThis.fetch;
    globalThis.fetch = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, rejeter) => init?.signal?.addEventListener('abort', () => rejeter(new Error('annulé par l’appelant'))))) as typeof fetch;
    try {
      const ctrl = new AbortController();
      const appel = fetchAvecDelai('https://exemple.supabase.co/rest/v1/x', { signal: ctrl.signal });
      ctrl.abort();
      await expect(appel).rejects.toThrow('annulé par l’appelant');
    } finally {
      globalThis.fetch = origine;
    }
  });
});
