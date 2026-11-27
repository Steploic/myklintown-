import { clientServiceTest, compte } from '../../apps/web/tests/support/fixtures';
import { etat, expect, session, test } from './base';

/**
 * Accompagnement vers la conformité (migration 20261127000029) : l'équipe
 * MyKlinTown suit la demande d'un précollecteur, qui lit son message dans son
 * dossier.
 */
test.describe('accompagnement vers la conformité', () => {
  test.use({ storageState: session('admin') });

  test('l’équipe suit une demande ; le gérant lit son message dans son dossier', async ({ page, browser }) => {
    test.skip(!etat().adminPromu, `Compte administrateur de test non promu (${etat().adminEmail})`);
    const A = await compte('precoA', 'precollecteur');
    const service = clientServiceTest();
    await service.from('accompagnements').delete().eq('entreprise_id', etat().precoA);
    const { error } = await A.sb.rpc('demander_accompagnement', { p_etape: 'structure', p_commune: null, p_message: 'Nous sommes quatre, sans statut' });
    expect(error).toBeNull();
    try {
      await page.goto('/dashboard/accompagnements');
      const carte = page.getByTestId('accompagnements-a-suivre').locator('li', { hasText: 'Test Propreté A' });
      await expect(carte).toContainText('Créer une structure légale');
      await expect(carte).toContainText('Nous sommes quatre, sans statut');
      await carte.getByLabel('Où en est-on ?').selectOption({ label: 'Contacté' });
      await carte.getByLabel(/Message au précollecteur/).fill('Atelier « structure légale » samedi à 9 h');
      await carte.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(carte.getByText('Suivi enregistré.')).toBeVisible();

      // Le gérant lit le message dans son dossier.
      const gerant = await browser.newContext({ storageState: session('precoA') });
      try {
        const dossier = await gerant.newPage();
        await dossier.goto('/precollecteur/dossier');
        const ligne = dossier.getByTestId('accompagnement').locator('li', { hasText: 'Créer une structure légale' });
        await expect(ligne.getByText('L’équipe vous a contacté')).toBeVisible();
        await expect(ligne).toContainText('Atelier « structure légale » samedi à 9 h');
      } finally {
        await gerant.close();
      }
    } finally {
      await service.from('accompagnements').delete().eq('entreprise_id', etat().precoA);
    }
  });
});
