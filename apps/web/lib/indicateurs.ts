/**
 * Indicateurs du pilote — livrable Technipole du 2 septembre 2026, chapitre 8.
 *
 * Les valeurs sont CALCULÉES PAR LA BASE (`indicateurs_pilote`, migration
 * 20261013000011) et les cibles y sont lues (`parametres_plateforme.kpi_cibles`) :
 * ce module ne fait que les présenter et les comparer.
 */

import { fcfa, nombre } from './format';

/**
 * 'pilote', 'yaounde', 'douala' (administrateur), ou le code d'une commune
 * (« YDE3 », « DLA1 »… : migration 20261019000016, un compte Mairie suit SA commune).
 */
export type Perimetre = string;

export interface OptionPerimetre {
  cle: Perimetre;
  label: string;
}

export const PERIMETRES: OptionPerimetre[] = [
  { cle: 'pilote', label: 'Tout le pilote' },
  { cle: 'yaounde', label: 'Yaoundé' },
  { cle: 'douala', label: 'Douala' },
];

/** Code de commune accepté comme périmètre par la base. */
export const estCodeCommune = (p: string) => /^[A-Z0-9]{2,12}$/.test(p);

/**
 * Périmètres que ce compte peut lire : l'administrateur, le pilote, les deux
 * villes et chaque commune ; un compte Mairie, ses communes. Sans le
 * cloisonnement en base (migration non jouée), les trois périmètres d'avant.
 */
export function perimetresDisponibles(acces: {
  estAdmin: boolean;
  cloisonne: boolean;
  communes: { code: string; nom: string }[];
}): OptionPerimetre[] {
  if (!acces.cloisonne) return PERIMETRES;
  const communes = acces.communes.filter((c) => estCodeCommune(c.code)).map((c) => ({ cle: c.code, label: c.nom }));
  return acces.estAdmin ? [...PERIMETRES, ...communes] : communes;
}

/** Le périmètre demandé s'il est permis, sinon le premier permis (le pilote par défaut). */
export function perimetreValide(p: string | null | undefined, disponibles: OptionPerimetre[] = PERIMETRES): Perimetre {
  return disponibles.some((x) => x.cle === p) ? p! : (disponibles[0]?.cle ?? 'pilote');
}

export interface Ratio {
  valeur: number | null;
  num: number;
  den: number;
}

export interface ValeursKpi {
  debut: string;
  fin: string;
  mesure_au: string;
  type: 'mois' | 'semaine' | 'libre';
  perimetre: Perimetre;
  delai_grace_jours: number;
  precollecteurs_actifs: number;
  menages_inscrits: number;
  abonnes_actifs: { valeur: number; dont_grace: number };
  taux_paiement: Ratio;
  /** `exclus_refus` : passages refusés pour abonnement impayé (migration 20261019000013 ; absent des relevés d'avant). */
  taux_execution: Ratio & { exclus_refus?: number };
  retention: Ratio;
  delai_signalement_h: { valeur: number | null; n: number; en_attente: number; plus_ancien_h: number | null };
  cout_par_menage: null | {
    valeur: number | null;
    charges: number;
    menages_mois: number;
    recette_par_menage: number | null;
    commission_taux: number;
    entreprises_saisies: number;
    entreprises_actives: number;
  };
  part_mobile_money: Ratio & { nb: number; nb_total: number };
  incidents_1000: Ratio;
  especes: { a_valider_7j: number; a_valider_7j_fcfa: number; rejetees: number; rejetees_fcfa: number };
}

export interface Cibles {
  mois: string[];
  abonnes_actifs: (number | null)[];
  taux_paiement: (number | null)[];
  taux_execution: (number | null)[];
  retention: (number | null)[];
  delai_signalement_h: (number | null)[];
  cout_par_menage: (number | null)[];
  part_mobile_money: (number | null)[];
  /** Variation visée par rapport à la valeur du premier mois (référence). */
  incidents_1000_variation: (number | null)[];
  criteres?: { c1_abonnes_actifs?: number; c2_taux_paiement?: number };
}

export interface MoisPilote {
  debut: string;
  fin: string;
  etat: 'clos' | 'en_cours' | 'a_venir';
  valeurs: ValeursKpi | null;
  calcule_at: string | null;
  mode: 'auto' | 'rattrapage' | null;
}

export interface Releve {
  debut: string;
  fin: string;
  valeurs: ValeursKpi | null;
  calcule_at: string;
  mode: 'auto' | 'rattrapage';
}

export interface TableauIndicateurs {
  perimetre: Perimetre;
  aujourdhui: string;
  pilote: { debut: string; fin: string };
  cibles: Cibles | null;
  releve_planifie: boolean;
  mois: MoisPilote[];
  semaine_en_cours: ValeursKpi | null;
  semaines: Releve[];
}

