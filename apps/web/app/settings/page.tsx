import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/lib/auth-actions';
import { PortalShell, type PortalKey } from '@/components/portal-shell';
import { PageHeader, Section } from '@/components/ui/blocks';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { changerMotDePasseAction, majProfilAction } from '@/lib/compte-actions';
import { majEntrepriseAction } from '@/lib/precollecteur/actions';
import { getSupabase, row, utilisateurCourant } from '@/lib/server';
import { isoJour } from '@/lib/format';
import type { Entreprise } from '@/lib/types';
import { ChampMotDePasse } from '@/components/ui/champ-mot-de-passe';

export const metadata = { title: 'Paramètres' };

const PORTAIL: Record<string, PortalKey> = {
  citoyen: 'citoyen',
  precollecteur: 'precollecteur',
  employe: 'employe',
  mairie: 'mairie',
  admin: 'mairie',
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
          <Section titre="Mon entreprise" sousTitre="Nom, contact et mentions fiscales imprimés sur les factures, reçus et étiquettes QR.">
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
              <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-1 text-body-sm font-semibold text-brand-ink">Mentions fiscales des factures</legend>
                <div>
                  <label className="field-label" htmlFor="e-niu">NIU</label>
                  <input id="e-niu" name="niu" maxLength={30} defaultValue={entreprise.niu ?? ''} className="field num uppercase" placeholder="ex. M012345678901A" autoCapitalize="characters" />
                  <p className="field-hint">Numéro d’identifiant unique (impôts).</p>
                </div>
                <div>
                  <label className="field-label" htmlFor="e-rccm">RCCM</label>
                  <input id="e-rccm" name="rccm" maxLength={60} defaultValue={entreprise.rccm ?? ''} className="field num uppercase" placeholder="ex. RC/YAO/2026/B/0001" autoCapitalize="characters" />
                  <p className="field-hint">Registre du commerce et du crédit mobilier.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="e-adresse-fiscale">Adresse fiscale</label>
                  <input id="e-adresse-fiscale" name="adresse_fiscale" maxLength={300} defaultValue={entreprise.adresse_fiscale ?? ''} className="field" placeholder="ex. BP 1234 Yaoundé, Nsam" />
                </div>
                <p className="text-small text-muted-foreground sm:col-span-2">
                  Imprimées sur les factures émises à partir de maintenant ; une facture déjà émise garde celles du jour de son émission.
                  {entreprise.prefixe_facture && (
                    <> Vos factures sont numérotées <span className="num font-semibold text-brand-ink">{entreprise.prefixe_facture}-{isoJour().slice(0, 4)}-00001</span>, <span className="num">…-00002</span>, et ainsi de suite, sans trou.</>
                  )}
                </p>
              </fieldset>
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
              <ChampMotDePasse id="m-1" name="password" minLength={8} required autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label" htmlFor="m-2">Confirmation</label>
              <ChampMotDePasse id="m-2" name="confirmation" minLength={8} required autoComplete="new-password" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton variant="secondary">Changer le mot de passe</SubmitButton>
            </div>
          </ActionForm>
        </Section>
        <Section titre="Session">
          <form action={signOutAction} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-muted-foreground">Fermez votre session sur cet appareil.</p>
            <SubmitButton variant="outline" pendingLabel="Déconnexion…">
              <LogOut size={16} /> Se déconnecter
            </SubmitButton>
          </form>
        </Section>
      </div>
    </PortalShell>
  );
}
