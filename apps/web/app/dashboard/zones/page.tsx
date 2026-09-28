import { PortalShell } from '@/components/portal-shell';
import { PageHeader } from '@/components/ui/blocks';
import { ZoneEditor, type ZoneEdit } from '@/components/mairie/zone-editor';
import { getSupabase, rows, rpc } from '@/lib/server';
import type { Zone } from '@/lib/types';

export const metadata = { title: 'Zones de collecte' };

export default async function ZonesPage() {
  const supabase = await getSupabase();
  const [zo, af, en, co, sup] = await Promise.all([
    supabase.from('zones').select('*').order('nom'),
    supabase.from('zone_affectations').select('zone_id, entreprises(id, nom)'),
    supabase.from('entreprises').select('id, nom').neq('statut', 'suspendu').order('nom'),
    supabase.from('communes').select('id, nom').order('nom'),
    rpc(supabase, 'supervision_zones'),
  ]);
  const affectations = rows<{ zone_id: string; entreprises: { id: string; nom: string } | null }>(af.data);
  const clientsParZone = new Map(rows<{ zone_id: string; nb_clients: number }>(sup.data).map((s) => [s.zone_id, Number(s.nb_clients)]));
  const zones: ZoneEdit[] = rows<Zone>(zo.data).map((z) => ({
    id: z.id,
    nom: z.nom,
    couleur: z.couleur,
    commune_id: z.commune_id,
    contour: z.contour,
    entreprises: affectations.filter((a) => a.zone_id === z.id && a.entreprises).map((a) => a.entreprises!),
    nb_clients: clientsParZone.get(z.id) ?? 0,
  }));

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/zones">
      <PageHeader
        titre="Zones de collecte"
        sousTitre="Découpez le territoire, affectez un ou plusieurs précollecteurs par zone, évitez les chevauchements."
      />
      <ZoneEditor zones={zones} entreprises={rows<{ id: string; nom: string }>(en.data)} communes={rows<{ id: string; nom: string }>(co.data)} />
    </PortalShell>
  );
}
