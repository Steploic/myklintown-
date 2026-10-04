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
  const [gps, setGps] = useState<'idle' | 'attente' | 'bloque' | 'indisponible' | 'delai' | 'absent'>('idle');
  const [cle, setCle] = useState(0);

  const choisir = (lat: number, lng: number, recentrer = false) => {
    setPos([lat, lng]);
    onChange?.(lat, lng);
    if (recentrer) setCle((k) => k + 1);
  };

  const maPosition = () => {
    if (!navigator.geolocation) return setGps('absent');
    setGps('attente');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps('idle');
        choisir(p.coords.latitude, p.coords.longitude, true);
      },
      // Le navigateur ne redemande JAMAIS une autorisation déjà refusée : il faut
      // dire précisément quoi faire selon la cause (retour de test de Pie).
      (e) => setGps(e.code === 1 ? 'bloque' : e.code === 3 ? 'delai' : 'indisponible'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
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
      {gps !== 'idle' && gps !== 'attente' && (
        <div role="status" className="rounded-md border border-terrain-relance/30 bg-terrain-relance/5 px-3 py-2 text-small text-terrain-relance">
          {gps === 'bloque' && (
            <>
              <strong>La localisation est bloquée pour ce site.</strong> Touchez le cadenas (ou ⓘ) à gauche de
              l’adresse, puis Autorisations → Position → Autoriser, et touchez à nouveau « Ma position ».
            </>
          )}
          {gps === 'indisponible' && (
            <>
              <strong>Le téléphone ne trouve pas sa position.</strong> Activez la localisation (GPS) dans les
              réglages rapides du téléphone, puis réessayez.
            </>
          )}
          {gps === 'delai' && (
            <>
              <strong>La position met trop de temps à arriver.</strong> Réessayez près d’une fenêtre ou à
              l’extérieur.
            </>
          )}
          {gps === 'absent' && <strong>Ce navigateur ne sait pas localiser l’appareil.</strong>}{' '}
          Vous pouvez aussi toucher la carte pour placer le domicile à la main.
        </div>
      )}
      <Carte key={cle} valeur={pos} onChange={(lat, lng) => choisir(lat, lng)} zones={zones} hauteur={hauteur} />
    </div>
  );
}
