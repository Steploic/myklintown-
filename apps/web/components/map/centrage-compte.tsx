'use client';

import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { useCentreCarte } from './use-centre-carte';

/**
 * À placer dans un <MapContainer> : une carte VIDE au premier affichage se
 * recentre sur le territoire du compte (ses zones, sa commune, son domicile…)
 * au lieu de rester sur Yaoundé — un précollecteur de Douala voit Douala.
 * Une seule fois, et jamais si l'utilisateur a déjà déplacé la carte ou si
 * elle a reçu entre-temps quelque chose à montrer.
 */
export function CentrageCompte({ vide, zoomMax = 15 }: { vide: boolean; zoomMax?: number }) {
  const map = useMap();
  const centre = useCentreCarte(vide);
  const fait = useRef(false);
  useMapEvents({
    dragstart: () => {
      fait.current = true;
    },
  });

  useEffect(() => {
    if (!centre || fait.current) return;
    // Une image plus tard, taille remesurée : juste après sa création, la
    // carte peut encore se croire large de 0 px, et le cadrage d'une emprise
    // partirait alors au zoom maximal.
    const image = requestAnimationFrame(() => {
      if (fait.current) return;
      fait.current = true;
      map.invalidateSize({ pan: false });
      if (centre.emprise) map.fitBounds(centre.emprise, { padding: [30, 30], maxZoom: zoomMax });
      else map.setView(centre.centre, centre.zoom ?? map.getZoom());
    });
    return () => cancelAnimationFrame(image);
  }, [centre, map, zoomMax]);

  return null;
}
