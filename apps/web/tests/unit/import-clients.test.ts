import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyserImport,
  assainirLigne,
  clesExistants,
  lireLignes,
  lireMois,
  lireTarif,
  normaliserTelephone,
  validerLigne,
  type Lecture,
} from '@/lib/import-clients';
import { lireTableur } from '@/lib/tableur';

const ZONES = [
  { id: 'z1', nom: 'Nsam Nord' },
  { id: 'z2', nom: 'Efoulan' },
];
const RIEN = { telephones: [], nomsQuartiers: [] };
const lecture = (t: string[][]) => lireLignes(t) as Lecture;

describe('colonnes du fichier', () => {
  it('reconnaît les titres sans tenir compte des accents, des majuscules ni de la ponctuation', () => {
    const l = lecture([['NOM', 'Tél.', 'quartier', 'Repère', 'Tarif (FCFA)', 'Fréquence', 'Code agent'], ['Famille Ateba', '677 12 34 56', 'Nsam', 'Portail bleu', '3500', 'mensuel', 'A7']]);
    expect(l.reconnues).toEqual(['nom', 'telephone', 'quartier', 'adresse', 'tarif', 'mois']);
    expect(l.ignorees).toEqual(['Code agent']);
    expect(l.lignes).toEqual([{ numero: 2, nom: 'Famille Ateba', telephone: '677 12 34 56', quartier: 'Nsam', adresse: 'Portail bleu', tarif: '3500', mois: 'mensuel' }]);
  });

  it('trouve la ligne de titres sous un titre de document, et saute les lignes vides', () => {
    const l = lecture([['Recensement Nsam, novembre'], [], ['Nom', 'Tarif'], ['A', '3500'], [], ['B', '9500']]);
    expect(l.ligneEntete).toBe(3);
    expect(l.lignes.map((x) => x.numero)).toEqual([4, 6]);
  });

  it('accepte un fichier exporté depuis MyKlinTown (colonnes en plus ignorées)', () => {
    const l = lecture([['Code', 'Nom', 'Téléphone', 'Quartier', 'Adresse', 'Zone', 'Tarif (FCFA)', 'Période facturée (mois)', 'Passages / semaine', 'Statut', 'Abonnement', 'Couvert jusqu’au', 'Reste dû (FCFA)']]);
    expect(l.reconnues).toEqual(['nom', 'telephone', 'quartier', 'adresse', 'zone', 'tarif', 'mois', 'passages']);
  });

  it('sans colonne Nom : message clair', () => {
    expect(lireLignes([['Abonnés du mois', 'Montant'], ['A', '3500']])).toHaveProperty('error');
  });
});

describe('valeurs', () => {
  it('téléphone camerounais : toutes les écritures courantes, 9 chiffres en sortie', () => {
    for (const t of ['677123456', '6 77 12 34 56', '+237 677 12 34 56', '00237677123456', '237677123456', '677-12-34-56']) expect(normaliserTelephone(t)).toBe('677123456');
    expect(normaliserTelephone('222 23 45 67')).toBe('222234567');
    expect(normaliserTelephone('')).toBeNull();
    for (const t of ['12345', '577123456', '6771234567', 'abc']) expect(normaliserTelephone(t)).toBe(false);
  });

  it('tarif : espaces, points des milliers, FCFA ; refuse décimales et texte', () => {
    for (const t of ['3500', '3 500', '3 500', '3.500', '3,500', '3500 FCFA', '3500F', '3 500 frs']) expect(lireTarif(t)).toBe(3500);
    for (const t of ['35,5', 'abc', '-100', '20000000']) expect(lireTarif(t)).toBeNull();
  });

  it('période facturée : chiffres ou mots', () => {
    expect([lireMois(''), lireMois('3'), lireMois('6 mois'), lireMois('Trimestriel'), lireMois('annuel')]).toEqual([1, 3, 6, 3, 12]);
    expect(lireMois('2')).toBeNull();
  });

  it('ligne correcte → client prêt, au format de la base', () => {
    const r = validerLigne({ numero: 2, nom: 'famille  ATEBA', telephone: '+237 6 77 12 34 56', quartier: 'nsam', tarif: '3 500', zone: 'nsam nord', lat: '3,8285', lng: '11.4985' }, ZONES);
    expect(r).toEqual({
      client: { nom: 'Famille Ateba', telephone: '677123456', quartier: 'Nsam', adresse: null, tarif_fcfa: 3500, facturation_mois: 1, passages_semaine: 2, zone_id: 'z1', lat: 3.8285, lng: 11.4985, notes: null },
    });
  });

  it('position en une seule case (GPS)', () => {
    const r = validerLigne({ numero: 2, nom: 'A', tarif: '3500', gps: '3.8285, 11.4985' }, ZONES);
    expect('client' in r && [r.client.lat, r.client.lng]).toEqual([3.8285, 11.4985]);
  });

  it('chaque erreur est dite, avec la valeur fautive', () => {
    const r = validerLigne({ numero: 6, nom: 'Famille Test', telephone: '12345', tarif: 'abc', mois: '2', passages: '9', zone: 'Zone X', lat: '11.5', lng: '3.8' }, ZONES);
    expect('erreurs' in r && r.erreurs).toEqual([
      'Téléphone invalide « 12345 » : 9 chiffres attendus, ex. 6 77 12 34 56.',
      'Tarif invalide « abc » : un nombre entier de FCFA, ex. 3500.',
      'Période facturée invalide « 2 » : 1, 3, 6 ou 12 mois.',
      'Passages par semaine invalides « 9 » : de 1 à 7.',
      'Position hors du Cameroun : vérifiez la latitude (≈ 3,8 à Yaoundé) et la longitude (≈ 11,5).',
      'Zone inconnue « Zone X » : vos zones sont Nsam Nord, Efoulan.',
    ]);
    const vide = validerLigne({ numero: 7, notes: 'x' }, []);
    expect('erreurs' in vide && vide.erreurs).toEqual(['Nom manquant.', 'Tarif manquant : montant de chaque facture, en FCFA.']);
    const sansZone = validerLigne({ numero: 8, nom: 'A', tarif: '1', zone: 'Nsam' }, []);
    expect('erreurs' in sansZone && sansZone.erreurs[0]).toMatch(/Aucune zone ne vous est encore affectée/);
  });
});

