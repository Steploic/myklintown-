/**
 * Base commune des tests navigateur : chaque test ÉCHOUE si la page produit
 * une erreur JavaScript ou une erreur console (hors bruit réseau connu).
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';

export const etat = () =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.media', 'etat.json'), 'utf8')) as {
    precoA: string;
    precoB: string;
    clientScan: string;
    clientLien: string;
    mairiePromue: boolean;
    mairieEmail: string;
  };

/** Marqueur propre à cette exécution : les textes saisis ne se confondent jamais avec ceux d'un essai précédent. */
export const RUN = Date.now().toString(36).toUpperCase();

export const session = (cle: string) => path.resolve(__dirname, '..', '.auth', `${cle}.json`);

// Bruit sans rapport avec l'application : tuiles de carte, extensions, favicon.
const IGNORES = [/tile\.openstreetmap|arcgisonline/i, /favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/];

export const test = base.extend<{ erreurs: string[] }>({
  erreurs: [
    async ({ page }, use) => {
      const erreurs: string[] = [];
      page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORES.some((r) => r.test(m.text()))) erreurs.push(`console: ${m.text()}`);
      });
      await use(erreurs);
      expect(erreurs, 'erreurs JavaScript / console pendant le test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** La page ne doit jamais défiler horizontalement (téléphone). */
export async function pasDeDebordement(page: Page) {
  const { large, fenetre } = await page.evaluate(() => ({
    large: document.documentElement.scrollWidth,
    fenetre: window.innerWidth,
  }));
  expect(large, `largeur de page ${large}px pour un écran de ${fenetre}px`).toBeLessThanOrEqual(fenetre + 1);
}
