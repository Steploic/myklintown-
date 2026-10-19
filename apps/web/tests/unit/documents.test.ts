import { describe, expect, it } from 'vitest';
import { decouperDocument, estTypeDocument, fonctionAbsente, lireVersion } from '@/lib/documents';
import { ANCIEN_NUMERO, NUMERO_EMETTEUR, tauxLisible } from '@/lib/facture';

describe('texte de la charte et du contrat → blocs', () => {
  it('titres, listes, paragraphes', () => {
    expect(
      decouperDocument('## Objet\nCette charte rappelle\nles engagements.\n\n## Engagements\n- Sortir ses déchets\n- Régler à l’échéance\n\n### Note\nFin.'),
    ).toEqual([
      { type: 'titre', niveau: 2, texte: 'Objet' },
      { type: 'paragraphe', texte: 'Cette charte rappelle les engagements.' },
      { type: 'titre', niveau: 2, texte: 'Engagements' },
      { type: 'liste', elements: ['Sortir ses déchets', 'Régler à l’échéance'] },
      { type: 'titre', niveau: 3, texte: 'Note' },
      { type: 'paragraphe', texte: 'Fin.' },
    ]);
  });
  it('fins de ligne Windows, puces « * » et « • », lignes vides en trop', () => {
    expect(decouperDocument('\r\n\r\n* un\r\n• deux\r\n\r\n\r\nTexte')).toEqual([
      { type: 'liste', elements: ['un', 'deux'] },
      { type: 'paragraphe', texte: 'Texte' },
    ]);
  });
  it('une liste suivie d’un paragraphe sans ligne vide', () => {
    expect(decouperDocument('- a\nSuite')).toEqual([
      { type: 'liste', elements: ['a'] },
      { type: 'paragraphe', texte: 'Suite' },
    ]);
  });
  it('le HTML reste du texte (aucune balise n’est produite)', () => {
    const blocs = decouperDocument('<script>alert(1)</script>\n- <img src=x onerror=alert(1)>');
    expect(blocs).toEqual([
      { type: 'paragraphe', texte: '<script>alert(1)</script>' },
      { type: 'liste', elements: ['<img src=x onerror=alert(1)>'] },
    ]);
  });
  it('contenu vide ou absent', () => {
    expect(decouperDocument('')).toEqual([]);
    expect(decouperDocument(null)).toEqual([]);
  });
});

describe('paramètres des pages /legal', () => {
  it('?version=N : entier positif, sinon la dernière publiée', () => {
    expect(lireVersion('2')).toBe(2);
    expect(lireVersion(['3', '4'])).toBe(3);
    for (const v of [undefined, '', '0', '-1', '1.5', 'abc']) expect(lireVersion(v)).toBeNull();
  });
  it('types de documents connus', () => {
    expect(estTypeDocument('charte_menage')).toBe(true);
    expect(estTypeDocument('contrat_menage')).toBe(true);
    expect(estTypeDocument('autre')).toBe(false);
    expect(estTypeDocument(null)).toBe(false);
  });
  it('fonction absente (migration 0014 pas encore jouée) ≠ refus', () => {
    expect(fonctionAbsente({ code: 'PGRST202', message: 'Could not find the function public.accepter_documents' })).toBe(true);
    expect(fonctionAbsente({ message: 'function public.documents_a_accepter() does not exist' })).toBe(true);
    expect(fonctionAbsente({ code: '42501', message: 'Réservé à l’équipe du précollecteur de ce client' })).toBe(false);
    expect(fonctionAbsente(null)).toBe(false);
  });
});

describe('numéros de facture', () => {
  it('ancien format (F<AAMM>-NNNNN) reconnu, nouveau format par émetteur non', () => {
    expect(ANCIEN_NUMERO.test('F2610-00042')).toBe(true);
    expect(ANCIEN_NUMERO.test('F007-2026-00001')).toBe(false);
    expect(ANCIEN_NUMERO.test('DEMO-F007-2026-00012')).toBe(false);
  });
});

describe('numérotation par émetteur et TVA', () => {
  it('format F007-2026-00001', () => {
    expect(NUMERO_EMETTEUR.exec('F007-2026-00001')?.slice(1)).toEqual(['F007', '2026', '00001']);
    expect(NUMERO_EMETTEUR.test('F2610-00042')).toBe(false);
  });
  it('taux lisible', () => {
    expect(tauxLisible(0.1925).replace(/\s/g, ' ')).toBe('19,25 %');
    expect(tauxLisible('0').replace(/\s/g, ' ')).toBe('0 %');
  });
});