describe('doublons', () => {
  const existants = clesExistants([
    { nom: 'Famille Ateba', quartier: 'Nsam', telephone: '+237 677 12 34 56' },
    { nom: 'Mme Bella', quartier: 'Efoulan', telephone: null },
  ]);

  it('déjà enregistré (même téléphone, quelle que soit l’écriture ; ou même nom et quartier sans téléphone) ou répété dans le fichier', () => {
    const a = analyserImport(
      [
        { numero: 2, nom: 'Ateba (nouvelle fiche)', telephone: '677123456', tarif: '3500' },
        { numero: 3, nom: 'MME BELLA', quartier: 'efoulan', tarif: '3500' },
        { numero: 4, nom: 'Famille Neuve', telephone: '690000001', tarif: '3500' },
        { numero: 5, nom: 'Famille Neuve bis', telephone: '6 90 00 00 01', tarif: '3500' },
        { numero: 6, nom: 'Sans Tel', quartier: 'Nsam', tarif: '3500' },
        { numero: 7, nom: 'sans tel', quartier: 'NSAM', tarif: '3500' },
        { numero: 8, nom: 'Erreur', tarif: 'x' },
      ],
      ZONES,
      existants,
    );
    expect(a.map((l) => [l.numero, l.etat, l.etat === 'doublon' ? l.raison : ''])).toEqual([
      [2, 'doublon', 'Déjà dans vos clients (même téléphone).'],
      [3, 'doublon', 'Déjà dans vos clients (même nom, même quartier).'],
      [4, 'pret', ''],
      [5, 'doublon', 'Même téléphone que la ligne 4.'],
      [6, 'pret', ''],
      [7, 'doublon', 'Même nom et même quartier que la ligne 6.'],
      [8, 'erreur', ''],
    ]);
  });

  it('réimporter le même fichier ne crée rien deux fois', () => {
    const lignes = [
      { numero: 2, nom: 'A', telephone: '690000001', tarif: '3500' },
      { numero: 3, nom: 'B', quartier: 'Nsam', tarif: '3500' },
    ];
    const premier = analyserImport(lignes, ZONES, RIEN);
    const enBase = premier.flatMap((l) => (l.etat === 'pret' ? [l.client] : []));
    expect(analyserImport(lignes, ZONES, clesExistants(enBase)).every((l) => l.etat === 'doublon')).toBe(true);
  });
});

describe('ce que le serveur reçoit du navigateur', () => {
  it('ne garde que les colonnes connues, en texte, et un numéro de ligne valide', () => {
    expect(assainirLigne({ numero: 3, nom: 'A', tarif: '3500', entreprise_id: 'autre', statut: 'resilie', zone: 42 })).toEqual({ numero: 3, nom: 'A', tarif: '3500' });
    expect(assainirLigne({ numero: -1, nom: 'A' })).toBeNull();
    expect(assainirLigne('x')).toBeNull();
    expect(assainirLigne({ numero: 2, nom: 'x'.repeat(5000) })!.nom).toHaveLength(1000);
  });
});

describe('de bout en bout sur les fichiers enregistrés par Excel', () => {
  for (const fichier of ['clients-excel.xlsx', 'clients-excel.csv']) {
    it(fichier, async () => {
      const t = await lireTableur(new Uint8Array(readFileSync(new URL(`./fixtures/${fichier}`, import.meta.url))));
      const a = analyserImport(lecture(t).lignes, ZONES, RIEN);
      expect(a.map((l) => [l.numero, l.etat])).toEqual([
        [2, 'pret'],
        [3, 'pret'],
        [5, 'pret'],
        [6, 'erreur'],
      ]);
      const [ebode, onana, ekani] = a.flatMap((l) => (l.etat === 'pret' ? [l.client] : []));
      expect(ebode).toMatchObject({ nom: 'Famille Ébodé', telephone: '677123456', adresse: 'Portail bleu & « grille »', tarif_fcfa: 3500, lat: 3.8285, lng: 11.4985, notes: 'Chien <méchant>' });
      expect(onana).toMatchObject({ telephone: '690000001', tarif_fcfa: 9500, facturation_mois: 3 });
      expect(ekani).toMatchObject({ telephone: '699112233', tarif_fcfa: 3500, facturation_mois: 3, passages_semaine: 3, notes: 'ligne 1\nligne 2' });
    });
  }
});
