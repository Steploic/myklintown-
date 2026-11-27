import { expect, session, test } from './base';

/**
 * Ouvrir l'application SANS RÉSEAU (service worker, apps/web/public/sw.js) :
 * le navigateur est vraiment coupé (setOffline, qui coupe aussi le service
 * worker), puis la page est RECHARGÉE — comme un téléphone qui a fermé le
 * navigateur au milieu du quartier.
 *
 * « Foyer Lien » n'est pas touché : c'est le foyer du test ménage.
 */
test.describe('ouvrir la tournée sans réseau', () => {
  test.use({
    storageState: session('precoA'),
    // Coupé du réseau, le navigateur le signale : ressources injoignables,
    // préchargement des pages du menu impossible.
    erreursAttendues: /ERR_INTERNET_DISCONNECTED|Failed to fetch RSC payload|Failed to load resource/,
  });

  test('la tournée démarrée se rouvre sans réseau, on y pointe ; une page jamais ouverte le dit et mène aux tournées', async ({ page, context }) => {
    await page.goto('/precollecteur/tournees');
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/tournees\/[0-9a-f-]+$/);
    const url = page.url();
    const chemin = new URL(url).pathname;
    await expect(page.getByTestId('hors-ligne-pret')).toHaveAttribute('data-version', 'planifiee', { timeout: 45_000 });
    await page.getByRole('button', { name: 'Démarrer' }).click();
    await expect(page.getByText('En cours').first()).toBeVisible();
    // Démarrée : la page se réenregistre telle quelle.
    await expect(page.getByTestId('hors-ligne-pret')).toHaveAttribute('data-version', 'en_cours', { timeout: 45_000 });

    // --- Plus de réseau, et la page est rechargée ------------------------------
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('hors-ligne-cache')).toContainText('page enregistrée le');
    await expect(page.getByText('En cours').first()).toBeVisible();

    const retard = page.locator('li', { hasText: 'Famille Retard' });
    await retard.getByRole('button', { name: 'Non collecté' }).click();
    await retard.getByRole('button', { name: 'Client absent' }).click();
    await expect(retard.getByText('En attente d’envoi')).toBeVisible();

    // Une page jamais enregistrée : « Pas de réseau », et les pages qui le sont.
    await page.goto('/precollecteur/clients');
    await expect(page.getByRole('heading', { name: 'Pas de réseau' })).toBeVisible();
    await page.locator(`a[href="${chemin}"]`).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId('hors-ligne-cache')).toBeVisible();
    await expect(page.locator('li', { hasText: 'Famille Retard' }).getByText('En attente d’envoi')).toBeVisible();

    // --- Le réseau revient : le geste part -------------------------------------
    await context.setOffline(false);
    await expect(page.getByTestId('etat-reseau')).toBeHidden({ timeout: 60_000 });
    await page.goto(url);
    await expect(page.getByTestId('hors-ligne-cache')).toHaveCount(0);
    await expect(page.locator('li', { hasText: 'Famille Retard' }).getByText('Non fait · Client absent')).toBeVisible();
  });
});
