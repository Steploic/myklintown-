import { redirect } from 'next/navigation';
import { Check, KeyRound, X } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { SubmitButton } from '@/components/ui/action-form';
import { traiterDemandeAccesAction } from '@/lib/acces-actions';
import { getSupabase, row, rows, rpc, utilisateurCourant } from '@/lib/server';
import { dateFr, telLisible } from '@/lib/format';

export const metadata = { title: 'Demandes d’accès' };

interface Demande {
  id: string;
  nom: string;
  email: string;
  telephone: string | null;
  fonction: string;
  service: string | null;
  commune: string | null;
  message: string | null;
  created_at: string;
}

/** Validation des demandes d'accès Mairie — administrateurs MyKlinTown uniquement. */
export default async function DemandesAccesPage() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle();
  if (row<{ role: string }>(p)?.role !== 'admin') redirect('/dashboard');

  const { data } = await rpc(supabase, 'demandes_acces_a_traiter');
  const demandes = rows<Demande>(data);

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/acces">
      <PageHeader
        titre="Demandes d’accès Mairie"
        sousTitre="Vérifiez la fonction de la personne (appel au service, courrier) avant d’accepter : l’accès ouvre la supervision de la commune."
      />
      {demandes.length === 0 ? (
        <div className="card-soft">
          <EmptyState icon={KeyRound} titre="Aucune demande en attente" />
        </div>
      ) : (
        <ul className="space-y-3">
          {demandes.map((d) => (
            <li key={d.id} className="card-soft flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-brand-ink">{d.nom}</p>
                <p className="text-body-sm">
                  {d.fonction}
                  {d.service && <> · {d.service}</>} — <strong>{d.commune ?? 'commune ?'}</strong>
                </p>
                <p className="text-small text-muted-foreground">
                  {d.email} · {telLisible(d.telephone)} · le {dateFr(d.created_at, { day: 'numeric', month: 'short' })}
                </p>
                {d.message && <p className="mt-1 text-body-sm text-muted-foreground">« {d.message} »</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={traiterDemandeAccesAction}>
                  <input type="hidden" name="demande_id" value={d.id} />
                  <input type="hidden" name="decision" value="refuser" />
                  <SubmitButton variant="outline" pendingLabel="…"><X size={16} /> Refuser</SubmitButton>
                </form>
                <form action={traiterDemandeAccesAction}>
                  <input type="hidden" name="demande_id" value={d.id} />
                  <input type="hidden" name="decision" value="accepter" />
                  <SubmitButton pendingLabel="…"><Check size={16} /> Accepter</SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
