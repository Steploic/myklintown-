import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { AuthAside } from '@/components/auth-aside';
import { LoginForm } from './login-form';

export const metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-2">
      <AuthAside
        titre="Content de vous revoir."
        points={[
          'Précollecteurs : clients, factures, tournées',
          'Ménages : abonnement, passages, signalements',
          'Mairies : zones et supervision du territoire',
        ]}
      />
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex lg:hidden">
            <Logo size={34} />
          </Link>
          <h1>Connexion</h1>
          <p className="mb-6 mt-1 text-body text-muted-foreground">Accédez à votre espace MyKlinTown.</p>
          <LoginForm />
          <p className="mt-6 text-center text-body-sm text-muted-foreground">
            Pas encore de compte ?{' '}
            <Link href="/signup" className="font-semibold text-brand-blue hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
