import { PortalShell } from '@/components/portal-shell';
import { PageHeader } from '@/components/ui/blocks';
import { ZoneEditor, type ZoneEdit, type ZoneVoisine } from '@/components/mairie/zone-editor';
import { accesCommunes, nomsCommunes } from '@/lib/mairie/communes';
import { getSupabase, rows, rpc } from '@/lib/server';
import type { Zone } from '@/lib/types';

export const metadata = { title: 'Zones de collecte' };

export default async function ZonesPage() {
  const supabase = await getSupabase();
  const [zo, af, en, acces, sup] = await Promise.all([
    supabase.from('zones').select('*').order('nom'),
    supabase.from('zone_affectations').select('zone_id, entreprises(id, nom)'),
    // Les précollecteurs que ce compte supervise (la base filtre par commune).
    supabase.from('entreprises').select('id, nom').neq('statut', 'suspendu').order('nom'),
    accesCommunes(supabase),
    rpc(supabase, 'supervision_zones'),
  ]);
  const affectations = rows<{ zone_id: string; entreprises: { id: string; nom: string } | null }>(af.data);
  const clientsParZone = new Map(rows<{ zone_id: string; nb_clients: number }>(sup.data).map((s) => [s.zone_id, Number(s.nb_clients)]));
  const miennes = new Set(acces.communes.map((c) => c.id));
  const nomCommune = new Map(acces.toutes.map((c) => [c.id, c.nom]));
  // Une zone d'une autre commune reste affichée (chevauchements), en lecture seule.
  const modifiable = (z: Zone) => acces.estAdmin || !acces.cloisonne || (z.commune_id != null && miennes.has(z.commune_id));
  const toutes = rows<Zone>(zo.data);
  const zones: ZoneEdit[] = toutes.filter(modifiable).map((z) => ({
    id: z.id,
    nom: z.nom,
    couleur: z.couleur,
    commune_id: z.commune_id,
    contour: z.contour,
    entreprises: affectations.filter((a) => a.zone_id === z.id && a.entreprises).map((a) => a.entreprises!),
    nb_clients: clientsParZone.get(z.id) ?? 0,
  }));
  const voisines: ZoneVoisine[] = toutes
    .filter((z) => !modifiable(z))
    .map((z) => ({ id: z.id, nom: z.nom, contour: z.contour, commune: z.commune_id ? (nomCommune.get(z.commune_id) ?? null) : null }));
  const territoire = acces.estAdmin || !acces.cloisonne ? null : nomsCommunes(acces.communes);

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/zones">
      <PageHeader
        titre="Zones de collecte"
        sousTitre={`Découpez ${territoire ? `le territoire de ${territoire}` : 'le territoire'}, affectez un ou plusieurs précollecteurs par zone, évitez les chevauchements.`}
      />
      <ZoneEditor zones={zones} voisines={voisines} entreprises={rows<{ id: string; nom: string }>(en.data)} communes={acces.communes} />
    </PortalShell>
  );
}
