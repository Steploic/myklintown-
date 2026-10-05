'use client';

import { useEffect, useState } from 'react';
import { MapPin, MapPinOff } from 'lucide-react';
import { envoyerPositionAction } from '@/lib/terrain-actions';

const INTERVALLE_MS = 30_000;

type Etat = 'attente' | 'ok' | 'bloque' | 'indisponible' | 'erreur';

/**
 * Pendant une tournée en cours, la position du téléphone part toutes les
 * 30 s vers le gérant (carte en direct). Limite du web, dite clairement :
 * rien ne part si l'application est fermée ou l'écran éteint.
 */
export function PositionLive({ tourneeId }: { tourneeId: string }) {
  const [etat, setEtat] = useState<Etat>('attente');
  const [dernier, setDernier] = useState<Date | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setEtat('indisponible');
      return;
    }
    // Relevé à intervalle fixe (et non au mouvement) : un tricycle à l'arrêt
    // reste visible, avec l'heure de son dernier signe de vie.
    const envoyer = () =>
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const r = await envoyerPositionAction(tourneeId, pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy));
          if (r.error) {
            setEtat('erreur');
          } else {
            setEtat('ok');
            setDernier(new Date());
          }
        },
        (err) => setEtat(err.code === 1 ? 'bloque' : 'indisponible'),
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 },
      );
    envoyer();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') envoyer();
    }, INTERVALLE_MS);
    return () => clearInterval(t);
  }, [tourneeId]);

  const probleme = etat === 'bloque' || etat === 'indisponible' || etat === 'erreur';
  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-body-sm ${
        probleme ? 'border-terrain-relance/30 bg-terrain-relance/5 text-terrain-relance' : 'border-brand-teal/25 bg-brand-teal/5 text-brand-teal'
      }`}
    >
      {probleme ? <MapPinOff size={16} className="mt-0.5 shrink-0" /> : <MapPin size={16} className="mt-0.5 shrink-0" />}
      <span>
        {etat === 'attente' && 'Position partagée avec le gérant pendant la tournée…'}
        {etat === 'ok' && (
          <>
            Position partagée avec le gérant pendant la tournée · dernier envoi{' '}
            {dernier?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Gardez l’application ouverte.
          </>
        )}
        {etat === 'bloque' &&
          'Position bloquée : autorisez la localisation pour ce site (icône à gauche de l’adresse, puis « Autorisations »). Le gérant ne voit pas où vous êtes.'}
        {etat === 'indisponible' && 'Position indisponible : activez le GPS du téléphone. Le gérant ne voit pas où vous êtes.'}
        {etat === 'erreur' && 'La position n’a pas pu être envoyée (réseau ?). Nouvel essai dans 30 s.'}
      </span>
    </p>
  );
}
