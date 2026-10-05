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
 * Clé : SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API), à
 * placer dans les variables d'environnement Vercel et dans .env.local —
 * jamais préfixée NEXT_PUBLIC_, jamais dans le dépôt.
 */
export function clientService(): SupabaseClient | null {
  if (typeof window !== 'undefined') throw new Error('Client service appelé côté navigateur.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  return createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchAvecDelai },
  });
}
