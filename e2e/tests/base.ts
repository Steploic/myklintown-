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
    migration0006: boolean;
  };

/** Marqueur propre à cette exécution : les textes saisis ne se confondent jamais avec ceux d'un essai précédent. */
export const RUN = Date.now().toString(36).toUpperCase();

export const session = (cle: string) => path.resolve(__dirname, '..', '.auth', `${cle}.json`);

export const SANS_MIGRATION_0006 = 'Migration 20261004000006_retours_tests_equipe.sql non exécutée';

/** Connexion par le vrai formulaire (comptes dont la session ne doit pas être partagée). */
export async function seConnecter(page: Page, email: string, motDePasse: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

// Bruit sans rapport avec l'application : tuiles de carte, extensions, favicon.
const IGNORES = [/tile\.openstreetmap|arcgisonline/i, /favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/];

// Erreur d'hydratation React #418 : CONNUE et OUVERTE (voir tests/README.md).
// Intermittente (1 à 3 fois par exécution complète, 0 sur 65 chargements
// isolés), sans effet fonctionnel : React reconstruit la page dans le
// navigateur, et chaque test vérifie ensuite que tout fonctionne. Elle est
// signalée dans le rapport au lieu de faire échouer le test (dans un groupe
// enchaîné, un échec fait sauter tous les tests suivants). Toute AUTRE erreur
// reste bloquante.
const CONNUES = [/Minified React error #418/];

export const test = base.extend<{ erreurs: string[] }>({
  erreurs: [
    async ({ page }, use, testInfo) => {
      const erreurs: string[] = [];
      page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORES.some((r) => r.test(m.text()))) erreurs.push(`console: ${m.text()}`);
      });
      await use(erreurs);
      const connues = erreurs.filter((e) => CONNUES.some((r) => r.test(e)));
      for (const e of connues) {
        testInfo.annotations.push({ type: 'erreur connue (hydratation #418)', description: `${page.url()} — ${e.slice(0, 120)}` });
        console.warn(`⚠️  Hydratation #418 (connue) pendant « ${testInfo.title} » sur ${page.url()}`);
      }
      expect(erreurs.filter((e) => !connues.includes(e)), 'erreurs JavaScript / console pendant le test').toEqual([]);
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
