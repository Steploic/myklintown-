import { Truck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { getSupabase, rows, rpc } from '@/lib/server';
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
  const { data } = await rpc(supabase, 'supervision_precollecteurs');
  const liste = rows<Ligne>(data);

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/precollecteurs">
      <PageHeader titre="Précollecteurs" sousTitre="Entreprises actives sur le territoire et leur performance sur 30 jours." />
      {liste.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={Truck} titre="Aucun précollecteur inscrit" texte="Les entreprises créent leur espace depuis la page d’accueil MyKlinTown." />
        </div>
      ) : (
        <div className="card-soft overflow-x-auto">
          <table className="table-data min-w-[860px]">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Zones</th>
                <th className="text-right">Ménages</th>
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
    </PortalShell>
  );
}
