'use client';

import { useState } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoPolygon } from '@/lib/types';

export const YAOUNDE: [number, number] = [3.848, 11.502];

export const pinIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#3E9A5E;border:3px solid #fff;box-shadow:0 3px 8px rgba(13,36,56,.35)"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

function Clic({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export interface ZoneAffichee {
  id: string;
  nom: string;
  couleur: string;
  contour: GeoPolygon;
}

export default function LocationPickerInner({
  valeur,
  onChange,
  zones = [],
  hauteur = 300,
}: {
  valeur: [number, number] | null;
  onChange: (lat: number, lng: number) => void;
  zones?: ZoneAffichee[];
  hauteur?: number;
}) {
  const [centre] = useState<[number, number]>(valeur ?? YAOUNDE);

  return (
    <div style={{ height: hauteur }} className="overflow-hidden rounded-lg border border-input">
      <MapContainer center={centre} zoom={valeur ? 16 : 13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {zones.map((z) => (
          <Polygon
            key={z.id}
            positions={z.contour.coordinates[0]!.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{ color: z.couleur, weight: 2, fillOpacity: 0.08 }}
          >
            <Tooltip sticky>{z.nom}</Tooltip>
          </Polygon>
        ))}
        <Clic
          onPick={(lat, lng) => {
            onChange(lat, lng);
          }}
        />
        {valeur && (
          <Marker
            position={valeur}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange(p.lat, p.lng);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
