'use client';

import { CloudOff, CloudUpload, Loader2 } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { useFileTerrain } from './use-file-terrain';

/**
 * Sur toutes les pages de l'espace terrain (hors page de tournée, qui a son
 * propre bandeau) : les gestes faits hors ligne continuent de partir, et
 * l'agent voit qu'il en reste.
 */
export function EnvoiTerrainGlobal() {
  const file = useFileTerrain();
  const n = file.enAttente.length;
  if (n === 0 && file.refus.length === 0) return null;
  return (
    <p
      role="status"
      className={cn(
        'mb-4 flex flex-wrap items-center gap-2 rounded-lg px-4 py-2.5 text-body-sm font-medium',
        file.refus.length > 0 || !file.enLigne ? 'bg-terrain-relance/10 text-terrain-relance' : 'bg-brand-teal/10 text-brand-teal',
      )}
    >
      {!file.enLigne ? <CloudOff size={16} /> : file.envoiEnCours ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
      <span>
        {n > 0 && `${n} geste${n > 1 ? 's' : ''} de tournée fait${n > 1 ? 's' : ''} hors ligne ${file.enLigne ? 'en cours d’envoi' : 'en attente du réseau'}.`}
        {file.refus.length > 0 &&
          ` ${file.refus.length} refusé${file.refus.length > 1 ? 's' : ''} par le serveur : ouvrez la tournée pour voir pourquoi.`}
      </span>
    </p>
  );
}
