/** Mise en forme partagée (serveur et client). */

const nf = new Intl.NumberFormat('fr-FR');

export function fcfa(n: number | null | undefined): string {
  return `${nf.format(Math.round(n ?? 0))} FCFA`;
}

export function nombre(n: number | null | undefined): string {
  return nf.format(Math.round(n ?? 0));
}

export function pct(part: number, total: number): string {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)} %`;
}

/**
 * Fuseau de l'application. Les serveurs (Vercel) sont en UTC : sans fuseau
 * explicite, une heure calculée côté serveur s'affichait avec une heure de
 * retard sur Douala.
 */
export const FUSEAU = 'Africa/Douala';

export function dateFr(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—';
  // Une date seule (AAAA-MM-JJ) est un jour du calendrier, pas un instant : pas de fuseau.
  const jourSeul = typeof d === 'string' && d.length === 10;
  const date = typeof d === 'string' ? new Date(jourSeul ? d + 'T12:00:00' : d) : d;
  return date.toLocaleDateString('fr-FR', {
    ...(opts ?? { day: 'numeric', month: 'short', year: 'numeric' }),
    ...(jourSeul ? {} : { timeZone: FUSEAU }),
  });
}

export function dateHeureFr(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU,
  });
}

/** « 14:05 », heure de Douala. */
export function heureFr(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU });
}

/** AAAA-MM-JJ en heure locale (le serveur Vercel est en UTC, Yaoundé en UTC+1 : l'écart ne change pas la date en journée). */
export function isoJour(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

export function ajouterJours(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoJour(d);
}

export function ajouterMois(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return isoJour(d);
}

export function joursEntre(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000,
  );
}

/** Numéro camerounais → format international sans « + » (pour wa.me). */
export function telInternational(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const chiffres = tel.replace(/\D/g, '').replace(/^00/, '');
  if (chiffres.length === 9) return '237' + chiffres;
  if (chiffres.length === 12 && chiffres.startsWith('237')) return chiffres;
  return chiffres.length >= 8 ? chiffres : null;
}

export function telLisible(tel: string | null | undefined): string {
  const i = telInternational(tel);
  if (!i) return tel || '—';
  if (i.startsWith('237') && i.length === 12) {
    const n = i.slice(3);
    return `+237 ${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
  }
  return '+' + i;
}

// --- Statuts --------------------------------------------------------------------

export type StatutAbonnement =
  | 'a_jour'
  | 'echeance_proche'
  | 'impaye'
  | 'expire'
  | 'sans_facture'
  | 'demande'
  | 'suspendu'
  | 'resilie';

/** Libellé + couleur terrain : vert = servir, orange = relancer, rouge = ne pas servir. */
export const STATUT_ABONNEMENT: Record<StatutAbonnement, { label: string; chip: string; terrain: 'ok' | 'relance' | 'stop' | 'neutre' }> = {
  a_jour: { label: 'À jour', chip: 'chip-ok', terrain: 'ok' },
  echeance_proche: { label: 'Échéance proche', chip: 'chip-relance', terrain: 'relance' },
  sans_facture: { label: 'À facturer', chip: 'chip-relance', terrain: 'relance' },
  impaye: { label: 'Impayé', chip: 'chip-stop', terrain: 'stop' },
  expire: { label: 'Expiré', chip: 'chip-stop', terrain: 'stop' },
  demande: { label: 'Nouvelle demande', chip: 'chip-info', terrain: 'neutre' },
  suspendu: { label: 'Suspendu', chip: 'chip-neutre', terrain: 'stop' },
  resilie: { label: 'Résilié', chip: 'chip-neutre', terrain: 'neutre' },
};

export function statutAbonnement(s: string | null | undefined) {
  return STATUT_ABONNEMENT[(s as StatutAbonnement) ?? 'sans_facture'] ?? STATUT_ABONNEMENT.sans_facture;
}

export const STATUT_COLLECTE: Record<string, { label: string; chip: string }> = {
  prevue: { label: 'Prévue', chip: 'chip-info' },
  realisee: { label: 'Réalisée', chip: 'chip-ok' },
  non_realisee: { label: 'Non réalisée', chip: 'chip-stop' },
};

export const STATUT_TOURNEE: Record<string, { label: string; chip: string }> = {
  planifiee: { label: 'Planifiée', chip: 'chip-info' },
  en_cours: { label: 'En cours', chip: 'chip-relance' },
  terminee: { label: 'Terminée', chip: 'chip-ok' },
  annulee: { label: 'Annulée', chip: 'chip-neutre' },
};

