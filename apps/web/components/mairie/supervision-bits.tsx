'use client';

import dynamic from 'next/dynamic';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ZoneCarte } from './zone-map';

const ZoneMap = dynamic(() => import('./zone-map'), {
  ssr: false,
  loading: () => <div className="grid h-[380px] place-content-center rounded-xl border border-border bg-muted text-muted-foreground">Chargement de la carte…</div>,
});

export function CarteCouverture({ zones }: { zones: ZoneCarte[] }) {
  return <ZoneMap zones={zones} hauteur={380} />;
}

export function EvolutionChart({ data }: { data: { semaine: string; prevues: number; realisees: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="#E4EAE7" />
          <XAxis dataKey="semaine" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5B6673' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5B6673' }} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #DDE4E1', fontSize: 13 }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="prevues" name="Prévues" stroke="#2B6CB0" fill="#2B6CB0" fillOpacity={0.08} strokeWidth={2} />
          <Area type="monotone" dataKey="realisees" name="Réalisées" stroke="#1F8A4C" fill="#1F8A4C" fillOpacity={0.2} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
