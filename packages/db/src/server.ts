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
 * Délai maximal d'un appel serveur à Supabase. Sur un réseau instable, une
 * connexion morte peut bloquer `fetch` jusqu'à 5 minutes (délai par défaut de
 * Node) : la page reste figée, bouton « … » compris. Au-delà de ce délai on
 * abandonne, et l'application affiche son message « réseau indisponible ».
 */
export const DELAI_SUPABASE_MS = 20_000;
const SEUIL_LENT_MS = 5_000;

/** `fetch` borné dans le temps, qui signale dans les journaux les appels lents. */
export const creerFetchAvecDelai = (delaiMs: number): typeof fetch => async (input, init) => {
  const delai = AbortSignal.timeout(delaiMs);
  const signal = init?.signal ? combiner(init.signal, delai) : delai;
  const debut = Date.now();
  const chemin = () => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  };
  try {
    const reponse = await fetch(input, { ...init, signal });
    const duree = Date.now() - debut;
    if (duree > SEUIL_LENT_MS) console.warn(`[supabase] appel lent : ${(duree / 1000).toFixed(1)} s ${chemin()}`);
    return reponse;
  } catch (e) {
    if (delai.aborted) console.warn(`[supabase] abandon après ${delaiMs / 1000} s ${chemin()}`);
    throw e;
  }
};

export const fetchAvecDelai = creerFetchAvecDelai(DELAI_SUPABASE_MS);

/** Abandon dès que l'un des deux signaux l'est (AbortSignal.any si disponible). */
function combiner(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  const ctrl = new AbortController();
  for (const s of [a, b]) {
    if (s.aborted) ctrl.abort(s.reason);
    else s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
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
    global: { fetch: fetchAvecDelai },
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
