import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Camera, Flag, Lock, Map as MapIcon, Play, Users } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { Volet } from '@/components/ui/volet';
import { CartePoints, type Ton } from '@/components/map/carte-points';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { TourneeRunner, type Passage } from '@/components/precollecteur/tournee-runner';
import { PositionLive } from '@/components/employe/position-live';
import { RafraichissementAuto } from '@/components/ui/rafraichissement-auto';
import { paiementEnLigneDisponible } from '@/lib/paiement/service';
import { requireEmploye } from '@/lib/employe/context';
import { statutTourneeAction } from '@/lib/terrain-actions';
import { row, rows } from '@/lib/server';
import { dateFr, dateHeureFr, fcfa, STATUT_TOURNEE, statutAbonnement } from '@/lib/format';

export const metadata = { title: 'Tournée' };

/**
 * La tournée vue par un membre de l'équipe : démarrer, scanner, pointer,
 * encaisser des espèces, documenter un incident. La progression est partagée :
 * la page se relit toute seule pour montrer ce que font les coéquipiers.
 */
export default async function TourneeEmploye({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scan?: string }>;
}) {
  const { id } = await params;
  const { scan } = await searchParams;
  const { supabase, entreprise } = await requireEmploye();

  // La sécurité par ligne ne montre que les tournées de son équipe.
  const { data } = await supabase
    .from('tournees_precollecte')
    .select('id, date, statut, debut_at, fin_at, zones(nom), tricycles(nom)')
    .eq('id', id)
    .maybeSingle();
  const t = row<{
    id: string; date: string; statut: string; debut_at: string | null; fin_at: string | null;
    zones: { nom: string } | null; tricycles: { nom: string } | null;
  }>(data);
  if (!t) notFound();

  const [eq, co, att] = await Promise.all([
    supabase.from('tournee_equipe').select('employes(nom)').eq('tournee_id', id),
    supabase.from('collectes').select('id, statut, motif, client_id').eq('tournee_id', id),
    supabase.from('paiements_clients').select('client_id, montant_fcfa').eq('statut', 'a_valider'),
  ]);
  const equipe = rows<{ employes: { nom: string } | null }>(eq.data).map((e) => e.employes?.nom).filter(Boolean).sort();
  const collectes = rows<{ id: string; statut: Passage['statut']; motif: string | null; client_id: string }>(co.data);
  const ids = collectes.map((c) => c.client_id);
  const { data: cl } = ids.length
    ? await supabase
        .from('v_clients_statut')
        .select('id, nom, code, quartier, adresse, statut_abonnement, lat, lng, montant_impaye, telephone')
        .in('id', ids)
    : { data: [] };

  // Espèces déjà reçues mais pas encore validées : on ne les redemande pas.
  const enAttente = new Map<string, number>();
  for (const p of rows<{ client_id: string; montant_fcfa: number }>(att.data)) {
    enAttente.set(p.client_id, (enAttente.get(p.client_id) ?? 0) + p.montant_fcfa);
  }
  const clients = new Map(
    rows<Passage['client']>(cl).map((c) => [
      c.id,
      { ...c, montant_impaye: Math.max(0, Number(c.montant_impaye ?? 0) - (enAttente.get(c.id) ?? 0)) },
    ]),
  );
  const passages: Passage[] = collectes
    .filter((c) => clients.has(c.client_id))
    .map((c) => ({ id: c.id, statut: c.statut, motif: c.motif, client: clients.get(c.client_id)! }));
  const totalAttente = [...enAttente.entries()].filter(([cid]) => clients.has(cid)).reduce((s, [, m]) => s + m, 0);

  // Mobile Money sur le téléphone du ménage : précollecteur vérifié chez Notch Pay.
  let enLigne = false;
  if (paiementEnLigneDisponible()) {
    const { data: e } = await supabase.from('entreprises').select('paiement_statut').eq('id', entreprise.id).maybeSingle();
    enLigne = row<{ paiement_statut: string }>(e)?.paiement_statut === 'actif';
  }
  const s = STATUT_TOURNEE[t.statut] ?? STATUT_TOURNEE.planifiee!;
  const modifiable = t.statut === 'planifiee' || t.statut === 'en_cours';

  return (
    <PortalShell portalKey="employe" currentPath="/employe" titre={entreprise.nom}>
      {modifiable && <RafraichissementAuto secondes={20} />}
      <PageHeader
        titre={`Tournée du ${dateFr(t.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            <span className={s.chip}>{s.label}</span>
            {[t.zones?.nom ?? 'Tous les clients', t.tricycles?.nom].filter(Boolean).join(' · ')}
            {t.debut_at && <span className="text-small">· départ {dateHeureFr(t.debut_at)}</span>}
          </span>
        }
        retour={{ href: '/employe', label: 'Aujourd’hui' }}
        actions={
          <>
            <Link href={`/employe/incidents/nouveau?tournee=${t.id}`} className="btn-outline">
              <Camera size={16} /> Incident
            </Link>
            {t.statut === 'planifiee' && (
              <form action={statutTourneeAction}>
                <input type="hidden" name="tournee_id" value={t.id} />
                <input type="hidden" name="statut" value="en_cours" />
                <SubmitButton pendingLabel="Départ…"><Play size={16} /> Démarrer</SubmitButton>
              </form>
            )}
            {t.statut === 'en_cours' && (
              <form action={statutTourneeAction}>
                <input type="hidden" name="tournee_id" value={t.id} />
                <input type="hidden" name="statut" value="terminee" />
                <SubmitButton variant="secondary" pendingLabel="Clôture…"><Flag size={16} /> Terminer la tournée</SubmitButton>
              </form>
            )}
          </>
        }
      />

      <p className="mb-4 flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
        <Users size={16} aria-hidden /> Équipe : <strong className="text-brand-ink">{equipe.join(', ') || '—'}</strong>
        <span className="text-small">· scans et passages partagés entre vous</span>
      </p>

      {t.statut === 'en_cours' && (
        <div className="mb-4">
          <PositionLive tourneeId={t.id} />
        </div>
      )}
      {totalAttente > 0 && (
        <p className="mb-4 rounded-lg border border-terrain-relance/25 bg-terrain-relance/5 px-4 py-2.5 text-body-sm text-terrain-relance">
          {fcfa(totalAttente)} en espèces reçus sur cette tournée attendent la validation du gérant.
        </p>
      )}
      {!modifiable && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3 text-body-sm text-muted-foreground">
          <Lock size={16} /> Tournée {t.statut === 'annulee' ? 'annulée' : 'terminée'} : consultation seule.
        </p>
      )}
      {passages.length === 0 && (
        <div className="card-soft mb-4">
          <EmptyState
            icon={Flag}
            titre="Aucun passage prévu"
            texte="Scannez le QR code d’un foyer : son passage s’ajoute à la tournée."
          />
        </div>
      )}

      <TourneeRunner
        tourneeId={t.id}
        passages={passages}
        modifiable={modifiable}
        espace="employe"
        scanAuDepart={scan === '1'}
        encaissement={modifiable}
        paiementEnLigne={modifiable && enLigne}
      />

      <Volet
        className="card-soft mt-6"
        ouvertAuDepart
        classeTitre="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold text-brand-ink"
        titre={<><MapIcon size={18} /> Carte de la tournée</>}
      >
        <div className="px-3 pb-3">
          <CartePoints
            points={passages
              .filter((p) => p.client.lat != null && p.client.lng != null)
              .map((p) => {
                const st = statutAbonnement(p.client.statut_abonnement);
                return {
                  id: p.id,
                  lat: p.client.lat!,
                  lng: p.client.lng!,
                  ton: st.terrain as Ton,
                  picto: p.statut === 'realisee' ? 'collecte' : p.statut === 'non_realisee' ? 'non_collecte' : 'a_collecter',
                  titre: p.client.nom,
                  lignes: [
                    p.statut === 'realisee' ? 'Collecté' : p.statut === 'non_realisee' ? `Non collecté${p.motif ? ` · ${p.motif}` : ''}` : 'À collecter',
                    st.label,
                  ],
                };
              })}
            legende={[
              { ton: 'ok', label: 'À jour' },
              { ton: 'relance', label: 'À relancer' },
              { ton: 'stop', label: 'Impayé' },
              { ton: 'neutre', label: 'Autre' },
            ]}
            hauteur={420}
            sansPosition={passages.filter((p) => p.client.lat == null || p.client.lng == null).length}
          />
          <p className="mt-2 text-small text-muted-foreground">Pictogramme : poubelle = à collecter · coche = collecté · croix = non collecté.</p>
        </div>
      </Volet>
    </PortalShell>
  );
}
