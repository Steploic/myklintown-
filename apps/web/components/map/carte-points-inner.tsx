'use client';

import { useEffect } from 'react';
import { MapContainer, Marker, Polygon, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoPolygon } from '@/lib/types';

export type Ton = 'ok' | 'relance' | 'stop' | 'neutre' | 'info' | 'direct';
export type Picto = 'maison' | 'collecte' | 'a_collecter' | 'non_collecte' | 'demande' | 'tricycle';

export interface PointCarte {
  id: string;
  lat: number;
  lng: number;
  ton: Ton;
  picto: Picto;
  titre: string;
  lignes?: string[];
  lien?: { href: string; label: string };
}

export interface ZoneCarte {
  id: string;
  nom: string;
  contour: GeoPolygon;
  couleur?: string;
}

const COULEURS: Record<Ton, string> = {
  ok: '#1F8A4C',
  relance: '#B86E00',
  stop: '#C8372D',
  neutre: '#5B6673',
  info: '#2B6CB0',
  direct: '#2E7F8E',
};

// Pictogrammes (tracés type Lucide) dessinés en blanc dans le repère.
const SVG: Record<Picto, string> = {
  maison: '<path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>',
  collecte: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  a_collecter: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>',
  non_collecte: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  demande: '<path d="M12 7v6M12 17h.01" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  tricycle: '<circle cx="6" cy="16" r="3" fill="none" stroke="#fff" stroke-width="2"/><circle cx="18" cy="16" r="3" fill="none" stroke="#fff" stroke-width="2"/><path d="M6 16l4-7h5l3 7M8 6h3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

const cacheIcones = new Map<string, L.DivIcon>();
function icone(ton: Ton, picto: Picto): L.DivIcon {
  const cle = `${ton}-${picto}`;
  const existant = cacheIcones.get(cle);
  if (existant) return existant;
  const ic = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:34px;height:42px">
      <svg width="34" height="42" viewBox="0 0 34 42" style="position:absolute;inset:0;filter:drop-shadow(0 2px 3px rgba(13,36,56,.35))">
        <path d="M17 41C17 41 32 25.5 32 16A15 15 0 1 0 2 16c0 9.5 15 25 15 25z" fill="${COULEURS[ton]}" stroke="#fff" stroke-width="2"/>
      </svg>
      <svg width="18" height="18" viewBox="0 0 24 24" style="position:absolute;left:8px;top:7px">${SVG[picto]}</svg>
    </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 41],
    popupAnchor: [0, -38],
  });
  cacheIcones.set(cle, ic);
  return ic;
}

function Cadrage({ points, zones }: { points: PointCarte[]; zones: ZoneCarte[] }) {
  const map = useMap();
  useEffect(() => {
    const b = L.latLngBounds([]);
    points.forEach((p) => b.extend([p.lat, p.lng]));
    if (!points.length) zones.forEach((z) => z.contour.coordinates[0]!.forEach(([lng, lat]) => b.extend([lat, lng])));
    if (b.isValid()) map.fitBounds(b, { padding: [36, 36], maxZoom: 16 });
    // Cadrage au premier affichage et quand la liste change de taille.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, zones.length]);
  return null;
}

export default function CartePointsInner({
  points,
  zones = [],
  hauteur = 480,
}: {
  points: PointCarte[];
  zones?: ZoneCarte[];
  hauteur?: number;
}) {
  return (
    <div style={{ height: hauteur }} className="overflow-hidden rounded-xl border border-border">
      <MapContainer center={[3.848, 11.502]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Cadrage points={points} zones={zones} />
        {zones.map((z) => (
          <Polygon
            key={z.id}
            positions={z.contour.coordinates[0]!.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{ color: z.couleur ?? '#2E7F8E', weight: 2, fillOpacity: 0.06, dashArray: '4 6' }}
          >
            <Tooltip sticky>{z.nom}</Tooltip>
          </Polygon>
        ))}
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icone(p.ton, p.picto)}>
            <Popup>
              <div style={{ fontFamily: 'var(--font-barlow), sans-serif', minWidth: 160 }}>
                <p style={{ fontWeight: 700, margin: 0 }}>{p.titre}</p>
                {p.lignes?.map((l) => (
                  <p key={l} style={{ margin: '2px 0', color: '#5B6673', fontSize: 12 }}>{l}</p>
                ))}
                <p style={{ margin: '6px 0 0', display: 'flex', gap: 10, fontSize: 13 }}>
                  {p.lien && <a href={p.lien.href}>{p.lien.label}</a>}
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                    Itinéraire
                  </a>
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
