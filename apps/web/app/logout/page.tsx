import { LogOut } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { RetourAccueil } from './retour-accueil';

export const metadata = { title: 'Déconnexion' };

/** Après la déconnexion : un message, puis l'accueil tout seul (retour d'équipe). */
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
        <p className="mt-1 text-body text-muted-foreground">Vous avez été déconnecté en toute sécurité.</p>
        <RetourAccueil delaiMs={2500} />
      </div>
    </div>
  );
}
