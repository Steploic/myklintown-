import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle2 } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { getMonEntreprise } from '@/lib/precollecteur/context';
import { creerEntrepriseAction } from '@/lib/precollecteur/actions';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { rows } from '@/lib/server';
import { getCurrentProfile } from '@/lib/get-profile';
import { DOCUMENTS } from '@/lib/documents';
import { SelecteurEspace } from '@/components/selecteur-espace';

export const metadata = { title: 'Créer mon entreprise' };

export default async function DemarragePage() {
  const { supabase, entreprise } = await getMonEntreprise();
  if (entreprise) redirect('/precollecteur');

  const { data } = await supabase.from('communes').select('id, nom').order('nom');
  const communes = rows<{ id: string; nom: string }>(data);
  // Un administrateur sans entreprise atterrit ici en changeant d'espace : il
  // doit pouvoir repartir (cet écran n'a pas de menu).
  const estAdmin = (await getCurrentProfile())?.role === 'admin';

  return (
    <div className="min-h-screen bg-brand-gradient-ink px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <Link href="/" className="inline-flex">
            <Logo size={34} variant="bare" />
          </Link>
          {estAdmin && (
            <div className="w-64 [&>details]:mx-0">
              <SelecteurEspace courant="precollecteur" />
            </div>
          )}
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_30rem] lg:items-start">
          <div className="space-y-5">
            <p className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Étape 1 sur 2</p>
            <h1 className="text-[2rem] font-bold leading-tight text-white md:text-[2.5rem]">
              Votre entreprise de précollecte, dans votre poche.
            </h1>
            <p className="max-w-lg text-body text-white/75">
              Créez votre espace gratuitement, sans engagement. Déposez ensuite les pièces de votre dossier : une fois
              vérifié par MyKlinTown, vous apparaissez dans l’annuaire des abonnés de vos quartiers.
            </p>
            <ul className="space-y-2 text-body-sm text-white/85">
              {[
                'Vos clients, leurs abonnements et leurs paiements au même endroit',
                'Relances d’impayés en un geste (WhatsApp, SMS, appel)',
                'Preuves photo et vidéo prises sur le terrain',
                'Une vitrine dans l’annuaire : nom, logo et devise, dans vos quartiers',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-leaf" /> {t}
                </li>
              ))}
            </ul>
            <div className="max-w-lg rounded-xl border border-white/15 bg-white/5 p-4 text-body-sm text-white/80">
              <p className="font-semibold text-white">Étape 2 : votre dossier</p>
              <p className="mt-1">
                NIU, adresse du siège social, autorisation territoriale de chaque commune d’activité, permis
                environnemental. Vous pouvez les déposer plus tard, depuis votre espace.
              </p>
            </div>
          </div>

          <ActionForm action={creerEntrepriseAction} className="rounded-2xl bg-surface p-6 text-foreground shadow-elevated">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-11 w-11 place-content-center rounded-xl bg-brand-green/10 text-brand-green">
                <Building2 size={22} />
              </span>
              <div>
                <p className="text-h2-sm font-semibold text-brand-ink">Mon entreprise</p>
                <p className="text-small text-muted-foreground">Modifiable à tout moment</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="nom" className="field-label">Nom de l’entreprise *</label>
                <input id="nom" name="nom" required className="field" placeholder="ex. Propreté Nsam SARL" />
              </div>
              <div>
                <label htmlFor="telephone" className="field-label">Téléphone de contact</label>
                <input id="telephone" name="telephone" type="tel" className="field" placeholder="6 XX XX XX XX" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="niu" className="field-label">NIU</label>
                  <input id="niu" name="niu" maxLength={30} autoCapitalize="characters" className="field num uppercase" placeholder="ex. M012345678901A" />
                </div>
                <div>
                  <label htmlFor="siege" className="field-label">Adresse du siège social</label>
                  <input id="siege" name="siege" className="field" placeholder="ex. Nsam, face pharmacie" />
                </div>
              </div>
              <p className="field-hint -mt-2">NIU et siège social sont exigés pour la vérification du dossier.</p>
              <fieldset>
                <legend className="field-label">Communes d’activité</legend>
                <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-md border border-input p-2 sm:grid-cols-2">
                  {communes.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-body-sm hover:bg-muted">
                      <input type="checkbox" name="communes" value={c.id} className="h-4 w-4 accent-[#30823A]" /> {c.nom}
                    </label>
                  ))}
                </div>
                <p className="field-hint">Une autorisation territoriale sera demandée pour chacune.</p>
              </fieldset>
              <div>
                <label htmlFor="quartiers" className="field-label">Quartiers desservis</label>
                <textarea id="quartiers" name="quartiers" rows={2} className="field" placeholder="ex. Nsam, Efoulan, Mvan" />
                <p className="field-hint">Séparés par des virgules : c’est là que les abonnés vous trouveront dans l’annuaire.</p>
              </div>
              <div>
                <label htmlFor="devise" className="field-label">Devise de l’entreprise</label>
                <input id="devise" name="devise" maxLength={120} className="field" placeholder="ex. Votre quartier propre, chaque semaine" />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-input p-3 text-body-sm">
                <input type="checkbox" name="conditions" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#30823A]" />
                <span>
                  J’ai lu et j’accepte les{' '}
                  <Link href={DOCUMENTS.cgu_precollecteur.chemin} target="_blank" className="font-semibold text-brand-blue underline">conditions d’utilisation</Link>{' '}
                  et la{' '}
                  <Link href={DOCUMENTS.charte_precollecteur.chemin} target="_blank" className="font-semibold text-brand-blue underline">charte du précollecteur</Link>.
                </span>
              </label>
              <SubmitButton className="w-full" pendingLabel="Création…">
                Créer mon espace
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