export type CleIndicateur =
  | 'abonnes_actifs'
  | 'taux_paiement'
  | 'taux_execution'
  | 'retention'
  | 'delai_signalement_h'
  | 'cout_par_menage'
  | 'part_mobile_money'
  | 'incidents_1000';

export interface DefIndicateur {
  cle: CleIndicateur;
  label: string;
  /** Définition telle qu'écrite dans le livrable. */
  definition: string;
  /** Règle de calcul exacte (affichée dans « Méthode »). */
  methode: string;
  /** Sens de la performance : plus haut = mieux, ou plus bas = mieux. */
  sens: 'haut' | 'bas';
  /** Cible de FIN de mois sur un cumul : en cours de mois, on suit l'avancement. */
  cumul?: boolean;
  /** Calculé sur le mois seulement (charges saisies au mois). */
  mensuel?: boolean;
  format: (v: number) => string;
}

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function pourcent(v: number | null | undefined): string {
  return v == null ? '—' : `${nf1.format(v * 100)} %`;
}

export function heures(v: number | null | undefined): string {
  return v == null ? '—' : `${nf1.format(v)} h`;
}

export const INDICATEURS: DefIndicateur[] = [
  {
    cle: 'abonnes_actifs',
    label: 'Ménages abonnés actifs',
    definition: 'Abonnements en cours de validité',
    methode:
      'Ménages inscrits dont une facture payée couvre le jour de mesure, ou s’est terminée depuis moins que le délai de grâce. Payé = paiements validés, encaissés au plus tard ce jour-là, couvrant le montant.',
    sens: 'haut',
    cumul: true,
    format: (v) => nombre(v),
  },
  {
    cle: 'taux_paiement',
    label: 'Taux de paiement effectif',
    definition: 'Abonnés à jour ÷ ménages inscrits',
    methode: 'Abonnés actifs (ci-dessus) ÷ ménages inscrits (fiche active ou suspendue, hors demandes et résiliations).',
    sens: 'haut',
    format: pourcent,
  },
  {
    cle: 'taux_execution',
    label: 'Taux d’exécution du service',
    definition: 'Passages réalisés ÷ passages planifiés',
    methode:
      'Passages des tournées de la période, hors tournées annulées. Un passage resté « prévu » un jour passé compte comme non réalisé ; prévu aujourd’hui, il n’est pas encore dû. Un ménage refusé pour abonnement impayé, expiré ou suspendu (blocage au passage) n’était pas à servir : son passage est retiré des passages planifiés.',
    sens: 'haut',
    format: pourcent,
  },
  {
    cle: 'retention',
    label: 'Rétention mensuelle',
    definition: 'Abonnés renouvelant leur formule',
    methode:
      'Sur 30 jours glissants, ménages dont la période payée s’est terminée (délai de grâce écoulé) et qui ont payé la période suivante.',
    sens: 'haut',
    format: pourcent,
  },
  {
    cle: 'delai_signalement_h',
    label: 'Délai de traitement d’un signalement',
    definition: 'Moyenne, du dépôt à la résolution',
    methode:
      'Signalements déposés par les ménages et résolus dans la période ; l’heure de résolution est posée par la plateforme. Les signalements encore ouverts sont comptés à part.',
    sens: 'bas',
    format: heures,
  },
  {
    cle: 'cout_par_menage',
    label: 'Coût de collecte par ménage servi',
    definition: 'Charges d’exploitation ÷ ménages servis',
    methode:
      'Calcul mensuel : charges saisies par les précollecteurs ÷ ménages servis au moins une fois dans le mois, chez ceux qui ont saisi leurs charges.',
    sens: 'bas',
    mensuel: true,
    format: (v) => fcfa(v),
  },
  {
    cle: 'part_mobile_money',
    label: 'Part du Mobile Money',
    definition: 'Encaissements dématérialisés ÷ total',
    methode: 'En montant : encaissements hors espèces ÷ tous les encaissements de la période (validés ou à valider, rejetés exclus).',
    sens: 'haut',
    format: pourcent,
  },
  {
    cle: 'incidents_1000',
    label: 'Incidents pour 1 000 passages',
    definition: 'Incidents terrain déclarés',
    methode:
      'Incidents déclarés par les équipes ÷ passages réalisés × 1 000. Cible : baisse par rapport au premier mois, qui sert de référence.',
    sens: 'bas',
    format: (v) => nf1.format(v),
  },
];

export function valeurDe(v: ValeursKpi | null | undefined, cle: CleIndicateur): number | null {
  if (!v) return null;
  switch (cle) {
    case 'abonnes_actifs':
      return v.abonnes_actifs?.valeur ?? null;
    case 'cout_par_menage':
      return v.cout_par_menage?.valeur ?? null;
    default:
      return v[cle]?.valeur ?? null;
  }
}

