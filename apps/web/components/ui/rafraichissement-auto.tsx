'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { serveurJoignable } from '@/lib/hors-ligne/client';

/**
 * Relit la page côté serveur à intervalle régulier, seulement quand elle est
 * visible : progression partagée par l'équipe, positions en direct.
 *
 * Seulement si le serveur répond : quand une relecture échoue, Next.js
 * recharge toute la page. Sans réseau, une tournée en cours retombait alors
 * sur la page d'erreur du navigateur (ou, avec le service worker, sur son
 * enregistrement) au bout de 20 s, caméra fermée.
 */
export function RafraichissementAuto({ secondes = 20 }: { secondes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let enCours = false;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || enCours) return;
      enCours = true;
      try {
        if (await serveurJoignable()) router.refresh();
      } finally {
        enCours = false;
      }
    }, secondes * 1000);
    return () => clearInterval(t);
  }, [router, secondes]);
  return null;
}
