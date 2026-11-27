import { describe, expect, it } from 'vitest';
import { estOuverte, ETAPES_CONFORMITE, STATUT_POUR_EQUIPE, STATUT_POUR_GERANT, titreEtape } from '@/lib/accompagnement';

describe('accompagnement vers la conformité', () => {
  it('les quatre étapes, dans l’ordre des démarches', () => {
    expect(ETAPES_CONFORMITE.map((e) => e.cle)).toEqual(['structure', 'niu', 'autorisation', 'permis']);
    expect(titreEtape('permis')).toBe('Permis environnemental');
    expect(titreEtape('inconnue')).toBe('inconnue');
  });

  it('ouverte = encore à traiter par l’équipe', () => {
    expect(['demande', 'contacte', 'en_cours'].every(estOuverte)).toBe(true);
    expect(['obtenue', 'close'].some(estOuverte)).toBe(false);
  });

  it('chaque statut de la base a son libellé, pour le gérant et pour l’équipe', () => {
    // Les statuts de la contrainte `accompagnements.statut` (migration 20261127000029).
    const statuts = ['demande', 'contacte', 'en_cours', 'obtenue', 'close'];
    expect(Object.keys(STATUT_POUR_GERANT).sort()).toEqual([...statuts].sort());
    expect(Object.keys(STATUT_POUR_EQUIPE).sort()).toEqual([...statuts].sort());
  });
});
