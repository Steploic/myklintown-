/*
 * MyKlinTown — service worker « terrain » : les pages du terrain s'ouvrent
 * SANS RÉSEAU, avec les données de la dernière fois où elles ont été
 * enregistrées. Les gestes faits hors ligne (scans, pointages) restent gérés par
 * la file du téléphone (lib/hors-ligne/file-terrain.ts), qui les envoie au retour
 * du réseau.
 *
 * Règles :
 *   - Pages : le réseau d'abord. Seule une page marquée `x-mkt-hors-ligne: 1`
 *     par le serveur (le middleware, pour les pages du terrain :
 *     lib/hors-ligne/pages.ts) est enregistrée, sous le compte qui l'a ouverte
 *     (`x-mkt-compte`). Sans réseau, ou si le serveur ne répond pas (erreur 5xx,
 *     délai dépassé), la page enregistrée est servie ; sinon une page « Pas de
 *     réseau » propose celles qui le sont.
 *   - Fichiers de l'application (/_next/static) : le cache d'abord (leur nom
 *     change avec leur contenu). Icônes et manifeste : le réseau d'abord.
 *   - Tout le reste (données, actions, connexion, téléchargements, autres
 *     sites) n'est pas touché.
 *   - Un téléphone sert parfois à plusieurs comptes : seules les pages du
 *     dernier compte connecté sont gardées, la déconnexion les efface, et une
 *     page enregistrée depuis plus de 3 jours n'est plus servie.
 *
 * Désactiver en urgence : remplacer ce fichier par un service worker qui vide
 * les caches « mkt- » puis appelle `self.registration.unregister()`.
 */
'use strict';

const VERSION = 1;
const STATIQUE = 'mkt-statique-v' + VERSION;
const PREFIXE_PAGES = 'mkt-pages-';
const ETAT = 'mkt-etat';
const CLE_COMPTE = '/__mkt/compte';
const DELAI_RESEAU_MS = 8000;
const DELAI_PREPARATION_MS = 20000;
const DUREE_PAGE_MS = 3 * 24 * 3600 * 1000;
const PREPARATION_RECENTE_MS = 2 * 60 * 1000;
const MAX_STATIQUE = 400;
const MAX_PAGES = 30;
const MAX_A_PREPARER = 12;
const COMPTE_VALIDE = /^[0-9a-f-]{36}$/;
// En-têtes de sécurité recopiés sur une page servie depuis le téléphone.
const ENTETES_GARDES = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];
// Fichiers publics sans empreinte dans le nom : le réseau d'abord.
const FICHIERS_PUBLICS = /^\/(?:brand\/[\w.-]+|logo-[\w-]+\.(?:png|jpe?g|svg|webp)|manifest\.webmanifest|favicon\.ico)$/;
// Téléchargements et API : jamais interceptés.
const JAMAIS = /^\/(?:api|auth)\/|\/(?:export|modele)(?:\/|$)/;

/** Onglet → date d'enregistrement de la page qu'il a reçue hors ligne. */
const servies = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const nom of await caches.keys()) {
        if (nom.startsWith('mkt-statique-') && nom !== STATIQUE) await caches.delete(nom);
      }
      await purgerPagesAnciennes();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  let url;
  try {
    url = new URL(requete.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin || JAMAIS.test(url.pathname)) return;
  if (requete.mode === 'navigate') {
    event.respondWith(navigation(event, url));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheDabord(requete));
  } else if (FICHIERS_PUBLICS.test(url.pathname)) {
    event.respondWith(reseauDabord(requete));
  }
});

self.addEventListener('message', (event) => {
  const msg = (event.data && typeof event.data === 'object' && event.data) || {};
  const port = event.ports && event.ports[0];
  const repondre = (x) => {
    if (port) port.postMessage(x);
  };
  if (msg.type === 'compte' && typeof msg.id === 'string') {
    event.waitUntil(changerDeCompte(msg.id).then(() => repondre({ ok: true }), () => repondre({ ok: false })));
  } else if (msg.type === 'deconnexion') {
    event.waitUntil(oublierTout().then(() => repondre({ ok: true }), () => repondre({ ok: false })));
  } else if (msg.type === 'etat') {
    const le = event.source ? servies.get(event.source.id) : undefined;
    repondre({ depuisCache: !!le, le: le || null });
  } else if (msg.type === 'preparer' && Array.isArray(msg.urls)) {
    const forcer = Array.isArray(msg.forcer) ? msg.forcer : [];
    const ressources = Array.isArray(msg.ressources) ? msg.ressources : [];
    event.waitUntil(
      preparer(msg.urls, forcer)
        .then(async (r) => {
          await garderFichiers(ressources).catch(() => {});
          return r;
        })
        .then(repondre, () => repondre({ resultats: {} })),
    );
  }
});

