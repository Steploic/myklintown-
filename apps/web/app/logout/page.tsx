import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Logo } from '@myklintown/ui';

export default function LogoutPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-brand-gradient-soft px-6">
      <div className="card-soft w-full max-w-md p-8 text-center">
        <div className="inline-flex">
          <Logo size={48} />
        </div>
        <div className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
          <LogOut size={22} />
        </div>
        <h1 className="mt-4">À très bientôt 👋</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Vous avez été déconnecté en toute sécurité. Vos données restent protégées dans
          notre infrastructure.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/login" className="btn-primary">Se reconnecter</Link>
          <Link href="/" className="btn-outline">Retour à l'accueil</Link>
        </div>
      </div>
    </div>
  );
}
