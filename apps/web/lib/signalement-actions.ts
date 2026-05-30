'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@myklintown/db/server';

export interface SignalementState {
  error?: string;
  success?: boolean;
}

export interface SignalementRow {
  id: string;
  type: string;
  statut: string;
  description: string | null;
  created_at: string;
}

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Enregistre un signalement citoyen (RPC PostGIS). */
export async function createSignalementAction(
  _prev: SignalementState,
  formData: FormData,
): Promise<SignalementState> {
  if (!hasSupabaseEnv()) {
    return { error: 'Base de données non configurée (clés Supabase manquantes).' };
  }

  const type = String(formData.get('type') ?? '');
  const description = String(formData.get('description') ?? '').trim() || null;
  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));

  if (!type) return { error: 'Choisissez un type de problème.' };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Localisation indisponible — autorisez la géolocalisation puis réessayez.' };
  }

  const supabase = createServerSupabase(await cookies());
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc('create_signalement', {
    p_type: type,
    p_lat: lat,
    p_lng: lng,
    p_description: description,
    p_photo_url: null,
  });

  if (error) {
    return { error: "Échec de l'enregistrement. Vérifiez que vous êtes connecté." };
  }

  revalidatePath('/citoyen/signaler');
  return { success: true };
}

/** Liste les signalements de l'utilisateur connecté (10 derniers). */
export async function getMesSignalements(): Promise<SignalementRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createServerSupabase(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('signalements')
    .select('id, type, statut, description, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return (data as unknown as SignalementRow[]) ?? [];
}
