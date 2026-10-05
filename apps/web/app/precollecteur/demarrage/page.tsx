import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle2 } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { getMonEntreprise } from '@/lib/precollecteur/context';
import { creerEntrepriseAction } from '@/lib/precollecteur/actions';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { rows } from '@/lib/server';
import { getCurrentProfile } from '@/lib/get-profile';
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
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_28rem] lg:items-start">
          <div className="space-y-5">
            <p className="text-small font-semibold uppercase tracking-wider text-brand-leaf">Étape 1 sur 1</p>
            <h1 className="text-[2rem] font-bold leading-tight text-white md:text-[2.5rem]">
              Votre entreprise de précollecte, dans votre poche.
            </h1>
            <p className="max-w-lg text-body text-white/75">
              Donnez un nom à votre activité : c’est lui que verront vos clients sur leurs factures et
              leurs reçus. Vous pourrez ensuite enregistrer vos ménages, votre flotte et vos tournées.
            </p>
            <ul className="space-y-2 text-body-sm text-white/85">
              {[
                'Vos clients, leurs abonnements et leurs paiements au même endroit',
                'Relances d’impayés en un geste (WhatsApp, SMS, appel)',
                'Preuves photo et vidéo prises sur le terrain',
                'Tableau de bord : clients actifs, chiffre d’affaires, collectes',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-leaf" /> {t}
                </li>
              ))}
            </ul>
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
              <div>
                <label htmlFor="commune_id" className="field-label">Commune d’activité</label>
                <select id="commune_id" name="commune_id" className="field" defaultValue="">
                  <option value="">— Choisir —</option>
                  {communes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="siege" className="field-label">Quartier / siège</label>
                <input id="siege" name="siege" className="field" placeholder="ex. Nsam, face pharmacie" />
              </div>
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
