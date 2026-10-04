/**
 * Téléphone (Pixel 7) : chaque écran s'affiche sans défilement horizontal,
 * sans erreur, avec la barre d'onglets du bas.
 */
import { emailDe, identifiants } from '../../apps/web/tests/support/fixtures';
import { expect, pasDeDebordement, seConnecter, session, test } from './base';

const PUBLIQUES = ['/', '/login', '/signup', '/marque', '/legal', '/acces-mairie'];
const PRECOLLECTEUR = [
  '/precollecteur',
  '/precollecteur/clients',
  '/precollecteur/clients/nouveau',
  '/precollecteur/facturation',
  '/precollecteur/facturation?onglet=factures',
  '/precollecteur/facturation?onglet=paiements',
  '/precollecteur/carte',
  '/precollecteur/demandes',
  '/precollecteur/tournees',
  '/precollecteur/flotte',
  '/precollecteur/incidents',
  '/precollecteur/incidents/nouveau',
  '/precollecteur/grille',
  '/settings',
];
const MENAGE = ['/citoyen', '/citoyen/collectes', '/citoyen/factures', '/citoyen/qr-code', '/citoyen/signaler', '/citoyen/souscrire'];

test.describe('pages publiques', () => {
  for (const url of PUBLIQUES) {
    test(`${url}`, async ({ page }) => {
      await page.goto(url);
      await pasDeDebordement(page);
    });
  }
});

test.describe('précollecteur', () => {
  test.use({ storageState: session('precoA') });
  for (const url of PRECOLLECTEUR) {
    test(`${url}`, async ({ page }) => {
      await page.goto(url);
      await pasDeDebordement(page);
      await expect(page.getByRole('navigation', { name: 'Navigation rapide' })).toBeVisible();
    });
  }
  test('le menu latéral s’ouvre et mène à la flotte', async ({ page }) => {
    await page.goto('/precollecteur');
    await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
    await page.getByRole('link', { name: 'Flotte & équipe' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/flotte/);
  });
  test('la fiche client tient sur l’écran', async ({ page }) => {
    await page.goto('/precollecteur/clients');
    await page.locator('a[href^="/precollecteur/clients/"]').filter({ hasText: 'Famille Scan' }).first().click();
    await expect(page.getByText('QR code du foyer')).toBeVisible();
    await pasDeDebordement(page);
  });
});

test.describe('ménage', () => {
  test.use({ storageState: session('souscripteur') });
  for (const url of MENAGE) {
    test(`${url}`, async ({ page }) => {
      await page.goto(url);
      await pasDeDebordement(page);
    });
  }
});

// Retour R9 : sur téléphone, « Déconnexion » refermait le menu avant l'envoi
// du formulaire — on restait connecté.
test.describe('déconnexion sur téléphone', () => {
  test('depuis le menu latéral', async ({ page }) => {
    await seConnecter(page, emailDe('deconnexion'), identifiants().motDePasse);
    await expect(page).toHaveURL(/\/citoyen/);
    await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/logout$/);
    await page.goto('/citoyen');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('facturation sur téléphone', () => {
  test.use({ storageState: session('precoA') });
  test('les paiements s’affichent en cartes lisibles', async ({ page }) => {
    await page.goto('/precollecteur/facturation?onglet=paiements');
    await expect(page.locator('ul').getByText('Famille Scan').first()).toBeVisible();
    await expect(page.locator('table')).toBeHidden();
    await pasDeDebordement(page);
  });
});
