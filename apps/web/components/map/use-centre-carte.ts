'use client';

import { useEffect, useState } from 'react';
import { centreCarteAction, type CentreCarte } from '@/lib/carte-actions';

export type { CentreCarte };

/** Centre par défaut d'une carte : Yaoundé (hors ligne, sans session, avant la migration 0015). */
export const YAOUNDE: [number, number] = [3.848, 11.502];
export const ZOOM_DEFAUT = 13;

/** Choix rapide sous le sélecteur de position. Centres approximatifs (centre-ville). */
export const VILLES: { nom: string; centre: [number, number]; zoom: number }[] = [
  { nom: 'Yaoundé', centre: YAOUNDE, zoom: 13 },
  { nom: 'Douala', centre: [4.05, 9.7], zoom: 12 },
];

const CLE = 'mkt.centre-carte';

function lire(): CentreCarte | null {
  try {
    const brut = window.sessionStorage.getItem(CLE);
    return brut ? (JSON.parse(brut) as CentreCarte) : null;
  } catch {
    return null;
  }
}

function ecrire(c: CentreCarte) {
  try {
    window.sessionStorage.setItem(CLE, JSON.stringify(c));
  } catch {
    // Navigation privée, stockage plein : on redemandera, voilà tout.
  }
}

/** À la déconnexion : le centre suivait le compte (ses zones, son domicile). */
export function oublierCentreCarte() {
  try {
    window.sessionStorage.removeItem(CLE);
  } catch {
    // rien à oublier
  }
}

/**
 * Centre propre au compte connecté, pour une carte VIDE (rien à cadrer).
 *
 * Seul l'état au premier affichage compte : une carte qui a déjà quelque
 * chose à montrer ne demande rien au serveur. La réponse est gardée pour la
 * session de l'onglet (une seule demande par session). Hors ligne, rien n'est
 * demandé : la carte garde son centre par défaut, le terrain n'attend jamais.
 *
 * Renvoie `null` tant qu'il n'y a pas de réponse, ou si la carte n'est plus
 * vide quand elle arrive (l'utilisateur a placé un point entre-temps).
 */
export function useCentreCarte(vide: boolean): CentreCarte | null {
  const [videAuDepart] = useState(vide);
  const [centre, setCentre] = useState<CentreCarte | null>(null);

  useEffect(() => {
    if (!videAuDepart) return;
    const enCache = lire();
    if (enCache) {
      setCentre(enCache);
      return;
    }
    if (!navigator.onLine) return;
    let monte = true;
    centreCarteAction()
      .then((c) => {
        if (!c) return;
        ecrire(c);
        if (monte) setCentre(c);
      })
      .catch(() => {});
    return () => {
      monte = false;
    };
  }, [videAuDepart]);

  return vide ? centre : null;
}
