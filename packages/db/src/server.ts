import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from './database.types';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Contrat minimal attendu du cookie store. Compatible avec le retour de
 * `await cookies()` de `next/headers` (ReadonlyRequestCookies).
 */
export interface CookieStore {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: CookieOptions): void;
}

/**
 * Client Supabase pour Server Components, Route Handlers et Server Actions Next.js.
 *
 * Le caller fournit le cookie store (depuis `next/headers`) pour préserver la session.
 *
 * Usage :
 * ```ts
 * import { cookies } from 'next/headers';
 * import { createServerSupabase } from '@myklintown/db/server';
 *
 * const supabase = createServerSupabase(await cookies());
 * const { data: { user } } = await supabase.auth.getUser();
 * ```
 */
export function createServerSupabase(cookieStore: CookieStore) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env manquantes : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component en lecture seule — le middleware rafraîchit la session.
        }
      },
    },
  });
}
