import { describe, expect, it } from 'vitest';
import { etatCode, formaterCode } from '@/lib/agrement';

describe('codes d’agrément', () => {
  const maintenant = new Date('2026-10-13T10:00:00Z');
  const base = { utilise_at: null, revoque_at: null, expire_at: '2026-11-12T10:00:00Z' };

  it('état : à utiliser, utilisé, révoqué, expiré', () => {
    expect(etatCode(base, maintenant)).toBe('en_attente');
    expect(etatCode({ ...base, utilise_at: '2026-10-14T08:00:00Z' }, maintenant)).toBe('utilise');
    expect(etatCode({ ...base, revoque_at: '2026-10-13T09:00:00Z' }, maintenant)).toBe('revoque');
    expect(etatCode({ ...base, expire_at: '2026-10-13T09:59:59Z' }, maintenant)).toBe('expire');
    // Utilisé avant d'expirer : il reste « utilisé ».
    expect(etatCode({ utilise_at: '2026-10-01T08:00:00Z', revoque_at: null, expire_at: '2026-10-02T00:00:00Z' }, maintenant)).toBe('utilise');
  });

  it('affichage en deux blocs, plus facile à dicter', () => {
    expect(formaterCode('ABCDE7GHJK')).toBe('ABCDE-7GHJK');
    expect(formaterCode('A1B2')).toBe('A1B2');
  });
});
