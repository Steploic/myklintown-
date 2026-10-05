import { AlertCircle, Inbox, MapPin } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { CartePoints } from '@/components/map/carte-points';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { prendreDemandeAction } from '@/lib/precollecteur/actions';
import { rows, rpc } from '@/lib/server';
import { dateFr, fcfa } from '@/lib/format';

export const metadata = { title: 'Demandes en attente' };

interface Demande {
  id: string;
  quartier: string | null;
  adresse: string | null;
  lat: number;
  lng: number;
  zone_nom: string | null;
  plan_nom: string | null;
  plan_prix: number | null;
  created_at: string;
}

/**
 * Ménages qui se sont inscrits là où aucun précollecteur n'est encore attitré
 * (retour R3). Nom et téléphone restent masqués jusqu'à la prise en charge.
 */
export default async function DemandesPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const { supabase } = await requireEntreprise();
  const { data } = await rpc(supabase, 'demandes_ouvertes');
  const demandes = rows<Demande>(data);

  return (
    <PrecoShell path="/precollecteur/demandes">
      <PageHeader
        titre="Demandes en attente"
        sousTitre="Des ménages veulent être collectés là où aucun précollecteur n’est encore attitré. Prenez-les en charge : ils deviennent vos clients."
      />
      {erreur && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erreur}
        </p>
      )}
      {demandes.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={Inbox} titre="Aucune demande en attente" texte="Les ménages hors zone qui demandent un précollecteur apparaîtront ici." />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Section flush>
            <div className="p-3">
              <CartePoints
                points={demandes.map((d) => ({
                  id: d.id,
                  lat: d.lat,
                  lng: d.lng,
                  ton: 'info',
                  picto: 'demande',
                  titre: d.quartier ?? 'Ménage en attente',
                  lignes: [[d.plan_nom, d.plan_prix != null ? fcfa(d.plan_prix) : null].filter(Boolean).join(' · ')],
                }))}
                legende={[{ ton: 'info', label: 'Demandes en attente' }]}
                hauteur={460}
              />
            </div>
          </Section>
          <ul className="space-y-3">
            {demandes.map((d) => (
              <li key={d.id} className="card-soft p-4">
                <p className="flex items-center gap-2 font-semibold text-brand-ink">
                  <MapPin size={16} className="text-brand-blue" /> {d.quartier ?? 'Quartier non précisé'}
                </p>
                <p className="text-small text-muted-foreground">
                  {[d.adresse, d.zone_nom ? `zone ${d.zone_nom}` : 'hors zone tracée'].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-1 text-body-sm">
                  Formule <strong>{d.plan_nom ?? '—'}</strong>
                  {d.plan_prix != null && <> · {fcfa(d.plan_prix)}</>}
                  <span className="text-muted-foreground"> · depuis le {dateFr(d.created_at, { day: 'numeric', month: 'short' })}</span>
                </p>
                <form action={prendreDemandeAction} className="mt-3">
                  <input type="hidden" name="demande_id" value={d.id} />
                  <SubmitButton className="w-full" pendingLabel="Prise en charge…">Prendre en charge</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PrecoShell>
  );
}
