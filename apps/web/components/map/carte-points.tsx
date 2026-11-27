'use client';

import dynamic from 'next/dynamic';
import { Component, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@myklintown/ui';
import type { PointCarte, Ton, ZoneCarte } from './carte-points-inner';

export type { PointCarte, Ton, ZoneCarte };

const Carte = dynamic(() => import('./carte-points-inner'), {
  ssr: false,
  loading: () => (
    <div className="grid h-[480px] place-content-center rounded-xl border border-border bg-muted text-body-sm text-muted-foreground">
      Chargement de la carte…
    </div>
  ),
});

/**
 * La carte se charge à part (Leaflet). Sans réseau, si ce fichier n'est pas
 * sur le téléphone, son échec ne doit pas emporter toute la page (la tournée,
 * ses scans, ses pointages) : la carte seule le dit.
 */
class CarteOuRien extends Component<{ hauteur?: number; children: ReactNode }, { echec: boolean }> {
  override state = { echec: false };
  static getDerivedStateFromError() {
    return { echec: true };
  }
  override render() {
    if (!this.state.echec) return this.props.children;
    return (
      <div
        className="grid place-content-center rounded-xl border border-border bg-muted px-4 text-center text-body-sm text-muted-foreground"
        style={{ height: this.props.hauteur ?? 480 }}
      >
        Carte indisponible sans réseau : elle reviendra avec le réseau.
      </div>
    );
  }
}

const PASTILLE: Record<Ton, string> = {
  ok: 'bg-terrain-ok',
  relance: 'bg-terrain-relance',
  stop: 'bg-terrain-stop',
  neutre: 'bg-muted-foreground',
  info: 'bg-brand-blue-pixel',
  direct: 'bg-brand-teal',
};

/**
 * Carte de repères avec légende-filtre : toucher une entrée de la légende
 * masque ou affiche cette catégorie (retours R7 et Pie : carte + légende + filtres).
 */
export function CartePoints({
  points,
  zones,
  legende,
  hauteur,
  sansPosition,
}: {
  points: PointCarte[];
  zones?: ZoneCarte[];
  legende: { ton: Ton; label: string }[];
  hauteur?: number;
  /** Nombre d'éléments sans position GPS (non affichables). */
  sansPosition?: number;
}) {
  const [masques, setMasques] = useState<Set<Ton>>(new Set());
  const visibles = useMemo(() => points.filter((p) => !masques.has(p.ton)), [points, masques]);
  const compte = (t: Ton) => points.filter((p) => p.ton === t).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer la carte">
        {legende.map(({ ton, label }) => {
          const actif = !masques.has(ton);
          return (
            <button
              key={ton}
              type="button"
              aria-pressed={actif}
              onClick={() =>
                setMasques((m) => {
                  const n = new Set(m);
                  if (n.has(ton)) n.delete(ton);
                  else n.add(ton);
                  return n;
                })
              }
              className={cn(
                'flex min-h-[36px] items-center gap-2 rounded-full border px-3 text-body-sm font-semibold transition-opacity',
                actif ? 'border-border bg-surface text-brand-ink' : 'border-dashed border-border bg-transparent text-muted-foreground opacity-60',
              )}
            >
              <span className={cn('h-3 w-3 rounded-full', PASTILLE[ton])} />
              {label}
              <span className="num text-small text-muted-foreground">{compte(ton)}</span>
            </button>
          );
        })}
        {!!sansPosition && (
          <span className="text-small text-muted-foreground">
            {sansPosition} sans position GPS (non affiché{sansPosition > 1 ? 's' : ''})
          </span>
        )}
      </div>
      <CarteOuRien hauteur={hauteur}>
        <Carte points={visibles} zones={zones} hauteur={hauteur} />
      </CarteOuRien>
    </div>
  );
}
