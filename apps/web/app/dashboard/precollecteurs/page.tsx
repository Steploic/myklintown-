import { Truck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { DossiersPrecollecteurs, type DossierEntreprise } from '@/components/admin/dossiers-precollecteurs';
import { accesCommunes, nomsCommunes } from '@/lib/mairie/communes';
import { getSupabase, rows, rpc } from '@/lib/server';
import { urlsPieces } from '@/lib/dossier-pieces';
import { nombre, pct, telLisible } from '@/lib/format';

export const metadata = { title: 'Précollecteurs' };

interface Ligne {
  entreprise_id: string;
  nom: string;
  telephone: string | null;
  statut: string;
  zones: string[];
  nb_clients: number;
  nb_tricycles: number;
  nb_employes: number;
  collectes_30j: number;
  collectes_realisees_30j: number;
  incidents_ouverts: number;
}

const STATUT: Record<string, { label: string; chip: string }> = {
  essai: { label: 'En essai', chip: 'chip-info' },
  actif: { label: 'Partenaire', chip: 'chip-ok' },
  suspendu: { label: 'Suspendu', chip: 'chip-neutre' },
};

export default async function PrecollecteursPage() {
  const supabase = await getSupabase();
  const [{ data }, acces] = await Promise.all([rpc(supabase, 'supervision_precollecteurs'), accesCommunes(supabase)]);
  const liste = rows<Ligne>(data);
  const territoire = acces.estAdmin || !acces.cloisonne ? 'sur le territoire' : `à ${nomsCommunes(acces.communes) || 'votre commune'}`;

  // Dossiers des précollecteurs (20261109000017) : vérifiés par l'équipe MyKlinTown seulement.
  let dossiers: DossierEntreprise[] | null = null;
  let urls = new Map<string, string>();
  if (acces.estAdmin) {
    const { data: d, error } = await supabase
      .from('entreprises')
      .select('id, nom, telephone, email, niu, siege, devise, quartiers, logo_path, permis_env_path, dossier_statut, dossier_motif, dossier_soumis_at, dossier_statue_at, entreprise_communes(commune_id, autorisation_path, communes(nom))')
      .order('nom');
    if (!error) {
      dossiers = rows<DossierEntreprise>(d);
      urls = await urlsPieces(supabase, dossiers.flatMap((x) => [x.permis_env_path, ...(x.entreprise_communes ?? []).map((c) => c.autorisation_path)]));
    }
  }

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/precollecteurs">
      <PageHeader titre="Précollecteurs" sousTitre={`Entreprises actives ${territoire} et leur performance sur 30 jours.`} />
      {liste.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={Truck} titre="Aucun précollecteur inscrit" texte="Un précollecteur crée son espace depuis la page d’accueil MyKlinTown ; son dossier est vérifié par l’équipe avant son entrée dans l’annuaire." />
        </div>
      ) : (
        <div className="card-soft overflow-x-auto">
          <table className="table-data min-w-[860px]">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Zones</th>
                <th className="text-right">Abonnés</th>
                <th className="text-right">Flotte</th>
                <th className="text-right">Collectes 30 j</th>
                <th className="text-right">Exécution</th>
                <th className="text-right">Incidents</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((e) => {
                const s = STATUT[e.statut] ?? STATUT.essai!;
                return (
                  <tr key={e.entreprise_id}>
                    <td>
                      <span className="flex items-center gap-2 font-semibold text-brand-ink">
                        {e.nom} <span className={s.chip}>{s.label}</span>
                      </span>
                      <span className="text-small text-muted-foreground">{telLisible(e.telephone)}</span>
                    </td>
                    <td className="text-muted-foreground">{e.zones.length ? e.zones.join(', ') : <span className="chip-relance">Aucune zone</span>}</td>
                    <td className="num text-right">{nombre(e.nb_clients)}</td>
                    <td className="num text-right text-muted-foreground">{e.nb_tricycles} tric. · {e.nb_employes} empl.</td>
                    <td className="num text-right">{nombre(e.collectes_realisees_30j)} / {nombre(e.collectes_30j)}</td>
                    <td className="num text-right font-semibold">{pct(Number(e.collectes_realisees_30j), Number(e.collectes_30j))}</td>
                    <td className="num text-right">{Number(e.incidents_ouverts) ? <span className="chip-stop">{e.incidents_ouverts}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Les codes d'agrément ne servent plus à l'inscription (retours de l'équipe, 08/11/2026) : le dossier vérifié les remplace. */}
      {dossiers && <DossiersPrecollecteurs dossiers={dossiers} urls={urls} />}
    </PortalShell>
  );
}
