import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@myklintown/db/server';

/**
 * Retour des liens envoyés par e-mail (réinitialisation de mot de passe,
 * confirmation d'adresse).
 *
 * Supabase renvoie l'utilisateur ici avec, selon le gabarit d'e-mail configuré :
 *   • `?code=…` — flux PKCE, le cas par défaut ;
 *   • `?token_hash=…&type=recovery` — gabarit historique.
 * Les deux sont traités : le gabarit peut être changé dans le tableau de bord
 * Supabase sans prévenir le code, et un lien qui tombe dans le vide au moment
 * où quelqu'un a perdu son mot de passe est le pire moment pour échouer.
 *
 * En cas d'échec on renvoie vers /forgot avec un motif lisible plutôt que
 * d'afficher une page d'erreur brute.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/reset-password';

  const echec = (motif: string) =>
    NextResponse.redirect(`${origin}/forgot?motif=${encodeURIComponent(motif)}`);

  const supabase = createServerSupabase(await cookies());

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Le vérificateur PKCE est un cookie posé sur l'appareil qui a fait la
    // demande. Ouvrir le lien depuis un autre téléphone ou un autre navigateur
    // ne peut donc pas fonctionner — il faut le dire, pas laisser deviner.
    if (error) return echec('lien-autre-appareil');
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'recovery' | 'email' | 'signup' | 'invite',
      token_hash: tokenHash,
    });
    if (error) return echec('lien-expire');
    return NextResponse.redirect(`${origin}${next}`);
  }

  return echec('lien-invalide');
}
