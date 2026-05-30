'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@myklintown/db/server';
import { homeForRole, type UserRole } from './roles';

export interface AuthState {
  error?: string;
  message?: string;
}

/** Connexion par e-mail + mot de passe, puis redirection vers le portail du rôle. */
export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { error: 'Renseignez votre e-mail et votre mot de passe.' };
  }

  const supabase = createServerSupabase(await cookies());
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: 'E-mail ou mot de passe incorrect.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const role = (profile as unknown as { role?: string } | null)?.role;
  redirect(homeForRole(role));
}

/** Inscription : crée l'utilisateur (le trigger SQL crée le profil avec le rôle). */
export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const nomComplet = String(formData.get('nom') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const telephone = String(formData.get('tel') ?? '').trim();
  const role = String(formData.get('role') ?? '');

  if (!role) return { error: 'Choisissez d’abord un profil.' };
  if (!nomComplet || !email || !password) {
    return { error: 'Nom, e-mail et mot de passe sont obligatoires.' };
  }
  if (password.length < 6) {
    return { error: 'Le mot de passe doit faire au moins 6 caractères.' };
  }

  const supabase = createServerSupabase(await cookies());
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nom_complet: nomComplet, role, telephone },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Si la confirmation e-mail est désactivée, une session est créée → on entre directement.
  if (data.session) {
    redirect(homeForRole(role as UserRole));
  }

  // Sinon : confirmation e-mail requise.
  return {
    message:
      'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.',
  };
}

/** Déconnexion puis redirection vers la page de confirmation. */
export async function signOutAction(): Promise<void> {
  const supabase = createServerSupabase(await cookies());
  await supabase.auth.signOut();
  redirect('/logout');
}
