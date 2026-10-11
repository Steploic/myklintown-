import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchAvecDelai } from '@myklintown/db/server';

/**
 * Client Supabase « service » : il contourne la sécurité par ligne.
 *
 * Réservé au SERVEUR, pour ce qu'aucun compte ne doit pouvoir faire lui-même :
 * écrire une transaction de paiement en ligne, la confirmer après Notch Pay,
 * activer le compte de paiement d'une entreprise. Toujours précédé d'un
 * contrôle d'autorisation fait avec la session de l'utilisateur.
 *
 * Clé : la « secret key » de Supabase (sb_secret_…, Settings → API Keys),
 * dans SUPABASE_SECRET_KEY — ou l'ancienne clé service_role dans
 * SUPABASE_SERVICE_ROLE_KEY. Variables d'environnement Vercel et .env.local ;
 * jamais préfixée NEXT_PUBLIC_, jamais dans le dépôt.
 */
export function cleServiceSupabase(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function clientService(): SupabaseClient | null {
  if (typeof window !== 'undefined') throw new Error('Client service appelé côté navigateur.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = cleServiceSupabase();
  if (!url || !cle) return null;
  return createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchAvecDelai },
  });
}
