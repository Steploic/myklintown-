import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { ClientFields } from '@/components/precollecteur/client-fields';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { creerClientAction } from '@/lib/precollecteur/actions';
import { rows } from '@/lib/server';
import type { Plan, Zone } from '@/lib/types';

export const metadata = { title: 'Nouveau client' };

export default async function NouveauClientPage() {
  const { supabase, entreprise } = await requireEntreprise();
  const [pl, za] = await Promise.all([
    supabase.from('plans_tarifaires').select('*').eq('actif', true).order('ordre'),
    supabase.from('zone_affectations').select('zones(*)').eq('entreprise_id', entreprise.id),
  ]);
  const plans = rows<Plan>(pl.data);
  const zones = rows<{ zones: Zone | null }>(za.data)
    .map((a) => a.zones)
    .filter((z): z is Zone => !!z);

  return (
    <PrecoShell path="/precollecteur/clients">
      <PageHeader
        titre="Nouveau client"
        sousTitre="Le prix vient de la grille tarifaire commune : il ne se saisit pas."
        retour={{ href: '/precollecteur/clients', label: 'Clients' }}
      />
      <ActionForm action={creerClientAction} className="card-soft max-w-3xl p-5 sm:p-6">
        <ClientFields plans={plans} zones={zones} />
        <label className="mt-5 flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-body-sm">
          <input type="checkbox" name="facturer" defaultChecked className="mt-0.5 h-5 w-5 accent-[#3E9A5E]" />
          <span>
            <strong className="text-brand-ink">Émettre la première facture maintenant</strong>
            <span className="block text-muted-foreground">
              Paiement avant service : la période commence aujourd’hui.
            </span>
          </span>
        </label>
        <div className="mt-5 flex justify-end">
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer le client</SubmitButton>
        </div>
      </ActionForm>
    </PrecoShell>
  );
}
