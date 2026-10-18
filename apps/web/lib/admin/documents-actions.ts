'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase, row, rows, utilisateurCourant, type Supa } from '@/lib/server';
import { estTypeDocument } from '@/lib/documents';
import type { ActionState } from '@/lib/types';

/**
 * Charte du ménage et contrat d'abonnement : rédaction et publication par un
 * administrateur MyKlinTown. La base fait autorité (RLS : écriture admin
 * seulement ; une version publiée est figée) ; ces contrôles rendent le refus
 * lisible.
 */

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function exigerAdmin(): Promise<{ supabase: Supa } | { error: string }> {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  const { data } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle();
  if (row<{ role: string }>(data)?.role !== 'admin') return { error: 'Réservé aux administrateurs MyKlinTown.' };
  return { supabase };
}

function lireTexte(fd: FormData): { titre: string; contenu: string; provisoire: boolean } | { error: string } {
  const titre = txt(fd, 'titre');
  const contenu = String(fd.get('contenu') ?? '').replace(/\r\n?/g, '\n').trim();
  if (titre.length < 3 || titre.length > 200) return { error: 'Le titre fait entre 3 et 200 caractères.' };
  if (!contenu) return { error: 'Le texte du document est vide.' };
  if (contenu.length > 100_000) return { error: 'Texte trop long (100 000 caractères au plus).' };
  return { titre, contenu, provisoire: fd.get('provisoire') === 'on' };
}

function rafraichir() {
  revalidatePath('/dashboard/documents');
  revalidatePath('/legal', 'layout');
}

/** Nouvelle version (brouillon) : numéro suivant, texte de départ au choix. */
export async function creerVersionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const a = await exigerAdmin();
  if ('error' in a) return a;
  const type = txt(fd, 'type');
  if (!estTypeDocument(type)) return { error: 'Document inconnu.' };
  const t = lireTexte(fd);
  if ('error' in t) return t;

  const { data: d } = await a.supabase.from('documents_legaux').select('version').eq('type', type).order('version', { ascending: false }).limit(1);
  const version = (rows<{ version: number }>(d)[0]?.version ?? 0) + 1;
  const { error } = await a.supabase.from('documents_legaux').insert({ type, version, ...t });
  if (error) return { error: /duplicate key/i.test(error.message) ? 'Une autre version vient d’être créée : rechargez la page.' : error.message };
  rafraichir();
  return { ok: `Version ${version} créée en brouillon : relisez-la, puis publiez-la.` };
}

/** Correction d'un brouillon (une version publiée, elle, ne se modifie plus). */
export async function majBrouillonAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const a = await exigerAdmin();
  if ('error' in a) return a;
  const t = lireTexte(fd);
  if ('error' in t) return t;
  const { data, error } = await a.supabase
    .from('documents_legaux')
    .update(t)
    .eq('id', txt(fd, 'id'))
    .is('publie_at', null)
    .select('version');
  if (error) return { error: error.message };
  if (!rows(data).length) return { error: 'Cette version est déjà publiée : elle ne se modifie plus.' };
  rafraichir();
  return { ok: 'Brouillon enregistré.' };
}

/** Publication : la version devient celle à accepter par les ménages, et se fige. */
export async function publierVersionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const a = await exigerAdmin();
  if ('error' in a) return a;
  if (fd.get('confirmer') !== 'on') return { error: 'Cochez la case de confirmation : une version publiée ne se modifie plus.' };
  const { data, error } = await a.supabase
    .from('documents_legaux')
    .update({ publie_at: new Date().toISOString() })
    .eq('id', txt(fd, 'id'))
    .is('publie_at', null)
    .select('version');
  if (error) return { error: error.message };
  const v = rows<{ version: number }>(data)[0];
  if (!v) return { error: 'Cette version est déjà publiée.' };
  rafraichir();
  return { ok: `Version ${v.version} publiée : les ménages seront invités à l’accepter.` };
}

/** Un brouillon abandonné se supprime ; une version publiée, jamais. */
export async function supprimerBrouillonAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const a = await exigerAdmin();
  if ('error' in a) return a;
  const { data, error } = await a.supabase.from('documents_legaux').delete().eq('id', txt(fd, 'id')).is('publie_at', null).select('version');
  if (error) return { error: error.message };
  if (!rows(data).length) return { error: 'Cette version est publiée : elle ne se supprime pas.' };
  rafraichir();
  return { ok: 'Brouillon supprimé.' };
}
