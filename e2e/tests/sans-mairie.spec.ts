/**
 * Sans les Mairies (migration 20261126000027) :
 *   - le précollecteur trace sa zone sur la carte, puis la supprime ;
 *   - accès Mairie fermés : ni lien d'accès à l'inscription ni au pied de
 *     page, la page d'accès renvoie à l'accueil, l'espace Mairie est fermé.
 * Les autres fichiers testent le monde où les accès sont ouverts (la mise en
 * place les ouvre) : chaque test qui les ferme les rouvre en sortant.
 */
import { interrupteurMairies } from '../../apps/web/tests/support/fixtures';
import { etat, expect, session, test } from './base';

test.describe('le précollecteur trace ses zones', () => {
  test.use({ storageState: session('precoA') });

  test('dessiner sa zone, la retrouver, la supprimer', async ({ page }) => {
    await page.goto('/precollecteur/zones');
    await expect(page.getByRole('heading', { name: 'Mes zones' })).toBeVisible();
    await page.getByRole('button', { name: 'Dessiner une zone' }).click();
    const carte = page.locator('.leaflet-container');
    for (const [x, y] of [[300, 200], [420, 200], [420, 320]]) await carte.click({ position: { x, y } });
    await expect(page.getByText(/\(3 points\)/)).toBeVisible();
    await page.getByLabel('Nom').fill('Zone test précollecteur');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Zone créée : elle vous est affectée.')).toBeVisible();

    // Sélectionnée d'office : ni affectation à d'autres, ni « libre ».
    await expect(page.getByText('Précollecteurs affectés')).toHaveCount(0);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Zone supprimée.')).toBeVisible();
  });
});

test.describe('accès Mairie fermés', () => {
  test('aucune entrée Mairie pour le public', async ({ page }) => {
    test.skip(!(await interrupteurMairies(false)), 'Migration 20261126000027_sans_mairie.sql non exécutée');
    try {
      await page.goto('/signup');
      await expect(page.getByRole('heading', { name: 'Créer un compte' })).toBeVisible();
      await expect(page.getByText('Vous représentez une Mairie ?')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Rejoignez votre équipe' })).toBeVisible();
      await expect(page.locator('footer').getByRole('link', { name: 'Mairie (sur demande)' })).toHaveCount(0);
      await page.goto('/acces-mairie');
      await expect(page).toHaveURL(/\/$/);
    } finally {
      await interrupteurMairies(true);
    }
  });

  test.describe('compte Mairie', () => {
    test.use({ storageState: session('mairie') });
    test('l’espace Mairie est fermé, sans menu', async ({ page }) => {
      test.skip(!etat().mairiePromue, 'Compte Mairie de test non promu');
      test.skip(!(await interrupteurMairies(false)), 'Migration 20261126000027_sans_mairie.sql non exécutée');
      try {
        await page.goto('/dashboard/zones');
        await expect(page.getByTestId('espace-mairie-ferme')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'L’espace Mairie est fermé' })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link')).toHaveCount(0);
      } finally {
        await interrupteurMairies(true);
      }
    });
  });
});
