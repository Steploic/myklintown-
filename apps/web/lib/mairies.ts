import { cache } from 'react';
import { getSupabase, rpc } from '@/lib/server';

/**
 * Accès des Mairies : interrupteur `mairies_actives` de la base (migration
 * 20261126000027). Fermés depuis le 26/11/2026 : MyKlinTown fonctionne sans
 * aucune intervention des Mairies (pas de lien d'accès, pas de demande, espace
 * Mairie fermé). Le code reste en place pour pouvoir rouvrir :
 *   update public.parametres_plateforme set valeur = '1' where cle = 'mairies_actives';
 *
 * Fermés aussi quand la base ne répond pas ou que la migration n'est pas
 * jouée : rien ne s'ouvre par défaut. Une seule lecture par requête.
 */
export const mairiesOuvertes = cache(async (): Promise<boolean> => {
  try {
    const { data, error } = await rpc(await getSupabase(), 'mairies_actives');
    return !error && data === true;
  } catch {
    return false;
  }
});
