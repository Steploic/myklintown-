import type { Passage } from '@/components/precollecteur/tournee-runner';
import { parametre, rows, type Supa } from '@/lib/server';

const COLONNES = 'id, nom, code, quartier, adresse, statut_abonnement, lat, lng, montant_impaye, telephone';
// Migration 20261019000013 : consigne de terrain et ce qu'il faut pour son motif.
const COLONNES_0013 = `${COLONNES}, consigne_terrain, couverture_fin, fin_grace, plus_ancienne_echeance`;

/**
 * Fiches des ménages d'une tournée (précollecteur et employé), avec la consigne
 * de terrain. Avant la migration 20261019000013, la vue n'a pas ces colonnes :
 * on relit sans elles, pour qu'un déploiement fait avant la migration ne casse
 * jamais la tournée.
 */
export async function clientsDeTournee(supabase: Supa, ids: string[]): Promise<Passage['client'][]> {
  if (!ids.length) return [];
  const lire = (colonnes: string) => supabase.from('v_clients_statut').select(colonnes).in('id', ids);
  let r = await lire(COLONNES_0013);
  if (r.error && /42703|consigne_terrain|fin_grace/.test(`${r.error.code ?? ''} ${r.error.message}`)) r = await lire(COLONNES);
  return rows<Passage['client']>(r.data);
}

/** Blocage au passage activé par l'administrateur (`terrain_blocage_actif`, éteint par défaut). */
export async function blocageAuPassage(supabase: Supa): Promise<boolean> {
  return (await parametre(supabase, 'terrain_blocage_actif', 0)) === 1;
}
