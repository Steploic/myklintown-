import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decoderTexte, ecrireXlsx, ErreurTableur, lireCsv, lireTableur, lireXlsx, STYLE } from '@/lib/tableur';

const fixture = (nom: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${nom}`, import.meta.url)));

describe('lecture d’un classeur enregistré par Excel (.xlsx compressé)', () => {
  it('lit la première feuille, en texte, comme on l’a saisie', async () => {
    const t = await lireTableur(fixture('clients-excel.xlsx'));
    expect(t[0]).toEqual(['Nom', 'Téléphone', 'Quartier', 'Repère / adresse', 'Tarif (FCFA)', 'Période facturée (mois)', 'Passages / semaine', 'Zone', 'Latitude', 'Longitude', 'Notes internes', 'Code agent']);
    // Téléphone saisi comme nombre : pas de 6.77E+8 ; caractères spéciaux décodés.
    expect(t[1]).toEqual(['famille ÉBODÉ', '677123456', 'Nsam', 'Portail bleu & « grille »', '3500', '1', '2', '', '3.8285', '11.4985', 'Chien <méchant>', 'A7']);
    expect(t[2]!.slice(0, 6)).toEqual(['M. Onana', '+237 6 90 00 00 01', 'Efoulan', '', '9500', '3']);
    // Ligne vide conservée (les numéros de ligne restent ceux d'Excel).
    expect(t[3]).toEqual([]);
    // Formule : sa valeur calculée ; texte sur deux lignes dans une cellule.
    expect(t[4]![4]).toBe('3500');
    expect(t[4]![5]).toBe('trimestriel');
    expect(t[4]![10]).toBe('ligne 1\nligne 2');
    expect(t.flat()).not.toContain('Ne pas lire');
  });
});

describe('lecture d’un CSV enregistré par Excel en français (« ; », encodage Windows)', () => {
  it('reconnaît l’encodage, le séparateur et les décimales à virgule', async () => {
    const t = await lireTableur(fixture('clients-excel.csv'));
    expect(t[0]![1]).toBe('Téléphone');
    expect(t[1]!.slice(0, 4)).toEqual(['famille ÉBODÉ', '677123456', 'Nsam', 'Portail bleu & « grille »']);
    expect(t[1]![8]).toBe('3,8285');
    expect(t[4]![10]).toBe('ligne 1\nligne 2');
  });

  it('CSV maison : virgules, guillemets, BOM, fin de ligne Unix, protection anti-formule de l’export', () => {
    const t = lireCsv('﻿Nom,Téléphone,Notes\n"Dupont, Jean",690000001,"Il a dit ""bonjour"""\n\'=Piège,,\n');
    expect(t).toEqual([
      ['Nom', 'Téléphone', 'Notes'],
      ['Dupont, Jean', '690000001', 'Il a dit "bonjour"'],
      ['=Piège', '', ''],
    ]);
  });

  it('UTF-8 reconnu, sinon encodage Windows', () => {
    expect(decoderTexte(new TextEncoder().encode('Éa'))).toBe('Éa');
    expect(decoderTexte(new Uint8Array([0xc9, 0x61]))).toBe('Éa');
  });
});

describe('fichiers refusés, avec une consigne', () => {
  it('ancien .xls, binaire quelconque, archive abîmée', async () => {
    await expect(lireTableur(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/\.xls\)/);
    await expect(lireTableur(new Uint8Array([1, 2, 0, 4]))).rejects.toThrow(ErreurTableur);
    await expect(lireTableur(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9]))).rejects.toThrow(/illisible/);
  });
});

describe('modèle écrit puis relu', () => {
  it('le classeur produit se relit à l’identique (texte, nombres, échappement XML)', async () => {
    const x = ecrireXlsx([
      { nom: 'Clients', lignes: [[{ v: 'Nom *', s: STYLE.entete }, 'Tarif'], ['A & B <c>', 3500], [], ['Zoé', 9500.5]], listes: [{ colonne: 1, source: '"1,3"' }] },
      { nom: 'Autre', lignes: [['x']] },
    ]);
    expect(await lireXlsx(x)).toEqual([['Nom *', 'Tarif'], ['A & B <c>', '3500'], [], ['Zoé', '9500.5']]);
  });
});
