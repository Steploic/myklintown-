/**
 * Import des clients depuis Excel (étape 6 du processus précollecteur), dans
 * un vrai navigateur : modèle téléchargé, fichier choisi, aperçu ligne par
 * ligne, import, étiquettes QR des seuls nouveaux clients, et réimport du
 * même fichier sans rien créer deux fois.
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { compte, supprimerClientsDeTest } from '../../apps/web/tests/support/fixtures';
import { ecrireXlsx, lireXlsx } from '../../apps/web/lib/tableur';
import { etat, expect, session, test } from './base';

// Quartier propre à ce test : ses fiches sont retirées avant et après.
const QUARTIER = 'Importville';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test.describe('import des clients depuis un fichier Excel', () => {
  test.use({ storageState: session('precoA') });

  const nettoyer = async () => {
    const A = await compte('precoA', 'precollecteur');
    await supprimerClientsDeTest(A.sb, etat().precoA, { quartier: QUARTIER });
  };
  test.beforeAll(nettoyer);
  test.afterAll(nettoyer);

  const choisirFichier = (page: Page, contenu: Uint8Array) =>
    page.locator('input[type="file"]').setInputFiles({ name: 'recensement.xlsx', mimeType: XLSX, buffer: Buffer.from(contenu) });

  test('modèle, aperçu, import, étiquettes des nouveaux clients, réimport sans doublon', async ({ page }) => {
    await page.goto('/precollecteur/clients');
    await page.getByRole('link', { name: /Importer \(Excel\)/ }).click();
    await expect(page).toHaveURL(/\/precollecteur\/clients\/import$/);

    // Le modèle se télécharge, et ses titres sont ceux que l'import attend.
    const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Télécharger le modèle/ }).click()]);
    expect(telechargement.suggestedFilename()).toBe('modele-clients-myklintown.xlsx');
    const modele = await lireXlsx(new Uint8Array(await readFile(await telechargement.path())));
    expect(modele[0]!.slice(0, 2)).toEqual(['Nom *', 'Téléphone']);

    // Le modèle rempli : 2 lignes prêtes, 1 à corriger, 1 doublon dans le fichier.
    const fichier = ecrireXlsx([
      {
        nom: 'Clients',
        lignes: [
          modele[0]!,
          ['Famille Importée Un', '+237 6 55 00 00 01', QUARTIER, 'Portail vert', 3500, 1, 2],
          ['Famille Importée Deux', '655000002', QUARTIER, '', 9500, 3],
          ['Famille Sans Tarif', '655000003', QUARTIER, '', 'gratuit'],
          ['Famille Doublon', '6 55 00 00 01', QUARTIER, '', 3500],
        ],
      },
    ]);
    await choisirFichier(page, fichier);
    await expect(page.getByTestId('bilan-import')).toHaveText('4 lignes lues · 2 prêtes · 1 à corriger · 1 doublon');
    await expect(page.getByText('Tarif invalide « gratuit »', { exact: false })).toBeVisible();
    await expect(page.getByText('Même téléphone que la ligne 2.')).toBeVisible();

    await page.getByRole('button', { name: 'Importer 2 clients' }).click();
    await expect(page.getByText('2 clients ajoutés')).toBeVisible();

    // Les étiquettes QR de ces seuls clients, prêtes pour l'imprimeur.
    await page.getByRole('link', { name: /Imprimer leurs étiquettes QR/ }).click();
    await expect(page).toHaveURL(/\/precollecteur\/clients\/planche\?depuis=/);
    const etiquettes = page.locator('.planche-page article');
    await expect(etiquettes).toHaveCount(2);
    await expect(etiquettes.filter({ hasText: 'Famille Importée Un' })).toHaveCount(1);
    await expect(etiquettes.filter({ hasText: 'Famille Importée Deux' })).toHaveCount(1);

    // Réimporter le même fichier (après correction partielle, par exemple) ne crée rien deux fois.
    await page.goto('/precollecteur/clients/import');
    await choisirFichier(page, fichier);
    await expect(page.getByTestId('bilan-import')).toHaveText('4 lignes lues · 0 prête · 1 à corriger · 3 doublons');
    await expect(page.getByRole('button', { name: 'Importer 0 client' })).toBeDisabled();
  });
});
