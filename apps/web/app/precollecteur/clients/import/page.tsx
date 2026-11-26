import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader } from '@/components/ui/blocks';
import { ImportClients } from '@/components/precollecteur/import-clients';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { rows, toutesLesLignes } from '@/lib/server';
import { clesExistants, type ZoneImport } from '@/lib/import-clients';

export const metadata = { title: 'Importer des clients' };
// Un gros import (zone de chaque position, premières factures) dépasse les 10 s par défaut.
export const maxDuration = 60;

export default async function ImportClientsPage() {
  const { supabase, entreprise } = await requireEntreprise();
  const za = await supabase.from('zone_affectations').select('zones(id, nom)').eq('entreprise_id', entreprise.id);
  const zones = rows<{ zones: ZoneImport | null }>(za.data)
    .map((a) => a.zones)
    .filter((z): z is ZoneImport => !!z);
  // Clés (téléphone, nom + quartier) des clients déjà enregistrés : l'aperçu
  // signale les doublons avant l'envoi ; le serveur refait la vérification.
  const { data } = await toutesLesLignes<{ nom: string | null; quartier: string | null; telephone: string | null }>((de, a) =>
    supabase.from('clients').select('nom, quartier, telephone').eq('entreprise_id', entreprise.id).order('id').range(de, a),
  );

  return (
    <PrecoShell path="/precollecteur/clients">
      <PageHeader
        titre="Importer des clients"
        sousTitre="Depuis un fichier Excel ou CSV : fiches de recensement, ancien cahier, autre logiciel."
        retour={{ href: '/precollecteur/clients', label: 'Clients' }}
      />
      <ImportClients zones={zones} existants={clesExistants(data)} />
    </PrecoShell>
  );
}
