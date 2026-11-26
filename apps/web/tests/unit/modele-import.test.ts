import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { modeleImportClients } from '@/lib/modele-import';
import { COLONNES_MODELE, lireLignes, type Lecture } from '@/lib/import-clients';
import { lireXlsx } from '@/lib/tableur';

describe('modèle Excel à télécharger', () => {
  const modele = modeleImportClients('Pinky Klin', ['Nsam Nord', 'Efoulan']);
  // Pour l'ouvrir dans Excel à la main : MODELE_SORTIE=chemin.xlsx pnpm exec vitest run tests/unit/modele-import.test.ts
  if (process.env.MODELE_SORTIE) writeFileSync(process.env.MODELE_SORTIE, modele);

  it('ses titres sont reconnus tels quels par l’import (astérisques compris)', async () => {
    const t = await lireXlsx(modele);
    expect(t[0]![0]).toBe('Nom *');
    const l = lireLignes(t) as Lecture;
    expect(l.reconnues).toEqual(COLONNES_MODELE);
    expect(l.ignorees).toEqual([]);
    expect(l.lignes).toEqual([]);
  });
});
