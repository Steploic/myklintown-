'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const DELAI_MAX_MS = 15_000;

/**
 * Barre de progression en haut de l'écran dès qu'on touche un lien interne
 * (retour R10) : sur réseau lent, l'utilisateur voit que sa touche est prise
 * en compte.
 *
 * Remplace les `loading.tsx` : leur zone d'attente React enveloppait la page,
 * et une touche donnée pendant l'initialisation de la page était perdue (la
 * navigation partait puis n'aboutissait jamais — vu en tests, 04/10/2026).
 * Ici rien n'enveloppe la page : la barre est un simple voisin.
 */
export function BarreNavigation() {
  const chemin = usePathname();
  const [cible, setCible] = useState<string | null>(null);
  const debut = useRef(0);

  // Changement de page : la barre disparaît.
  useEffect(() => setCible(null), [chemin]);

  useEffect(() => {
    const surClic = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const lien = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!lien || lien.target === '_blank' || lien.hasAttribute('download')) return;
      const url = new URL(lien.href, location.href);
      if (url.origin !== location.origin) return;
      const destination = url.pathname + url.search;
      if (destination === location.pathname + location.search) return; // même page (ou ancre)
      debut.current = Date.now();
      setCible(destination);
    };
    document.addEventListener('click', surClic, true);
    return () => document.removeEventListener('click', surClic, true);
  }, []);

  // Seul le paramètre d'adresse change (filtre, onglet) : on surveille l'URL.
  useEffect(() => {
    if (!cible) return;
    const t = setInterval(() => {
      if (location.pathname + location.search === cible || Date.now() - debut.current > DELAI_MAX_MS) setCible(null);
    }, 100);
    return () => clearInterval(t);
  }, [cible]);

  if (!cible) return null;
  return (
    <div role="progressbar" aria-label="Chargement de la page" className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden">
      <div className="h-full w-1/3 animate-[chargement_1.2s_ease-in-out_infinite] bg-brand-green" />
    </div>
  );
}
