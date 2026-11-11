/**
 * Base simulée en mémoire pour les tests unitaires du paiement en ligne : juste
 * ce que lib/paiement/service.ts demande au client Supabase (lecture filtrée,
 * comptage, modification, insertion, RPC). Les lignes de `paiements_en_ligne`
 * respectent l'index unique de la migration 0023 : une seule demande en cours
 * (« initie », « en_attente ») par facture, sinon erreur 23505.
 */

export type Ligne = Record<string, unknown>;
type Filtre = (l: Ligne) => boolean;
type Reponse = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };

const EN_COURS = ['initie', 'en_attente'];

export interface FausseBase {
  tables: Record<string, Ligne[]>;
  /** Réponses des fonctions SQL appelées en RPC. */
  rpc: Record<string, (args: Record<string, unknown>) => Reponse>;
  appelsRpc: { fonction: string; args: Record<string, unknown> }[];
  /** Erreur forcée sur la prochaine opération qui la vérifie (table, action). */
  panne?: { table: string; action: 'select' | 'update' | 'insert' } | null;
  /** Juste avant une insertion : simule une autre requête passée entre la lecture et l'écriture. */
  avantInsertion?: ((table: string) => void) | null;
  client: unknown;
}

export function fausseBase(tables: Record<string, Ligne[]> = {}): FausseBase {
  const base: FausseBase = { tables, rpc: {}, appelsRpc: [], panne: null, avantInsertion: null, client: null };
  const lignes = (t: string) => (base.tables[t] ??= []);
  const enPanne = (table: string, action: 'select' | 'update' | 'insert') => {
    if (base.panne?.table === table && base.panne.action === action) {
      base.panne = null;
      return true;
    }
    return false;
  };

  function requete(table: string) {
    const filtres: Filtre[] = [];
    let action: 'select' | 'update' | 'insert' = 'select';
    let valeurs: Ligne | null = null;
    let compter = false;
    let renvoyer = false;
    let tri: string | null = null;
    let max: number | null = null;

    const executer = (unique: boolean): Reponse => {
      if (enPanne(table, action)) return { data: null, error: { message: `panne simulée (${table}, ${action})` } };
      if (action === 'insert') {
        const nouvelle: Ligne = { statut: 'initie', created_at: new Date().toISOString(), ...(valeurs ?? {}) };
        base.avantInsertion?.(table);
        if (
          table === 'paiements_en_ligne' &&
          EN_COURS.includes(String(nouvelle.statut)) &&
          lignes(table).some((l) => l.facture_id === nouvelle.facture_id && EN_COURS.includes(String(l.statut)))
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "paiements_en_ligne_un_en_cours"' } };
        }
        lignes(table).push(nouvelle);
        return { data: null, error: null };
      }
      let choisies = lignes(table).filter((l) => filtres.every((f) => f(l)));
      if (action === 'update') {
        for (const l of choisies) Object.assign(l, valeurs);
        return { data: renvoyer ? choisies.map((l) => ({ ...l })) : null, error: null };
      }
      if (tri) choisies = [...choisies].sort((a, b) => String(a[tri!]).localeCompare(String(b[tri!])));
      if (max !== null) choisies = choisies.slice(0, max);
      if (compter) return { data: null, error: null, count: choisies.length };
      if (unique) return { data: choisies[0] ?? null, error: null };
      return { data: choisies.map((l) => ({ ...l })), error: null };
    };

    const b = {
      select(_colonnes?: string, options?: { count?: string; head?: boolean }) {
        if (action === 'select') compter = !!options?.head;
        else renvoyer = true;
        return b;
      },
      update(v: Ligne) {
        action = 'update';
        valeurs = v;
        return b;
      },
      insert(v: Ligne) {
        action = 'insert';
        valeurs = v;
        return b;
      },
      eq(c: string, v: unknown) {
        filtres.push((l) => l[c] === v);
        return b;
      },
      in(c: string, v: unknown[]) {
        filtres.push((l) => v.includes(l[c]));
        return b;
      },
      gte(c: string, v: string) {
        filtres.push((l) => String(l[c]) >= v);
        return b;
      },
      lt(c: string, v: string) {
        filtres.push((l) => String(l[c]) < v);
        return b;
      },
      is(c: string, v: null) {
        filtres.push((l) => (l[c] ?? null) === v);
        return b;
      },
      not(c: string, op: string, v: null) {
        if (op !== 'is') throw new Error(`not(${op}) non simulé`);
        filtres.push((l) => (l[c] ?? null) !== v);
        return b;
      },
      order(c: string) {
        tri = c;
        return b;
      },
      limit(n: number) {
        max = n;
        return b;
      },
      maybeSingle: async () => executer(true),
      then<T>(ok: (r: Reponse) => T, ko?: (e: unknown) => T) {
        return Promise.resolve(executer(false)).then(ok, ko);
      },
    };
    return b;
  }

  base.client = {
    from: (table: string) => requete(table),
    rpc: async (fonction: string, args: Record<string, unknown>) => {
      base.appelsRpc.push({ fonction, args });
      const f = base.rpc[fonction];
      return f ? f(args) : { data: null, error: { message: `RPC ${fonction} non simulée` } };
    },
  };
  return base;
}

export const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString();
