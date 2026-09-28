import type { Supa } from '@/lib/server';

/** URLs signées (1 h) des preuves : le compartiment est privé, jamais public. */
export async function urlsPreuves(supabase: Supa, chemins: (string | null)[]): Promise<Map<string, string>> {
  const utiles = [...new Set(chemins.filter((c): c is string => !!c))];
  const m = new Map<string, string>();
  if (!utiles.length) return m;
  const { data } = await supabase.storage.from('preuves').createSignedUrls(utiles, 3600);
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) m.set(d.path, d.signedUrl);
  }
  return m;
}
