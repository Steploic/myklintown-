import { describe, expect, it } from 'vitest';
import {
  aDesDasri,
  CATEGORIES,
  estCategorie,
  libelleFrequence,
  libelleTarif,
  nettoyerReponses,
  QUESTIONS,
  resumerReponses,
} from '@/lib/devis';

// L'espace des milliers de fcfa() est une espace fine insécable : on la normalise.
const plat = (s: string) => s.replace(/\s/g, ' ');

describe('catégories de la demande de devis', () => {
  it('quatre catégories, chacune avec ses questions', () => {
    expect(CATEGORIES.map((c) => c.cle)).toEqual(['residentiel', 'commerce', 'entreprise', 'institution']);
    for (const c of CATEGORIES) expect(QUESTIONS[c.cle].length).toBeGreaterThan(0);
  });
  it('estCategorie refuse ce qui n’est pas dans la liste', () => {
    expect(estCategorie('commerce')).toBe(true);
    expect(estCategorie('usine')).toBe(false);
    expect(estCategorie('')).toBe(false);
  });
});

describe('nettoyage des réponses (liste blanche)', () => {
  it('garde les réponses connues, aux valeurs permises', () => {
    expect(nettoyerReponses('residentiel', { type_logement: 'maison', taille_menage: 6, contenant: 'fut' })).toEqual({
      type_logement: 'maison',
      taille_menage: 6,
      contenant: 'fut',
    });
  });
  it('ignore les clés inconnues, les options inventées et les questions d’une autre catégorie', () => {
    expect(nettoyerReponses('residentiel', { type_logement: 'chateau', pirate: 'x', type_commerce: 'restaurant' })).toEqual({});
  });
  it('nombres : arrondis, et hors bornes refusés', () => {
    expect(nettoyerReponses('residentiel', { taille_menage: 4.6 })).toEqual({ taille_menage: 5 });
    expect(nettoyerReponses('residentiel', { taille_menage: 0 })).toEqual({});
    expect(nettoyerReponses('residentiel', { taille_menage: 'beaucoup' })).toEqual({});
  });
  it('choix multiples : sans doublon ni option inventée ; vide = absent', () => {
    expect(nettoyerReponses('commerce', { dechets: ['verre', 'verre', 'uranium'] })).toEqual({ dechets: ['verre'] });
    expect(nettoyerReponses('commerce', { dechets: ['uranium'] })).toEqual({});
  });
  it('texte : rogné et limité à sa longueur', () => {
    const r = nettoyerReponses('commerce', { heure_ideale: `  ${'a'.repeat(100)}  ` });
    expect(r.heure_ideale).toBe('a'.repeat(40));
    expect(nettoyerReponses('commerce', { heure_ideale: '   ' })).toEqual({});
  });
  it('question conditionnelle : gardée seulement si sa condition tient', () => {
    expect(nettoyerReponses('commerce', { dechets: ['emballages'], dechets_autres: 'pneus' })).toEqual({ dechets: ['emballages'] });
    expect(nettoyerReponses('commerce', { dechets: ['autres'], dechets_autres: 'pneus' })).toEqual({ dechets: ['autres'], dechets_autres: 'pneus' });
    expect(nettoyerReponses('institution', { type_institution: 'scolaire', dasri: true })).toEqual({ type_institution: 'scolaire' });
  });
  it('oui / non : seulement un vrai booléen', () => {
    expect(nettoyerReponses('institution', { stockage_centralise: 'oui' })).toEqual({});
    expect(nettoyerReponses('institution', { stockage_centralise: false })).toEqual({ stockage_centralise: false });
  });
});

describe('fiche lue par le précollecteur', () => {
  it('réponses en phrases courtes, dans l’ordre des questions', () => {
    expect(resumerReponses('commerce', { heure_ideale: 'avant 7 h', type_commerce: 'boulangerie', dechets: ['organiques', 'verre'] })).toEqual([
      'Type de commerce : Boulangerie',
      'Nature principale des déchets : Organiques, restes de nourriture, Verre',
      'Heure idéale de passage : avant 7 h',
    ]);
    expect(resumerReponses('institution', { stockage_centralise: true })).toEqual(['Local à poubelles ou grand bac commun ? : oui']);
  });
  it('catégorie inconnue ou réponses absentes : rien', () => {
    expect(resumerReponses('usine', { type_logement: 'maison' })).toEqual([]);
    expect(resumerReponses('residentiel', null)).toEqual([]);
  });
  it('DASRI : seulement un centre de santé qui les déclare', () => {
    expect(aDesDasri('institution', { type_institution: 'sante', dasri: true })).toBe(true);
    expect(aDesDasri('institution', { type_institution: 'sante', dasri: false })).toBe(false);
    expect(aDesDasri('institution', { type_institution: 'scolaire', dasri: true })).toBe(false);
    expect(aDesDasri('commerce', { dasri: true })).toBe(false);
  });
});

describe('libellés du tarif', () => {
  it('montant par période facturée', () => {
    expect(plat(libelleTarif(3500, 1))).toBe('3 500 FCFA / mois');
    expect(plat(libelleTarif(9500, 3))).toBe('9 500 FCFA / 3 mois');
    expect(plat(libelleTarif(3500, null))).toBe('3 500 FCFA / mois');
    expect(libelleTarif(null, 1)).toBe('Tarif à fixer');
  });
  it('fréquence de passage', () => {
    expect(libelleFrequence(2)).toBe('2 fois par semaine');
    expect(libelleFrequence(7)).toBe('Tous les jours');
    expect(libelleFrequence(5)).toBe('5 fois par semaine');
    expect(libelleFrequence(null)).toBe('—');
  });
});
