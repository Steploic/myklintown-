import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@myklintown/db/server';

/**
 * Client Supabase lié à la session de la requête en cours.
 *
 * Non typé volontairement : les types du schéma ne sont pas encore générés
 * (voir packages/db/src/database.types.ts) et la version permissive rend les
 * insert/update impossibles à typer. La sécurité reste portée par la RLS.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  return createServerSupabase(await cookies()) as unknown as SupabaseClient;
}

export type Supa = SupabaseClient;

/** Utilisateur connecté, ou renvoi à la connexion. */
export async function requireUser() {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

/** Lecture typée souple : le schéma n'est pas encore généré (voir database.types.ts). */
export function rows<T>(data: unknown): T[] {
  return (Array.isArray(data) ? data : []) as T[];
}

export function row<T>(data: unknown): T | null {
  return (data ?? null) as T | null;
}

/** Paramètre plateforme numérique (lu en base, jamais codé en dur). */
export async function parametre(supabase: Supa, cle: string, defaut: number): Promise<number> {
  const { data } = await supabase
    .from('parametres_plateforme')
    .select('valeur')
    .eq('cle', cle)
    .maybeSingle();
  const v = Number((data as { valeur?: unknown } | null)?.valeur);
  return Number.isFinite(v) ? v : defaut;
}

/** Appel RPC non typé (fonctions du pivot, absentes des types générés). */
export function rpc(supabase: Supa, fn: string, args: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).rpc(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;
}
