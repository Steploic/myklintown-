import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, Clock, Landmark, XCircle } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { annulerDemandeAccesAction, demanderAccesMairieAction } from '@/lib/acces-actions';
import { getSupabase, row, rows, utilisateurCourant } from '@/lib/server';
import { dateFr } from '@/lib/format';

export const metadata = { title: 'Accès Mairie' };

/**
 * Demande d'accès à l'espace Mairie (retour R1 de Julien) : formulaire réel,
 * puis statut « en cours de traitement » jusqu'à la validation par MyKlinTown.
 */
export default async function AccesMairiePage({ searchParams }: { searchParams: Promise<{ envoyee?: string }> }) {
  const { envoyee } = await searchParams;
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);

  let role: string | null = null;
  let demande: { statut: string; created_at: string; fonction: string } | null = null;
  if (user) {
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    role = row<{ role: string }>(p)?.role ?? null;
    if (role === 'mairie' || role === 'admin') redirect('/dashboard');
    const { data: d } = await supabase
      .from('demandes_acces')
      .select('statut, created_at, fonction')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    demande = row<{ statut: string; created_at: string; fonction: string }>(d);
  }
  const { data: c } = await supabase.from('communes').select('id, nom').order('nom');
  const communes = rows<{ id: string; nom: string }>(c);
  const peutDemander = !demande || demande.statut === 'refusee' || demande.statut === 'annulee';

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="container flex-1 py-12">
        <div className="mx-auto max-w-2xl">
          <span className="grid h-12 w-12 place-content-center rounded-xl bg-brand-ink text-brand-leaf">
            <Landmark size={24} />
          </span>
          <h1 className="mt-4">Accès Mairie</h1>
          <p className="mt-2 text-body text-muted-foreground">
            L’espace Mairie permet de découper la commune en zones de collecte, d’y affecter les précollecteurs et de
            superviser l’activité (sans accès aux données personnelles des ménages). Il est ouvert après vérification
            par l’équipe MyKlinTown.
          </p>

          <ol className="mt-6 grid gap-3 text-body-sm sm:grid-cols-3">
            {['Vous envoyez la demande', 'MyKlinTown vérifie votre fonction', 'Votre compte bascule sur l’espace Mairie'].map((t, i) => (
              <li key={t} className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
                <span className="num grid h-6 w-6 shrink-0 place-content-center rounded-full bg-brand-ink text-small font-bold text-brand-leaf">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>

          {demande && demande.statut === 'en_attente' && (
            <section className="mt-8 flex items-start gap-4 rounded-2xl border border-brand-blue/20 bg-brand-blue/5 p-6">
              <Clock size={28} className="shrink-0 text-brand-blue" />
              <div>
                <p className="text-h2-sm font-semibold text-brand-ink">
                  {envoyee ? 'Demande envoyée' : 'Demande en cours de traitement'}
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Envoyée le {dateFr(demande.created_at, { day: 'numeric', month: 'long' })} ({demande.fonction}). Dès
                  qu’elle est validée, reconnectez-vous : vous arriverez directement sur l’espace Mairie.
                </p>
                <form action={annulerDemandeAccesAction} className="mt-3">
                  <SubmitButton variant="outline" pendingLabel="Retrait…">Retirer ma demande</SubmitButton>
                </form>
              </div>
            </section>
          )}
          {demande && demande.statut === 'acceptee' && (
            <section className="mt-8 flex items-start gap-4 rounded-2xl border border-terrain-ok/25 bg-terrain-ok/5 p-6">
              <CheckCircle2 size={28} className="shrink-0 text-terrain-ok" />
              <div>
                <p className="text-h2-sm font-semibold text-brand-ink">Accès accordé</p>
                <Link href="/dashboard" className="btn-primary mt-3">Ouvrir l’espace Mairie</Link>
              </div>
            </section>
          )}
          {demande && demande.statut === 'refusee' && (
            <p className="mt-8 flex items-start gap-2 rounded-lg border border-terrain-stop/25 bg-terrain-stop/5 p-4 text-body-sm text-terrain-stop">
              <XCircle size={18} className="mt-0.5 shrink-0" /> Votre précédente demande n’a pas été retenue. Vous pouvez en
              envoyer une nouvelle en précisant votre fonction et votre service.
            </p>
          )}

          {peutDemander && (
            <ActionForm action={demanderAccesMairieAction} className="card-soft mt-8 space-y-4 p-6">
              {!user && (
                <>
                  <p className="text-body-sm text-muted-foreground">
                    Déjà un compte ?{' '}
                    <Link href="/login?next=/acces-mairie" className="font-semibold text-brand-blue hover:underline">
                      Connectez-vous
                    </Link>{' '}
                    puis revenez ici.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor="am-nom">Nom complet *</label>
                      <input id="am-nom" name="nom" required autoComplete="name" className="field" />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="am-email">E-mail professionnel *</label>
                      <input id="am-email" name="email" type="email" required autoComplete="email" className="field" />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="am-mdp">Mot de passe *</label>
                      <input id="am-mdp" name="password" type="password" required minLength={6} autoComplete="new-password" className="field" />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="am-tel-c">Téléphone</label>
                      <input id="am-tel-c" name="telephone" type="tel" className="field" placeholder="6 XX XX XX XX" />
                    </div>
                  </div>
                </>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="am-commune">Commune *</label>
                  <select id="am-commune" name="commune_id" required className="field" defaultValue="">
                    <option value="" disabled>— Choisir —</option>
                    {communes.map((cm) => (
                      <option key={cm.id} value={cm.id}>{cm.nom}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="am-fonction">Fonction *</label>
                  <input id="am-fonction" name="fonction" required className="field" placeholder="ex. Chef du service d’hygiène" />
                </div>
                <div>
                  <label className="field-label" htmlFor="am-service">Service</label>
                  <input id="am-service" name="service" className="field" placeholder="ex. Hygiène et salubrité" />
                </div>
                {user && (
                  <div>
                    <label className="field-label" htmlFor="am-tel">Téléphone</label>
                    <input id="am-tel" name="telephone" type="tel" className="field" />
                  </div>
                )}
              </div>
              <div>
                <label className="field-label" htmlFor="am-message">Message (facultatif)</label>
                <textarea id="am-message" name="message" rows={3} className="field" />
              </div>
              <SubmitButton className="w-full" pendingLabel="Envoi…">Envoyer la demande d’accès</SubmitButton>
            </ActionForm>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
