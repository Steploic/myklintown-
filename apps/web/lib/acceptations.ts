import { rpc, type Supa } from './server';
import { fonctionAbsente, TYPES_DOCUMENTS, type TypeDocument } from './documents';

/**
 * Enregistre l'acceptation de la dernière version publiée de la charte et du
 * contrat (`accepter_documents`) : en ligne par le compte connecté, ou remise
 * papier pour une fiche client (gérant ou agent). Sans doublon.
 *
 * Renvoie le message d'erreur à afficher, ou null. Base sans la migration 0014 :
 * rien à enregistrer, le parcours continue (le bandeau le demandera ensuite).
 */
export async function enregistrerAcceptation(
  supabase: Supa,
  { types = TYPES_DOCUMENTS, clientId = null }: { types?: readonly TypeDocument[]; clientId?: string | null } = {},
): Promise<string | null> {
  if (!types.length) return null;
  const { error } = await rpc(supabase, 'accepter_documents', { p_types: [...types], p_client: clientId });
  if (!error || fonctionAbsente(error)) return null;
  return error.message;
}
