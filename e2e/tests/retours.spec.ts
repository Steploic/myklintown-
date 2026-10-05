/**
 * Retours de test de l'équipe (rapport de Julien R1–R10, compte rendu de Pie) :
 * chaque correction est rejouée dans un vrai navigateur.
 */
import { compte, emailDe, identifiants, iso } from '../../apps/web/tests/support/fixtures';
import { expect, etat, SANS_MIGRATION_0006, seConnecter, session, test } from './base';
import { CODE_SCAN } from './global-setup';

test.describe('précollecteur : retours de test', () => {
  test.use({ storageState: session('precoA') });

  test('Pie — une tournée terminée est en lecture seule, et se rouvre', async ({ page }) => {
    const A = await compte('precoA', 'precollecteur');
    const { data } = await A.sb.from('tournees_precollecte').select('id').eq('entreprise_id', etat().precoA).eq('date', iso(-4)).single();
    await page.goto(`/precollecteur/tournees/${data!.id}`);
    await expect(page.getByText(/Tournée terminée : consultation seule/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scanner' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Collecté', exact: true })).toHaveCount(0);
    // La carte de la tournée est ouverte d'emblée.
    await expect(page.locator('.leaflet-container')).toBeVisible();

    await page.getByRole('button', { name: 'Rouvrir la tournée' }).click();
    await expect(page.getByText('En cours').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scanner' })).toBeVisible();
    await expect(page.getByText(/consultation seule/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Terminer la tournée' }).click();
    await expect(page.getByText(/Tournée terminée : consultation seule/)).toBeVisible();
  });

  test('R4 — impression : nom de fichier explicite, couleurs conservées', async ({ page }) => {
    const A = await compte('precoA', 'precollecteur');
    const { data: c } = await A.sb.from('clients').select('id').eq('code', CODE_SCAN).single();
    await page.goto(`/precollecteur/clients/${c!.id}/etiquette`);
    await expect(page).toHaveTitle(`QR_code_Famille_Scan_${CODE_SCAN}`);
    const etiquette = page.locator('article.impression-fidele');
    await expect(etiquette).toBeVisible();
    expect(await etiquette.evaluate((el) => getComputedStyle(el).printColorAdjust)).toBe('exact');

    const { data: f } = await A.sb.from('factures').select('id, numero').eq('client_id', c!.id).limit(1).single();
    await page.goto(`/precollecteur/facturation/${f!.id}`);
    await expect(page).toHaveTitle(new RegExp(`^Reçu_${f!.numero}_Famille_Scan_\\d{4}-\\d{2}-\\d{2}$`));
  });

  test('R7 / Pie — carte des clients colorée par statut, avec filtres', async ({ page }) => {
    await page.goto('/precollecteur/carte');
    await expect(page.getByRole('heading', { name: 'Carte des clients' })).toBeVisible();
    const reperes = page.locator('.leaflet-marker-icon');
    await expect.poll(() => reperes.count()).toBeGreaterThanOrEqual(2);
    const avant = await reperes.count();
    const filtre = page.getByRole('group', { name: 'Filtrer la carte' }).getByRole('button', { name: /À jour/ });
    await filtre.click();
    await expect(filtre).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => reperes.count()).toBeLessThan(avant);
    await filtre.click();
    await expect.poll(() => reperes.count()).toBe(avant);
  });

  test('R10 — une barre de progression répond tout de suite à la touche', async ({ page }) => {
    await page.goto('/precollecteur/clients');
    await page.waitForLoadState('networkidle');
    // Réseau lent simulé : la page filtrée met 2 s à arriver.
    await page.route(/\/precollecteur\/clients\?filtre=impaye/, async (r) => {
      await new Promise((fin) => setTimeout(fin, 2_000));
      await r.continue();
    });
    const barre = page.getByRole('progressbar', { name: 'Chargement de la page' });
    await page.getByRole('link', { name: /^Impayés/ }).click();
    await expect(barre).toBeVisible({ timeout: 1_000 });
    await expect(page).toHaveURL(/filtre=impaye/);
    await expect(barre).toHaveCount(0);
  });

  test('R8 — les noms saisis sont remis en forme', async ({ page }) => {
    const A = await compte('precoA', 'precollecteur');
    try {
      await page.goto('/precollecteur/clients/nouveau');
      await page.getByLabel('Nom du client / du foyer *').fill('  famille   NGONO-ESSO ');
      await page.getByLabel('Téléphone').fill('677 11 22 33');
      await page.getByLabel('Quartier').fill('mvog-ada');
      await page.getByRole('radio', { name: /Mensuel/ }).check({ force: true });
      await page.locator('.leaflet-container').click({ position: { x: 200, y: 150 } });
      await page.getByRole('button', { name: 'Enregistrer le client' }).click();
      await expect(page).toHaveURL(/\/precollecteur\/clients\/[0-9a-f-]+\?cree=1/);
      await expect(page.getByRole('heading', { name: 'Famille Ngono-Esso' })).toBeVisible();
      await expect(page.getByText('Mvog-Ada').first()).toBeVisible();
    } finally {
      await A.sb.from('clients').delete().eq('entreprise_id', etat().precoA).eq('nom', 'Famille Ngono-Esso');
    }
  });
});

test.describe('connexion et déconnexion', () => {
  test('R1 — après connexion, on revient sur la page demandée', async ({ page }) => {
    await page.goto('/precollecteur/clients');
    await expect(page).toHaveURL(/\/login\?next=%2Fprecollecteur%2Fclients/);
    await page.getByLabel('E-mail').fill(emailDe('precoA'));
    await page.getByLabel('Mot de passe').fill(identifiants().motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/clients$/);
  });

  test('R9 — se déconnecter depuis les paramètres', async ({ page }) => {
    await seConnecter(page, emailDe('deconnexion'), identifiants().motDePasse);
    await expect(page).toHaveURL(/\/citoyen/);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/logout$/);
    await page.goto('/citoyen');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('R1 — accès Mairie sur demande', () => {
  test('page publique : explication et formulaire complet', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Demander un accès' }).first().click();
    await expect(page).toHaveURL(/\/acces-mairie$/);
    await expect(page.getByRole('heading', { name: 'Accès Mairie' })).toBeVisible();
    for (const champ of ['Nom complet *', 'E-mail professionnel *', 'Mot de passe *', 'Commune *', 'Fonction *']) {
      await expect(page.getByLabel(champ)).toBeVisible();
    }
    if (etat().migration0006) {
      // Les communes sont lisibles avant toute création de compte (13 + « Choisir »).
      await expect.poll(() => page.getByLabel('Commune *').locator('option').count()).toBeGreaterThanOrEqual(14);
      await expect(page.getByLabel('Commune *').locator('option', { hasText: /^Douala V$/ })).toHaveCount(1);
    }
  });

  test.describe('compte connecté', () => {
    test.use({ storageState: session('acces') });

    test('envoyer la demande, voir son statut, la retirer', async ({ page }) => {
      test.skip(!etat().migration0006, SANS_MIGRATION_0006);
      const C = await compte('acces', 'citoyen');
      try {
        await page.goto('/acces-mairie');
        await expect(page.getByLabel('Mot de passe *')).toHaveCount(0);
        await page.getByLabel('Commune *').selectOption({ label: 'Yaoundé III' });
        await page.getByLabel('Fonction *').fill('Agent de test');
        await page.getByLabel('Service').fill('Hygiène et salubrité');
        await page.getByRole('button', { name: 'Envoyer la demande d’accès' }).click();
        await expect(page).toHaveURL(/\/acces-mairie\?envoyee=1/);
        await expect(page.getByText('Demande envoyée')).toBeVisible();

        // Rappel dans son espace tant que la demande n'est pas traitée.
        await page.goto('/citoyen');
        await expect(page.getByText(/Votre demande d’accès Mairie est en cours de traitement/)).toBeVisible();
        // Un compte non administrateur n'ouvre pas la page de validation.
        await page.goto('/dashboard/acces');
        await expect(page).not.toHaveURL(/\/dashboard\/acces/);

        await page.goto('/acces-mairie');
        await page.getByRole('button', { name: 'Retirer ma demande' }).click();
        await expect(page.getByRole('button', { name: 'Envoyer la demande d’accès' })).toBeVisible();
      } finally {
        await C.sb.rpc('annuler_demande_acces');
      }
    });
  });
});

test.describe('Changer d’espace (administrateurs)', () => {
  test.describe('précollecteur', () => {
    test.use({ storageState: session('precoA') });
    test('un non-administrateur ne voit pas le sélecteur', async ({ page }) => {
      await page.goto('/precollecteur');
      await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
      await expect(page.getByText('Changer d’espace')).toHaveCount(0);
    });
  });

  test.describe('administrateur', () => {
    test.use({ storageState: session('admin') });
    test('passer de la Mairie à l’espace Client puis Précollecteur, et revenir', async ({ page }) => {
      test.skip(!etat().adminPromu, `Compte administrateur de test non promu (${etat().adminEmail})`);
      const barre = page.getByRole('complementary');
      // Sélecteur cherché dans toute la page : un administrateur sans entreprise
      // arrive sur l'écran « Créer mon entreprise », qui n'a pas de barre latérale.
      const changer = async (espace: string) => {
        await page.getByText('Changer d’espace').click();
        await page.getByRole('link', { name: espace }).click();
      };
      await page.goto('/dashboard');
      await expect(barre.getByText('Espace Mairie')).toBeVisible();
      await changer('Espace Client');
      await expect(page).toHaveURL(/\/citoyen/);
      await expect(barre.getByText('Espace Client')).toBeVisible();
      await changer('Espace Précollecteur');
      await expect(page).toHaveURL(/\/precollecteur/);
      await changer('Espace Mairie');
      await expect(page).toHaveURL(/\/dashboard/);
      // La page de validation des accès reste dans le menu de l'espace Mairie.
      await expect(barre.getByRole('link', { name: 'Demandes d’accès' })).toBeVisible();
    });
  });
});
