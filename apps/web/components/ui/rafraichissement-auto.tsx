'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Relit la page côté serveur à intervalle régulier, seulement quand elle est
 * visible : progression partagée par l'équipe, positions en direct.
 */
export function RafraichissementAuto({ secondes = 20 }: { secondes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, secondes * 1000);
    return () => clearInterval(t);
  }, [router, secondes]);
  return null;
}
