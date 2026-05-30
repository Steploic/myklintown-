'use client';

import { useActionState, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MapPin, Plus, Send } from 'lucide-react';
import { createIncidentAction, type IncidentState } from '@/lib/incident-actions';

const TYPES = [
  { value: 'bac_detruit', label: 'Bac détruit' },
  { value: 'bac_inaccessible', label: 'Bac inaccessible' },
  { value: 'bac_introuvable', label: 'Bac introuvable' },
  { value: 'camion_panne', label: 'Camion en panne' },
  { value: 'accident', label: 'Accident' },
  { value: 'autre', label: 'Autre' },
];

const INITIAL: IncidentState = {};

export function CollecteurIncidentForm() {
  const [state, formAction, pending] = useActionState(createIncidentAction, INITIAL);
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
      <h2 className="m-0 flex items-center gap-2">
        <Plus size={18} className="text-brand-blue" /> Nouveau signalement
      </h2>

      {state.success && (
        <div className="flex items-start gap-2 rounded-md border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-body-sm text-brand-green">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>Incident transmis au superviseur.</span>
        </div>
      )}
      {state.error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="type-incident" className="text-body-sm font-semibold">
          Type
        </label>
        <select
          id="type-incident"
          name="type"
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="desc-incident" className="text-body-sm font-semibold">
          Description
        </label>
        <textarea
          id="desc-incident"
          name="description"
          rows={3}
          placeholder="Décrivez la situation observée..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <span className="grid h-9 w-9 shrink-0 place-content-center rounded-md bg-brand-blue/10 text-brand-blue">
          {geoState === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
        </span>
        <div className="flex-1 text-body-sm">
          {geoState === 'ok' && coords ? (
            <>
              <p className="font-semibold">Position auto-détectée</p>
              <p className="text-small text-muted-foreground">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            </>
          ) : geoState === 'loading' ? (
            <p className="text-muted-foreground">Détection de la position…</p>
          ) : (
            <>
              <p className="font-semibold">Position non disponible</p>
              <p className="text-small text-muted-foreground">
                L'incident sera transmis sans coordonnées.
              </p>
            </>
          )}
        </div>
      </div>

      <input type="hidden" name="lat" value={coords?.lat ?? ''} readOnly />
      <input type="hidden" name="lng" value={coords?.lng ?? ''} readOnly />

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Envoi…
            </>
          ) : (
            <>
              <Send size={16} /> Transmettre
            </>
          )}
        </button>
      </div>
    </form>
  );
}
