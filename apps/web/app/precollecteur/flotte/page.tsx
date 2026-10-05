import { Bike, KeyRound, MessageCircle, Plus, UserCheck, UserRound, X } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { Volet } from '@/components/ui/volet';
import { requireEntreprise } from '@/lib/precollecteur/context';
import {
  affecterEmployeAction,
  basculerEmployeAction,
  creerEmployeAction,
  creerTricycleAction,
  inviterEmployeAction,
  retirerAccesEmployeAction,
  retirerEmployeAction,
  statutTricycleAction,
} from '@/lib/precollecteur/actions';
import { origineDemande, rows } from '@/lib/server';
import { ajouterJours, dateFr, isoJour, telInternational, telLisible } from '@/lib/format';
import type { Employe, Tricycle } from '@/lib/types';

export const metadata = { title: 'Flotte & équipe' };

const FONCTIONS: Record<string, string> = {
  chauffeur: 'Chauffeur',
  collecteur: 'Collecteur',
  superviseur: 'Superviseur',
  autre: 'Autre',
};
const STATUTS_TRICYCLE: Record<string, { label: string; chip: string }> = {
  actif: { label: 'En service', chip: 'chip-ok' },
  maintenance: { label: 'Maintenance', chip: 'chip-relance' },
  hors_service: { label: 'Hors service', chip: 'chip-stop' },
};

