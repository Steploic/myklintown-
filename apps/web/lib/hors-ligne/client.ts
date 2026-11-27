/**
 * Dialogue avec le service worker « terrain » (public/sw.js), côté navigateur.
 * Tout est facultatif : sans service worker (navigateur ancien, navigation
 * privée), l'application marche comme avant, en ligne.
 */

const PREFIXE_PAGES = 'mkt-pages-';
const ETAT = 'mkt-etat';

/** Le service worker actif, s'il y en a un. */
export async function serviceWorkerActif(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller ?? reg.active ?? null;
  } catch {
    return null;
  }
}

/** Envoie un message au service worker et attend sa réponse (null : pas de réponse à temps). */
export function demander<T>(sw: ServiceWorker, message: Record<string, unknown>, delaiMs = 10_000): Promise<T | null> {
  return new Promise((resolve) => {
    const canal = new MessageChannel();
    const t = setTimeout(() => resolve(null), delaiMs);
    canal.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data as T);
    };
    try {
      sw.postMessage(message, [canal.port2]);
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

/**
 * Déconnexion : les pages enregistrées pour le terrain sont effacées du
 * téléphone (le prochain compte ouvert ne doit pas les voir). La file des
 * gestes à envoyer, elle, reste : chaque geste porte son compte.
 */
export async function oublierPagesHorsLigne(): Promise<void> {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'deconnexion' });
  } catch {
    // pas de service worker : rien à dire
  }
  try {
    if (typeof caches === 'undefined') return;
    for (const nom of await caches.keys()) {
      if (nom.startsWith(PREFIXE_PAGES) || nom === ETAT) await caches.delete(nom);
    }
  } catch {
    // stockage bloqué (navigation privée stricte) : rien n'a été enregistré
  }
}

/**
 * Le serveur répond-il ? `navigator.onLine` dit seulement que le téléphone est
 * branché à un réseau : sans forfait de données, il reste « en ligne » mais
 * rien ne passe. Une requête minuscule tranche (5 s au plus).
 */
export async function serveurJoignable(delaiMs = 5_000): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const arret = new AbortController();
  const t = setTimeout(() => arret.abort(), delaiMs);
  try {
    const r = await fetch('/api/sante', { cache: 'no-store', signal: arret.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
