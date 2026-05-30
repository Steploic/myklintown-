'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

/**
 * Client Supabase pour les composants côté navigateur (React Client Components).
 *
 * Lit les clés depuis NEXT_PUBLIC_* — c'est la clé `anon`, sûre à exposer.
 * Les politiques RLS (Row Level Security) côté DB garantissent la sécurité.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env manquantes : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        "Voir apps/web/.env.example.",
    );
  }
  return createBrowserClient<Database>(url, key);
}
