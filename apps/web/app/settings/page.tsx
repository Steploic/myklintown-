import { redirect } from 'next/navigation';
import { PortalShell, type PortalKey } from '@/components/portal-shell';
import { PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { changerMotDePasseAction, majProfilAction } from '@/lib/compte-actions';
import { majEntrepriseAction } from '@/lib/precollecteur/actions';
import { getSupabase, row, utilisateurCourant } from '@/lib/server';
import type { Entreprise } from '@/lib/types';

export const metadata = { title: 'Paramètres' };

const PORTAIL: Record<string, PortalKey> = {
  citoyen: 'citoyen',
  precollecteur: 'precollecteur',
  collecteur: 'collecteur',
  mairie: 'mairie',
  admin: 'mairie',
  enterprise: 'enterprise',
};

/** Paramètres du compte connecté : profil, entreprise (précollecteur), mot de passe. */
export default async function SettingsPage() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) redirect('/login?next=/settings');

  const { data } = await supabase
    .from('profiles')
    .select('nom_complet, email, telephone, role')
    .eq('id', user.id)
    .maybeSingle();
  const profil = row<{ nom_complet: string; email: string; telephone: string | null; role: string }>(data);
  const role = profil?.role ?? 'citoyen';

  let entreprise: Entreprise | null = null;
  if (role === 'precollecteur') {
    const { data: m } = await supabase
      .from('entreprise_membres')
      .select('entreprises(*)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    entreprise = row<{ entreprises: Entreprise | null }>(m)?.entreprises ?? null;
  }

  return (
    <PortalShell portalKey={PORTAIL[role] ?? 'citoyen'} currentPath="/settings" titre={entreprise?.nom}>
      <PageHeader titre="Paramètres" sousTitre={profil?.email ?? user.email} />
      <div className="grid max-w-3xl gap-6">
        <Section titre="Mon profil">
          <ActionForm action={majProfilAction} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="p-nom">Nom complet</label>
              <input id="p-nom" name="nom" required defaultValue={profil?.nom_complet ?? ''} className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="p-tel">Téléphone</label>
              <input id="p-tel" name="telephone" type="tel" defaultValue={profil?.telephone ?? ''} className="field" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton>Enregistrer</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        {entreprise && (
          <Section titre="Mon entreprise" sousTitre="Nom et contact imprimés sur les factures, reçus et étiquettes QR.">
            <ActionForm action={majEntrepriseAction} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="e-nom">Nom de l’entreprise</label>
                <input id="e-nom" name="nom" required defaultValue={entreprise.nom} className="field" />
              </div>
              <div>
                <label className="field-label" htmlFor="e-tel">Téléphone</label>
                <input id="e-tel" name="telephone" type="tel" defaultValue={entreprise.telephone ?? ''} className="field" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="e-siege">Quartier / siège</label>
                <input id="e-siege" name="siege" defaultValue={entreprise.siege ?? ''} className="field" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Enregistrer</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        )}

        <Section titre="Mot de passe">
          <ActionForm action={changerMotDePasseAction} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="m-1">Nouveau mot de passe</label>
              <input id="m-1" name="password" type="password" minLength={6} required autoComplete="new-password" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="m-2">Confirmation</label>
              <input id="m-2" name="confirmation" type="password" minLength={6} required autoComplete="new-password" className="field" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton variant="secondary">Changer le mot de passe</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      </div>
    </PortalShell>
  );
}
