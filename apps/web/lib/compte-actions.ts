'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabase, rpc } from '@/lib/server';
import { normaliserNom } from '@/lib/metier';
import type { ActionState } from '@/lib/types';

/** Nom et téléphone du compte connecté (le rôle, lui, reste verrouillé en base). */
export async function majProfilAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Session expirée : reconnectez-vous.' };
  const nom = normaliserNom(String(fd.get('nom') ?? ''));
  if (!nom) return { error: 'Le nom est obligatoire.' };
  const telephone = String(fd.get('telephone') ?? '').trim() || null;
  const { error } = await supabase.from('profiles').update({ nom_complet: nom, telephone }).eq('id', user.id);
  if (error) return { error: 'Enregistrement impossible. Réessayez.' };
  revalidatePath('/', 'layout');
  return { ok: 'Profil mis à jour.' };
}

export async function changerMotDePasseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const motDePasse = String(fd.get('password') ?? '');
  if (motDePasse.length < 6) return { error: 'Le mot de passe doit faire au moins 6 caractères.' };
  if (motDePasse !== String(fd.get('confirmation') ?? '')) {
    return { error: 'Les deux mots de passe ne sont pas identiques.' };
  }
  const supabase = await getSupabase();
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) {
    return {
      error: /different|same/i.test(error.message)
        ? 'Choisissez un mot de passe différent de l’actuel.'
        : 'Le mot de passe n’a pas pu être changé. Réessayez.',
    };
  }
  return { ok: 'Mot de passe changé.' };
}

/**
 * Le ménage déjà servi rattache son compte à la fiche créée par son
 * précollecteur : code de l'étiquette (MKT-…) + téléphone enregistré.
 */
export async function rattacherCompteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const code = String(fd.get('code') ?? '').trim().toUpperCase();
  const telephone = String(fd.get('telephone') ?? '').trim();
  if (!/^MKT-[A-Z0-9]{4,}$/.test(code)) return { error: 'Le code figure sur votre étiquette : il commence par « MKT- ».' };
  if (!telephone) return { error: 'Indiquez le téléphone donné à votre précollecteur.' };
  const supabase = await getSupabase();
  const { error } = await rpc(supabase, 'rattacher_mon_compte', { p_code: code, p_telephone: telephone });
  if (error) {
    return {
      error: /function|schema cache/i.test(error.message)
        ? 'Cette fonction n’est pas encore activée. Réessayez plus tard.'
        : error.message,
    };
  }
  revalidatePath('/citoyen', 'layout');
  redirect('/citoyen?rattache=1');
}
