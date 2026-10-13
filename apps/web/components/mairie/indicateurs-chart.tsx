'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface PointTaux {
  semaine: string;
  paiement: number | null;
  execution: number | null;
}

/** Taux de paiement et d'exécution, semaine par semaine (en %). */
export function TauxHebdoChart({ data }: { data: PointTaux[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="#E4EAE7" />
          <XAxis dataKey="semaine" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5B6673' }} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#5B6673' }}
            tickFormatter={(v: number) => `${v} %`}
          />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? `${v} %` : '—')}
            contentStyle={{ borderRadius: 10, border: '1px solid #DDE4E1', fontSize: 13 }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="paiement" name="Paiement effectif" stroke="#2B6CB0" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="execution" name="Exécution du service" stroke="#1F8A4C" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
