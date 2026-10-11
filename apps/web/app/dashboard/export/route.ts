import { NextResponse } from 'next/server';
import { getSupabase, rows, rpc } from '@/lib/server';
import { documentCsv } from '@/lib/csv';

/** Export CSV des statistiques par zone (agrégats seulement). */
export async function GET() {
  const supabase = await getSupabase();
  const { data } = await rpc(supabase, 'supervision_zones');
  const zones = rows<{
    zone_nom: string;
    commune: string | null;
    precollecteurs: string[];
    nb_clients: number;
    nb_clients_actifs: number;
    collectes_30j: number;
    collectes_realisees_30j: number;
    incidents_ouverts: number;
  }>(data);
  const entetes = ['Zone', 'Commune', 'Précollecteurs', 'Ménages inscrits', 'Ménages actifs', 'Collectes prévues (30 j)', 'Collectes réalisées (30 j)', 'Incidents ouverts'];
  const csv = documentCsv(
    entetes,
    zones.map((z) => [z.zone_nom, z.commune, z.precollecteurs.join(', '), z.nb_clients, z.nb_clients_actifs, z.collectes_30j, z.collectes_realisees_30j, z.incidents_ouverts]),
  );
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="supervision-zones-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
