'use client';

import { useEffect, useId, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const YAOUNDE_III_CENTER: [number, number] = [3.8324, 11.5067];

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
// Esri World Imagery — service de tuiles public, sans clé API requise.
const SAT_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT_ATTR =
  'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP';

export interface MapPoint {
  id: string;
  position: [number, number];
  label: string;
  statut: 'collecte' | 'attente' | 'incident' | 'camion' | 'bac_plein';
}

/** Emoji + couleur de fond par type d'acteur / situation */
const STATUT_ICON: Record<MapPoint['statut'], { emoji: string; bg: string }> = {
  collecte:  { emoji: '🏠', bg: '#4FA36A' }, // ménage collecté – vert
  attente:   { emoji: '🏠', bg: '#EF4444' }, // ménage en attente – rouge
  camion:    { emoji: '🚛', bg: '#1B3F63' }, // camion collecteur – bleu marine
  bac_plein: { emoji: '🗑️', bg: '#EF4444' }, // bac débordant – rouge
  incident:  { emoji: '⚠️', bg: '#F59E0B' }, // signalement – ambre
};

/** Crée un DivIcon Leaflet : emoji centré dans un cercle coloré */
function createActorIcon(statut: MapPoint['statut']): L.DivIcon {
  const { emoji, bg } = STATUT_ICON[statut];
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.9);">${emoji}</div>`,
    iconSize:    [36, 36],
    iconAnchor:  [18, 18],
    popupAnchor: [0, -22],
  });
}

interface YaoundeMapProps {
  points?: MapPoint[];
  zoom?: number;
  height?: string;
}

export function YaoundeMap({ points = [], zoom = 13, height = '500px' }: YaoundeMapProps) {
  // useId garantit un identifiant stable SSR/CSR — évite "Map container already initialized"
  // en StrictMode où le composant monte deux fois.
  const containerId = useId();
  // Différer le rendu d'un tick après le mount client résout les conflits HMR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground"
        style={{ height }}
      >
        Chargement de la carte…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-soft" style={{ height }}>
      <MapContainer
        key={containerId}
        center={YAOUNDE_III_CENTER}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        {/* Contrôle de couche : Plan OpenStreetMap / Vue Satellite Esri */}
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Plan">
            <TileLayer attribution={OSM_ATTR} url={OSM_URL} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer attribution={SAT_ATTR} url={SAT_URL} />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* Marqueurs différenciés par type d'acteur (ménage, camion, bac, incident) */}
        {points.map((p) => (
          <Marker key={p.id} position={p.position} icon={createActorIcon(p.statut)}>
            <Popup>
              <div className="font-sans">
                <p className="font-semibold">{p.label}</p>
                <p className="text-xs uppercase tracking-wider text-gray-500">
                  {p.statut.replace('_', ' ')}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
