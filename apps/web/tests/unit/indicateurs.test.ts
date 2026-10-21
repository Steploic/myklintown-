import { describe, expect, it } from 'vitest';
import {
  INDICATEURS,
  cibleDe,
  criteres,
  detail,
  evaluer,
  libelleCible,
  moisCourant as moisMesure,
  perimetresDisponibles,
  perimetreValide,
  pourcent,
  rangMois,
  type Cibles,
  type MoisPilote,
  type TableauIndicateurs,
  type ValeursKpi,
} from '@/lib/indicateurs';
import { derniersMois, finDeMois, lireMontant, moisCourant, moisValide } from '@/lib/charges';

// Les cibles du livrable Technipole (chapitre 8), telles que la migration les pose en base.
const CIBLES: Cibles = {
  mois: ['2026-10-01', '2026-11-01', '2026-12-01'],
  abonnes_actifs: [800, 1500, 2000],
  taux_paiement: [0.7, 0.8, 0.85],
  taux_execution: [0.9, 0.93, 0.95],
  retention: [null, 0.88, 0.9],
  delai_signalement_h: [72, 48, 24],
  cout_par_menage: [null, null, null],
  part_mobile_money: [0, 0.15, 0.3],
  incidents_1000_variation: [null, -0.2, -0.35],
  criteres: { c1_abonnes_actifs: 1600, c2_taux_paiement: 0.8 },
};

function valeurs(p: Partial<ValeursKpi> = {}): ValeursKpi {
  return {
    debut: '2026-10-01',
    fin: '2026-10-31',
    mesure_au: '2026-10-13',
    type: 'mois',
    perimetre: 'pilote',
    delai_grace_jours: 7,
    precollecteurs_actifs: 10,
    menages_inscrits: 500,
    abonnes_actifs: { valeur: 350, dont_grace: 12 },
    taux_paiement: { valeur: 0.7, num: 350, den: 500 },
    taux_execution: { valeur: 0.91, num: 910, den: 1000 },
    retention: { valeur: null, num: 0, den: 0 },
    delai_signalement_h: { valeur: 30, n: 4, en_attente: 1, plus_ancien_h: 52.5 },
    cout_par_menage: null,
    part_mobile_money: { valeur: 0.1, num: 100_000, den: 1_000_000, nb: 20, nb_total: 300 },
    incidents_1000: { valeur: 12.5, num: 10, den: 800 },
    especes: { a_valider_7j: 0, a_valider_7j_fcfa: 0, rejetees: 0, rejetees_fcfa: 0 },
    ...p,
  };
}

const def = (cle: string) => INDICATEURS.find((d) => d.cle === cle)!;

describe('les 8 indicateurs du livrable', () => {
  it('sont tous là, chacun avec sa définition et sa méthode', () => {
    expect(INDICATEURS.map((d) => d.cle)).toEqual([
      'abonnes_actifs', 'taux_paiement', 'taux_execution', 'retention',
      'delai_signalement_h', 'cout_par_menage', 'part_mobile_money', 'incidents_1000',
    ]);
    for (const d of INDICATEURS) expect(d.definition && d.methode).toBeTruthy();
  });

  it('un périmètre inconnu retombe sur tout le pilote', () => {
    expect(perimetreValide('douala')).toBe('douala');
    expect(perimetreValide("douala' or 1=1")).toBe('pilote');
    expect(perimetreValide(undefined)).toBe('pilote');
  });

  it('un compte Mairie ne suit que ses communes ; l’administrateur, tout (migration 20261019000016)', () => {
    const communes = [
      { code: 'YDE3', nom: 'Yaoundé III' },
      { code: 'DLA1', nom: 'Douala I' },
    ];
    const mairie = perimetresDisponibles({ estAdmin: false, cloisonne: true, communes: [communes[0]!] });
    expect(mairie).toEqual([{ cle: 'YDE3', label: 'Yaoundé III' }]);
    expect(perimetreValide(undefined, mairie)).toBe('YDE3');
    expect(perimetreValide('pilote', mairie)).toBe('YDE3');
    expect(perimetreValide('DLA1', mairie)).toBe('YDE3');

    const admin = perimetresDisponibles({ estAdmin: true, cloisonne: true, communes });
    expect(admin.map((p) => p.cle)).toEqual(['pilote', 'yaounde', 'douala', 'YDE3', 'DLA1']);
    expect(perimetreValide('DLA1', admin)).toBe('DLA1');
    expect(perimetreValide(undefined, admin)).toBe('pilote');

    // Compte Mairie sans commune : aucun périmètre. Base sans la migration : comme avant.
    expect(perimetresDisponibles({ estAdmin: false, cloisonne: true, communes: [] })).toEqual([]);
    expect(perimetresDisponibles({ estAdmin: false, cloisonne: false, communes }).map((p) => p.cle)).toEqual(['pilote', 'yaounde', 'douala']);
    // Un code inattendu dans le référentiel n'est jamais proposé (la base le refuserait).
    expect(perimetresDisponibles({ estAdmin: false, cloisonne: true, communes: [{ code: "x' or 1=1", nom: 'Pirate' }] })).toEqual([]);
  });
});

