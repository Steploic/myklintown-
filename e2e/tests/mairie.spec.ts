import fs from 'node:fs';
import { mairie } from '../../apps/web/tests/support/fixtures';
import { expect, etat, session, test } from './base';

test.describe.configure({ mode: 'serial' });
test.use({ storageState: session('mairie') });

test.beforeEach(() => {
  test.skip(!etat().mairiePromue, `Compte Mairie non promu — select public.promouvoir_utilisateur('${etat().mairieEmail}', 'mairie');`);
});

test.afterAll(async () => {
  if (!etat().mairiePromue) return;
  const M = await mairie();
  await M.sb.from('zones').delete().like('nom', 'Zone test%');
});

test('supervision : indicateurs et export', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Supervision de la précollecte' })).toBeVisible();
  await expect(page.getByText('Précollecteurs actifs')).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Exporter/ }).click()]);
  expect(fs.readFileSync((await csv.path())!, 'utf8')).toContain('Zone;Commune;Précollecteurs');
});

test('dessiner une zone, vérifier, enregistrer, affecter, supprimer', async ({ page }) => {
  await page.goto('/dashboard/zones');
  await page.getByRole('button', { name: 'Dessiner une zone' }).click();
  const carte = page.locator('.leaflet-container');
  for (const [x, y] of [[300, 200], [420, 200], [420, 320], [300, 320]]) {
    await carte.click({ position: { x, y } });
  }
  await expect(page.getByText(/\(4 points\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Annuler le point' }).click();
  await expect(page.getByText(/\(3 points\)/)).toBeVisible();
  await carte.click({ position: { x: 300, y: 320 } });
  await page.getByLabel('Nom').fill('Zone test UI');
  await page.getByRole('button', { name: 'Vérifier les chevauchements' }).click();
  await expect(page.getByText(/Aucun chevauchement|Chevauche/)).toBeVisible();
  if (await page.getByText('Chevauche').isVisible()) await page.getByLabel('Chevauchement autorisé').check();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Zone créée.')).toBeVisible();

  // Après l'enregistrement, la zone est sélectionnée d'office.
  await expect(page.getByText('Aucun — zone non couverte.')).toBeVisible();
  await page.getByLabel('Affecter un précollecteur').selectOption({ label: 'Test Propreté A' });
  await expect(page.getByText('Précollecteur affecté.')).toBeVisible();
  await page.getByRole('button', { name: 'Retirer Test Propreté A' }).click();
  await expect(page.getByText('Affectation retirée.')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Zone supprimée.')).toBeVisible();
});

test('un chevauchement non autorisé est refusé à l’enregistrement', async ({ page }) => {
  const M = await mairie();
  await M.sb.from('zones').insert({
    nom: 'Zone test existante',
    contour: { type: 'Polygon', coordinates: [[[11.4, 3.7], [11.6, 3.7], [11.6, 3.95], [11.4, 3.95], [11.4, 3.7]]] },
  });
  await page.goto('/dashboard/zones');
  await page.getByRole('button', { name: 'Dessiner une zone' }).click();
  const carte = page.locator('.leaflet-container');
  for (const [x, y] of [[350, 250], [450, 250], [450, 350]]) await carte.click({ position: { x, y } });
  await page.getByLabel('Nom').fill('Zone test chevauchante');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(/Chevauchement avec : Zone test existante/)).toBeVisible();
});

test('précollecteurs et incidents', async ({ page }) => {
  await page.goto('/dashboard/precollecteurs');
  await expect(page.getByText('Test Propreté A')).toBeVisible();
  await page.goto('/dashboard/incidents');
  await expect(page.getByRole('heading', { name: 'Incidents signalés' })).toBeVisible();
});

test('la Mairie ne peut pas ouvrir les espaces précollecteur et ménage', async ({ page }) => {
  for (const url of ['/precollecteur', '/precollecteur/clients', '/citoyen']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});