export default async function FlottePage({ searchParams }: { searchParams: Promise<{ invite?: string; erreur?: string }> }) {
  const { invite, erreur } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  const il30 = ajouterJours(isoJour(), -30);
  const origine = await origineDemande();
  const [tr, em, af, co, to, inv] = await Promise.all([
    supabase.from('tricycles').select('*').eq('entreprise_id', entreprise.id).order('nom'),
    supabase.from('employes').select('*').eq('entreprise_id', entreprise.id).order('nom'),
    supabase.from('tricycle_employes').select('tricycle_id, employe_id'),
    supabase.from('collectes').select('employe_id, statut').eq('entreprise_id', entreprise.id).gte('date_prevue', il30),
    supabase.from('tournees_precollecte').select('tricycle_id, employe_id').eq('entreprise_id', entreprise.id).gte('date', il30),
    supabase
      .from('invitations_employe')
      .select('employe_id, code, expire_at')
      .eq('entreprise_id', entreprise.id)
      .is('utilisee_at', null)
      .gt('expire_at', new Date().toISOString()),
  ]);
  const invitations = new Map(rows<{ employe_id: string; code: string; expire_at: string }>(inv.data).map((i) => [i.employe_id, i]));
  const tricycles = rows<Tricycle>(tr.data);
  const employes = rows<Employe>(em.data);
  const affectations = rows<{ tricycle_id: string; employe_id: string }>(af.data);
  const collectes = rows<{ employe_id: string | null; statut: string }>(co.data);
  const tournees = rows<{ tricycle_id: string | null; employe_id: string | null }>(to.data);
  const nomEmploye = new Map(employes.map((e) => [e.id, e.nom]));

  return (
    <PrecoShell path="/precollecteur/flotte">
      <PageHeader titre="Flotte & équipe" sousTitre="Vos tricycles, vos employés, et qui roule sur quoi." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titre="Tricycles" sousTitre={`${tricycles.filter((t) => t.statut === 'actif').length} en service sur ${tricycles.length}`} flush>
          {tricycles.length === 0 ? (
            <EmptyState icon={Bike} titre="Aucun tricycle" texte="Ajoutez vos véhicules pour suivre leur activité et y affecter des employés." />
          ) : (
            <ul className="divide-y divide-border">
              {tricycles.map((t) => {
                const equipage = affectations.filter((a) => a.tricycle_id === t.id);
                const libres = employes.filter((e) => e.actif && !equipage.some((a) => a.employe_id === e.id));
                const s = STATUTS_TRICYCLE[t.statut]!;
                return (
                  <li key={t.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-content-center rounded-lg bg-brand-teal/10 text-brand-teal">
                          <Bike size={20} />
                        </span>
                        <div>
                          <p className="font-semibold text-brand-ink">{t.nom}</p>
                          <p className="text-small text-muted-foreground">
                            {[t.immatriculation, t.capacite_kg && `${t.capacite_kg} kg`].filter(Boolean).join(' · ') || 'Sans immatriculation'}
                            {' · '}
                            {tournees.filter((x) => x.tricycle_id === t.id).length} tournées / 30 j
                          </p>
                        </div>
                      </div>
                      <form action={statutTricycleAction} className="flex items-center gap-2">
                        <input type="hidden" name="tricycle_id" value={t.id} />
                        <span className={s.chip}>{s.label}</span>
                        <select name="statut" defaultValue={t.statut} className="field min-h-[36px] w-auto py-1 text-body-sm" aria-label="Changer l’état">
                          {Object.entries(STATUTS_TRICYCLE).map(([v, x]) => (
                            <option key={v} value={v}>{x.label}</option>
                          ))}
                        </select>
                        <SubmitButton variant="ghost" pendingLabel="…">OK</SubmitButton>
                      </form>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {equipage.map((a) => (
                        <form key={a.employe_id} action={retirerEmployeAction} className="inline-flex">
                          <input type="hidden" name="tricycle_id" value={t.id} />
                          <input type="hidden" name="employe_id" value={a.employe_id} />
                          <button type="submit" className="chip-info gap-1 py-1 hover:bg-brand-blue/20" title="Retirer de ce tricycle">
                            <UserRound size={12} /> {nomEmploye.get(a.employe_id)} <X size={12} />
                          </button>
                        </form>
                      ))}
                      {libres.length > 0 && (
                        <form action={affecterEmployeAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="tricycle_id" value={t.id} />
                          <select name="employe_id" className="field min-h-[34px] w-auto py-1 text-small" defaultValue="" aria-label="Affecter un employé">
                            <option value="" disabled>+ Affecter…</option>
                            {libres.map((e) => (
                              <option key={e.id} value={e.id}>{e.nom}</option>
                            ))}
                          </select>
                          <SubmitButton variant="ghost" pendingLabel="…">Affecter</SubmitButton>
                        </form>
                      )}
                      {equipage.length === 0 && libres.length === 0 && (
                        <span className="text-small text-muted-foreground">Ajoutez des employés pour former l’équipage.</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Volet
            className="border-t border-border"
            classeTitre="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-body-sm font-semibold text-brand-blue"
            titre={<><Plus size={16} /> Ajouter un tricycle</>}
          >
            <ActionForm action={creerTricycleAction} resetOnSuccess className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="t-nom">Nom *</label>
                <input id="t-nom" name="nom" required className="field" placeholder="Tricycle 1" />
              </div>
              <div>
                <label className="field-label" htmlFor="t-imm">Immatriculation</label>
                <input id="t-imm" name="immatriculation" className="field" placeholder="CE-123-AB" />
              </div>
              <div>
                <label className="field-label" htmlFor="t-cap">Capacité (kg)</label>
                <input id="t-cap" name="capacite_kg" type="number" inputMode="numeric" className="field" placeholder="500" />
              </div>
              <SubmitButton className="sm:col-span-3">Ajouter</SubmitButton>
            </ActionForm>
          </Volet>
        </Section>

        <Section titre="Employés" sousTitre={`${employes.filter((e) => e.actif).length} actifs`} flush>
          {erreur && (
            <p role="alert" className="mx-5 mt-3 rounded-md border border-terrain-stop/25 bg-terrain-stop/5 px-3 py-2 text-body-sm text-terrain-stop">{erreur}</p>
          )}
          <p className="px-5 pt-3 text-small text-muted-foreground">
            « Inviter » donne à l’employé un code pour créer son compte : il ouvre l’espace employé (ses tournées, le scan,
            la carte, les incidents, les espèces reçues à faire valider).
          </p>
          {employes.length === 0 ? (
            <EmptyState icon={UserRound} titre="Aucun employé" texte="Enregistrez chauffeurs et collecteurs pour suivre l’activité de chacun." />
          ) : (
            <ul className="divide-y divide-border">
              {employes.map((e) => {
                const siens = collectes.filter((c) => c.employe_id === e.id);
                const faits = siens.filter((c) => c.statut === 'realisee').length;
                const invitation = invitations.get(e.id);
                const lien = invitation ? `${origine}/rejoindre?code=${invitation.code}` : null;
                const message = lien
                  ? `Bonjour ${e.nom.split(' ')[0]}, voici votre accès à l’espace employé de ${entreprise.nom} sur MyKlinTown : ${lien} (code ${invitation!.code}, valable jusqu’au ${dateFr(invitation!.expire_at)}).`
                  : '';
                return (
                  <li key={e.id} id={`employe-${e.id}`} className={`space-y-2 px-5 py-3 ${invite === e.id ? 'bg-brand-green/5' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`font-semibold ${e.actif ? 'text-brand-ink' : 'text-muted-foreground line-through'}`}>{e.nom}</p>
                        <p className="text-small text-muted-foreground">
                          {FONCTIONS[e.fonction] ?? e.fonction} · {telLisible(e.telephone)} · <strong className="num text-brand-ink">{faits}</strong>/{siens.length} passages (30 j)
                        </p>
                        {e.user_id && (
                          <p className="mt-1"><span className="chip-ok"><UserCheck size={12} /> Compte relié</span></p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {e.actif && !e.user_id && (
                          <form action={inviterEmployeAction}>
                            <input type="hidden" name="employe_id" value={e.id} />
                            <SubmitButton variant="outline" pendingLabel="…">
                              <KeyRound size={16} /> {invitation ? 'Nouveau code' : 'Inviter'}
                            </SubmitButton>
                          </form>
                        )}
                        {e.user_id && (
                          <form action={retirerAccesEmployeAction}>
                            <input type="hidden" name="employe_id" value={e.id} />
                            <SubmitButton variant="ghost" pendingLabel="…">Retirer l’accès</SubmitButton>
                          </form>
                        )}
                        <form action={basculerEmployeAction}>
                          <input type="hidden" name="employe_id" value={e.id} />
                          <input type="hidden" name="actif" value={e.actif ? 'false' : 'true'} />
                          <SubmitButton variant="ghost" pendingLabel="…">{e.actif ? 'Désactiver' : 'Réactiver'}</SubmitButton>
                        </form>
                      </div>
                    </div>
                    {invitation && !e.user_id && lien && (
                      <div className="rounded-lg border border-brand-green/25 bg-brand-green/5 p-3 text-body-sm">
                        <p>
                          Code d’invitation : <strong className="num text-h2-sm tracking-widest text-brand-ink">{invitation.code}</strong>
                          <span className="text-small text-muted-foreground"> · valable jusqu’au {dateFr(invitation.expire_at)}, une seule fois</span>
                        </p>
                        <p className="mt-1 break-all text-small text-muted-foreground">{lien}</p>
                        <a
                          href={`https://wa.me/${telInternational(e.telephone) ?? ''}?text=${encodeURIComponent(message)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary mt-2"
                        >
                          <MessageCircle size={16} /> Envoyer par WhatsApp
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Volet
            className="border-t border-border" ouvertAuDepart={employes.length === 0}
            classeTitre="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-body-sm font-semibold text-brand-blue"
            titre={<><Plus size={16} /> Ajouter un employé</>}
          >
            <ActionForm action={creerEmployeAction} resetOnSuccess className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="e-nom">Nom *</label>
                <input id="e-nom" name="nom" required className="field" />
              </div>
              <div>
                <label className="field-label" htmlFor="e-tel">Téléphone</label>
                <input id="e-tel" name="telephone" type="tel" className="field" />
              </div>
              <div>
                <label className="field-label" htmlFor="e-fn">Fonction</label>
                <select id="e-fn" name="fonction" className="field" defaultValue="collecteur">
                  {Object.entries(FONCTIONS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <SubmitButton className="sm:col-span-3">Ajouter</SubmitButton>
            </ActionForm>
          </Volet>
        </Section>
      </div>
    </PrecoShell>
  );
}
