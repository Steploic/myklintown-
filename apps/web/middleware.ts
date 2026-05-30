import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isProtectedPath } from '@/lib/roles';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Middleware d'authentification.
 *
 * - Rafraîchit la session Supabase à chaque requête (cookies).
 * - Redirige vers /login si une route protégée est demandée sans session.
 * - Si Supabase n'est pas configuré (env manquantes), ne bloque rien : la
 *   maquette reste navigable. La protection s'active dès que les clés sont là.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

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

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
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
