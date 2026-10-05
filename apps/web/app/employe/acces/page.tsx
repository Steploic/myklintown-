import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { getSupabase, row, utilisateurCourant } from '@/lib/server';
import { signOutAction } from '@/lib/auth-actions';

export const metadata = { title: 'Accès employé' };

/**
 * Compte « employé » sans fiche active : le gérant a désactivé la fiche ou
 * retiré l'accès. On l'explique au lieu d'afficher des pages vides.
 */
export default async function AccesEmploye() {
  const supabase = await getSupabase();
  const user = await utilisateurCourant(supabase);
  if (!user) redirect('/login?next=/employe');
  const { data } = await supabase.from('employes').select('id').eq('user_id', user.id).eq('actif', true).maybeSingle();
  if (row(data)) redirect('/employe');

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="container flex-1 py-12">
        <div className="card-soft mx-auto max-w-lg p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-content-center rounded-xl bg-terrain-relance/10 text-terrain-relance">
            <KeyRound size={24} />
          </span>
          <h1 className="mt-4">Accès employé suspendu</h1>
          <p className="mt-2 text-body text-muted-foreground">
            Votre compte n’est plus relié à une équipe active. Si c’est une erreur, demandez à votre gérant de réactiver
            votre fiche, ou un nouveau code d’invitation.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/rejoindre" className="btn-primary">J’ai un code d’invitation</Link>
            <form action={signOutAction}>
              <button type="submit" className="btn-outline">Se déconnecter</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
