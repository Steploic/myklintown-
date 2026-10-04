import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Download, Map as MapIcon, Shapes, Truck, Users } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, Kpi, PageHeader, Section } from '@/components/ui/blocks';
import { CarteCouverture, EvolutionChart } from '@/components/mairie/supervision-bits';
import { getSupabase, rows, rpc } from '@/lib/server';
import { dateFr, nombre, pct } from '@/lib/format';
import type { GeoPolygon } from '@/lib/types';

export const metadata = { title: 'Supervision' };

interface LigneZone {
  zone_id: string;
  zone_nom: string;
  couleur: string;
  contour: GeoPolygon;
  commune: string | null;
  precollecteurs: string[];
  nb_clients: number;
  nb_clients_actifs: number;
  collectes_30j: number;
  collectes_realisees_30j: number;
  incidents_ouverts: number;
}

/**
 * Supervision Mairie : uniquement des AGRÉGATS (fonctions `supervision_*`).
 * La Mairie voit l'activité par zone et par précollecteur, jamais la liste
 * nominative des ménages ni leurs paiements.
 */
export default async function SupervisionPage() {
  const supabase = await getSupabase();
  const [z, p, a, dm] = await Promise.all([
    rpc(supabase, 'supervision_zones'),
    rpc(supabase, 'supervision_precollecteurs'),
    rpc(supabase, 'supervision_activite', { p_semaines: 12 }),
    rpc(supabase, 'supervision_demandes'),
  ]);
  const zones = rows<LigneZone>(z.data);
  const precos = rows<{ entreprise_id: string; statut: string; zones: string[]; nb_clients: number }>(p.data);
  const activite = rows<{ semaine: string; prevues: number; realisees: number; non_realisees: number }>(a.data);

  const demandes = rows<{ quartier: string; zone_nom: string | null; nombre: number; plus_ancienne: string }>(dm.data);
  const nbDemandes = demandes.reduce((t, d) => t + Number(d.nombre), 0);
  const couvertes = zones.filter((x) => x.precollecteurs.length > 0).length;
  const actifs = precos.filter((x) => x.statut !== 'suspendu' && x.zones.length > 0).length;
  const clients = zones.reduce((s, x) => s + Number(x.nb_clients_actifs), 0);
  const prevues = zones.reduce((s, x) => s + Number(x.collectes_30j), 0);
  const realisees = zones.reduce((s, x) => s + Number(x.collectes_realisees_30j), 0);
  const incidents = zones.reduce((s, x) => s + Number(x.incidents_ouverts), 0);

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard">
      <PageHeader
        titre="Supervision de la précollecte"
        sousTitre="Activité agrégée sur le territoire, mise à jour en temps réel."
        actions={
          <>
            <a href="/dashboard/export" className="btn-outline"><Download size={16} /> Exporter (CSV)</a>
            <Link href="/dashboard/zones" className="btn-primary"><Shapes size={16} /> Gérer les zones</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Précollecteurs actifs" valeur={nombre(actifs)} detail={`${precos.length} inscrits`} icon={Truck} ton="info" href="/dashboard/precollecteurs" />
        <Kpi label="Zones couvertes" valeur={`${couvertes} / ${zones.length}`} detail={`${zones.length - couvertes} sans précollecteur`} icon={MapIcon} ton={zones.length - couvertes > 0 ? 'relance' : 'ok'} href="/dashboard/zones" />
        <Kpi label="Ménages abonnés" valeur={nombre(clients)} detail="actifs, toutes zones" icon={Users} ton="ok" />
        <Kpi label="Collectes (30 j)" valeur={nombre(realisees)} detail={`sur ${nombre(prevues)} prévues · ${pct(realisees, prevues)}`} icon={CheckCircle2} ton="ok" />
        <Kpi label="Incidents ouverts" valeur={nombre(incidents)} detail="avec preuves" icon={AlertTriangle} ton={incidents ? 'stop' : 'neutre'} href="/dashboard/incidents" />
      </div>

      {zones.length === 0 ? (
        <div className="card-soft mt-6">
          <EmptyState
            icon={Shapes}
            titre="Le territoire n’est pas encore découpé"
            texte="Tracez les zones de collecte de la commune, puis affectez-y les précollecteurs. Les ménages seront automatiquement orientés vers le précollecteur de leur zone."
            action={<Link href="/dashboard/zones" className="btn-primary">Dessiner la première zone</Link>}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Section titre="Couverture du territoire" sousTitre="Pointillés gris : zones sans précollecteur">
              <CarteCouverture
                zones={zones.map((x) => ({
                  id: x.zone_id,
                  nom: x.zone_nom,
                  couleur: x.couleur,
                  contour: x.contour,
                  attribuee: x.precollecteurs.length > 0,
                  etiquette: `${x.precollecteurs.join(', ') || 'Non attribuée'} · ${x.nb_clients_actifs} ménages`,
                }))}
              />
            </Section>
            <Section titre="Évolution de l’activité" sousTitre="Collectes par semaine, 12 semaines">
              {activite.length ? (
                <EvolutionChart
                  data={activite.map((w) => ({
                    semaine: dateFr(w.semaine, { day: 'numeric', month: 'short' }),
                    prevues: Number(w.prevues),
                    realisees: Number(w.realisees),
                  }))}
                />
              ) : (
                <p className="py-16 text-center text-body-sm text-muted-foreground">Pas encore de collecte enregistrée.</p>
              )}
            </Section>
          </div>

          {nbDemandes > 0 && (
            <Section
              titre={`${nbDemandes} ménage${nbDemandes > 1 ? 's' : ''} sans précollecteur`}
              sousTitre="Demandes d’abonnement là où aucun précollecteur n’est attitré : zones à créer ou à attribuer."
              className="mt-6"
              flush
            >
              <ul className="divide-y divide-border">
                {demandes.map((d) => (
                  <li key={`${d.quartier}-${d.zone_nom}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-body-sm">
                    <span>
                      <strong className="text-brand-ink">{d.quartier}</strong>
                      <span className="text-muted-foreground"> · {d.zone_nom ? `zone ${d.zone_nom} (non attribuée)` : 'hors de toute zone'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-small text-muted-foreground">depuis le {dateFr(d.plus_ancienne, { day: 'numeric', month: 'short' })}</span>
                      <span className="chip-info num">{d.nombre}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section titre="Statistiques par zone" className="mt-6" flush>
            <div className="overflow-x-auto">
              <table className="table-data min-w-[760px]">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Précollecteur(s)</th>
                    <th className="text-right">Ménages actifs</th>
                    <th className="text-right">Collectes 30 j</th>
                    <th className="text-right">Exécution</th>
                    <th className="text-right">Incidents</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((x) => (
                    <tr key={x.zone_id}>
                      <td>
                        <span className="flex items-center gap-2 font-semibold text-brand-ink">
                          <span className="h-3 w-3 rounded-sm" style={{ background: x.precollecteurs.length ? x.couleur : '#8A96A3' }} />
                          {x.zone_nom}
                        </span>
                        {x.commune && <span className="text-small text-muted-foreground">{x.commune}</span>}
                      </td>
                      <td>{x.precollecteurs.length ? x.precollecteurs.join(', ') : <span className="chip-relance">Non couverte</span>}</td>
                      <td className="num text-right">{nombre(x.nb_clients_actifs)}</td>
                      <td className="num text-right">{nombre(x.collectes_realisees_30j)} / {nombre(x.collectes_30j)}</td>
                      <td className="num text-right font-semibold">{pct(Number(x.collectes_realisees_30j), Number(x.collectes_30j))}</td>
                      <td className="num text-right">{Number(x.incidents_ouverts) ? <span className="chip-stop">{x.incidents_ouverts}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </PortalShell>
  );
}
