'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { marquerCollecteAction, scannerClientAction } from '@/lib/terrain-actions';
import { abonner, envoyer, operations, operationsServeur, type Executeurs, type OperationTerrain } from '@/lib/hors-ligne/file-terrain';

const RELANCE_MS = 20_000;

/** Les gestes en attente sont rejoués par les mêmes actions, avec l'heure du terrain. */
const EXECUTEURS: Executeurs = {
  pointage: async (op) => {
    const r = await marquerCollecteAction({ collecteId: op.collecteId, statut: op.statut, motif: op.motif, horodatage: op.horodatage });
    return { error: r.error, reseau: r.reseau };
  },
  scan: async (op) => {
    const r = await scannerClientAction(op.tourneeId, op.code, op.horodatage);
    // Ménage à ne pas servir (blocage au passage) : la base a noté « Refus / impayé ».
    // Montré à l'agent comme un refus ; la file continue.
    if (r.refuse) return { error: `Non servi : abonnement impayé, expiré ou suspendu (${r.client?.nom ?? op.code})` };
    return { error: r.error, reseau: r.reseau };
  },
};

export interface EtatFileTerrain {
  /** Gestes pas encore envoyés (hors refus). */
  enAttente: OperationTerrain[];
  /** Gestes refusés par le serveur, à montrer à l'agent. */
  refus: OperationTerrain[];
  enLigne: boolean;
  envoiEnCours: boolean;
  relancer: () => void;
}

/**
 * État de la file des gestes faits hors ligne (pour une tournée, ou toutes)
 * et envoi automatique : au retour du réseau, au retour sur l'application,
 * et toutes les 20 s tant qu'il reste quelque chose.
 */
export function useFileTerrain(tourneeId?: string): EtatFileTerrain {
  const toutes = useSyncExternalStore(abonner, operations, operationsServeur);
  const [enLigne, setEnLigne] = useState(true);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const relancer = useCallback(() => {
    if (!navigator.onLine || !operations().some((o) => !o.refus)) return;
    setEnvoiEnCours(true);
    void envoyer(EXECUTEURS).finally(() => setEnvoiEnCours(false));
  }, []);

  useEffect(() => {
    setEnLigne(navigator.onLine);
    const enLigneMaintenant = () => {
      setEnLigne(true);
      relancer();
    };
    const horsLigne = () => setEnLigne(false);
    const visible = () => {
      if (document.visibilityState === 'visible') relancer();
    };
    window.addEventListener('online', enLigneMaintenant);
    window.addEventListener('offline', horsLigne);
    document.addEventListener('visibilitychange', visible);
    const t = setInterval(relancer, RELANCE_MS);
    relancer();
    return () => {
      window.removeEventListener('online', enLigneMaintenant);
      window.removeEventListener('offline', horsLigne);
      document.removeEventListener('visibilitychange', visible);
      clearInterval(t);
    };
  }, [relancer]);

  const miennes = tourneeId ? toutes.filter((o) => o.tourneeId === tourneeId) : [...toutes];
  return {
    enAttente: miennes.filter((o) => !o.refus),
    refus: miennes.filter((o) => o.refus),
    enLigne,
    envoiEnCours,
    relancer,
  };
}