export const STATUT_INCIDENT: Record<string, { label: string; chip: string }> = {
  ouvert: { label: 'Ouvert', chip: 'chip-stop' },
  en_cours: { label: 'En traitement', chip: 'chip-relance' },
  resolu: { label: 'Résolu', chip: 'chip-ok' },
};

export const METHODES_PAIEMENT: Record<string, string> = {
  especes: 'Espèces',
  mtn_momo: 'MTN Mobile Money',
  orange_money: 'Orange Money',
  virement: 'Virement',
};

export const CATEGORIES_INCIDENT: Record<string, string> = {
  acces_impossible: 'Accès impossible',
  client_absent: 'Client absent',
  dechets_non_conformes: 'Déchets non conformes',
  depot_sauvage: 'Dépôt sauvage',
  panne_tricycle: 'Panne de tricycle',
  accident: 'Accident / blessure',
  passage_non_effectue: 'Passage non effectué',
  collecte_incomplete: 'Collecte incomplète',
  comportement: 'Comportement de l’agent',
  autre: 'Autre',
};

export const CATEGORIES_INCIDENT_PRECOLLECTEUR = [
  'acces_impossible',
  'client_absent',
  'dechets_non_conformes',
  'depot_sauvage',
  'panne_tricycle',
  'accident',
  'autre',
];

export const CATEGORIES_INCIDENT_CLIENT = [
  'passage_non_effectue',
  'collecte_incomplete',
  'depot_sauvage',
  'comportement',
  'autre',
];

export const MOTIFS_NON_REALISEE = [
  'Client absent',
  'Accès impossible',
  'Bac vide',
  'Refus / impayé',
  'Panne du tricycle',
  'Intempéries',
  'Autre',
];

// --- Messages de relance (niveau croissant) -----------------------------------------

export function niveauRelance(joursDeRetard: number): 1 | 2 | 3 {
  if (joursDeRetard > 21) return 3;
  if (joursDeRetard > 7) return 2;
  return 1;
}

export const NIVEAUX_RELANCE: Record<1 | 2 | 3, { label: string; chip: string }> = {
  1: { label: 'Rappel', chip: 'chip-relance' },
  2: { label: 'Relance', chip: 'chip-stop' },
  3: { label: 'Mise en demeure', chip: 'chip-stop' },
};

export function messageRelance(p: {
  niveau: 1 | 2 | 3;
  client: string;
  montant: number;
  entreprise: string;
  numero?: string;
  echeance?: string | null;
}): string {
  const du = fcfa(p.montant);
  const ref = p.numero ? ` (facture ${p.numero})` : '';
  if (p.niveau === 1) {
    return `Bonjour ${p.client}, votre abonnement de collecte des déchets${ref} de ${du} est arrivé à échéance${p.echeance ? ` le ${dateFr(p.echeance)}` : ''}. Merci de régler pour continuer à être servi. — ${p.entreprise} (MyKlinTown)`;
  }
  if (p.niveau === 2) {
    return `Bonjour ${p.client}, sauf erreur, nous n’avons pas encore reçu le règlement de ${du}${ref}. Sans paiement, la collecte sera suspendue. Paiement possible en espèces ou Mobile Money. — ${p.entreprise} (MyKlinTown)`;
  }
  return `Bonjour ${p.client}, malgré nos relances, ${du}${ref} reste impayé. La collecte est suspendue jusqu’au règlement. Contactez-nous pour régulariser. — ${p.entreprise} (MyKlinTown)`;
}

export function messageEcheance(p: { client: string; fin: string; entreprise: string; prix?: number | null }): string {
  return `Bonjour ${p.client}, votre abonnement de collecte se termine le ${dateFr(p.fin)}.${p.prix ? ` Renouvellement : ${fcfa(p.prix)}.` : ''} Pensez à régler pour ne pas interrompre le service. — ${p.entreprise} (MyKlinTown)`;
}

// --- Erreurs réseau (connexion mobile instable) -------------------------------------

export const MESSAGE_RESEAU =
  'Connexion au serveur impossible. Vérifiez votre réseau (données mobiles, Wi-Fi) puis réessayez : rien n’a été perdu.';

/** Coupure réseau, et non refus du serveur : à ne jamais présenter comme une erreur de saisie. */
export function estErreurReseau(e: { message?: string; status?: number } | null | undefined): boolean {
  if (!e) return false;
  return e.status === 0 || /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|Failed to fetch|TimeoutError|timed? ?out|aborted due to timeout/i.test(e.message ?? '');
}

/** Fragment de nom de fichier lisible : « Famille Ateba » → « Famille_Ateba ». */
export function nomFichier(texte: string): string {
  return texte.trim().replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
}
