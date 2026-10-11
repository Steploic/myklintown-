'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Flag, Loader2, Play, RotateCcw } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { statutTourneeAction } from '@/lib/terrain-actions';
import { estPanneReseau, MESSAGE_HORS_LIGNE } from '@/lib/format';
import { useFileTerrain } from './use-file-terrain';

const BOUTONS = {
  demarrer: { statut: 'en_cours', libelle: 'Démarrer', enCours: 'Départ…', icone: Play, classe: 'btn-primary' },
  terminer: { statut: 'terminee', libelle: 'Terminer la tournée', enCours: 'Clôture…', icone: Flag, classe: 'btn-secondary' },
  rouvrir: { statut: 'en_cours', libelle: 'Rouvrir la tournée', enCours: 'Réouverture…', icone: RotateCcw, classe: 'btn-outline' },
} as const;

/**
 * Démarrer, terminer ou rouvrir une tournée.
 *
 * Sans réseau, le bouton le dit au lieu de faire planter la page. Et on ne
 * TERMINE pas tant que des passages faits hors ligne attendent d'être
 * envoyés : la clôture marquerait « non visités » des foyers bel et bien servis.
 */
export function BoutonStatutTournee({ tourneeId, action }: { tourneeId: string; action: keyof typeof BOUTONS }) {
  const b = BOUTONS[action];
  const file = useFileTerrain(tourneeId);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const bloqueParFile = action === 'terminer' && file.enAttente.length > 0;

  const cliquer = () => {
    setMessage(null);
    if (bloqueParFile) {
      const n = file.enAttente.length;
      setMessage(
        `${n} geste${n > 1 ? 's' : ''} fait${n > 1 ? 's' : ''} hors ligne ${n > 1 ? 'attendent' : 'attend'} encore d’être envoyé${n > 1 ? 's' : ''}. ` +
          'Terminez quand le réseau est revenu : sinon ces foyers seraient comptés « non visités ».',
      );
      file.relancer();
      return;
    }
    if (!navigator.onLine) {
      setMessage(MESSAGE_HORS_LIGNE);
      return;
    }
    const fd = new FormData();
    fd.set('tournee_id', tourneeId);
    fd.set('statut', b.statut);
    startTransition(async () => {
      try {
        const r = await statutTourneeAction(fd);
        if (r.error) setMessage(r.error);
      } catch (e) {
        if (!estPanneReseau(e)) throw e;
        setMessage(MESSAGE_HORS_LIGNE);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" onClick={cliquer} disabled={enCours} className={cn(b.classe, bloqueParFile && 'opacity-60')}>
        {enCours ? <Loader2 size={16} className="animate-spin" /> : <b.icone size={16} />} {enCours ? b.enCours : b.libelle}
      </button>
      {message && (
        <p role="alert" className="flex max-w-sm items-start gap-2 rounded-md border border-terrain-relance/30 bg-terrain-relance/5 px-3 py-2 text-left text-body-sm text-terrain-relance">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {message}
        </p>
      )}
    </div>
  );
}
