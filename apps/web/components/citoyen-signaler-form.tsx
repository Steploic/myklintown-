'use client';

import { useActionState, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Loader2, MapPin, Send, Trash2 } from 'lucide-react';
import { createSignalementAction, type SignalementState } from '@/lib/signalement-actions';

const TYPES = [
  { id: 'bac_plein', label: 'Bac débordant', desc: 'Bac plein, déchets qui débordent ou pas vidé à temps', icon: Trash2 },
  { id: 'depot_sauvage', label: 'Dépôt sauvage', desc: "Tas d'ordures hors bac, sur la voie publique", icon: AlertTriangle },
  { id: 'retard_collecte', label: 'Retard collecte', desc: "Le passage prévu n'a pas eu lieu", icon: Clock },
  { id: 'incident_collecteur', label: 'Incident collecteur', desc: 'Comportement inapproprié, bac endommagé', icon: AlertTriangle },
];

const INITIAL: SignalementState = {};

export function CitoyenSignalerForm() {
  const [state, formAction, pending] = useActionState(createSignalementAction, INITIAL);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoState('error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState('ok');
      },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  return (
    <form action={formAction} className="card-soft space-y-5 p-6 lg:col-span-2">
      {state.success && (
        <div className="flex items-start gap-2 rounded-md border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-body-sm text-brand-green">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>Signalement transmis au Service Hygiène. Vous serez notifié à sa résolution.</span>
        </div>
      )}
      {state.error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-body-sm font-semibold">1. Type de problème</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors has-[:checked]:border-brand-green has-[:checked]:bg-brand-green/5"
              >
                <input type="radio" name="type" value={t.id} required className="sr-only" />
                <span className="grid h-9 w-9 place-content-center rounded-md bg-warning/10 text-warning">
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block text-body-sm font-semibold">{t.label}</span>
                  <span className="block text-small text-muted-foreground">{t.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="description" className="text-body-sm font-semibold">
          2. Description (optionnel)
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Précisez le contexte, l'urgence, ou tout détail utile pour l'équipe..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm placeholder:text-muted-foreground focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />
      </div>

      <div className="space-y-2">
        <span className="text-body-sm font-semibold">3. Localisation</span>
        <div className="flex items-center gap-3 rounded-lg border border-border p-4">
          <span className="grid h-10 w-10 place-content-center rounded-md bg-brand-blue/10 text-brand-blue">
            {geoState === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
          </span>
          <div className="flex-1">
            {geoState === 'ok' && coords ? (
              <>
                <p className="text-body-sm font-semibold">Position détectée</p>
                <p className="text-small text-muted-foreground">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              </>
            ) : geoState === 'loading' ? (
              <p className="text-body-sm text-muted-foreground">Détection de votre position…</p>
            ) : (
              <p className="text-body-sm text-danger">
                Position non disponible — autorisez la géolocalisation dans le navigateur.
              </p>
            )}
          </div>
        </div>
      </div>

      <input type="hidden" name="lat" value={coords?.lat ?? ''} readOnly />
      <input type="hidden" name="lng" value={coords?.lng ?? ''} readOnly />

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <button type="submit" disabled={pending || !coords} className="btn-primary">
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Envoi…
            </>
          ) : (
            <>
              <Send size={16} /> Envoyer le signalement
            </>
          )}
        </button>
      </div>
    </form>
  );
}
