import { describe, expect, it } from 'vitest';
import { disposition, enPages, formatDepuis, FORMAT_IMPRIMEUR } from '@/lib/planche';

describe('planche QR pour l’imprimeur (1 page = 1 m²)', () => {
  it('10 × 15 cm espacées de 0,5 cm : 9 colonnes × 6 rangées = 54 étiquettes, grille centrée', () => {
    const d = disposition(FORMAT_IMPRIMEUR);
    expect(d).toEqual({ colonnes: 9, rangees: 6, parPage: 54, margeX: 30, margeY: 37.5 });
    // Contrôle : la grille + les marges font exactement 1 m.
    expect(2 * d.margeX + 9 * 100 + 8 * 5).toBe(1000);
    expect(2 * d.margeY + 6 * 150 + 5 * 5).toBe(1000);
  });

  it('découpe en pages de 54', () => {
    const pages = enPages(Array.from({ length: 120 }, (_, i) => i), 54);
    expect(pages.map((p) => p.length)).toEqual([54, 54, 12]);
    expect(enPages([], 54)).toEqual([]);
  });

  it('format réglable par l’adresse, dans des bornes', () => {
    expect(formatDepuis({ largeur: '150', hauteur: '100' })).toEqual({ page: 1000, largeur: 150, hauteur: 100, ecart: 5 });
    expect(disposition(formatDepuis({ largeur: '150', hauteur: '100' })).parPage).toBe(54);
    expect(formatDepuis({ largeur: '0', ecart: 'abc', page: '99999' })).toEqual(FORMAT_IMPRIMEUR);
  });
});
