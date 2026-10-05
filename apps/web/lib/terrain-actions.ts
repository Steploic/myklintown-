'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase, row, rpc } from '@/lib/server';
import { estErreurReseau, MESSAGE_RESEAU } from '@/lib/format';
import { extraireCodeClient } from '@/lib/metier';
import type { ActionState } from '@/lib/types';

/**
 * Gestes de terrain, partagés par le gérant (espace précollecteur) et ses
 * employés (espace employé). Tout passe par des fonctions contrôlées en base
 * (migration 20261005000007) : gérant OU équipier de la tournée, jamais sur
 * une tournée close. L'interface ne fait que relayer.
 */

function rafraichir() {
  revalidatePath('/precollecteur', 'layout');
  revalidatePath('/employe', 'layout');
}

function erreurLisible(message: string | undefined): string {
  if (!message) return 'Une erreur est survenue.';
  if (estErreurReseau({ message })) return MESSAGE_RESEAU;
  if (/row-level security|42501|permission/i.test(message)) return 'Action refusée : vos droits ne le permettent pas.';
  return message;
}

export async function marquerCollecteAction(input: {
  collecteId: string;
  statut: 'realisee' | 'non_realisee' | 'prevue';
  motif?: string | null;
}): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'pointer_passage', {
    p_collecte: input.collecteId,
    p_statut: input.statut,
    p_motif: input.motif ?? null,
  });
  if (error) return { error: erreurLisible(error.message) };
  rafraichir();
  return { ok: 'Enregistré.' };
}

export interface ResultatScan {
  error?: string;
  client?: { nom: string; code: string; statut_abonnement: string; quartier: string | null };
  horsPlanning?: boolean;
  dejaFait?: boolean;
}

/** Scan du QR d'un client pendant la tournée : le passage est tracé en base, immédiatement. */
export async function scannerClientAction(tourneeId: string, codeLu: string): Promise<ResultatScan> {
  const supabase = await getSupabase();
  const { data, error } = await rpc(supabase, 'scanner_passage', {
    p_tournee: tourneeId,
    p_code: extraireCodeClient(codeLu),
  });
  if (error) return { error: erreurLisible(error.message) };
  const r = row<{ nom: string; code: string; statut_abonnement: string; quartier: string | null; hors_planning: boolean; deja_fait: boolean }>(data)!;
  if (!r.deja_fait) rafraichir();
  return {
    client: { nom: r.nom, code: r.code, statut_abonnement: r.statut_abonnement, quartier: r.quartier },
    horsPlanning: r.hors_planning,
    dejaFait: r.deja_fait,
  };
}

/** Démarrer, terminer — et, pour le gérant seulement, rouvrir ou annuler. */
export async function statutTourneeAction(fd: FormData) {
  const supabase = await getSupabase();
  await rpc(supabase, 'changer_statut_tournee', {
    p_tournee: String(fd.get('tournee_id')),
    p_statut: String(fd.get('statut')),
  });
  rafraichir();
}

/** Position du téléphone pendant une tournée en cours (appli ouverte). */
export async function envoyerPositionAction(tourneeId: string, lat: number, lng: number, precision: number | null): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'envoyer_position', {
    p_tournee: tourneeId,
    p_lat: lat,
    p_lng: lng,
    p_precision: precision,
  });
  if (error) return { error: erreurLisible(error.message) };
  return { ok: 'Position envoyée.' };
}

/**
 * Espèces reçues sur le terrain. Encaissées par un employé, elles restent « à
 * valider » jusqu'au contrôle du gérant ; encaissées par le gérant, elles
 * comptent tout de suite.
 */
export async function encaisserEspecesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const montant = Math.round(Number(String(fd.get('montant') ?? '').replace(/\s/g, '').replace(',', '.')));
  if (!Number.isFinite(montant) || montant <= 0) return { error: 'Indiquez le montant reçu.' };
  const supabase = await getSupabase();
  const { data, error } = await rpc(supabase, 'encaisser_especes', {
    p_client: String(fd.get('client_id')),
    p_montant: montant,
  });
  if (error) return { error: erreurLisible(error.message) };
  const { data: p } = await supabase.from('paiements_clients').select('statut').eq('id', data as string).maybeSingle();
  rafraichir();
  return row<{ statut: string }>(p)?.statut === 'a_valider'
    ? { ok: 'Espèces enregistrées : le gérant doit les valider.' }
    : { ok: 'Paiement enregistré.' };
}
