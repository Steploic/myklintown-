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
    error,
  } = await supabase.auth.getUser();

  if (!isProtectedPath(pathname)) return response;

  // 2 bis. Serveur d'authentification injoignable (réseau mobile instable) :
  //    on refuse toujours l'accès, mais sans faire croire à une déconnexion.
  if (!user && error && (error as { status?: number }).status === 0) return reseauIndisponible();

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

function reseauIndisponible() {
  const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Réseau indisponible · MyKlinTown</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F7F5;font-family:system-ui,sans-serif;color:#1A2330">
<main style="max-width:26rem;margin:1rem;padding:2rem;background:#fff;border:1px solid #DDE4E1;border-radius:16px;text-align:center">
<p style="font-size:2.5rem;margin:0">📶</p><h1 style="font-size:1.4rem;color:#0D2438">Réseau indisponible</h1>
<p style="color:#5B6673">Le serveur n’a pas pu être joint. Vos données sont intactes : réessayez dans un instant.</p>
<button onclick="location.reload()" style="min-height:44px;padding:0 1.25rem;border:0;border-radius:8px;background:#3E9A5E;color:#fff;font-weight:600;font-size:1rem">Réessayer</button>
</main></body></html>`;
  return new NextResponse(page, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '5' } });
}

export const config = {
  matcher: [
    '/citoyen/:path*',
    '/precollecteur/:path*',
    '/collecteur/:path*',
    '/dashboard/:path*',
    '/enterprise/:path*',
    '/settings/:path*',
  ],
};
