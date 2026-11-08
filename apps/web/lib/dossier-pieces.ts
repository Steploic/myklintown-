import type { Supa } from '@/lib/server';

/**
 * URLs signées (1 h) des pièces du dossier : le compartiment `dossiers` est
 * privé (le gérant et l'administrateur seulement), jamais public.
 */
export async function urlsPieces(supabase: Supa, chemins: (string | null | undefined)[]): Promise<Map<string, string>> {
  const utiles = [...new Set(chemins.filter((c): c is string => !!c))];
  const m = new Map<string, string>();
  if (!utiles.length) return m;
  const { data } = await supabase.storage.from('dossiers').createSignedUrls(utiles, 3600);
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) m.set(d.path, d.signedUrl);
  }
  return m;
}
