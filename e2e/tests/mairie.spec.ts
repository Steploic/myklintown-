import fs from 'node:fs';
import { communeId, mairie } from '../../apps/web/tests/support/fixtures';
import { expect, etat, SANS_MIGRATION_0011, SANS_MIGRATION_0012, session, test } from './base';

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

test('indicateurs du pilote : les 8 indicateurs, les périmètres, les exports', async ({ page }) => {
  test.skip(!etat().migration0011, SANS_MIGRATION_0011);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Indicateurs du pilote' }).first().click();
  await expect(page.getByRole('heading', { name: 'Indicateurs du pilote', level: 1 })).toBeVisible();

  for (const cle of ['abonnes_actifs', 'taux_paiement', 'taux_execution', 'retention', 'delai_signalement_h', 'cout_par_menage', 'part_mobile_money', 'incidents_1000']) {
    await expect(page.getByTestId(`kpi-${cle}`)).toBeVisible();
  }
  const mensuel = page.getByTestId('tableau-mensuel');
  await expect(mensuel.getByRole('columnheader', { name: /octobre 2026/ })).toBeVisible();
  await expect(mensuel.getByRole('columnheader', { name: /décembre 2026/ })).toBeVisible();
  await expect(page.getByText('Critères de réussite au 31 décembre')).toBeVisible();

  const onglets = page.getByRole('navigation', { name: 'Périmètre' });
  let perimetre = 'douala';
  if (etat().migration0016) {
    // Une Mairie suit SA commune (migration 20261019000016) : un seul onglet, ni le pilote ni les villes.
    perimetre = 'YDE3';
    await expect(onglets.getByRole('link')).toHaveCount(1);
    await expect(onglets.getByRole('link', { name: 'Yaoundé III' })).toHaveAttribute('aria-current', 'page');
    // Demander une ville la ramène à sa commune.
    await page.goto('/dashboard/indicateurs?perimetre=douala');
    await expect(onglets.getByRole('link', { name: 'Yaoundé III' })).toHaveAttribute('aria-current', 'page');
  } else {
    await onglets.getByRole('link', { name: 'Douala' }).click();
    await expect(page).toHaveURL(/perimetre=douala/);
    await expect(onglets.getByRole('link', { name: 'Douala' })).toHaveAttribute('aria-current', 'page');
  }

  const [mois] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Tableau mensuel \(CSV\)/ }).click()]);
  expect(mois.suggestedFilename()).toMatch(new RegExp(`^indicateurs-pilote-mois-${perimetre}-`));
  const csv = fs.readFileSync((await mois.path())!, 'utf8');
  expect(csv).toContain('Indicateur;Définition;octobre 2026 — valeur');
  expect(csv).toContain('Taux de paiement effectif');
  const [semaines] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Relevés hebdomadaires \(CSV\)/ }).click()]);
  expect(fs.readFileSync((await semaines.path())!, 'utf8')).toContain('Début;Fin;Ménages inscrits');
});

test('codes d’agrément : délivrer, envoyer par WhatsApp, révoquer', async ({ page }) => {
  test.skip(!etat().migration0012, SANS_MIGRATION_0012);
  const nom = `Test Agrément ${Date.now().toString().slice(-6)}`;
  await page.goto('/dashboard/precollecteurs');
  await page.getByLabel('Précollecteur agréé *').fill(nom);
  await page.getByLabel('Téléphone').fill('690112233');
  await page.getByRole('button', { name: 'Délivrer un code' }).click();
  await expect(page.getByText(new RegExp(`Code délivré à ${nom} : [0-9A-Z]{5}-[0-9A-Z]{5}`))).toBeVisible();

  const ligne = page.getByTestId('codes-agrement').getByRole('listitem').filter({ hasText: nom });
  await expect(ligne.getByText('À utiliser')).toBeVisible();
  const whatsapp = await ligne.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/237690112233\?text=/);
  expect(decodeURIComponent(whatsapp!)).toContain('/signup?role=precollecteur');

  await ligne.getByRole('button', { name: 'Révoquer' }).click();
  await expect(ligne.getByText('Révoqué')).toBeVisible();
});

test('l’ancienne page « rapports » mène aux indicateurs', async ({ page }) => {
  test.skip(!etat().migration0011, SANS_MIGRATION_0011);
  await page.goto('/dashboard/rapports');
  await expect(page).toHaveURL(/\/dashboard\/indicateurs$/);
});

test('dessiner une zone, vérifier, enregistrer, affecter, supprimer', async ({ page }) => {
  await page.goto('/dashboard/zones');
  if (etat().migration0016) {
    // Le territoire de SA commune ; la zone y est rattachée d'office.
    await expect(page.getByText(/Découpez le territoire de Yaoundé III/)).toBeVisible();
  }
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
  if (etat().migration0016) await expect(page.getByLabel('Commune')).toHaveValue((await communeId())!);
  await page.getByRole('button', { name: 'Vérifier les chevauchements' }).click();
  // « Aucun chevauchement. » ou « Chevauche : » (et non « chevauchements » du bouton ou du sous-titre).
  await expect(page.getByText(/Aucun chevauchement\.|Chevauche :/)).toBeVisible();
  if (await page.getByText('Chevauche :', { exact: true }).isVisible()) await page.getByLabel('Chevauchement autorisé').check();
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
    commune_id: M.communeId,
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
  // Sa ligne dans le tableau de supervision (les codes d'agrément, plus bas, citent aussi l'entreprise).
  await expect(page.getByRole('row').filter({ hasText: 'Test Propreté A' })).toBeVisible();
  await page.goto('/dashboard/incidents');
  await expect(page.getByRole('heading', { name: 'Incidents signalés' })).toBeVisible();
});

test('la Mairie ne peut pas ouvrir les espaces précollecteur et ménage', async ({ page }) => {
  for (const url of ['/precollecteur', '/precollecteur/clients', '/citoyen']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});
