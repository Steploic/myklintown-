import { expect, session, test } from './base';

/**
 * Tournée sans réseau : le navigateur est VRAIMENT coupé (setOffline), comme
 * un téléphone qui perd le signal au milieu d'un quartier.
 *
 * « Foyer Lien » n'est volontairement pas touché : c'est le foyer du test
 * ménage, qui compte ses passages à confirmer.
 */
test.describe('tournée hors ligne', () => {
  test.use({
    storageState: session('precoA'),
    // Coupé du réseau, le navigateur le signale dans la console : ressources
    // injoignables, et Next.js qui ne peut plus précharger les pages du menu.
    erreursAttendues: /ERR_INTERNET_DISCONNECTED|Failed to fetch RSC payload/,
  });

  test('pointer et scanner sans réseau, tout part au retour du réseau', async ({ page, context }) => {
    await page.goto('/precollecteur/tournees');
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/tournees\/[0-9a-f-]+$/);
    const url = page.url();
    await page.getByRole('button', { name: 'Démarrer' }).click();
    await expect(page.getByText('En cours').first()).toBeVisible();
    const etat = page.getByTestId('etat-reseau');

    // --- Le signal tombe -----------------------------------------------------
    await context.setOffline(true);
    await expect(etat).toContainText('Hors ligne');

    const retard = page.locator('li', { hasText: 'Famille Retard' });
    await retard.getByRole('button', { name: 'Non collecté' }).click();
    await retard.getByRole('button', { name: 'Client absent' }).click();
    await expect(retard.getByText('Non fait · Client absent')).toBeVisible();
    await expect(retard.getByText('En attente d’envoi')).toBeVisible();

    // Scan sans réseau : la couleur vient de la liste du jour, déjà sur le téléphone.
    await page.getByRole('button', { name: 'Scanner' }).click();
    await page.getByRole('button', { name: /Activer la caméra/ }).click();
    const bandeau = page.getByRole('status').filter({ hasText: 'Famille Scan' });
    await expect(bandeau).toBeVisible({ timeout: 45_000 });
    await expect(bandeau).toContainText('Servir');
    await expect(bandeau).toContainText('hors ligne : passage gardé');
    await page.getByRole('button', { name: 'Fermer le scan' }).click();
    const scan = page.locator('li', { hasText: 'Famille Scan' });
    await expect(scan.getByText('Collecté', { exact: true })).toBeVisible();
    await expect(scan.getByText('En attente d’envoi')).toBeVisible();
    await expect(etat).toContainText('2 gestes en attente d’envoi');

    // Terminer maintenant compterait ces foyers « non visités » : refusé, expliqué.
    await page.getByRole('button', { name: 'Terminer la tournée' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'attendent encore d’être envoyés' })).toBeVisible();
    await expect(page.getByText('En cours').first()).toBeVisible();

    // La file est écrite sur le téléphone (elle survivrait à un rechargement).
    const enAttente = await page.evaluate(() => JSON.parse(localStorage.getItem('mkt:file-terrain:v1') ?? '[]').length);
    expect(enAttente).toBe(2);

    // --- Le réseau revient : tout part tout seul ------------------------------
    await context.setOffline(false);
    await expect(etat).toBeHidden({ timeout: 60_000 });
    await expect(page.locator('li').getByText('En attente d’envoi')).toHaveCount(0);

    // C'est bien en base : un rechargement retrouve les deux gestes.
    await page.goto(url);
    await expect(page.getByText(/1 faits/)).toBeVisible();
    await expect(page.getByText(/1 non faits/)).toBeVisible();
    await expect(page.locator('li', { hasText: 'Famille Retard' }).getByText('Non fait · Client absent')).toBeVisible();
  });

  test('sans réseau, l’encaissement et le démarrage le disent au lieu de planter', async ({ page, context }) => {
    await page.goto('/precollecteur/tournees');
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/tournees\/[0-9a-f-]+$/);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Démarrer' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Pas de réseau' })).toBeVisible();

    const retard = page.locator('li', { hasText: 'Famille Retard' });
    await retard.getByRole('button', { name: /Encaisser/ }).click();
    await retard.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(retard.getByRole('alert').filter({ hasText: 'Pas de réseau' })).toBeVisible();
    await context.setOffline(false);
  });
});
