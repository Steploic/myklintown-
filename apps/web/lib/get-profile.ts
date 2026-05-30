import { cookies } from 'next/headers';
import { createServerSupabase } from '@myklintown/db/server';

export interface CurrentProfile {
  nom: string;
  email: string;
  avatar_url?: string;
  role?: string;
}

/**
 * Récupère le profil de l'utilisateur connecté (server-side).
 * Retourne null si aucune session. Utilisé par PortalShell pour afficher
 * le vrai nom/e-mail dans l'en-tête plutôt que des données de démo.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = createServerSupabase(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('nom_complet, email, avatar_url, role')
    .eq('id', user.id)
    .single();

  const p = data as
    | { nom_complet?: string; email?: string; avatar_url?: string; role?: string }
    | null;

  return {
    nom: p?.nom_complet || user.email?.split('@')[0] || 'Utilisateur',
    email: p?.email || user.email || '',
    avatar_url: p?.avatar_url,
    role: p?.role,
  };
}
