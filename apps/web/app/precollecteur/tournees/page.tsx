import Link from 'next/link';
import { CalendarPlus, Route } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { planifierTourneeAction } from '@/lib/precollecteur/actions';
import { rows } from '@/lib/server';
import { dateFr, isoJour, pct, STATUT_TOURNEE } from '@/lib/format';
import type { Employe, Tournee, Tricycle, Zone } from '@/lib/types';

export const metadata = { title: 'Tournées' };

export default async function TourneesPage() {
  const { supabase, entreprise } = await requireEntreprise();
  const [to, em, tr, za, co, eqp] = await Promise.all([
    supabase.from('tournees_precollecte').select('*').eq('entreprise_id', entreprise.id).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    supabase.from('employes').select('*').eq('entreprise_id', entreprise.id).eq('actif', true).order('nom'),
    supabase.from('tricycles').select('*').eq('entreprise_id', entreprise.id).order('nom'),
    supabase.from('zone_affectations').select('zones(id, nom)').eq('entreprise_id', entreprise.id),
    supabase.from('collectes').select('tournee_id, statut').eq('entreprise_id', entreprise.id).not('tournee_id', 'is', null).limit(5000),
    supabase.from('tournee_equipe').select('tournee_id, employe_id').eq('entreprise_id', entreprise.id),
  ]);
  const equipes = rows<{ tournee_id: string; employe_id: string }>(eqp.data);
  const tournees = rows<Tournee>(to.data);
  const employes = rows<Employe>(em.data);
  const tricycles = rows<Tricycle>(tr.data);
  const zones = rows<{ zones: Pick<Zone, 'id' | 'nom'> | null }>(za.data).map((a) => a.zones).filter((z): z is Pick<Zone, 'id' | 'nom'> => !!z);
  const collectes = rows<{ tournee_id: string; statut: string }>(co.data);
  const nomE = new Map(employes.map((e) => [e.id, e.nom]));
  const nomT = new Map(tricycles.map((t) => [t.id, t.nom]));
  const nomZ = new Map(zones.map((z) => [z.id, z.nom]));
  const auj = isoJour();

  return (
    <PrecoShell path="/precollecteur/tournees">
      <PageHeader titre="Tournées" sousTitre="Planifiez, partez, cochez chaque passage : tout est tracé en base." />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Section titre="Planifier une tournée">
          <ActionForm action={planifierTourneeAction} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="date">Date</label>
              <input id="date" name="date" type="date" defaultValue={auj} className="field" required />
            </div>
            <div>
              <label className="field-label" htmlFor="zone_id">Zone</label>
              <select id="zone_id" name="zone_id" className="field" defaultValue="">
                <option value="">Tous mes clients actifs</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.nom}</option>
                ))}
              </select>
              <p className="field-hint">Les passages prévus sont créés pour chaque client actif concerné.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="tricycle_id">Tricycle</label>
              <select id="tricycle_id" name="tricycle_id" className="field" defaultValue="">
                <option value="">—</option>
                {tricycles.filter((t) => t.statut === 'actif').map((t) => (
                  <option key={t.id} value={t.id}>{t.nom}</option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="field-label">Équipe</legend>
              {employes.length === 0 ? (
                <p className="field-hint">Ajoutez vos employés dans « Flotte & équipe ».</p>
              ) : (
                <div className="space-y-1.5">
                  {employes.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-body-sm">
                      <input type="checkbox" name="equipe" value={e.id} className="h-4 w-4 accent-brand-green" />
                      {e.nom}
                      {e.user_id && <span className="text-small text-muted-foreground">· a son compte</span>}
                    </label>
                  ))}
                </div>
              )}
              <p className="field-hint">
                Chauffeur, ramasseur… Ils voient la tournée dans leur espace employé et partagent scans et passages. Personne
                de coché : l’équipage du tricycle choisi.
              </p>
            </fieldset>
            <SubmitButton className="w-full" pendingLabel="Planification…">
              <CalendarPlus size={16} /> Planifier
            </SubmitButton>
          </ActionForm>
        </Section>

        <Section titre="Historique des tournées" flush>
          {tournees.length === 0 ? (
            <EmptyState icon={Route} titre="Aucune tournée" texte="Planifiez votre première tournée à gauche." />
          ) : (
            <ul className="divide-y divide-border">
              {tournees.map((t) => {
                const s = STATUT_TOURNEE[t.statut] ?? STATUT_TOURNEE.planifiee!;
                const siennes = collectes.filter((c) => c.tournee_id === t.id);
                const faits = siennes.filter((c) => c.statut === 'realisee').length;
                const rates = siennes.filter((c) => c.statut === 'non_realisee').length;
                return (
                  <li key={t.id}>
                    <Link href={`/precollecteur/tournees/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/40">
                      <div className="min-w-0">
                        <p className="font-semibold text-brand-ink">
                          {dateFr(t.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                          {t.date === auj && <span className="chip-info ml-2">Aujourd’hui</span>}
                        </p>
                        <p className="truncate text-small text-muted-foreground">
                          {[t.zone_id ? nomZ.get(t.zone_id) : 'Tous clients', equipes.filter((q) => q.tournee_id === t.id).map((q) => nomE.get(q.employe_id)).filter(Boolean).join(', ') || (t.employe_id && nomE.get(t.employe_id)), t.tricycle_id && nomT.get(t.tricycle_id)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-28">
                          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                            <span className="bg-terrain-ok" style={{ width: pct(faits, siennes.length).replace(' %', '%').replace('—', '0%') }} />
                            <span className="bg-terrain-stop" style={{ width: pct(rates, siennes.length).replace(' %', '%').replace('—', '0%') }} />
                          </div>
                          <p className="num mt-1 text-right text-small text-muted-foreground">{faits}/{siennes.length} passages</p>
                        </div>
                        <span className={s.chip}>{s.label}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </PrecoShell>
  );
}
