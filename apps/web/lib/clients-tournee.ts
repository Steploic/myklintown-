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
  // Par lots de 100 : tous les identifiants d'une grande tournée dans une seule
  // adresse dépassaient la longueur admise (revue du 09/11/2026).
  const lots: string[][] = [];
  for (let i = 0; i < ids.length; i += LOT) lots.push(ids.slice(i, i + LOT));
  const lire = (colonnes: string) => Promise.all(lots.map((lot) => supabase.from('v_clients_statut').select(colonnes).in('id', lot)));
  let r = await lire(COLONNES_0013);
  const erreur = r.find((x) => x.error)?.error;
  if (erreur && /42703|consigne_terrain|fin_grace/.test(`${erreur.code ?? ''} ${erreur.message}`)) r = await lire(COLONNES);
  return r.flatMap((x) => rows<Passage['client']>(x.data));
}

const LOT = 100;

/** Blocage au passage activé par l'administrateur (`terrain_blocage_actif`, éteint par défaut). */
export async function blocageAuPassage(supabase: Supa): Promise<boolean> {
  return (await parametre(supabase, 'terrain_blocage_actif', 0)) === 1;
}
