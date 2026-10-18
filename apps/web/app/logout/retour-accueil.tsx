'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { oublierCentreCarte } from '@/components/map/use-centre-carte';

/** Renvoie à l'accueil après un court délai ; le lien reste là si JavaScript ne tourne pas. */
export function RetourAccueil({ delaiMs }: { delaiMs: number }) {
  const router = useRouter();
  useEffect(() => {
    // Le centre des cartes suivait le compte (ses zones, son domicile) : le
    // prochain compte ouvert dans cet onglet ne doit pas en hériter.
    oublierCentreCarte();
    const t = setTimeout(() => router.replace('/'), delaiMs);
    return () => clearTimeout(t);
  }, [router, delaiMs]);
  return (
    <p className="mt-6 text-body-sm text-muted-foreground" role="status">
      Retour à l’accueil…{' '}
      <Link href="/" replace className="font-semibold text-brand-blue hover:underline">
        y aller maintenant
      </Link>
    </p>
  );
}
