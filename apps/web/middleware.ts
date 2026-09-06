import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { canAccessPath, homeForRole, isProtectedPath } from '@/lib/roles';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Middleware d'authentification et d'autorisation.
 *
 * Trois contrôles, dans cet ordre :
 *   1. La configuration est-elle présente ? Sinon aucun contrôle n'est possible,
 *      donc on refuse — on ne laisse pas passer faute de savoir.
 *   2. Y a-t-il une session ? Sinon → page de connexion.
 *   3. Ce rôle a-t-il le droit d'ouvrir ce portail ? Sinon → son propre portail.
 *
 * Le troisième contrôle manquait : être connecté suffisait à ouvrir n'importe
 * quel portail, tableau de bord Mairie compris. La sécurité par ligne (RLS)
 * empêchait d'en lire les données, mais l'interface s'ouvrait quand même.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const versLogin = (motif?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    if (motif) url.searchParams.set('motif', motif);
    return NextResponse.redirect(url);
  };

  // 1. Configuration absente → refus. Auparavant le middleware laissait passer,
  //    ce qui ouvrait tous les portails sans compte dès qu'une variable
  //    d'environnement manquait. Confortable pour une maquette, inacceptable
  //    dès qu'il y a de vrais comptes.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return isProtectedPath(pathname) ? versLogin('configuration') : response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isProtectedPath(pathname)) return response;

  // 2. Pas de session → connexion.
  if (!user) return versLogin();

  // 3. Session valide : le rôle décide du portail.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profile as unknown as { role?: string } | null)?.role;

  // Compte sans profil : anomalie (le déclencheur en base en crée un à
  // l'inscription). On ne devine pas un rôle par défaut — cela rouvrirait la
  // porte — et on ne redirige pas vers un portail, ce qui bouclerait.
  if (!role) return versLogin('profil-introuvable');

  if (!canAccessPath(role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/citoyen/:path*',
    '/collecteur/:path*',
    '/dashboard/:path*',
    '/enterprise/:path*',
    '/settings/:path*',
  ],
};
