import { rows, utilisateurCourant, type Supa } from '@/lib/server';

export interface Commune {
  id: string;
  nom: string;
  code: string;
}

export interface AccesCommunes {
  estAdmin: boolean;
  /**
   * La base cloisonne-t-elle la Mairie par commune (migration 20261019000016) ?
   * Sans elle, tout compte Mairie voit toutes les communes, comme avant.
   */
  cloisonne: boolean;
  /** Communes supervisées : toutes pour l'administrateur (ou sans cloisonnement). */
  communes: Commune[];
  /** Le référentiel complet (13 communes). */
  toutes: Commune[];
}

/**
 * Communes que le compte connecté supervise. Un compte Mairie qui n'est
 * rattaché à aucune commune obtient une liste vide : la base ne lui montre
 * rien, l'interface le lui dit (`AvisSansCommune`).
 */
export async function accesCommunes(supabase: Supa): Promise<AccesCommunes> {
  const user = await utilisateurCourant(supabase);
  const [p, c, mc] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle(),
    supabase.from('communes').select('id, nom, code').order('nom'),
    supabase.from('mairie_communes').select('commune_id').eq('user_id', user?.id ?? ''),
  ]);
  const estAdmin = (p.data as { role?: string } | null)?.role === 'admin';
  const toutes = rows<Commune>(c.data);
  const cloisonne = !mc.error;
  if (estAdmin || !cloisonne) return { estAdmin, cloisonne, communes: toutes, toutes };
  const miennes = new Set(rows<{ commune_id: string }>(mc.data).map((x) => x.commune_id));
  return { estAdmin, cloisonne, communes: toutes.filter((x) => miennes.has(x.id)), toutes };
}

/** Compte Mairie (pas administrateur) rattaché à aucune commune : il ne voit rien. */
export const sansCommune = (a: AccesCommunes) => a.cloisonne && !a.estAdmin && a.communes.length === 0;

/** En-tête des pages Mairie : ce compte n'est-il rattaché à aucune commune ? (une seule requête) */
export async function mairieSansCommune(supabase: Supa): Promise<boolean> {
  const user = await utilisateurCourant(supabase);
  const { data, error } = await supabase.from('mairie_communes').select('commune_id').eq('user_id', user?.id ?? '').limit(1);
  return !error && rows(data).length === 0;
}

/** « Yaoundé III », « Yaoundé III et Douala I »… pour les sous-titres. */
export function nomsCommunes(communes: Pick<Commune, 'nom'>[]): string {
  const noms = communes.map((c) => c.nom);
  return noms.length <= 1 ? (noms[0] ?? '') : `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}`;
}
