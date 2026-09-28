'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoPolygon } from '@/lib/types';

export interface ZoneCarte {
  id: string;
  nom: string;
  couleur: string;
  contour: GeoPolygon;
  attribuee: boolean;
  etiquette?: string;
}

const CENTRE: [number, number] = [3.848, 11.502];

function Clics({ actif, onPoint }: { actif: boolean; onPoint: (p: [number, number]) => void }) {
  useMapEvents({
    click: (e) => {
      if (actif) onPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function Cadrage({ zones }: { zones: ZoneCarte[] }) {
  const map = useMap();
  useEffect(() => {
    if (!zones.length) return;
    const b = L.latLngBounds([]);
    zones.forEach((z) => z.contour.coordinates[0]!.forEach(([lng, lat]) => b.extend([lat, lng])));
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
    // Cadrage initial seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function ZoneMap({
  zones,
  selection,
  onSelect,
  dessin,
  points,
  onPoint,
  hauteur = 560,
}: {
  zones: ZoneCarte[];
  selection?: string | null;
  onSelect?: (id: string) => void;
  dessin?: boolean;
  points?: [number, number][];
  onPoint?: (p: [number, number]) => void;
  hauteur?: number;
}) {
  return (
    <div style={{ height: hauteur }} className={`overflow-hidden rounded-xl border border-border ${dessin ? 'cursor-crosshair [&_.leaflet-container]:cursor-crosshair' : ''}`}>
      <MapContainer center={CENTRE} zoom={13} style={{ height: '100%', width: '100%' }}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Plan">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>
        </LayersControl>
        <Cadrage zones={zones} />
        <Clics actif={!!dessin} onPoint={(p) => onPoint?.(p)} />
        {zones.map((z) => {
          const sel = z.id === selection;
          return (
            <Polygon
              key={z.id + (sel ? '-sel' : '')}
              positions={z.contour.coordinates[0]!.map(([lng, lat]) => [lat, lng] as [number, number])}
              pathOptions={{
                color: z.attribuee ? z.couleur : '#8A96A3',
                weight: sel ? 4 : 2,
                dashArray: z.attribuee ? undefined : '6 6',
                fillColor: z.attribuee ? z.couleur : '#8A96A3',
                fillOpacity: sel ? 0.35 : z.attribuee ? 0.2 : 0.08,
              }}
              eventHandlers={{
                click: (e) => {
                  if (dessin) return;
                  L.DomEvent.stopPropagation(e);
                  onSelect?.(z.id);
                },
              }}
            >
              <Tooltip sticky>
                <strong>{z.nom}</strong>
                <br />
                {z.etiquette ?? (z.attribuee ? 'Attribuée' : 'Non attribuée')}
              </Tooltip>
            </Polygon>
          );
        })}
        {dessin && points && points.length > 0 && (
          <>
            {points.length >= 3 ? (
              <Polygon positions={points} pathOptions={{ color: '#0D2438', weight: 3, fillColor: '#79C267', fillOpacity: 0.25 }} />
            ) : (
              <Polyline positions={points} pathOptions={{ color: '#0D2438', weight: 3 }} />
            )}
            {points.map((p, i) => (
              <CircleMarker key={i} center={p} radius={i === 0 ? 7 : 5} pathOptions={{ color: '#fff', weight: 2, fillColor: i === 0 ? '#3E9A5E' : '#0D2438', fillOpacity: 1 }} />
            ))}
          </>
        )}
      </MapContainer>
    </div>
  );
}
