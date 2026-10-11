import { describe, expect, it } from 'vitest';
import { celluleCsv, documentCsv } from '@/lib/csv';

describe('export CSV : pas d’injection de formules dans Excel', () => {
  it.each([
    ['=HYPERLINK("http://pirate","Cliquez")', `"'=HYPERLINK(""http://pirate"",""Cliquez"")"`],
    ['+237 677 11 22 33', "'+237 677 11 22 33"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
  ])('%s est neutralisé', (brut, attendu) => {
    expect(celluleCsv(brut)).toBe(attendu);
  });

  it('les textes ordinaires et les nombres sont inchangés', () => {
    expect(celluleCsv('Famille Ateba')).toBe('Famille Ateba');
    expect(celluleCsv(-1500)).toBe('-1500');
    expect(celluleCsv(null)).toBe('');
    expect(celluleCsv('Nsam; bloc D')).toBe('"Nsam; bloc D"');
    expect(celluleCsv('ligne\r\nsuivante')).toBe('"ligne\r\nsuivante"');
  });

  it('document : BOM, séparateur « ; », lignes CRLF', () => {
    expect(documentCsv(['Nom', 'Dû'], [['=1+1', 3500]])).toBe("\uFEFFNom;Dû\r\n'=1+1;3500");
  });
});
