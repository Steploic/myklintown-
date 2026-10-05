'use server';

import { redirect } from 'next/navigation';
import { getSupabase, rpc } from '@/lib/server';
import { estErreurReseau, MESSAGE_RESEAU } from '@/lib/format';
import { normaliserNom } from '@/lib/metier';
import type { ActionState } from '@/lib/types';

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/**
 * Rejoindre l'équipe d'un précollecteur avec le code reçu du gérant. Sans
 * compte : on le crée (e-mail + mot de passe), puis on utilise le code. Le rôle
 * « employé » est donné par la base, jamais par le formulaire.
 */
export async function rejoindreEquipeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const code = txt(fd, 'code');
  if (!code) return { error: 'Saisissez le code d’invitation reçu de votre gérant.' };
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const email = txt(fd, 'email').toLowerCase();
    const motDePasse = String(fd.get('password') ?? '');
    const nom = normaliserNom(txt(fd, 'nom'));
    if (!nom || !email || motDePasse.length < 6) {
      return { error: 'Nom, e-mail et mot de passe (6 caractères minimum) sont obligatoires.' };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: motDePasse,
      options: { data: { nom_complet: nom, role: 'citoyen', telephone: txt(fd, 'telephone') } },
    });
    if (error) {
      if (estErreurReseau(error)) return { error: MESSAGE_RESEAU };
      if (/already registered|already exists/i.test(error.message)) {
        return { error: 'Un compte existe déjà avec cette adresse : connectez-vous, puis revenez sur cette page.' };
      }
      return { error: error.message };
    }
    if (!data.session) {
      return { ok: 'Compte créé. Confirmez votre adresse e-mail, connectez-vous, puis revenez sur cette page avec votre code.' };
    }
  }

  const { error } = await rpc(supabase, 'rejoindre_entreprise', { p_code: code });
  if (error) return { error: estErreurReseau(error) ? MESSAGE_RESEAU : error.message };
  // Le middleware lit le rôle en base : l'espace employé s'ouvre tout de suite.
  redirect('/employe');
}
