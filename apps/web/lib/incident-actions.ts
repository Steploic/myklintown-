'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@myklintown/db/server';

export interface IncidentState {
  error?: string;
  success?: boolean;
}

export interface IncidentRow {
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

/** Enregistre un incident terrain collecteur (localisation optionnelle). */
export async function createIncidentAction(
  _prev: IncidentState,
  formData: FormData,
): Promise<IncidentState> {
  if (!hasSupabaseEnv()) {
    return { error: 'Base de données non configurée (clés Supabase manquantes).' };
  }

  const type = String(formData.get('type') ?? '');
  const description = String(formData.get('description') ?? '').trim() || null;
  const latRaw = formData.get('lat');
  const lngRaw = formData.get('lng');
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  if (!type) return { error: "Choisissez un type d'incident." };

  const supabase = createServerSupabase(await cookies());
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc('create_incident_terrain', {
    p_type: type,
    p_lat: lat !== null && Number.isFinite(lat) ? lat : null,
    p_lng: lng !== null && Number.isFinite(lng) ? lng : null,
    p_description: description,
    p_photo_url: null,
  });

  if (error) {
    return { error: "Échec de l'enregistrement. Vérifiez que vous êtes connecté." };
  }

  revalidatePath('/collecteur/incidents');
  return { success: true };
}

/** Liste les incidents transmis par le collecteur connecté (10 derniers). */
export async function getMesIncidents(): Promise<IncidentRow[]> {
  if (!hasSupabaseEnv()) return [];

  const supabase = createServerSupabase(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('incidents_terrain')
    .select('id, type, statut, description, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return (data as unknown as IncidentRow[]) ?? [];
}
