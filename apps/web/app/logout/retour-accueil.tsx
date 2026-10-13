'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** Renvoie à l'accueil après un court délai ; le lien reste là si JavaScript ne tourne pas. */
export function RetourAccueil({ delaiMs }: { delaiMs: number }) {
  const router = useRouter();
  useEffect(() => {
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
