import { rows, type Supa } from '@/lib/server';

export interface TourneeEquipe {
  id: string;
  date: string;
  statut: string;
  debut_at: string | null;
  fin_at: string | null;
  zone_nom: string | null;
  tricycle_nom: string | null;
  equipe: string[];
  faits: number;
  rates: number;
  total: number;
}

/**
 * Tournées de l'équipe de l'employé connecté (la sécurité par ligne ne lui
 * montre que celles où il est équipier), avec équipe et progression.
 */
export async function tourneesDeLEquipe(supabase: Supa, quand: 'a_faire' | 'passees', limite = 30): Promise<TourneeEquipe[]> {
  let q = supabase
    .from('tournees_precollecte')
    .select('id, date, statut, debut_at, fin_at, zones(nom), tricycles(nom)')
    .limit(limite);
  q = quand === 'a_faire'
    ? q.in('statut', ['planifiee', 'en_cours']).order('date', { ascending: true })
    : q.in('statut', ['terminee', 'annulee']).order('date', { ascending: false });
  const { data } = await q;
  const brutes = rows<{
    id: string; date: string; statut: string; debut_at: string | null; fin_at: string | null;
    zones: { nom: string } | null; tricycles: { nom: string } | null;
  }>(data);
  if (brutes.length === 0) return [];
  const ids = brutes.map((t) => t.id);
  const [eq, co] = await Promise.all([
    supabase.from('tournee_equipe').select('tournee_id, employes(nom)').in('tournee_id', ids),
    supabase.from('collectes').select('tournee_id, statut').in('tournee_id', ids),
  ]);
  const equipes = rows<{ tournee_id: string; employes: { nom: string } | null }>(eq.data);
  const collectes = rows<{ tournee_id: string; statut: string }>(co.data);
  return brutes.map((t) => {
    const siennes = collectes.filter((c) => c.tournee_id === t.id);
    return {
      id: t.id,
      date: t.date,
      statut: t.statut,
      debut_at: t.debut_at,
      fin_at: t.fin_at,
      zone_nom: t.zones?.nom ?? null,
      tricycle_nom: t.tricycles?.nom ?? null,
      equipe: equipes.filter((e) => e.tournee_id === t.id && e.employes).map((e) => e.employes!.nom).sort(),
      faits: siennes.filter((c) => c.statut === 'realisee').length,
      rates: siennes.filter((c) => c.statut === 'non_realisee').length,
      total: siennes.length,
    };
  });
}

export interface StatsEmploye {
  tournees: number;
  passages_faits: number;
  passages_non_faits: number;
  incidents: number;
  especes_validees: number;
  especes_a_valider: number;
}
