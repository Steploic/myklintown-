/**
 * File d'attente des gestes de terrain faits SANS RÉSEAU.
 *
 * Sur le terrain, le réseau coupe souvent. Un scan ou un pointage fait hors
 * ligne est gardé sur le téléphone (localStorage : il survit à un
 * rechargement de la page), puis envoyé dès que le réseau revient, dans
 * l'ordre où il a été fait, avec l'HEURE RÉELLE du passage.
 *
 * Rejouer un geste est sans danger : un scan déjà enregistré répond « déjà
 * fait », un pointage remet le même statut. Un geste que le serveur REFUSE
 * (tournée close, code inconnu…) n'est pas perdu en silence : il reste dans
 * la file avec le motif du refus, jusqu'à ce que l'agent l'ait lu.
 *
 * Ce module ne dépend ni de React ni des actions serveur : les « exécuteurs »
 * sont fournis par l'appelant (testable seul, voir tests/unit).
 */

export type StatutPassage = 'realisee' | 'non_realisee' | 'prevue';

interface Base {
  id: string;
  tourneeId: string;
  /** Heure du geste sur le téléphone (ISO). */
  horodatage: string;
  /** Motif du refus par le serveur, une fois rejoué. */
  refus?: string;
}
export type OperationTerrain =
  | (Base & { type: 'pointage'; collecteId: string; statut: StatutPassage; motif: string | null })
  | (Base & { type: 'scan'; code: string });

/** Réponse d'un exécuteur : `reseau` = à retenter plus tard ; `error` seul = refus définitif. */
export interface ResultatEnvoi {
  error?: string;
  reseau?: boolean;
}
export type Executeurs = {
  [T in OperationTerrain['type']]: (op: Extract<OperationTerrain, { type: T }>) => Promise<ResultatEnvoi>;
};

export const CLE_STOCKAGE = 'mkt:file-terrain:v1';

interface Stockage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

function stockageNavigateur(): Stockage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // navigation privée stricte, stockage bloqué
  }
}

let stockage: Stockage | null = null;
let memoire: OperationTerrain[] = [];
const abonnes = new Set<() => void>();
let instantane: readonly OperationTerrain[] | null = null;
const VIDE: readonly OperationTerrain[] = [];

/** Pour les tests : un stockage en mémoire à la place de localStorage. */
export function utiliserStockage(s: Stockage | null) {
  stockage = s;
  memoire = [];
  instantane = lireBrut();
}

function lireBrut(): OperationTerrain[] {
  const s = stockage ?? stockageNavigateur();
  if (!s) return memoire;
  try {
    const brut = s.getItem(CLE_STOCKAGE);
    const liste = brut ? (JSON.parse(brut) as unknown) : [];
    return Array.isArray(liste) ? (liste as OperationTerrain[]) : [];
  } catch {
    return [];
  }
}

function ecrire(liste: OperationTerrain[]) {
  const s = stockage ?? stockageNavigateur();
  memoire = liste;
  if (s) {
    try {
      s.setItem(CLE_STOCKAGE, JSON.stringify(liste));
    } catch {
      // stockage plein ou refusé : la file reste en mémoire pour cette page
    }
  }
  instantane = liste;
  abonnes.forEach((f) => f());
}

/** Toutes les opérations en attente (le même tableau tant que rien ne change). */
export function operations(): readonly OperationTerrain[] {
  if (instantane == null) instantane = lireBrut();
  return instantane;
}

/** Rendu serveur : jamais de file (elle n'existe que sur le téléphone). */
export function operationsServeur(): readonly OperationTerrain[] {
  return VIDE;
}

export function abonner(f: () => void): () => void {
  if (abonnes.size === 0) instantane = lireBrut();
  abonnes.add(f);
  // Un autre onglet a modifié la file.
  const surStockage = (e: StorageEvent) => {
    if (e.key === CLE_STOCKAGE) {
      instantane = lireBrut();
      f();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', surStockage);
  return () => {
    abonnes.delete(f);
    if (typeof window !== 'undefined') window.removeEventListener('storage', surStockage);
  };
}

function nouvelId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type SansId<T> = T extends unknown ? Omit<T, 'id' | 'horodatage' | 'refus'> & { horodatage?: string } : never;

export function ajouter(op: SansId<OperationTerrain>): OperationTerrain {
  const complete = { ...op, id: nouvelId(), horodatage: op.horodatage ?? new Date().toISOString() } as OperationTerrain;
  let liste = lireBrut();
  // Le même QR scanné deux fois avant le retour du réseau : un seul passage.
  if (complete.type === 'scan') {
    const deja = liste.find((o) => o.type === 'scan' && !o.refus && o.tourneeId === complete.tourneeId && o.code === complete.code);
    if (deja) return deja;
  }
  // Un nouveau pointage du même passage remplace le précédent encore en attente.
  if (complete.type === 'pointage') {
    liste = liste.filter((o) => !(o.type === 'pointage' && !o.refus && o.collecteId === complete.collecteId));
  }
  ecrire([...liste, complete]);
  return complete;
}

export function retirer(id: string) {
  ecrire(lireBrut().filter((o) => o.id !== id));
}

/** Efface les refus déjà lus par l'agent (pour une tournée, ou partout). */
export function oublierRefus(tourneeId?: string) {
  ecrire(lireBrut().filter((o) => !o.refus || (tourneeId != null && o.tourneeId !== tourneeId)));
}

let envoiEnCours: Promise<BilanEnvoi> | null = null;

export interface BilanEnvoi {
  envoyees: number;
  refusees: number;
  restantes: number;
  /** Arrêt sur une coupure : le reste partira au prochain essai. */
  coupure: boolean;
}

/**
 * Envoie la file dans l'ordre. S'arrête à la première coupure réseau (le
 * reste attend) ; un refus est marqué et l'envoi continue avec la suite.
 * Un seul envoi à la fois : un second appel attend le premier.
 */
export function envoyer(executeurs: Executeurs): Promise<BilanEnvoi> {
  if (envoiEnCours) return envoiEnCours;
  envoiEnCours = (async () => {
    const bilan: BilanEnvoi = { envoyees: 0, refusees: 0, restantes: 0, coupure: false };
    for (const op of lireBrut()) {
      if (op.refus) continue;
      let r: ResultatEnvoi;
      try {
        r = await (executeurs[op.type] as (o: OperationTerrain) => Promise<ResultatEnvoi>)(op);
      } catch {
        r = { reseau: true };
      }
      if (r.reseau) {
        bilan.coupure = true;
        break;
      }
      if (r.error) {
        ecrire(lireBrut().map((o) => (o.id === op.id ? { ...o, refus: r.error } : o)));
        bilan.refusees++;
      } else {
        retirer(op.id);
        bilan.envoyees++;
      }
    }
    bilan.restantes = lireBrut().filter((o) => !o.refus).length;
    return bilan;
  })().finally(() => {
    envoiEnCours = null;
  });
  return envoiEnCours;
}

export function envoiActif(): boolean {
  return envoiEnCours != null;
}
