import Link from 'next/link';
import { AlertTriangle, BadgeCheck, FileCheck2, MapPinned, Store } from 'lucide-react';
import { PrecoShell } from '@/components/precollecteur/shell';
import { PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CarteVitrine } from '@/components/annuaire/carte-vitrine';
import { PieceDossier } from '@/components/precollecteur/piece-dossier';
import { requireEntreprise } from '@/lib/precollecteur/context';
import {
  definirCommunesAction,
  majIdentiteAction,
  majVitrineAction,
  soumettreDossierAction,
} from '@/lib/precollecteur/actions';
import { ETATS_DOSSIER, etatDossier } from '@/lib/dossier';
import { urlsPieces } from '@/lib/dossier-pieces';
import { rows, rpc } from '@/lib/server';
import { dateFr } from '@/lib/format';

export const metadata = { title: 'Dossier et vitrine' };

/**
 * Dossier du précollecteur (retours de l'équipe, 08/11/2026) : sans dossier
 * vérifié par MyKlinTown, pas de place dans l'annuaire public.
 */
export default async function DossierPage() {
  const { supabase, entreprise } = await requireEntreprise();
  const [{ data: co }, { data: ec }, manque] = await Promise.all([
    supabase.from('communes').select('id, nom').order('nom'),
    supabase.from('entreprise_communes').select('commune_id, autorisation_path').eq('entreprise_id', entreprise.id),
    rpc(supabase, 'pieces_manquantes', { p_entreprise: entreprise.id }),
  ]);
  const communes = rows<{ id: string; nom: string }>(co);
  const miennes = rows<{ commune_id: string; autorisation_path: string | null }>(ec);
  const manquantes = Array.isArray(manque.data) ? (manque.data as string[]) : [];
  const etat = etatDossier(entreprise.dossier_statut);
  const urls = await urlsPieces(supabase, [entreprise.permis_env_path, ...miennes.map((m) => m.autorisation_path)]);
  const nomCommune = (id: string) => communes.find((c) => c.id === id)?.nom ?? 'Commune';
  const peutSoumettre = (etat === 'incomplet' || etat === 'refuse') && manquantes.length === 0 && !manque.error;

  return (
    <PrecoShell path="/precollecteur/dossier">
      <PageHeader
        titre="Dossier et vitrine"
        sousTitre="Votre place dans l’annuaire des abonnés : nom, logo et devise, dans les quartiers que vous desservez. Elle s’ouvre une fois votre dossier vérifié par MyKlinTown."
      />

      <div
        className={`mb-6 flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-body-sm ${
          etat === 'valide'
            ? 'border-terrain-ok/30 bg-terrain-ok/5'
            : etat === 'refuse'
              ? 'border-terrain-stop/30 bg-terrain-stop/5'
              : 'border-brand-blue/20 bg-brand-blue/5'
        }`}
      >
        <BadgeCheck size={20} className="mt-0.5 shrink-0 text-brand-ink" />
        <div className="flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-ink">
            <span className={ETATS_DOSSIER[etat].chip}>{ETATS_DOSSIER[etat].label}</span>
            {etat === 'soumis' && entreprise.dossier_soumis_at && <span className="font-normal text-muted-foreground">envoyé le {dateFr(entreprise.dossier_soumis_at)}</span>}
            {etat === 'valide' && entreprise.dossier_statue_at && <span className="font-normal text-muted-foreground">vérifié le {dateFr(entreprise.dossier_statue_at)}</span>}
          </p>
          <p className="mt-1">{ETATS_DOSSIER[etat].texte}</p>
          {etat === 'refuse' && entreprise.dossier_motif && (
            <p className="mt-2 font-semibold text-terrain-stop">Motif : {entreprise.dossier_motif}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titre="Votre vitrine" sousTitre="Ce que les abonnés voient dans l’annuaire, et rien d’autre.">
          <div className="space-y-4">
            <CarteVitrine nom={entreprise.nom} devise={entreprise.devise} logoPath={entreprise.logo_path} />
            <PieceDossier entrepriseId={entreprise.id} piece="logo" libelle="mon logo" deposee={!!entreprise.logo_path} />
            <ActionForm action={majVitrineAction} className="space-y-4">
              <div>
                <label htmlFor="devise" className="field-label">Devise de l’entreprise</label>
                <input id="devise" name="devise" maxLength={120} defaultValue={entreprise.devise ?? ''} className="field" placeholder="ex. Votre quartier propre, chaque semaine" />
              </div>
              <div>
                <label htmlFor="quartiers" className="field-label">Quartiers desservis</label>
                <textarea id="quartiers" name="quartiers" rows={3} defaultValue={(entreprise.quartiers ?? []).join(', ')} className="field" placeholder="ex. Nsam, Efoulan, Mvan" />
                <p className="field-hint">Séparés par des virgules. Un abonné qui cherche l’un de ces quartiers vous trouvera.</p>
              </div>
              <SubmitButton variant="secondary">
                <Store size={16} /> Enregistrer la vitrine
              </SubmitButton>
            </ActionForm>
          </div>
        </Section>

        <Section titre="Identité de l’entreprise" sousTitre="Exigée pour la vérification.">
          <ActionForm action={majIdentiteAction} className="space-y-4">
            <div>
              <label htmlFor="niu" className="field-label">NIU (numéro d’identifiant unique)</label>
              <input id="niu" name="niu" maxLength={30} defaultValue={entreprise.niu ?? ''} autoCapitalize="characters" className="field num uppercase" placeholder="ex. M012345678901A" />
            </div>
            <div>
              <label htmlFor="siege" className="field-label">Adresse du siège social</label>
              <input id="siege" name="siege" defaultValue={entreprise.siege ?? ''} className="field" placeholder="ex. Nsam, face pharmacie" />
            </div>
            <SubmitButton variant="secondary">Enregistrer</SubmitButton>
          </ActionForm>
        </Section>

        <Section titre="Communes d’activité" sousTitre="Une autorisation territoriale de la commune est exigée pour chacune.">
          <div className="space-y-5">
            <ActionForm action={definirCommunesAction} className="space-y-3">
              <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border border-input p-2 sm:grid-cols-2">
                {communes.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-body-sm hover:bg-muted">
                    <input type="checkbox" name="communes" value={c.id} defaultChecked={miennes.some((m) => m.commune_id === c.id)} className="h-4 w-4 accent-[#30823A]" /> {c.nom}
                  </label>
                ))}
              </div>
              <SubmitButton variant="outline">
                <MapPinned size={16} /> Enregistrer mes communes
              </SubmitButton>
            </ActionForm>
            {miennes.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {miennes.map((m) => (
                  <li key={m.commune_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="text-body-sm">
                      <span className="block font-semibold text-brand-ink">{nomCommune(m.commune_id)}</span>
                      {m.autorisation_path ? (
                        <span className="chip-ok">Autorisation déposée</span>
                      ) : (
                        <span className="chip-relance">Autorisation à déposer</span>
                      )}
                      {m.autorisation_path && urls.get(m.autorisation_path) && (
                        <a href={urls.get(m.autorisation_path)} target="_blank" rel="noreferrer" className="ml-2 text-small font-semibold text-brand-blue hover:underline">Voir</a>
                      )}
                    </span>
                    <PieceDossier
                      entrepriseId={entreprise.id}
                      piece="autorisation"
                      communeId={m.commune_id}
                      libelle="l’autorisation"
                      deposee={!!m.autorisation_path}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section titre="Permis environnemental" sousTitre="Permis en matière de gestion des déchets : photo ou PDF.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-body-sm">
              {entreprise.permis_env_path ? <span className="chip-ok">Permis déposé</span> : <span className="chip-relance">Permis à déposer</span>}
              {entreprise.permis_env_path && urls.get(entreprise.permis_env_path) && (
                <a href={urls.get(entreprise.permis_env_path)} target="_blank" rel="noreferrer" className="ml-2 text-small font-semibold text-brand-blue hover:underline">Voir</a>
              )}
            </span>
            <PieceDossier entrepriseId={entreprise.id} piece="permis" libelle="le permis" deposee={!!entreprise.permis_env_path} />
          </div>
        </Section>
      </div>

      <Section className="mt-6" titre="Vérification par MyKlinTown">
        <div className="space-y-4">
          {manquantes.length > 0 && (
            <p className="flex items-start gap-2 text-body-sm text-terrain-relance">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" /> Il manque encore : {manquantes.join(', ')}.
            </p>
          )}
          {peutSoumettre && (
            <ActionForm action={soumettreDossierAction}>
              <SubmitButton pendingLabel="Envoi…">
                <FileCheck2 size={16} /> Soumettre mon dossier pour vérification
              </SubmitButton>
            </ActionForm>
          )}
          {etat === 'soumis' && <p className="text-body-sm text-muted-foreground">Votre dossier est entre les mains de l’équipe MyKlinTown.</p>}
          <p className="text-small text-muted-foreground">
            Modifier le NIU, le siège, une commune ou une pièce d’un dossier vérifié le renvoie en vérification : vous
            quittez l’annuaire jusqu’à la nouvelle validation. Le logo, la devise et les quartiers se changent librement.
            Vos engagements : <Link href="/legal/conditions-precollecteur" className="font-semibold text-brand-blue hover:underline">conditions d’utilisation</Link> et{' '}
            <Link href="/legal/charte-precollecteur" className="font-semibold text-brand-blue hover:underline">charte du précollecteur</Link>.
          </p>
        </div>
      </Section>
    </PrecoShell>
  );
}
