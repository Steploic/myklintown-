import Link from 'next/link';
import { Logo } from '@myklintown/ui';
import { AuthAside } from '@/components/auth-aside';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Créer un compte' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const defaut = role === 'citoyen' ? 'citoyen' : 'precollecteur';
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[0.9fr_1.1fr]">
      <AuthAside
        titre="Rejoignez le pilote MyKlinTown."
        points={[
          'Création en 2 minutes, sans installation',
          'Précollecteurs : démonstration chargée en un clic',
          'Ménages : abonnement auprès du précollecteur de votre zone',
        ]}
      />
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-lg">
          <Link href="/" className="mb-8 inline-flex lg:hidden">
            <Logo size={34} />
          </Link>
          <h1>Créer un compte</h1>
          <p className="mb-6 mt-1 text-body text-muted-foreground">
            Déjà inscrit ?{' '}
            <Link href="/login" className="font-semibold text-brand-blue hover:underline">
              Se connecter
            </Link>
          </p>
          <SignupForm defaut={defaut} />
        </div>
      </div>
    </div>
  );
}
