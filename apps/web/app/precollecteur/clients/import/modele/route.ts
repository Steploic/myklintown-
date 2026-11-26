import { NextResponse } from 'next/server';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { rows } from '@/lib/server';
import { modeleImportClients } from '@/lib/modele-import';

/** Modèle Excel à remplir pour importer ses clients, avec les zones de l'entreprise. */
export async function GET() {
  const { supabase, entreprise } = await requireEntreprise();
  const za = await supabase.from('zone_affectations').select('zones(nom)').eq('entreprise_id', entreprise.id);
  const zones = rows<{ zones: { nom: string } | null }>(za.data)
    .map((a) => a.zones?.nom)
    .filter((n): n is string => !!n);

  return new NextResponse(new Blob([modeleImportClients(entreprise.nom, zones) as BlobPart]), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-clients-myklintown.xlsx"',
      'Cache-Control': 'private, no-store',
    },
  });
}
