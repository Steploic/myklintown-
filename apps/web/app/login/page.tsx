import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@myklintown/ui';
import { AuthAside } from '@/components/auth-aside';
import { getCurrentProfile } from '@/lib/get-profile';
import { destinationApresConnexion } from '@/lib/destination';
import { LoginForm } from './login-form';

export const metadata = { title: 'Connexion' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Session toujours valide : on ouvre l'espace sans redemander le mot de passe.
  // L'application installée démarre ici (manifest : start_url = /login) ; sans
  // ce renvoi, chaque ouverture affichait le formulaire alors que la session
  // était intacte (retour de l'équipe, 08/11/2026). Se déconnecter reste un
  // geste volontaire (/logout).
  const profil = await getCurrentProfile();
  if (profil?.role) redirect(destinationApresConnexion(profil.role, next));

  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-2">
      <AuthAside
        titre="Content de vous revoir."
        points={[
          'Précollecteurs : clients, factures, tournées',
          'Abonnés : devis, passages, signalements',
          'Employés : tournées et scans sur le terrain',
        ]}
      />
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex lg:hidden">
            <Logo size={34} />
          </Link>
          <h1>Connexion</h1>
          <p className="mb-6 mt-1 text-body text-muted-foreground">Accédez à votre espace MyKlinTown.</p>
          <LoginForm suite={next} />
          <p className="mt-6 text-center text-body-sm text-muted-foreground">
            Pas encore de compte ?{' '}
            <Link href="/signup" className="font-semibold text-brand-blue hover:underline">
              Créer un compte
            </Link>
          </p>
          <p className="mt-2 text-center text-body-sm text-muted-foreground">
            Employé d’un précollecteur ?{' '}
            <Link href="/rejoindre" className="font-semibold text-brand-blue hover:underline">
              Rejoindre mon équipe
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