// -----------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------

function cleDe(url) {
  const u = new URL(url, self.location.origin);
  return u.origin + u.pathname;
}

async function navigation(event, url) {
  const cle = cleDe(url);
  const enregistree = await pageEnregistree(cle).catch(() => null);
  try {
    const reponse = await avecDelai(fetch(event.request), enregistree ? DELAI_RESEAU_MS : 0);
    if (reponse.status >= 500 && enregistree) return servir(enregistree, event);
    const compte = reponse.headers.get('x-mkt-compte');
    if (compte) event.waitUntil(changerDeCompte(compte).catch(() => {}));
    if (reponse.headers.get('x-mkt-hors-ligne') !== '1') return reponse;
    const pourNavigateur = reponse.clone();
    event.waitUntil(retenir(reponse, cle).catch(() => false));
    return pourNavigateur;
  } catch (e) {
    if (enregistree) return servir(enregistree, event);
    return pageSansReseau();
  }
}

function servir(enregistree, event) {
  if (event.resultingClientId) servies.set(event.resultingClientId, enregistree.le);
  return enregistree.reponse;
}

/** Enregistre la page si le serveur l'autorise ; renvoie son HTML, ou false. */
async function retenir(reponse, cle) {
  const compte = reponse.headers.get('x-mkt-compte');
  if (!compte || !COMPTE_VALIDE.test(compte)) return false;
  await changerDeCompte(compte);
  if (reponse.headers.get('x-mkt-hors-ligne') !== '1') return false;
  if (!reponse.ok || reponse.redirected || ['opaque', 'opaqueredirect', 'error'].includes(reponse.type)) return false;
  if (!/text\/html/i.test(reponse.headers.get('content-type') || '')) return false;
  const html = await reponse.text();
  const entetes = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'x-mkt-enregistree': String(Date.now()),
    'x-mkt-titre': encodeURIComponent(libelleDe(cle, html)),
  });
  for (const nom of ENTETES_GARDES) {
    const v = reponse.headers.get(nom);
    if (v) entetes.set(nom, v);
  }
  const cache = await caches.open(PREFIXE_PAGES + compte);
  await cache.put(cle, new Response(html, { status: 200, headers: entetes }));
  await limiter(cache, MAX_PAGES);
  return html;
}

async function compteEnregistre() {
  const etat = await caches.open(ETAT);
  const r = await etat.match(CLE_COMPTE);
  return r ? (await r.text()).trim() : null;
}

/** Nouveau compte sur ce téléphone : les pages des autres comptes sont effacées. */
async function changerDeCompte(compte) {
  if (!COMPTE_VALIDE.test(compte)) return;
  if ((await compteEnregistre()) === compte) return;
  for (const nom of await caches.keys()) {
    if (nom.startsWith(PREFIXE_PAGES) && nom !== PREFIXE_PAGES + compte) await caches.delete(nom);
  }
  const etat = await caches.open(ETAT);
  await etat.put(CLE_COMPTE, new Response(compte));
}

async function oublierTout() {
  servies.clear();
  for (const nom of await caches.keys()) {
    if (nom.startsWith(PREFIXE_PAGES) || nom === ETAT) await caches.delete(nom);
  }
}

async function pageEnregistree(cle) {
  const compte = await compteEnregistre();
  if (!compte) return null;
  const cache = await caches.open(PREFIXE_PAGES + compte);
  const reponse = await cache.match(cle);
  if (!reponse) return null;
  const le = Number(reponse.headers.get('x-mkt-enregistree')) || 0;
  if (Date.now() - le > DUREE_PAGE_MS) {
    await cache.delete(cle);
    return null;
  }
  return { reponse, le };
}

