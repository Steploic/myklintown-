'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import type { ZoneAffichee } from './location-picker-inner';

const Carte = dynamic(() => import('./location-picker-inner'), {
  ssr: false,
  loading: () => (
    <div className="grid h-[300px] place-content-center rounded-lg border border-input bg-muted text-body-sm text-muted-foreground">
      Chargement de la carte…
    </div>
  ),
});

/**
 * Choix d'un emplacement : clic sur la carte, marqueur déplaçable, ou position GPS
 * du téléphone. Écrit `lat` et `lng` dans des champs cachés du formulaire parent.
 */
export function LocationPicker({
  defaut,
  zones,
  onChange,
  hauteur,
}: {
  defaut?: [number, number] | null;
  zones?: ZoneAffichee[];
  onChange?: (lat: number, lng: number) => void;
  hauteur?: number;
}) {
  const [pos, setPos] = useState<[number, number] | null>(defaut ?? null);
  const [gps, setGps] = useState<'idle' | 'attente' | 'refus'>('idle');
  const [cle, setCle] = useState(0);

  const choisir = (lat: number, lng: number, recentrer = false) => {
    setPos([lat, lng]);
    onChange?.(lat, lng);
    if (recentrer) setCle((k) => k + 1);
  };

  const maPosition = () => {
    if (!navigator.geolocation) return setGps('refus');
    setGps('attente');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps('idle');
        choisir(p.coords.latitude, p.coords.longitude, true);
      },
      () => setGps('refus'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name="lat" value={pos ? pos[0].toFixed(6) : ''} />
      <input type="hidden" name="lng" value={pos ? pos[1].toFixed(6) : ''} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
          <MapPin size={16} className="text-brand-green" />
          {pos ? `Position : ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}` : 'Touchez la carte pour placer le domicile.'}
        </p>
        <button type="button" onClick={maPosition} className="btn-outline min-h-[38px] py-1.5">
          {gps === 'attente' ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />}
          Ma position
        </button>
      </div>
      {gps === 'refus' && (
        <p className="text-small text-terrain-relance">
          Position indisponible : autorisez la localisation, ou placez le point à la main sur la carte.
        </p>
      )}
      <Carte key={cle} valeur={pos} onChange={(lat, lng) => choisir(lat, lng)} zones={zones} hauteur={hauteur} />
    </div>
  );
}