/** Rang du mois dans les cibles (0 = M1), d'après « AAAA-MM ». */
export function rangMois(cibles: Cibles | null, debut: string): number {
  return cibles ? cibles.mois.findIndex((m) => m.slice(0, 7) === debut.slice(0, 7)) : -1;
}

/** Cible chiffrée du mois de rang `i`. Incidents : valeur de référence × (1 + variation). */
export function cibleDe(cibles: Cibles | null, cle: CleIndicateur, i: number, reference: number | null): number | null {
  if (!cibles || i < 0) return null;
  if (cle === 'incidents_1000') {
    const variation = cibles.incidents_1000_variation?.[i];
    if (variation == null || reference == null) return null;
    return Math.round(reference * (1 + variation) * 10) / 10;
  }
  return cibles[cle]?.[i] ?? null;
}

/** Libellé de la cible tel que dans le livrable (« mesure », « référence »…). */
export function libelleCible(cibles: Cibles | null, cle: CleIndicateur, i: number, reference: number | null): string {
  const c = cibleDe(cibles, cle, i, reference);
  const def = INDICATEURS.find((x) => x.cle === cle)!;
  if (c != null) return cle === 'incidents_1000' ? `≤ ${def.format(c)}` : def.format(c);
  if (cle === 'incidents_1000') return i === 0 ? 'référence' : 'après la référence';
  if (cle === 'cout_par_menage') return i >= 2 ? 'à fixer' : 'mesure';
  return '—';
}

export type Verdict = 'atteint' | 'non_atteint' | 'en_cours' | 'sans_cible' | 'non_mesure';

export const VERDICTS: Record<Verdict, { label: string; chip: string }> = {
  atteint: { label: 'Cible atteinte', chip: 'chip-ok' },
  non_atteint: { label: 'Hors cible', chip: 'chip-relance' },
  en_cours: { label: 'En progression', chip: 'chip-info' },
  sans_cible: { label: 'Mesure', chip: 'chip-neutre' },
  non_mesure: { label: 'Pas de données', chip: 'chip-neutre' },
};

export function evaluer(
  def: Pick<DefIndicateur, 'sens' | 'cumul'>,
  valeur: number | null,
  cible: number | null,
  etat: MoisPilote['etat'],
): Verdict {
  if (valeur == null) return 'non_mesure';
  if (cible == null) return 'sans_cible';
  if (def.sens === 'haut' ? valeur >= cible : valeur <= cible) return 'atteint';
  // Un cumul de fin de mois n'est « manqué » qu'une fois le mois terminé.
  if (def.cumul && etat !== 'clos') return 'en_cours';
  return 'non_atteint';
}

/** Ce que recouvre le chiffre, en clair. */
export function detail(v: ValeursKpi, cle: CleIndicateur): string {
  switch (cle) {
    case 'abonnes_actifs':
      return v.abonnes_actifs.dont_grace
        ? `dont ${nombre(v.abonnes_actifs.dont_grace)} en délai de grâce · ${nombre(v.menages_inscrits)} inscrits`
        : `${nombre(v.menages_inscrits)} ménages inscrits`;
    case 'taux_paiement':
      return `${nombre(v.taux_paiement.num)} à jour sur ${nombre(v.taux_paiement.den)} inscrits`;
    case 'taux_execution':
      return (
        `${nombre(v.taux_execution.num)} passages réalisés sur ${nombre(v.taux_execution.den)} planifiés` +
        (v.taux_execution.exclus_refus ? ` · ${nombre(v.taux_execution.exclus_refus)} refusé${v.taux_execution.exclus_refus > 1 ? 's' : ''} pour impayé, hors calcul` : '')
      );
    case 'retention':
      return v.retention.den
        ? `${nombre(v.retention.num)} renouvellement${v.retention.num > 1 ? 's' : ''} sur ${nombre(v.retention.den)} fins de période`
        : 'Aucune période arrivée à échéance';
    case 'delai_signalement_h': {
      const s = v.delai_signalement_h;
      const resolus = `${nombre(s.n)} résolu${s.n > 1 ? 's' : ''}`;
      return s.en_attente
        ? `${resolus} · ${nombre(s.en_attente)} en attente (le plus ancien : ${heures(s.plus_ancien_h)})`
        : `${resolus} · aucun en attente`;
    }
    case 'cout_par_menage': {
      const c = v.cout_par_menage;
      if (!c) return 'Calculé sur le mois';
      if (!c.entreprises_saisies) return `Aucune charge saisie ce mois (${nombre(c.entreprises_actives)} précollecteur${c.entreprises_actives > 1 ? 's' : ''} en activité)`;
      return `${fcfa(c.charges)} ÷ ${nombre(c.menages_mois)} ménages servis · ${nombre(c.entreprises_saisies)} précollecteur${c.entreprises_saisies > 1 ? 's' : ''} sur ${nombre(c.entreprises_actives)} ont saisi`;
    }
    case 'part_mobile_money':
      return `${fcfa(v.part_mobile_money.num)} sur ${fcfa(v.part_mobile_money.den)} encaissés`;
    case 'incidents_1000':
      return `${nombre(v.incidents_1000.num)} incident${v.incidents_1000.num > 1 ? 's' : ''} pour ${nombre(v.incidents_1000.den)} passages réalisés`;
  }
}