async function pagesEnregistrees() {
  const compte = await compteEnregistre();
  if (!compte) return [];
  const cache = await caches.open(PREFIXE_PAGES + compte);
  const pages = [];
  for (const requete of await cache.keys()) {
    const r = await cache.match(requete);
    if (!r) continue;
    const le = Number(r.headers.get('x-mkt-enregistree')) || 0;
    if (Date.now() - le > DUREE_PAGE_MS) continue;
    let titre = '';
    try {
      titre = decodeURIComponent(r.headers.get('x-mkt-titre') || '');
    } catch (e) {
      titre = '';
    }
    const chemin = new URL(requete.url).pathname;
    pages.push({ chemin, titre: titre || chemin, le });
  }
  return pages.sort((a, b) => b.le - a.le);
}

async function purgerPagesAnciennes() {
  for (const nom of await caches.keys()) {
    if (!nom.startsWith(PREFIXE_PAGES)) continue;
    const cache = await caches.open(nom);
    for (const requete of await cache.keys()) {
      const r = await cache.match(requete);
      const le = r ? Number(r.headers.get('x-mkt-enregistree')) || 0 : 0;
      if (Date.now() - le > DUREE_PAGE_MS) await cache.delete(requete);
    }
  }
}

/**
 * Enregistre ces pages (et les fichiers dont elles ont besoin) pendant que le
 * réseau est là : la tournée du jour s'ouvrira sans réseau, même jamais ouverte.
 * Une page enregistrée il y a moins de 2 minutes n'est pas rechargée, sauf si
 * elle est dans `forcer` (elle a changé : tournée démarrée, terminée…).
 */
async function preparer(urls, forcer) {
  const aForcer = new Set((forcer || []).filter((u) => typeof u === 'string').map((u) => new URL(u, self.location.origin).pathname));
  const resultats = {};
  const chemins = [];
  for (const u of urls) {
    if (typeof u !== 'string' || !u.startsWith('/') || u.startsWith('//')) continue;
    const chemin = new URL(u, self.location.origin).pathname;
    if (!chemins.includes(chemin)) chemins.push(chemin);
  }
  for (const chemin of chemins.slice(0, MAX_A_PREPARER)) {
    const cle = cleDe(chemin);
    const deja = await pageEnregistree(cle).catch(() => null);
    if (deja && !aForcer.has(chemin) && Date.now() - deja.le < PREPARATION_RECENTE_MS) {
      resultats[chemin] = true;
      continue;
    }
    try {
      const reponse = await avecDelai(fetch(cle, { credentials: 'same-origin', cache: 'no-store' }), DELAI_PREPARATION_MS);
      const html = await retenir(reponse, cle);
      if (html) await garderRessources(html);
      resultats[chemin] = !!html || !!deja;
    } catch (e) {
      resultats[chemin] = !!deja;
    }
  }
  return { resultats };
}

