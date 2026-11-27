import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader } from '@/components/ui/blocks';
import { ZoneEditor, type ZoneEdit, type ZoneVoisine } from '@/components/mairie/zone-editor';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { rows, toutesLesLignes } from '@/lib/server';
import type { GeoPolygon } from '@/lib/types';

export const metadata = { title: 'Mes zones' };

interface ZoneLigne {
  id: string;
  nom: string;
  couleur: string;
  commune_id: string | null;
  contour: GeoPolygon;
  entreprise_id: string | null;
}

/**
 * Le précollecteur trace lui-même ses zones (décision du 26/11/2026 :
 * MyKlinTown fonctionne sans les Mairies). Les zones des autres restent
 * visibles, sans leur nom, pour voir les chevauchements ; elles ne bloquent rien.
 */
export default async function MesZonesPage() {
  const { supabase, entreprise } = await requireEntreprise();
  const [zo, af, ec, cl] = await Promise.all([
    supabase.from('zones').select('id, nom, couleur, commune_id, contour, entreprise_id').order('nom'),
    supabase.from('zone_affectations').select('zone_id').eq('entreprise_id', entreprise.id),
    supabase.from('entreprise_communes').select('communes(id, nom)').eq('entreprise_id', entreprise.id),
    toutesLesLignes<{ zone_id: string | null }>((de, a) =>
      supabase.from('clients').select('zone_id').eq('entreprise_id', entreprise.id).neq('statut', 'resilie').not('zone_id', 'is', null).order('id').range(de, a),
    ),
  ]);

  const parZone = new Map<string, number>();
  for (const c of rows<{ zone_id: string | null }>(cl.data)) {
    if (c.zone_id) parZone.set(c.zone_id, (parZone.get(c.zone_id) ?? 0) + 1);
  }
  const confiees = new Set(rows<{ zone_id: string }>(af.data).map((a) => a.zone_id));
  const communes = rows<{ communes: { id: string; nom: string } | null }>(ec.data)
    .map((x) => x.communes)
    .filter((c): c is { id: string; nom: string } => !!c)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const toutes = rows<ZoneLigne>(zo.data);
  const miennes: ZoneEdit[] = toutes
    .filter((z) => z.entreprise_id === entreprise.id)
    .map((z) => ({ id: z.id, nom: z.nom, couleur: z.couleur, commune_id: z.commune_id, contour: z.contour, entreprises: [], nb_clients: parZone.get(z.id) ?? 0 }));
  const voisines: ZoneVoisine[] = toutes
    .filter((z) => z.entreprise_id !== entreprise.id)
    .map((z) =>
      confiees.has(z.id)
        ? { id: z.id, nom: z.nom, contour: z.contour, commune: null, etiquette: `Confiée par MyKlinTown · ${parZone.get(z.id) ?? 0} abonné(s)` }
        : { id: z.id, nom: 'Autre zone', contour: z.contour, commune: null, etiquette: 'Zone d’un autre précollecteur' },
    );

  return (
    <PrecoShell path="/precollecteur/zones">
      <PageHeader
        titre="Mes zones"
        sousTitre="Tracez les secteurs que vous desservez. Vos abonnés y sont rangés d’office d’après leur position, et une tournée peut porter sur une zone."
      />
      <ZoneEditor espace="precollecteur" zones={miennes} voisines={voisines} entreprises={[]} communes={communes} />
    </PrecoShell>
  );
}