describe('cibles', () => {
  it('M1, M2, M3 selon le mois', () => {
    expect(rangMois(CIBLES, '2026-11-01')).toBe(1);
    expect(rangMois(CIBLES, '2027-01-01')).toBe(-1);
    expect(cibleDe(CIBLES, 'taux_paiement', 0, null)).toBe(0.7);
    expect(cibleDe(CIBLES, 'abonnes_actifs', 2, null)).toBe(2000);
    expect(cibleDe(CIBLES, 'taux_paiement', -1, null)).toBeNull();
  });

  it('incidents : le premier mois est la référence, puis −20 % et −35 %', () => {
    expect(cibleDe(CIBLES, 'incidents_1000', 0, 12.5)).toBeNull();
    expect(cibleDe(CIBLES, 'incidents_1000', 1, 12.5)).toBe(10);
    expect(cibleDe(CIBLES, 'incidents_1000', 2, 12.5)).toBe(8.1);
    expect(cibleDe(CIBLES, 'incidents_1000', 1, null)).toBeNull();
    expect(libelleCible(CIBLES, 'incidents_1000', 0, 12.5)).toBe('référence');
    expect(libelleCible(CIBLES, 'incidents_1000', 1, 12.5)).toBe('≤ 10');
  });

  it('libellés du livrable : « mesure », « à fixer », pourcentages, heures', () => {
    expect(libelleCible(CIBLES, 'cout_par_menage', 0, null)).toBe('mesure');
    expect(libelleCible(CIBLES, 'cout_par_menage', 2, null)).toBe('à fixer');
    expect(libelleCible(CIBLES, 'retention', 0, null)).toBe('—');
    expect(libelleCible(CIBLES, 'taux_execution', 1, null)).toBe('93 %');
    expect(libelleCible(CIBLES, 'delai_signalement_h', 2, null)).toBe('24 h');
    expect(libelleCible(CIBLES, 'abonnes_actifs', 1, null)).toBe(`1${' '}500`);
  });
});

describe('verdict', () => {
  it('plus haut = mieux, plus bas = mieux', () => {
    expect(evaluer(def('taux_paiement'), 0.7, 0.7, 'clos')).toBe('atteint');
    expect(evaluer(def('taux_paiement'), 0.69, 0.7, 'clos')).toBe('non_atteint');
    expect(evaluer(def('delai_signalement_h'), 30, 72, 'clos')).toBe('atteint');
    expect(evaluer(def('delai_signalement_h'), 80, 72, 'clos')).toBe('non_atteint');
  });

  it('un cumul de fin de mois n’est manqué qu’une fois le mois clos', () => {
    expect(evaluer(def('abonnes_actifs'), 350, 800, 'en_cours')).toBe('en_cours');
    expect(evaluer(def('abonnes_actifs'), 350, 800, 'clos')).toBe('non_atteint');
    // un taux, lui, se juge tout de suite
    expect(evaluer(def('taux_execution'), 0.85, 0.9, 'en_cours')).toBe('non_atteint');
  });

  it('pas de valeur, pas de cible', () => {
    expect(evaluer(def('retention'), null, null, 'en_cours')).toBe('non_mesure');
    expect(evaluer(def('cout_par_menage'), 4200, null, 'clos')).toBe('sans_cible');
  });
});