/** Les fichiers /_next/static que la page charge : scripts, styles, polices. */
function ressourcesDe(html) {
  const urls = new Set();
  const re = /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[^"'\\\s)<>?#]+)/g;
  let m;
  while ((m = re.exec(html))) urls.add('/_next/' + m[1]);
  return [...urls];
}

async function garderRessources(html) {
  await garderFichiers(ressourcesDe(html));
}

/**
 * Enregistre ces fichiers de l'application (/_next/static seulement, de ce site
 * seulement). La page envoie aussi ceux qu'elle a chargés à la demande (la
 * carte) : ils n'apparaissent pas dans son HTML.
 */
async function garderFichiers(liste) {
  const cache = await caches.open(STATIQUE);
  const urls = [];
  for (const brut of liste.slice(0, 300)) {
    if (typeof brut !== 'string') continue;
    let u;
    try {
      u = new URL(brut, self.location.origin);
    } catch (e) {
      continue;
    }
    if (u.origin !== self.location.origin || !u.pathname.startsWith('/_next/static/')) continue;
    if (!urls.includes(u.pathname)) urls.push(u.pathname);
  }
  for (const u of urls) {
    if (await cache.match(u, { ignoreSearch: true })) continue;
    try {
      const r = await fetch(u);
      if (r.ok) await cache.put(u, r);
    } catch (e) {
      // Réseau perdu en cours de route : la page s'ouvrira peut-être sans style.
    }
  }
  await limiter(cache, MAX_STATIQUE);
}

/** Ce que la page « Pas de réseau » affiche : le titre de la tournée, sinon celui de la page. */
function libelleDe(cle, html) {
  const chemin = new URL(cle).pathname;
  const titre = (/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
  const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || '';
  const texte = (s) => decoderEntites(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (/\/tournees\/[^/]+$/.test(chemin) && texte(h1)) return texte(h1).slice(0, 120);
  if (chemin === '/employe') return 'Aujourd’hui : mes tournées';
  return (texte(titre).replace(/\s*[·|–-]\s*MyKlinTown\s*$/i, '') || chemin).slice(0, 120);
}

function decoderEntites(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function echapper(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function dateLisible(le) {
  try {
    return new Date(le).toLocaleString('fr-FR', { timeZone: 'Africa/Douala', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ');
  } catch (e) {
    return new Date(le).toISOString().slice(0, 16).replace('T', ' à ');
  }
}

async function pageSansReseau() {
  const pages = await pagesEnregistrees().catch(() => []);
  const liste = pages.length
    ? '<p>Ces pages sont sur votre téléphone :</p><ul>' +
      pages
        .map((p) => '<li><a href="' + echapper(p.chemin) + '">' + echapper(p.titre) + '</a><span>enregistrée le ' + echapper(dateLisible(p.le)) + '</span></li>')
        .join('') +
      '</ul>'
    : '<p>Aucune page n’est encore enregistrée sur ce téléphone. Ouvrez vos tournées du jour quand vous avez du réseau : elles resteront disponibles.</p>';
  const html =
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pas de réseau · MyKlinTown</title>' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F7F5;font-family:system-ui,sans-serif;color:#1A2330}' +
    'main{max-width:28rem;margin:1rem;padding:1.5rem;background:#fff;border:1px solid #DDE4E1;border-radius:16px}' +
    'h1{font-size:1.35rem;color:#0B1E3B;margin:.25rem 0 .5rem}p{color:#5B6673;line-height:1.45}ul{list-style:none;padding:0;margin:0}' +
    'li{border-top:1px solid #DDE4E1;padding:.75rem 0;display:flex;flex-direction:column;gap:.2rem}li a{color:#2563EB;font-weight:600;text-decoration:none;font-size:1.05rem}' +
    'li span{font-size:.85rem;color:#5B6673}button{min-height:44px;margin-top:1rem;padding:0 1.25rem;border:0;border-radius:8px;background:#30823A;color:#fff;font-weight:600;font-size:1rem}</style></head>' +
    '<body><main><p style="font-size:2rem;margin:0">📶</p><h1>Pas de réseau</h1>' +
    '<p>Cette page n’a pas été enregistrée sur votre téléphone : elle s’ouvrira au retour du réseau.</p>' +
    liste +
    '<button onclick="location.reload()">Réessayer</button></main></body></html>';
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// -----------------------------------------------------------------------------
// Fichiers
// -----------------------------------------------------------------------------

async function cacheDabord(requete) {
  const cache = await caches.open(STATIQUE);
  // Le nom porte déjà l'empreinte du contenu : un paramètre ajouté (ex. `?dpl=`
  // de Vercel) ne change pas le fichier.
  const enCache = await cache.match(requete, { ignoreSearch: true });
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok && !['opaque', 'opaqueredirect', 'error'].includes(reponse.type)) {
    await cache.put(requete, reponse.clone());
    await limiter(cache, MAX_STATIQUE);
  }
  return reponse;
}

async function reseauDabord(requete) {
  const cache = await caches.open(STATIQUE);
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) await cache.put(requete, reponse.clone());
    return reponse;
  } catch (e) {
    const enCache = await cache.match(requete);
    if (enCache) return enCache;
    throw e;
  }
}

/** Garde les `max` entrées les plus récentes (l'ordre des clés est celui d'insertion). */
async function limiter(cache, max) {
  const cles = await cache.keys();
  for (let i = 0; i < cles.length - max; i++) await cache.delete(cles[i]);
}

/** La promesse, ou un échec au bout de `ms` (0 : attendre sans limite). */
function avecDelai(promesse, ms) {
  if (!ms) return promesse;
  return new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('délai dépassé')), ms);
    promesse.then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      (e) => {
        clearTimeout(t);
        ko(e);
      },
    );
  });
}
