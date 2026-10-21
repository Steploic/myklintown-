import { Truck } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { CodesAgrement } from '@/components/mairie/codes-agrement';
import { accesCommunes, nomsCommunes } from '@/lib/mairie/communes';
import { getSupabase, origineDemande, rows, rpc } from '@/lib/server';
import type { CodeAgrement } from '@/lib/agrement';
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
  const [{ data }, co, acces, origine] = await Promise.all([
    rpc(supabase, 'supervision_precollecteurs'),
    supabase
      .from('codes_agrement')
      .select('id, code, destinataire, telephone, created_at, expire_at, revoque_at, utilise_at, communes(nom), entreprises(nom)')
      .order('created_at', { ascending: false })
      .limit(50),
    accesCommunes(supabase),
    origineDemande(),
  ]);
  const liste = rows<Ligne>(data);
  // L'administrateur délivre pour n'importe quelle commune (ou sans) ; une Mairie, pour les siennes.
  const choixLibre = acces.estAdmin || !acces.cloisonne;
  const territoire = choixLibre ? 'sur le territoire' : `à ${nomsCommunes(acces.communes) || 'votre commune'}`;

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/precollecteurs">
      <PageHeader titre="Précollecteurs" sousTitre={`Entreprises actives ${territoire} et leur performance sur 30 jours.`} />
      {liste.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={Truck} titre="Aucun précollecteur inscrit" texte="Un précollecteur crée son espace depuis la page d’accueil MyKlinTown, avec un code d’agrément délivré ci-dessous." />
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
      {/* Sans la migration 20261013000012, la table n'existe pas : la section ne s'affiche pas. */}
      {!co.error && <CodesAgrement codes={rows<CodeAgrement>(co.data)} communes={acces.communes} choixLibre={choixLibre} origine={origine} />}
    </PortalShell>
  );
}
