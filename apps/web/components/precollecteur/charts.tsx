'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface PointJour {
  jour: string;
  realisees: number;
  non_realisees: number;
}

/** Collectes réalisées / non réalisées par jour. */
export function CollectesChart({ data }: { data: PointJour[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#E4EAE7" />
          <XAxis dataKey="jour" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5B6673' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5B6673' }} />
          <Tooltip
            cursor={{ fill: 'rgba(13,36,56,0.04)' }}
            contentStyle={{ borderRadius: 10, border: '1px solid #DDE4E1', fontSize: 13 }}
          />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="realisees" name="Réalisées" stackId="a" fill="#1F8A4C" radius={[0, 0, 0, 0]} />
          <Bar dataKey="non_realisees" name="Non réalisées" stackId="a" fill="#C8372D" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface PointSemaine {
  semaine: string;
  encaisse: number;
}

export function EncaissementsChart({ data }: { data: PointSemaine[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="#E4EAE7" />
          <XAxis dataKey="semaine" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5B6673' }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#5B6673' }}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: 'rgba(13,36,56,0.04)' }}
            formatter={(v: number) => [`${new Intl.NumberFormat('fr-FR').format(v)} FCFA`, 'Encaissé']}
            contentStyle={{ borderRadius: 10, border: '1px solid #DDE4E1', fontSize: 13 }}
          />
          <Bar dataKey="encaisse" name="Encaissé" fill="#2E7F8E" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
