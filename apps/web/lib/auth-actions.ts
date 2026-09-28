'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@myklintown/db/server';
import { homeForRole, isSelfServiceRole, type UserRole } from './roles';

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
  // Le formulaire n'est pas une barrière : ce champ arrive du client et peut
  // être forgé. On refuse ici pour donner un message clair ; la garantie, elle,
  // est posée en base (`handle_new_user()` ramène tout rôle non autorisé à
  // « citoyen », et un déclencheur interdit ensuite d'en changer soi-même).
  if (!isSelfServiceRole(role)) {
    return {
      error:
        'Ce profil ne s’obtient pas en ligne. Les accès Collecteur et Mairie sont ouverts par MyKlinTown : contactez-nous.',
    };
  }
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

/**
 * Origine réelle de la requête.
 *
 * On la déduit des en-têtes plutôt que de `NEXT_PUBLIC_SITE_URL` : si cette
 * variable est mal renseignée en production, les liens de réinitialisation
 * pointeraient vers `localhost` et personne ne s'en apercevrait avant qu'un
 * utilisateur ne se plaigne. Les en-têtes, eux, ne peuvent pas se tromper.
 */
async function origineDemande(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Demande d'un lien de réinitialisation.
 *
 * Répond toujours la même chose, que l'adresse existe ou non : une réponse
 * différenciée transformerait ce formulaire en outil de vérification de
 * comptes. C'est délibéré, ce n'est pas une imprécision.
 */
export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  const CONFIRMATION =
    'Si un compte existe pour cette adresse, un lien de réinitialisation vient d’y être envoyé. Pensez à regarder les indésirables.';

  if (!email || !email.includes('@')) {
    return { error: 'Saisissez une adresse e-mail valide.' };
  }

  const supabase = createServerSupabase(await cookies());
  const origine = await origineDemande();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origine}/auth/callback?next=/reset-password`,
  });

  // Une erreur de configuration (SMTP absent, domaine non autorisé) doit être
  // visible : la taire ferait croire à l'utilisateur que le message est parti.
  if (error && /redirect|url|smtp|mail/i.test(error.message)) {
    return {
      error:
        'L’envoi a échoué côté serveur. Prévenez MyKlinTown : la configuration des e-mails doit être vérifiée.',
    };
  }

  return { message: CONFIRMATION };
}

/**
 * Définition du nouveau mot de passe, après ouverture du lien reçu par e-mail.
 * À ce stade la session de récupération existe déjà (créée par /auth/callback).
 */
export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const motDePasse = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');

  if (motDePasse.length < 6) {
    return { error: 'Le mot de passe doit faire au moins 6 caractères.' };
  }
  if (motDePasse !== confirmation) {
    return { error: 'Les deux mots de passe ne sont pas identiques.' };
  }

  const supabase = createServerSupabase(await cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        'Ce lien n’est plus valide. Les liens expirent au bout d’une heure et ne servent qu’une fois — demandez-en un nouveau.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) {
    return { error: 'Le mot de passe n’a pas pu être enregistré. Réessayez.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  redirect(homeForRole((profile as unknown as { role?: string } | null)?.role));
}
