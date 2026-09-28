import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Camera, Flag, Play } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { TourneeRunner, type Passage } from '@/components/precollecteur/tournee-runner';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { statutTourneeAction } from '@/lib/precollecteur/actions';
import { row, rows } from '@/lib/server';
import { dateFr, dateHeureFr, STATUT_TOURNEE } from '@/lib/format';
import type { Tournee } from '@/lib/types';

export const metadata = { title: 'Tournée' };

export default async function TourneePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, entreprise } = await requireEntreprise();
  const { data } = await supabase
    .from('tournees_precollecte')
    .select('*, employes(nom), tricycles(nom), zones(nom)')
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
    ? await supabase.from('v_clients_statut').select('id, nom, code, quartier, adresse, statut_abonnement, lat, lng').in('id', ids)
    : { data: [] };
  const clients = new Map(rows<Passage['client']>(cl).map((c) => [c.id, c]));
  const passages: Passage[] = collectes
    .filter((c) => clients.has(c.client_id))
    .map((c) => ({ id: c.id, statut: c.statut, motif: c.motif, client: clients.get(c.client_id)! }));

  const s = STATUT_TOURNEE[t.statut] ?? STATUT_TOURNEE.planifiee!;
  const modifiable = t.statut !== 'annulee';

  return (
    <PrecoShell path="/precollecteur/tournees">
      <PageHeader
        titre={`Tournée du ${dateFr(t.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            <span className={s.chip}>{s.label}</span>
            {[t.zones?.nom ?? 'Tous clients', t.employes?.nom, t.tricycles?.nom].filter(Boolean).join(' · ')}
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

      {passages.length === 0 && (
        <div className="card-soft mb-4">
          <EmptyState
            icon={Flag}
            titre="Aucun passage prévu"
            texte="Aucun client actif dans cette zone au moment de la planification. Scannez un QR code pour ajouter un passage hors planning."
          />
        </div>
      )}
      <TourneeRunner tourneeId={t.id} passages={passages} modifiable={modifiable} />
    </PrecoShell>
  );
}
