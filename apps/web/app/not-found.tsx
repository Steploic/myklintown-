import Link from 'next/link';
import { Home, LogIn } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { PixelDots } from '@/components/ui/blocks';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="card-soft relative w-full max-w-lg p-8 text-center">
        <PixelDots className="absolute left-6 top-6 h-10 w-10" />
        <div className="mx-auto inline-flex">
          <Logo size={40} />
        </div>
        <p className="num mt-6 text-[3rem] font-bold leading-none text-brand-green">404</p>
        <h1 className="mt-2">Page introuvable</h1>
        <p className="mt-2 text-body text-muted-foreground">
          L’adresse est peut-être mal saisie, ou la page a été déplacée.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            <Home size={16} /> Retour à l’accueil
          </Link>
          <Link href="/login" className="btn-outline">
            <LogIn size={16} /> Mon espace
          </Link>
        </div>
      </div>
    </div>
  );
}
