'use server';

import { getSupabase, rpc } from '@/lib/server';

export interface CentreCarte {
  centre: [number, number];
  /** Zoom conseillé (commune, domicile) ; absent quand une emprise est donnée. */
  zoom: number | null;
  /** Emprise à cadrer [[sud, ouest], [nord, est]] : zones ou clients du compte. */
  emprise: [[number, number], [number, number]] | null;
  /** zones · commune · clients · domicile · demande · defaut */
  origine: string;
}

interface Ligne {
  lat: number | null;
  lng: number | null;
  zoom: number | null;
  lat_min: number | null;
  lng_min: number | null;
  lat_max: number | null;
  lng_max: number | null;
  origine: string;
}

/**
 * Où centrer une carte VIDE pour le compte connecté : ses zones, sa commune,
 * ses clients, son domicile… (fonction `centre_carte`, migration
 * 20261019000015). `null` si la base ne la connaît pas encore, si le réseau
 * manque ou sans session : la carte garde alors son centre par défaut.
 */
export async function centreCarteAction(): Promise<CentreCarte | null> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await rpc(supabase, 'centre_carte');
    if (error) return null;
    const r = (Array.isArray(data) ? data[0] : data) as Ligne | undefined;
    if (!r || r.lat == null || r.lng == null) return null;
    const emprise =
      r.lat_min != null && r.lng_min != null && r.lat_max != null && r.lng_max != null
        ? ([[r.lat_min, r.lng_min], [r.lat_max, r.lng_max]] as [[number, number], [number, number]])
        : null;
    return { centre: [r.lat, r.lng], zoom: r.zoom, emprise, origine: r.origine };
  } catch {
    return null;
  }
}
