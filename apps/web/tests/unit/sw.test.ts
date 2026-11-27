/**
 * Service worker « terrain » (public/sw.js), joué dans un bac à sable : faux
 * stockage (Cache Storage), faux réseau. Le vrai navigateur est vérifié par
 * e2e/tests/hors-ligne-ouverture.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageHorsLigne } from '@/lib/hors-ligne/pages';

const ORIGINE = 'https://mkt.test';
const CODE = readFileSync(join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TOURNEE = '/precollecteur/tournees/33333333-3333-4333-8333-333333333333';
const HTML_TOURNEE =
  '<!doctype html><html><head><title>Tournée · MyKlinTown</title>' +
  '<link rel="stylesheet" href="/_next/static/css/app-1.css"><link rel="preload" href="/_next/static/media/police-2.woff2" as="font">' +
  '<script src="/_next/static/chunks/main-3.js" async></script></head>' +
  '<body><h1 class="t">Tournée du jeudi <!-- -->27 novembre</h1>' +
  '<script>self.__next_f.push([1,"I:[\\"static/chunks/app/precollecteur/tournees/%5Bid%5D/page-4.js\\"]"])</script></body></html>';

type Requete = { url: string; method: string; mode: string };
type Ecouteur = (e: unknown) => void;

class FauxCache {
  entrees = new Map<string, Response>();
  private cle(r: string | { url: string }, sansRecherche = false) {
    const u = new URL(typeof r === 'string' ? r : r.url, ORIGINE);
    if (sansRecherche) u.search = '';
    return u.href;
  }
  async match(r: string | { url: string }, options?: { ignoreSearch?: boolean }) {
    if (options?.ignoreSearch) {
      const cible = this.cle(r, true);
      for (const [k, v] of this.entrees) if (this.cle(k, true) === cible) return v.clone();
      return undefined;
    }
    return this.entrees.get(this.cle(r))?.clone();
  }
  async put(r: string | { url: string }, reponse: Response) {
    const k = this.cle(r);
    this.entrees.delete(k);
    this.entrees.set(k, reponse);
  }
  async delete(r: string | { url: string }) {
    return this.entrees.delete(this.cle(r));
  }
  async keys() {
    return [...this.entrees.keys()].map((url) => ({ url }));
  }
}

class FauxCaches {
  noms = new Map<string, FauxCache>();
  async open(n: string) {
    if (!this.noms.has(n)) this.noms.set(n, new FauxCache());
    return this.noms.get(n)!;
  }
  async keys() {
    return [...this.noms.keys()];
  }
  async delete(n: string) {
    return this.noms.delete(n);
  }
}

/** Le service worker chargé, avec son réseau (`reseau`) et son stockage. */
function charger(reseau: (r: Requete | string) => Promise<Response>) {
  const ecouteurs: Record<string, Ecouteur> = {};
  const caches = new FauxCaches();
  const appels: string[] = [];
  const self = {
    location: new URL(`${ORIGINE}/`),
    addEventListener: (type: string, fn: Ecouteur) => {
      ecouteurs[type] = fn;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetch = (r: Requete | string) => {
    appels.push(new URL(typeof r === 'string' ? r : r.url, ORIGINE).pathname);
    return reseau(r);
  };
  vm.runInContext(
    CODE,
    vm.createContext({
      self, caches, fetch, Response, Request, Headers, URL, Date, console,
      // Lus à l'appel : les minuteurs simulés de vitest s'appliquent.
      setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
      clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    }),
  );
  return { ecouteurs, caches, appels };
}
type SW = ReturnType<typeof charger>;

/** Une requête comme le navigateur l'envoie au service worker ; `null` s'il ne l'a pas prise. */
async function requete(sw: SW, chemin: string, { mode = 'navigate', method = 'GET', onglet = 'onglet-1' } = {}) {
  const attentes: Promise<unknown>[] = [];
  let reponse: Promise<Response> | null = null;
  sw.ecouteurs.fetch!({
    request: { url: chemin.startsWith('http') ? chemin : ORIGINE + chemin, method, mode },
    resultingClientId: onglet,
    respondWith: (p: Promise<Response>) => {
      reponse = Promise.resolve(p);
    },
    waitUntil: (p: Promise<unknown>) => attentes.push(p),
  });
  if (!reponse) return null;
  const r = await (reponse as Promise<Response>);
  await Promise.all(attentes);
  return r;
}

async function message<T>(sw: SW, data: unknown, onglet = 'onglet-1'): Promise<T> {
  const attentes: Promise<unknown>[] = [];
  let reponse: unknown;
  sw.ecouteurs.message!({ data, ports: [{ postMessage: (x: unknown) => (reponse = x) }], source: { id: onglet }, waitUntil: (p: Promise<unknown>) => attentes.push(p) });
  await Promise.all(attentes);
  return reponse as T;
}

/** Réponse du serveur : page du terrain (`x-mkt-hors-ligne`) du compte A, par défaut. */
function page(html: string, { compte = A as string | null, horsLigne = true, status = 200, type = 'text/html; charset=utf-8' } = {}) {
  const h = new Headers({ 'content-type': type, 'x-frame-options': 'DENY' });
  if (compte) h.set('x-mkt-compte', compte);
  if (horsLigne) h.set('x-mkt-hors-ligne', '1');
  return new Response(html, { status, headers: h });
}

const sansReseau = () => Promise.reject(new TypeError('Failed to fetch'));
const pagesDe = (sw: SW, compte: string) => sw.caches.noms.get(`mkt-pages-${compte}`)?.entrees ?? new Map();

/** Service worker dont la tournée de A a été ouverte une fois avec du réseau. */
async function avecTourneeEnregistree() {
  let enLigne = true;
  const sw = charger((r) => (enLigne ? Promise.resolve(page(HTML_TOURNEE)) : sansReseau()));
  await requete(sw, TOURNEE);
  return { sw, couper: () => (enLigne = false) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('pages du terrain', () => {
  it('la liste des pages enregistrables : tournées et accueil de l’employé, rien d’autre', () => {
    for (const p of ['/employe', `/employe/tournees/${A}`, '/precollecteur/tournees', TOURNEE]) expect(pageHorsLigne(p), p).toBe(true);
    for (const p of ['/precollecteur', '/precollecteur/clients', '/employe/historique', '/employe/scan', '/citoyen', '/dashboard', `${TOURNEE}/x`]) {
      expect(pageHorsLigne(p), p).toBe(false);
    }
  });

  it('en ligne : la page du terrain passe et s’enregistre sous son compte, avec ses en-têtes de sécurité ; une autre page, non', async () => {
    const sw = charger((r) => {
      const chemin = new URL(typeof r === 'string' ? r : r.url).pathname;
      return Promise.resolve(chemin === TOURNEE ? page(HTML_TOURNEE) : page('<h1>Clients</h1>', { horsLigne: false }));
    });
    const r = await requete(sw, TOURNEE);
    expect(r?.status).toBe(200);
    expect(await r!.text()).toContain('Tournée du jeudi');
    const enregistree = pagesDe(sw, A).get(ORIGINE + TOURNEE);
    expect(enregistree).toBeTruthy();
    expect(enregistree!.headers.get('x-frame-options')).toBe('DENY');
    expect(decodeURIComponent(enregistree!.headers.get('x-mkt-titre')!)).toBe('Tournée du jeudi 27 novembre');

    await requete(sw, '/precollecteur/clients');
    expect(pagesDe(sw, A).has(`${ORIGINE}/precollecteur/clients`)).toBe(false);
  });

  it('sans réseau : la page enregistrée est servie, et l’onglet sait qu’il voit un instantané', async () => {
    const { sw, couper } = await avecTourneeEnregistree();
    couper();
    const r = await requete(sw, `${TOURNEE}?scan=1`, { onglet: 'onglet-2' });
    expect(r?.status).toBe(200);
    expect(await r!.text()).toContain('Tournée du jeudi');
    const etat = await message<{ depuisCache: boolean; le: number }>(sw, { type: 'etat' }, 'onglet-2');
    expect(etat.depuisCache).toBe(true);
    expect(etat.le).toBeGreaterThan(0);
    expect((await message<{ depuisCache: boolean }>(sw, { type: 'etat' }, 'onglet-1')).depuisCache).toBe(false);
  });

  it('serveur injoignable (503 « réseau indisponible ») ou trop lent : la page enregistrée aussi', async () => {
    let mode: 'ok' | '503' | 'lent' = 'ok';
    const sw = charger(() => {
      if (mode === 'ok') return Promise.resolve(page(HTML_TOURNEE));
      if (mode === '503') return Promise.resolve(page('Réseau indisponible', { status: 503, compte: null, horsLigne: false }));
      return new Promise<Response>(() => {}); // ne répond jamais
    });
    await requete(sw, TOURNEE);
    mode = '503';
    expect(await (await requete(sw, TOURNEE))!.text()).toContain('Tournée du jeudi');

    mode = 'lent';
    vi.useFakeTimers();
    const lente = requete(sw, TOURNEE);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await (await lente)!.text()).toContain('Tournée du jeudi');
  });

  it('sans page enregistrée, un serveur lent est attendu : pas de délai imposé', async () => {
    vi.useFakeTimers();
    let repondre: (r: Response) => void = () => {};
    const sw = charger(() => new Promise<Response>((ok) => (repondre = ok)));
    const r = requete(sw, TOURNEE);
    await vi.advanceTimersByTimeAsync(60_000);
    repondre(page(HTML_TOURNEE));
    expect((await r)?.status).toBe(200);
  });

  it('sans réseau, page jamais enregistrée : « Pas de réseau », avec les pages disponibles', async () => {
    const { sw, couper } = await avecTourneeEnregistree();
    couper();
    const r = await requete(sw, '/precollecteur/clients');
    expect(r?.status).toBe(503);
    const html = await r!.text();
    expect(html).toContain('Pas de réseau');
    expect(html).toContain(`href="${TOURNEE}"`);
    expect(html).toContain('Tournée du jeudi 27 novembre');
    expect(html).toMatch(/enregistrée le \d{2}\/\d{2}/);
  });

  it('redirection (session expirée), erreur, contenu qui n’est pas une page : rien n’est enregistré', async () => {
    for (const reponse of [
      new Response(null, { status: 307, headers: { location: '/login', 'x-mkt-compte': A, 'x-mkt-hors-ligne': '1' } }),
      page('Introuvable', { status: 404 }),
      page('{"a":1}', { type: 'application/json' }),
    ]) {
      const sw = charger(() => Promise.resolve(reponse.clone()));
      await requete(sw, TOURNEE);
      expect(pagesDe(sw, A).size).toBe(0);
    }
  });

  it('un autre compte sur le même téléphone : les pages du premier sont effacées et plus jamais servies', async () => {
    let compte = A;
    let enLigne = true;
    const sw = charger(() => (enLigne ? Promise.resolve(page(HTML_TOURNEE, { compte, horsLigne: compte === A })) : sansReseau()));
    await requete(sw, TOURNEE);
    expect(pagesDe(sw, A).size).toBe(1);
    compte = B; // B ouvre une page quelconque de son espace
    await requete(sw, '/citoyen');
    expect(sw.caches.noms.has(`mkt-pages-${A}`)).toBe(false);
    enLigne = false;
    const r = await requete(sw, TOURNEE);
    expect(r?.status).toBe(503);
    expect(await r!.text()).not.toContain('Tournée du jeudi');
  });

  it('le compte annoncé par l’application suffit aussi ; un identifiant invalide est ignoré', async () => {
    const { sw } = await avecTourneeEnregistree();
    await message(sw, { type: 'compte', id: '../../piege' });
    expect(pagesDe(sw, A).size).toBe(1);
    await message(sw, { type: 'compte', id: B });
    expect(sw.caches.noms.has(`mkt-pages-${A}`)).toBe(false);
  });

  it('déconnexion : les pages et le compte quittent le téléphone', async () => {
    const { sw } = await avecTourneeEnregistree();
    expect(await message(sw, { type: 'deconnexion' })).toEqual({ ok: true });
    expect([...sw.caches.noms.keys()].filter((n) => n.startsWith('mkt-pages-') || n === 'mkt-etat')).toEqual([]);
  });

  it('une page enregistrée depuis plus de 3 jours n’est plus servie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T07:00:00Z'));
    const { sw, couper } = await avecTourneeEnregistree();
    couper();
    vi.setSystemTime(new Date('2026-11-29T07:00:00Z'));
    expect((await requete(sw, TOURNEE))?.status).toBe(200);
    vi.setSystemTime(new Date('2026-11-30T08:00:00Z'));
    expect((await requete(sw, TOURNEE))?.status).toBe(503);
  });
});