describe('détail en clair', () => {
  it('dit ce que recouvre le chiffre', () => {
    const v = valeurs();
    expect(detail(v, 'taux_execution')).toBe('910 passages réalisés sur 1 000 planifiés');
    expect(detail(v, 'abonnes_actifs')).toContain('dont 12 en délai de grâce');
    expect(detail(v, 'retention')).toBe('Aucune période arrivée à échéance');
    expect(detail(v, 'delai_signalement_h')).toBe('4 résolus · 1 en attente (le plus ancien : 52,5 h)');
    expect(detail(v, 'cout_par_menage')).toBe('Calculé sur le mois');
    expect(
      detail(valeurs({ cout_par_menage: { valeur: null, charges: 0, menages_mois: 0, recette_par_menage: null, commission_taux: 0.1, entreprises_saisies: 0, entreprises_actives: 3 } }), 'cout_par_menage'),
    ).toBe('Aucune charge saisie ce mois (3 précollecteurs en activité)');
  });

  it('pourcentages à la française', () => {
    expect(pourcent(0.4286)).toBe('42,9 %');
    expect(pourcent(null)).toBe('—');
  });
});

describe('critères de réussite C1 à C4', () => {
  const mois = (debut: string, etat: MoisPilote['etat'], v: ValeursKpi | null): MoisPilote => ({
    debut, fin: debut, etat, valeurs: v, calcule_at: null, mode: null,
  });
  const tableau = (m: MoisPilote[]): TableauIndicateurs => ({
    perimetre: 'pilote', aujourdhui: '2026-11-13', pilote: { debut: '2026-10-01', fin: '2026-12-31' },
    cibles: CIBLES, releve_planifie: true, mois: m, semaine_en_cours: null, semaines: [],
  });

  it('se lisent sur le mois en cours ; C3 sur le dernier mois où des charges existent', () => {
    const oct = valeurs({
      cout_par_menage: { valeur: 900, charges: 90_000, menages_mois: 100, recette_par_menage: 2800, commission_taux: 0.1, entreprises_saisies: 2, entreprises_actives: 10 },
      especes: { a_valider_7j: 0, a_valider_7j_fcfa: 0, rejetees: 1, rejetees_fcfa: 3500 },
    });
    const nov = valeurs({ abonnes_actifs: { valeur: 1700, dont_grace: 0 }, taux_paiement: { valeur: 0.78, num: 1700, den: 2180 } });
    const t = tableau([mois('2026-10-01', 'clos', oct), mois('2026-11-01', 'en_cours', nov), mois('2026-12-01', 'a_venir', null)]);
    expect(moisMesure(t)?.debut).toBe('2026-11-01');

    const [c1, c2, c3, c4] = criteres(t);
    expect(c1).toMatchObject({ code: 'C1', chip: 'chip-ok' });
    expect(c2).toMatchObject({ code: 'C2', chip: 'chip-relance', etat: '78 % ce mois-ci' });
    expect(c3).toMatchObject({ code: 'C3', chip: 'chip-ok' });
    expect(c4?.chip).toBe('chip-relance');
    expect(c4?.etat).toContain('1 encaissement rejeté');
  });

  it('rien de mesuré : neutre, sans conclusion', () => {
    const t = tableau([mois('2026-10-01', 'a_venir', null)]);
    const [c1, c2, c3, c4] = criteres(t);
    expect([c1?.chip, c2?.chip, c3?.chip]).toEqual(['chip-neutre', 'chip-neutre', 'chip-neutre']);
    expect(c3?.etat).toContain('aucune charge saisie');
    expect(c4?.etat).toBe('Aucun signal sur le circuit espèces');
  });
});

describe('charges du mois', () => {
  it('montants : espaces et points de milliers acceptés, décimales refusées', () => {
    expect(lireMontant('30 000')).toBe(30000);
    expect(lireMontant('30 000 FCFA')).toBe(30000);
    expect(lireMontant('1.250.000')).toBe(1250000);
    expect(lireMontant('')).toBeNull();
    expect(lireMontant('1.5')).toBeNaN();
    expect(lireMontant('1,5')).toBeNaN();
    expect(lireMontant('-200')).toBeNaN();
  });

  it('mois : celui de Yaoundé, jamais dans le futur', () => {
    // 31 octobre 23 h 30 UTC = déjà le 1er novembre à Yaoundé
    const veille = new Date('2026-10-31T23:30:00Z');
    expect(moisCourant(veille)).toBe('2026-11');
    expect(moisValide('2026-11', veille)).toBe(true);
    expect(moisValide('2026-12', veille)).toBe(false);
    expect(moisValide('2026-13', veille)).toBe(false);
    expect(moisValide("2026-10' --", veille)).toBe(false);
    expect(derniersMois(3, veille)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(derniersMois(2, new Date('2026-01-15T12:00:00Z'))).toEqual(['2026-01', '2025-12']);
    expect(finDeMois('2028-02')).toBe('2028-02-29');
  });
});
