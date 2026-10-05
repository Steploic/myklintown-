import Link from 'next/link';
import { Users } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { rejoindreEquipeAction } from '@/lib/employe/rejoindre-actions';
import { getSupabase, row, rows, rpc, utilisateurCourant } from '@/lib/server';

export const metadata = { title: 'Rejoindre mon équipe' };

const FONCTIONS: Record<string, string> = {
  chauffeur: 'chauffeur',
  collecteur: 'ramasseur',
  superviseur: 'superviseur',
  autre: 'membre de l’équipe',
};

/**
 * Page publique : l'employé y saisit le code reçu de son gérant (ou arrive par
 * le lien partagé), crée son compte au besoin et rejoint l'équipe.
 */
export default async function RejoindrePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = '' } = await searchParams;
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);

  const { data: a } = code ? await rpc(supabase, 'apercu_invitation', { p_code: code }) : { data: [] };
  const apercu = rows<{ entreprise_nom: string; employe_nom: string; fonction: string; valide: boolean }>(a)[0] ?? null;

  let dejaMembre: string | null = null;
  if (user) {
    const { data: e } = await supabase
      .from('employes')
      .select('entreprises(nom)')
      .eq('user_id', user.id)
      .eq('actif', true)
      .maybeSingle();
    dejaMembre = row<{ entreprises: { nom: string } | null }>(e)?.entreprises?.nom ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="container flex-1 py-12">
        <div className="mx-auto max-w-lg">
          <span className="grid h-12 w-12 place-content-center rounded-xl bg-brand-ink text-brand-leaf">
            <Users size={24} />
          </span>
          <h1 className="mt-4">Rejoindre mon équipe</h1>
          <p className="mt-2 text-body text-muted-foreground">
            Votre gérant vous a donné un code d’invitation. Il ouvre votre espace employé : vos tournées, le scan des
            QR codes, la carte et la déclaration d’incidents.
          </p>

          {dejaMembre ? (
            <section className="card-soft mt-8 p-6">
              <p className="font-semibold text-brand-ink">Vous faites déjà partie de l’équipe de {dejaMembre}.</p>
              <Link href="/employe" className="btn-primary mt-4">Ouvrir mon espace employé</Link>
            </section>
          ) : (
            <>
              {code && !apercu && (
                <p role="alert" className="mt-6 rounded-lg border border-terrain-stop/25 bg-terrain-stop/5 px-4 py-3 text-body-sm text-terrain-stop">
                  Ce code d’invitation est inconnu. Vérifiez-le auprès de votre gérant.
                </p>
              )}
              {apercu && !apercu.valide && (
                <p role="alert" className="mt-6 rounded-lg border border-terrain-stop/25 bg-terrain-stop/5 px-4 py-3 text-body-sm text-terrain-stop">
                  Ce code n’est plus valable (déjà utilisé ou expiré). Demandez-en un nouveau à votre gérant.
                </p>
              )}
              {apercu?.valide && (
                <section className="mt-6 rounded-2xl border border-brand-green/25 bg-brand-green/5 p-5">
                  <p className="text-small font-semibold uppercase tracking-wider text-brand-green">Invitation</p>
                  <p className="mt-1 text-h2-sm font-semibold text-brand-ink">{apercu.entreprise_nom}</p>
                  <p className="text-body-sm text-muted-foreground">
                    Pour {apercu.employe_nom}, {FONCTIONS[apercu.fonction] ?? 'membre de l’équipe'}.
                  </p>
                </section>
              )}

              <ActionForm action={rejoindreEquipeAction} className="card-soft mt-6 space-y-4 p-6">
                <div>
                  <label className="field-label" htmlFor="rj-code">Code d’invitation *</label>
                  <input
                    id="rj-code"
                    name="code"
                    required
                    defaultValue={code}
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="field num uppercase tracking-widest"
                    placeholder="ex. 3F9A2C71"
                  />
                </div>
                {!user && (
                  <>
                    <p className="text-body-sm text-muted-foreground">
                      Déjà un compte ?{' '}
                      <Link
                        href={`/login?next=${encodeURIComponent(`/rejoindre${code ? `?code=${code}` : ''}`)}`}
                        className="font-semibold text-brand-blue hover:underline"
                      >
                        Connectez-vous
                      </Link>{' '}
                      puis revenez ici. Sinon, créez votre compte :
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="field-label" htmlFor="rj-nom">Nom complet *</label>
                        <input id="rj-nom" name="nom" required autoComplete="name" defaultValue={apercu?.employe_nom ?? ''} className="field" />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="rj-email">E-mail *</label>
                        <input id="rj-email" name="email" type="email" required autoComplete="email" className="field" />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="rj-mdp">Mot de passe *</label>
                        <input id="rj-mdp" name="password" type="password" required minLength={6} autoComplete="new-password" className="field" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="field-label" htmlFor="rj-tel">Téléphone</label>
                        <input id="rj-tel" name="telephone" type="tel" className="field" placeholder="6 XX XX XX XX" />
                      </div>
                    </div>
                  </>
                )}
                <SubmitButton className="w-full" pendingLabel="Connexion à l’équipe…">Rejoindre l’équipe</SubmitButton>
              </ActionForm>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