// -----------------------------------------------------------------------------
// Critères de réussite au 31 décembre (livrable §1.3)
// -----------------------------------------------------------------------------

export interface Critere {
  code: 'C1' | 'C2' | 'C3' | 'C4';
  enonce: string;
  etat: string;
  chip: string;
}

/** Dernier mois mesuré (en cours, ou à défaut le dernier clos). */
export function moisCourant(t: TableauIndicateurs): MoisPilote | null {
  return t.mois.find((m) => m.etat === 'en_cours') ?? [...t.mois].reverse().find((m) => m.etat === 'clos') ?? null;
}

export function criteres(t: TableauIndicateurs): Critere[] {
  const courant = moisCourant(t)?.valeurs ?? null;
  const c1 = t.cibles?.criteres?.c1_abonnes_actifs ?? null;
  const c2 = t.cibles?.criteres?.c2_taux_paiement ?? null;
  const actifs = courant?.abonnes_actifs.valeur ?? null;
  const paiement = courant?.taux_paiement.valeur ?? null;

  // C3 : le dernier mois où des charges ont été saisies.
  const avecCouts = [...t.mois].reverse().find((m) => m.valeurs?.cout_par_menage?.valeur != null)?.valeurs?.cout_par_menage ?? null;

  // C4 : rejets cumulés sur le pilote, espèces non rapprochées au dernier relevé.
  const rejets = t.mois.reduce((s, m) => s + (m.valeurs?.especes.rejetees ?? 0), 0);
  const rejetsFcfa = t.mois.reduce((s, m) => s + (m.valeurs?.especes.rejetees_fcfa ?? 0), 0);
  const attente = courant?.especes.a_valider_7j ?? 0;
  const attenteFcfa = courant?.especes.a_valider_7j_fcfa ?? 0;

  return [
    {
      code: 'C1',
      enonce: `Au moins ${c1 != null ? nombre(c1) : '—'} ménages abonnés actifs au 31 décembre`,
      etat: actifs == null ? 'Pas encore mesuré' : `${nombre(actifs)} aujourd’hui`,
      chip: actifs != null && c1 != null && actifs >= c1 ? 'chip-ok' : 'chip-neutre',
    },
    {
      code: 'C2',
      enonce: `Taux de paiement effectif d’au moins ${pourcent(c2)} sur le dernier mois`,
      etat: paiement == null ? 'Pas encore mesuré' : `${pourcent(paiement)} ce mois-ci`,
      chip: paiement == null || c2 == null ? 'chip-neutre' : paiement >= c2 ? 'chip-ok' : 'chip-relance',
    },
    {
      code: 'C3',
      enonce: 'Coût de collecte par ménage servi mesuré et inférieur à la part reversée au précollecteur',
      etat: avecCouts?.valeur == null
        ? 'Pas encore mesuré : aucune charge saisie'
        : `${fcfa(avecCouts.valeur)} de coût pour ${fcfa(avecCouts.recette_par_menage)} reversés par ménage servi`,
      chip:
        avecCouts?.valeur == null || avecCouts.recette_par_menage == null
          ? 'chip-neutre'
          : avecCouts.valeur < avecCouts.recette_par_menage
            ? 'chip-ok'
            : 'chip-relance',
    },
    {
      code: 'C4',
      enonce: 'Aucune perte d’encaissement non expliquée sur le circuit espèces',
      etat:
        rejets || attente
          ? [
              rejets ? `${nombre(rejets)} encaissement${rejets > 1 ? 's' : ''} rejeté${rejets > 1 ? 's' : ''} (${fcfa(rejetsFcfa)})` : null,
              attente ? `${nombre(attente)} non rapproché${attente > 1 ? 's' : ''} depuis plus de 7 jours (${fcfa(attenteFcfa)})` : null,
            ]
              .filter(Boolean)
              .join(' · ') + ' : à expliquer'
          : 'Aucun signal sur le circuit espèces',
      chip: rejets || attente ? 'chip-relance' : 'chip-ok',
    },
  ];
}
