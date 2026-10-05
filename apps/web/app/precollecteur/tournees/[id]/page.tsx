import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Camera, Flag, Lock, Map as MapIcon, Play, RotateCcw, Users } from 'lucide-react';
import { Volet } from '@/components/ui/volet';
import { CartePoints, type PointCarte, type Ton } from '@/components/map/carte-points';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { TourneeRunner, type Passage } from '@/components/precollecteur/tournee-runner';
import { RafraichissementAuto } from '@/components/ui/rafraichissement-auto';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { statutTourneeAction } from '@/lib/terrain-actions';
import { row, rows } from '@/lib/server';
import { dateFr, dateHeureFr, heureFr, STATUT_TOURNEE, statutAbonnement } from '@/lib/format';
import type { Tournee } from '@/lib/types';

export const metadata = { title: 'Tournée' };

export default async function TourneePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, entreprise } = await requireEntreprise();
  const { data } = await supabase
    .from('tournees_precollecte')
    // `employes!employe_id` : le responsable (lien nommé, la table d'équipe relie aussi tournées et employés).
    .select('*, employes!employe_id(nom), tricycles(nom), zones(nom)')
    .eq('id', id)
    .eq('entreprise_id', entreprise.id)
    .maybeSingle();
  const t = row<Tournee & { employes: { nom: string } | null; tricycles: { nom: string } | null; zones: { nom: string } | null }>(data);
  if (!t) notFound();

  const { data: co } = await supabase
    .from('collectes')
    .select('id, statut, motif, client_id')
    .eq('tournee_id', id);
  const collectes = rows<{ id: string; statut: Passage['statut']; motif: string | null; client_id: string }>(co);
  const ids = collectes.map((c) => c.client_id);
  const { data: cl } = ids.length
    ? await supabase.from('v_clients_statut').select('id, nom, code, quartier, adresse, statut_abonnement, lat, lng, montant_impaye').in('id', ids)
    : { data: [] };
  const [eq, att, pos] = await Promise.all([
    supabase.from('tournee_equipe').select('employe_id, employes(nom)').eq('tournee_id', id),
    supabase.from('paiements_clients').select('client_id, montant_fcfa').eq('entreprise_id', entreprise.id).eq('statut', 'a_valider'),
    supabase
      .from('positions_tournee')
      .select('user_id, lat, lng, created_at, employes(nom)')
      .eq('tournee_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const equipe = rows<{ employe_id: string; employes: { nom: string } | null }>(eq.data).map((e) => e.employes?.nom).filter(Boolean).sort();
  // Espèces reçues par l'équipe, pas encore validées : on ne les redemande pas.
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
  // Dernière position connue de chaque membre de l'équipe (appli ouverte pendant la tournée).
  const dernieres = new Map<string, { lat: number; lng: number; created_at: string; nom: string }>();
  for (const p of rows<{ user_id: string; lat: number; lng: number; created_at: string; employes: { nom: string } | null }>(pos.data)) {
    if (!dernieres.has(p.user_id)) dernieres.set(p.user_id, { lat: p.lat, lng: p.lng, created_at: p.created_at, nom: p.employes?.nom ?? 'Équipe' });
  }
  const passages: Passage[] = collectes
    .filter((c) => clients.has(c.client_id))
    .map((c) => ({ id: c.id, statut: c.statut, motif: c.motif, client: clients.get(c.client_id)! }));

  const s = STATUT_TOURNEE[t.statut] ?? STATUT_TOURNEE.planifiee!;
  // Une tournée terminée (ou annulée) est en lecture seule : plus de scan ni
  // d'annulation par erreur (retour de Pie). On la rouvre explicitement si besoin.
  const modifiable = t.statut === 'planifiee' || t.statut === 'en_cours';

  return (
    <PrecoShell path="/precollecteur/tournees">
      {t.statut === 'en_cours' && <RafraichissementAuto secondes={20} />}
      <PageHeader
        titre={`Tournée du ${dateFr(t.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            <span className={s.chip}>{s.label}</span>
            {[t.zones?.nom ?? 'Tous clients', t.tricycles?.nom].filter(Boolean).join(' · ')}
            {t.debut_at && <span className="text-small">· départ {dateHeureFr(t.debut_at)}</span>}
            {t.fin_at && <span className="text-small">· retour {dateHeureFr(t.fin_at)}</span>}
          </span>
        }
        retour={{ href: '/precollecteur/tournees', label: 'Tournées' }}
        actions={
          <>
            <Link href={`/precollecteur/incidents/nouveau?tournee=${t.id}`} className="btn-outline">
              <Camera size={16} /> Incident
            </Link>
            {t.statut === 'planifiee' && (
              <form action={statutTourneeAction}>
                <input type="hidden" name="tournee_id" value={t.id} />
                <input type="hidden" name="statut" value="en_cours" />
                <SubmitButton pendingLabel="Départ…"><Play size={16} /> Démarrer</SubmitButton>
              </form>
            )}
            {t.statut === 'terminee' && (
              <form action={statutTourneeAction}>
                <input type="hidden" name="tournee_id" value={t.id} />
                <input type="hidden" name="statut" value="en_cours" />
                <SubmitButton variant="outline" pendingLabel="Réouverture…"><RotateCcw size={16} /> Rouvrir la tournée</SubmitButton>
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
        <Users size={16} aria-hidden /> Équipe : <strong className="text-brand-ink">{equipe.join(', ') || t.employes?.nom || '—'}</strong>
        {t.statut === 'en_cours' && dernieres.size > 0 && (
          <span className="text-small">
            · position en direct ({[...dernieres.values()].map((d) => `${d.nom} à ${heureFr(d.created_at)}`).join(', ')})
          </span>
        )}
      </p>

      {passages.length === 0 && (
        <div className="card-soft mb-4">
          <EmptyState
            icon={Flag}
            titre="Aucun passage prévu"
            texte="Aucun client actif dans cette zone au moment de la planification. Scannez un QR code pour ajouter un passage hors planning."
          />
        </div>
      )}
      {!modifiable && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3 text-body-sm text-muted-foreground">
          <Lock size={16} /> Tournée {t.statut === 'annulee' ? 'annulée' : 'terminée'} : consultation seule. Rouvrez-la pour corriger un passage.
        </p>
      )}
      <TourneeRunner tourneeId={t.id} passages={passages} modifiable={modifiable} encaissement={modifiable} />

      <Volet
        className="card-soft mt-6"
        ouvertAuDepart
        classeTitre="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold text-brand-ink"
        titre={<><MapIcon size={18} /> Carte de la tournée</>}
      >
        <div className="px-3 pb-3">
          <CartePoints
            points={[
              ...[...dernieres.entries()].map(([uid, d]) => ({
                id: `direct-${uid}`,
                lat: d.lat,
                lng: d.lng,
                ton: 'direct' as Ton,
                picto: 'tricycle' as const,
                titre: d.nom,
                lignes: [`Vu à ${heureFr(d.created_at)}`],
              })),
              ...passages
              .filter((p) => p.client.lat != null && p.client.lng != null)
              .map((p): PointCarte => {
                const s = statutAbonnement(p.client.statut_abonnement);
                return {
                  id: p.id,
                  lat: p.client.lat!,
                  lng: p.client.lng!,
                  ton: s.terrain as Ton,
                  picto: p.statut === 'realisee' ? 'collecte' : p.statut === 'non_realisee' ? 'non_collecte' : 'a_collecter',
                  titre: p.client.nom,
                  lignes: [
                    p.statut === 'realisee' ? 'Collecté' : p.statut === 'non_realisee' ? `Non collecté${p.motif ? ` · ${p.motif}` : ''}` : 'À collecter',
                    s.label,
                  ],
                  lien: { href: `/precollecteur/clients/${p.client.id}`, label: 'Fiche' },
                };
              }),
            ]}
            legende={[
              { ton: 'ok', label: 'À jour' },
              { ton: 'relance', label: 'À relancer' },
              { ton: 'stop', label: 'Impayé' },
              { ton: 'neutre', label: 'Autre' },
              { ton: 'direct', label: 'Équipe (en direct)' },
            ]}
            hauteur={420}
            sansPosition={passages.filter((p) => p.client.lat == null || p.client.lng == null).length}
          />
          <p className="mt-2 text-small text-muted-foreground">Pictogramme : poubelle = à collecter · coche = collecté · croix = non collecté.</p>
        </div>
      </Volet>
    </PrecoShell>
  );
}
