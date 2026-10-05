import { describe, expect, it } from 'vitest';
import { consigneTerrain, contourDepuisPoints, extraireCodeClient, periodeFacture } from '@/lib/metier';

describe('période de facturation (paiement avant service)', () => {
  it('premier abonnement : la période démarre aujourd’hui', () => {
    expect(periodeFacture({ aujourdhui: '2026-10-01', dureeMois: 1, grace: 7 })).toEqual({
      debut: '2026-10-01',
      fin: '2026-10-31',
      echeance: '2026-10-08',
    });
  });
  it('renouvellement anticipé : enchaîne au lendemain, sans jour perdu ni chevauchement', () => {
    const p = periodeFacture({ aujourdhui: '2026-10-25', finPrecedente: '2026-10-31', dureeMois: 1, grace: 7 });
    expect(p.debut).toBe('2026-11-01');
    expect(p.fin).toBe('2026-11-30');
  });
  it('abonnement expiré depuis longtemps : repart d’aujourd’hui (pas de rattrapage)', () => {
    const p = periodeFacture({ aujourdhui: '2026-12-10', finPrecedente: '2026-10-31', dureeMois: 1, grace: 7 });
    expect(p.debut).toBe('2026-12-10');
  });
  it('trimestriel et annuel', () => {
    expect(periodeFacture({ aujourdhui: '2026-10-01', dureeMois: 3, grace: 7 }).fin).toBe('2026-12-31');
    expect(periodeFacture({ aujourdhui: '2026-10-01', dureeMois: 12, grace: 7 }).fin).toBe('2027-09-30');
  });
  it('le délai de grâce est paramétrable', () => {
    expect(periodeFacture({ aujourdhui: '2026-10-01', dureeMois: 1, grace: 0 }).echeance).toBe('2026-10-01');
    expect(periodeFacture({ aujourdhui: '2026-10-01', dureeMois: 1, grace: 15 }).echeance).toBe('2026-10-16');
  });
  it('la fin est toujours après le début', () => {
    for (const duree of [1, 2, 3, 6, 12]) {
      const p = periodeFacture({ aujourdhui: '2026-01-31', dureeMois: duree, grace: 7 });
      expect(p.fin > p.debut).toBe(true);
    }
  });
});

describe('lecture du code scanné', () => {
  it('code brut', () => expect(extraireCodeClient('MKT-12F42E56')).toBe('MKT-12F42E56'));
  it('minuscules et espaces', () => expect(extraireCodeClient('  mkt-12f42e56 \n')).toBe('MKT-12F42E56'));
  it('QR contenant une URL', () =>
    expect(extraireCodeClient('https://myklintown-web.vercel.app/c/MKT-12F42E56?x=1')).toBe('MKT-12F42E56'));
  it('texte sans code : renvoyé tel quel (le serveur répondra « inconnu »)', () =>
    expect(extraireCodeClient('bonjour')).toBe('BONJOUR'));
});

describe('contour de zone', () => {
  const carre: [number, number][] = [
    [3.83, 11.5],
    [3.83, 11.52],
    [3.85, 11.52],
    [3.85, 11.5],
  ];
  it('produit un polygone GeoJSON fermé en [lng, lat]', () => {
    const g = contourDepuisPoints(carre)!;
    expect(g.type).toBe('Polygon');
    const anneau = g.coordinates[0]!;
    expect(anneau).toHaveLength(5);
    expect(anneau[0]).toEqual([11.5, 3.83]);
    expect(anneau[4]).toEqual(anneau[0]);
  });
  it('refuse moins de 3 sommets', () => {
    expect(contourDepuisPoints([])).toBeNull();
    expect(contourDepuisPoints(carre.slice(0, 2))).toBeNull();
  });
  it('ignore les clics en double (3 clics au même endroit ≠ zone)', () => {
    expect(contourDepuisPoints([carre[0]!, carre[0]!, carre[0]!])).toBeNull();
  });
  it('ne referme pas deux fois un anneau déjà fermé', () => {
    const g = contourDepuisPoints([...carre, carre[0]!])!;
    expect(g.coordinates[0]).toHaveLength(5);
  });
  it('arrondit à 6 décimales (~10 cm)', () => {
    const g = contourDepuisPoints([
      [3.123456789, 11.987654321],
      [3.2, 11.9],
      [3.1, 11.8],
    ])!;
    expect(g.coordinates[0]![0]).toEqual([11.987654, 3.123457]);
  });
});

describe('consigne au portail', () => {
  it.each([
    ['a_jour', 'servir'],
    ['echeance_proche', 'servir_rappeler'],
    ['sans_facture', 'servir_rappeler'],
    ['impaye', 'ne_pas_servir'],
    ['expire', 'ne_pas_servir'],
    ['suspendu', 'ne_pas_servir'],
    ['demande', 'verifier'],
  ])('%s → %s', (statut, attendu) => {
    expect(consigneTerrain(statut)).toBe(attendu);
  });
});

describe('redirection après enregistrement : chemins internes seulement', () => {
  it.each(['/precollecteur/incidents', '/citoyen/collectes', '/citoyen?demande=1'])('%s accepté', async (c) => {
    const { cheminInterne } = await import('@/lib/metier');
    expect(cheminInterne(c)).toBe(true);
  });
  it.each(['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, '/a b'])('%s refusé', async (c) => {
    const { cheminInterne } = await import('@/lib/metier');
    expect(cheminInterne(c as string | null)).toBe(false);
  });
});

describe('noms harmonisés (retour R8)', () => {
  it.each([
    ['BEKOLO', 'Bekolo'],
    ['motto', 'Motto'],
    ['menage 2', 'Menage 2'],
    ['  famille   ateba ', 'Famille Ateba'],
    ['NGO-BASSA marie', 'Ngo-Bassa Marie'],
    ["d'souza", "D'Souza"],
    ['élodie ÉKANI', 'Élodie Ékani'],
    ['', ''],
  ])('« %s » → « %s »', async (brut, attendu) => {
    const { normaliserNom } = await import('@/lib/metier');
    expect(normaliserNom(brut)).toBe(attendu);
  });
  it('idempotent', async () => {
    const { normaliserNom } = await import('@/lib/metier');
    expect(normaliserNom(normaliserNom('JULIEN rostand'))).toBe('Julien Rostand');
  });
});
