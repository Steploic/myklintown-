'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createClient } from '@myklintown/db/client';
import { marquerCollecteAction, scannerClientAction } from '@/lib/terrain-actions';
import { abonner, definirCompte, envoyer, operations, operationsServeur, type Executeurs, type OperationTerrain } from '@/lib/hors-ligne/file-terrain';

const RELANCE_MS = 20_000;

/**
 * Compte connecté sur ce téléphone, lu sur l'appareil. La file ne montre et
 * n'envoie que les gestes de ce compte : un téléphone partagé ne rejoue pas
 * les gestes d'un agent sous le nom d'un autre.
 */
const CLE_COMPTE = 'mkt:file-terrain:compte';

/** Dernier compte reconnu sur ce téléphone (on ne se connecte ni ne se déconnecte sans réseau). */
function dernierCompte(): string | null {
  try {
    return window.localStorage.getItem(CLE_COMPTE);
  } catch {
    return null;
  }
}

async function compteConnecte(): Promise<string | null> {
  // Hors ligne, la session ne peut pas être rafraîchie : le dernier compte reconnu fait foi.
  if (!navigator.onLine) return dernierCompte();
  try {
    const { data, error } = await createClient().auth.getSession();
    // Réseau instable (session non rafraîchie) : on garde le dernier compte reconnu.
    if (error) return dernierCompte();
    const compte = data.session?.user.id ?? null;
    try {
      if (compte) window.localStorage.setItem(CLE_COMPTE, compte);
      else window.localStorage.removeItem(CLE_COMPTE);
    } catch {
      // stockage bloqué : le compte reste connu pour cette page
    }
    return compte;
  } catch {
    return dernierCompte();
  }
}

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
    void compteConnecte().then((compte) => {
      definirCompte(compte);
      // Sans compte connu, rien ne part : le geste attend son auteur.
      if (!compte || !navigator.onLine || !operations().some((o) => !o.refus)) return;
      setEnvoiEnCours(true);
      void envoyer(EXECUTEURS).finally(() => setEnvoiEnCours(false));
    });
  }, []);

  useEffect(() => {
    setEnLigne(navigator.onLine);
    // Page ouverte sans réseau : les gestes en attente du dernier compte reconnu s'affichent tout de suite.
    if (!navigator.onLine) definirCompte(dernierCompte());
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
