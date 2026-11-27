import Link from 'next/link';
import { Landmark } from 'lucide-react';

/**
 * Compte Mairie, accès Mairie fermés (migration 20261126000027) : MyKlinTown
 * fonctionne sans intervention des Mairies. La base ne lui montre plus rien ;
 * on le lui dit plutôt que des pages vides. Son compte reste à lui.
 */
export function EspaceMairieFerme() {
  return (
    <div role="status" data-testid="espace-mairie-ferme" className="card-soft mx-auto max-w-xl space-y-3 p-6 text-center">
      <span className="mx-auto grid h-12 w-12 place-content-center rounded-full bg-brand-blue/10 text-brand-blue">
        <Landmark size={22} aria-hidden />
      </span>
      <h1 className="text-h2-sm">L’espace Mairie est fermé</h1>
      <p className="text-body-sm text-muted-foreground">
        MyKlinTown fonctionne désormais directement entre les précollecteurs et leurs abonnés, sans intervention des Mairies. Votre compte
        reste ouvert : vous pouvez le gérer ou le supprimer depuis vos paramètres.
      </p>
      <Link href="/settings" className="btn-outline inline-flex">
        Mes paramètres
      </Link>
    </div>
  );
}
