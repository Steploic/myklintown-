'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { YaoundeMap } from './map-yaounde';

const YaoundeMapDynamic = dynamic(() => import('./map-yaounde').then((m) => m.YaoundeMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
      Chargement de la carte…
    </div>
  ),
});

export function YaoundeMapLoader(props: ComponentProps<typeof YaoundeMap>) {
  return <YaoundeMapDynamic {...props} />;
}
