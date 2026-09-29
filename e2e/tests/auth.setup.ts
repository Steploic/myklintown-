/**
 * Connexion de chaque compte de test PAR L'INTERFACE (le vrai formulaire),
 * puis sauvegarde de la session pour les autres tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { emailDe, identifiants } from '../../apps/web/tests/support/fixtures';

const DOSSIER = path.resolve(__dirname, '..', '.auth');
fs.mkdirSync(DOSSIER, { recursive: true });

const COMPTES: [string, RegExp][] = [
  ['precoA', /\/precollecteur/],
  ['precoB', /\/precollecteur/],
  ['menage', /\/citoyen/],
  ['souscripteur', /\/citoyen/],
  ['mairie', /\/(dashboard|citoyen)/],
];

for (const [cle, destination] of COMPTES) {
  setup(`connexion ${cle}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(emailDe(cle));
    await page.getByLabel('Mot de passe').fill(identifiants().motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(destination, { timeout: 90_000 });
    await page.context().storageState({ path: path.join(DOSSIER, `${cle}.json`) });
  });
}
