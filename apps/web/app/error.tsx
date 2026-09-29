'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, WifiOff } from 'lucide-react';

/**
 * Page affichée quand une page ne peut pas être produite — le plus souvent une
 * coupure réseau entre le serveur et la base (connexion mobile instable).
 * En production, le message d'origine n'est pas transmis au navigateur : on
 * propose donc toujours de réessayer, sans jamais faire croire à une déconnexion.
 */
export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.warn('Page non affichée :', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <div className="card-soft w-full max-w-md p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-content-center rounded-2xl bg-terrain-relance/10 text-terrain-relance">
          <WifiOff size={26} />
        </span>
        <h1 className="mt-4 text-h1-sm">Le serveur n’a pas pu répondre</h1>
        <p className="mt-2 text-body text-muted-foreground">
          C’est souvent une coupure de réseau passagère. Vos données sont intactes : réessayez dans un instant.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => reset()} className="btn-primary">
            <RefreshCw size={16} /> Réessayer
          </button>
          <Link href="/" className="btn-outline">
            Accueil
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-small text-muted-foreground">Référence : {error.digest}</p>}
      </div>
    </div>
  );
}