describe('préparer le terrain', () => {
  it('les tournées du jour et leurs fichiers sont enregistrés ; redemandé dans les 2 minutes, rien n’est rechargé', async () => {
    const sw = charger((r) => {
      const chemin = new URL(typeof r === 'string' ? r : r.url, ORIGINE).pathname;
      if (chemin.startsWith('/_next/static/')) return Promise.resolve(new Response('/* fichier */', { headers: { 'content-type': 'text/javascript' } }));
      return Promise.resolve(page(HTML_TOURNEE));
    });
    const r = await message<{ resultats: Record<string, boolean> }>(sw, { type: 'preparer', urls: [TOURNEE, '/precollecteur/tournees', '//ailleurs.test/x', 42] });
    expect(r.resultats).toEqual({ [TOURNEE]: true, '/precollecteur/tournees': true });
    const statiques = [...(sw.caches.noms.get('mkt-statique-v1')?.entrees.keys() ?? [])].map((u) => new URL(u).pathname).sort();
    expect(statiques).toEqual([
      '/_next/static/chunks/app/precollecteur/tournees/%5Bid%5D/page-4.js',
      '/_next/static/chunks/main-3.js',
      '/_next/static/css/app-1.css',
      '/_next/static/media/police-2.woff2',
    ]);
    const avant = sw.appels.length;
    await message(sw, { type: 'preparer', urls: [TOURNEE] });
    expect(sw.appels.length).toBe(avant);
    // La tournée a changé (démarrée) : rechargée tout de suite, sans ses fichiers déjà là.
    await message(sw, { type: 'preparer', urls: [TOURNEE], forcer: [TOURNEE] });
    expect(sw.appels.slice(avant)).toEqual([TOURNEE]);
  });

  it('les fichiers que la page a chargés à la demande (la carte) sont gardés ; ceux d’ailleurs, non', async () => {
    const sw = charger(() => Promise.resolve(new Response('/* carte */', { headers: { 'content-type': 'text/javascript' } })));
    await message(sw, {
      type: 'preparer',
      urls: [],
      ressources: [`${ORIGINE}/_next/static/chunks/carte-9.js?dpl=x`, 'https://autre.test/_next/static/chunks/y.js', '/api/sante', 7],
    });
    expect([...(sw.caches.noms.get('mkt-statique-v1')?.entrees.keys() ?? [])]).toEqual([`${ORIGINE}/_next/static/chunks/carte-9.js`]);
  });

  it('une page que le serveur n’a pas marquée ne s’enregistre pas, même demandée', async () => {
    const sw = charger(() => Promise.resolve(page('<h1>Clients</h1>', { horsLigne: false })));
    const r = await message<{ resultats: Record<string, boolean> }>(sw, { type: 'preparer', urls: ['/precollecteur/clients'] });
    expect(r.resultats).toEqual({ '/precollecteur/clients': false });
    expect(pagesDe(sw, A).size).toBe(0);
  });

  it('sans réseau, une page déjà enregistrée reste disponible ; une autre, non', async () => {
    const { sw, couper } = await avecTourneeEnregistree();
    couper();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const r = await message<{ resultats: Record<string, boolean> }>(sw, { type: 'preparer', urls: [TOURNEE, '/employe'] });
    expect(r.resultats).toEqual({ [TOURNEE]: true, '/employe': false });
  });
});

