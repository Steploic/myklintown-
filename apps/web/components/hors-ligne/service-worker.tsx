'use client';

import { useEffect } from 'react';
import { demander, serviceWorkerActif } from '@/lib/hors-ligne/client';

/**
 * Installe le service worker « terrain » (public/sw.js) et lui dit quel compte
 * est connecté : sur un téléphone partagé, les pages enregistrées d'un autre
 * compte sont effacées. En développement, rien : il gênerait le rechargement
 * à chaud.
 */
export function ServiceWorkerTerrain({ compteId }: { compteId: string | null }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let fini = false;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => serviceWorkerActif())
      .then((sw) => {
        if (sw && compteId && !fini) void demander(sw, { type: 'compte', id: compteId });
      })
      .catch(() => {
        // Service worker refusé (navigation privée, navigateur ancien) : l'appli reste en ligne seulement.
      });
    return () => {
      fini = true;
    };
  }, [compteId]);
  return null;
}
