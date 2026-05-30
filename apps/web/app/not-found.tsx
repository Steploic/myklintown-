import Link from 'next/link';
import { Hammer, Home } from 'lucide-react';
import { Logo } from '@myklintown/ui';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-brand-gradient-soft px-6">
      <div className="card-soft w-full max-w-lg p-8 text-center">
        <div className="mx-auto inline-flex">
          <Logo size={48} />
        </div>
        <div className="mt-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
          <Hammer size={28} />
        </div>
        <h1 className="mt-4">Cette page n'est pas encore prête</h1>
        <p className="mt-2 text-body text-muted-foreground">
          La fonctionnalité que vous demandez fait partie des écrans en cours de développement
          du MVP. Elle sera disponible dans une prochaine itération.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            <Home size={16} /> Retour à l'accueil
          </Link>
          <Link href="/dashboard" className="btn-outline">
            Voir le Dashboard
          </Link>
        </div>
        <p className="mt-6 text-small text-muted-foreground">
          Code erreur : 404 · Si vous pensez qu'il s'agit d'une erreur, contactez{' '}
          <a href="mailto:dev@myklintown.cm" className="text-brand-blue hover:underline">
            dev@myklintown.cm
          </a>
        </p>
      </div>
    </div>
  );
}