describe('fichiers et requêtes hors du périmètre', () => {
  it('fichiers de l’application : le cache d’abord, même avec un paramètre ajouté', async () => {
    let enLigne = true;
    const sw = charger(() => (enLigne ? Promise.resolve(new Response('code', { headers: { 'content-type': 'text/javascript' } })) : sansReseau()));
    expect(await (await requete(sw, '/_next/static/chunks/x-1.js', { mode: 'no-cors' }))!.text()).toBe('code');
    enLigne = false;
    expect(await (await requete(sw, '/_next/static/chunks/x-1.js?dpl=abc', { mode: 'no-cors' }))!.text()).toBe('code');
  });

  it('jamais touchés : envoi de formulaire, données de page (RSC), API, téléchargements, connexion, autres sites', async () => {
    const sw = charger(() => Promise.resolve(page('x')));
    expect(await requete(sw, TOURNEE, { method: 'POST' })).toBeNull();
    expect(await requete(sw, `${TOURNEE}?_rsc=1`, { mode: 'cors' })).toBeNull();
    expect(await requete(sw, '/api/sante', { mode: 'cors' })).toBeNull();
    expect(await requete(sw, '/precollecteur/clients/export')).toBeNull();
    expect(await requete(sw, '/precollecteur/clients/import/modele')).toBeNull();
    expect(await requete(sw, '/auth/callback?code=x')).toBeNull();
    expect(await requete(sw, 'https://tile.openstreetmap.org/1/1/1.png', { mode: 'no-cors' })).toBeNull();
    expect(sw.appels).toEqual([]);
  });
});
