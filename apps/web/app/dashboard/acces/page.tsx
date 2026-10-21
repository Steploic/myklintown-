import { redirect } from 'next/navigation';
import { Check, KeyRound, MapPin, Plus, X } from 'lucide-react';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { accorderCommuneMairieAction, retirerCommuneMairieAction, traiterDemandeAccesAction } from '@/lib/acces-actions';
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

interface CompteMairie {
  user_id: string;
  nom: string;
  email: string;
  communes: { id: string; nom: string; code: string }[];
}

/** Validation des demandes d'accès Mairie et communes des comptes Mairie — administrateurs MyKlinTown uniquement. */
export default async function DemandesAccesPage() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle();
  if (row<{ role: string }>(p)?.role !== 'admin') redirect('/dashboard');

  const [{ data }, cm, co] = await Promise.all([
    rpc(supabase, 'demandes_acces_a_traiter'),
    // Sans la migration 20261019000016, la fonction n'existe pas : la section ne s'affiche pas.
    rpc(supabase, 'comptes_mairie'),
    supabase.from('communes').select('id, nom').order('nom'),
  ]);
  const demandes = rows<Demande>(data);
  const comptes = rows<CompteMairie>(cm.data);
  const communes = rows<{ id: string; nom: string }>(co.data);
  const sansCommune = comptes.filter((c) => c.communes.length === 0).length;

  return (
    <PortalShell portalKey="mairie" currentPath="/dashboard/acces">
      <PageHeader
        titre="Demandes d’accès Mairie"
        sousTitre="Vérifiez la fonction de la personne (appel au service, courrier) avant d’accepter : l’accès ouvre la supervision de la commune demandée, et d’elle seule."
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

      {!cm.error && (
        <Section
          titre="Comptes Mairie et leurs communes"
          sousTitre={
            sansCommune
              ? `${sansCommune} compte${sansCommune > 1 ? 's' : ''} sans commune : ${sansCommune > 1 ? 'ils ne voient' : 'il ne voit'} rien tant qu’une commune n’est pas rattachée.`
              : 'Chaque compte Mairie supervise les zones, précollecteurs, codes d’agrément et indicateurs de ses communes.'
          }
          className="mt-6"
          flush
        >
          {comptes.length === 0 ? (
            <p className="px-5 py-6 text-body-sm text-muted-foreground">Aucun compte Mairie pour le moment.</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="comptes-mairie">
              {comptes.map((c) => {
                const restantes = communes.filter((x) => !c.communes.some((m) => m.id === x.id));
                return (
                  <li key={c.user_id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-ink">{c.nom}</p>
                      <p className="text-small text-muted-foreground">{c.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.communes.length === 0 ? (
                          <span className="chip-relance">Aucune commune : ne voit rien</span>
                        ) : (
                          c.communes.map((m) => (
                            <form key={m.id} action={retirerCommuneMairieAction} className="inline-flex">
                              <input type="hidden" name="user_id" value={c.user_id} />
                              <input type="hidden" name="commune_id" value={m.id} />
                              <span className="chip-info inline-flex items-center gap-1">
                                <MapPin size={12} aria-hidden /> {m.nom}
                                <button type="submit" className="ml-1 hover:text-terrain-stop" aria-label={`Retirer ${m.nom} à ${c.nom}`}>
                                  <X size={12} />
                                </button>
                              </span>
                            </form>
                          ))
                        )}
                      </div>
                    </div>
                    {restantes.length > 0 && (
                      <ActionForm action={accorderCommuneMairieAction} className="flex shrink-0 flex-wrap items-center gap-2">
                        <input type="hidden" name="user_id" value={c.user_id} />
                        <select name="commune_id" className="field w-auto" defaultValue="" aria-label={`Commune à rattacher à ${c.nom}`}>
                          <option value="">Commune…</option>
                          {restantes.map((x) => (
                            <option key={x.id} value={x.id}>{x.nom}</option>
                          ))}
                        </select>
                        <SubmitButton variant="outline" pendingLabel="…"><Plus size={16} /> Rattacher</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
    </PortalShell>
  );
}
