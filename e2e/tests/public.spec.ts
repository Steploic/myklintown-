import { expect, pasDeDebordement, session, test } from './base';

test.describe('pages publiques', () => {
  test('accueil : message, appels à l’action, grille lue en base', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/MyKlinTown/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('La précollecte');
    await expect(page.getByRole('link', { name: /Créer mon espace précollecteur/ })).toHaveAttribute('href', '/signup?role=precollecteur');
    const tarifs = page.locator('#tarifs');
    await expect(tarifs.getByText(/3\s500\sFCFA/)).toBeVisible();
    await expect(tarifs.getByText(/9\s500\sFCFA/)).toBeVisible();
    await expect(tarifs.getByText(/35\s000\sFCFA/)).toBeVisible();
    await expect(tarifs.getByText('−10 %')).toBeVisible();
    await expect(tarifs.getByText('−17 %')).toBeVisible();
  });

  test('les ancres du menu mènent aux bonnes sections', async ({ page }) => {
    await page.goto('/');
    for (const id of ['precollecteurs', 'menages', 'mairies', 'tarifs']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
  });

  test('connexion, inscription, charte, mentions légales', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await page.goto('/signup?role=citoyen');
    await expect(page.getByRole('radio', { name: /Ménage/ })).toBeChecked();
    await page.goto('/signup?role=precollecteur');
    await expect(page.getByRole('radio', { name: /Précollecteur/ })).toBeChecked();
    await page.goto('/marque');
    await expect(page.getByRole('heading', { name: 'L’identité MyKlinTown' })).toBeVisible();
    await page.goto('/legal');
    await expect(page.getByText('VRP')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Données personnelles' })).toBeVisible();
  });

  test('aucune citation ou donnée inventée sur les pages publiques', async ({ page }) => {
    for (const url of ['/', '/login', '/signup', '/legal']) {
      await page.goto(url);
      const texte = await page.locator('body').innerText();
      expect(texte, url).not.toMatch(/TSANGA|Marie Tsanga|Chef de Service Hygiène|VRP/i);
    }
  });

  test('logo et icônes d’application servis', async ({ request }) => {
    for (const f of ['/brand/logo-horizontal.png', '/brand/logo-horizontal-blanc.png', '/brand/symbole.png', '/brand/icon-192.png', '/brand/icon-512.png', '/manifest.webmanifest']) {
      expect((await request.get(f)).status(), f).toBe(200);
    }
  });

  test('page introuvable', async ({ page, erreurs }) => {
    const r = await page.goto('/cette-page-n-existe-pas');
    expect(r?.status()).toBe(404);
    await expect(page.getByRole('link', { name: /accueil/i }).first()).toBeVisible();
    // Le navigateur journalise le 404 attendu : ce n'est pas une erreur de l'application.
    erreurs.splice(0, erreurs.length, ...erreurs.filter((e) => !/404/.test(e)));
  });

  test('formulaire de connexion : mauvais mot de passe', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('personne.inexistante.mkt@gmail.com');
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText('incorrect');
    // Régression : l'e-mail saisi reste en place après l'erreur.
    await expect(page.getByLabel('E-mail')).toHaveValue('personne.inexistante.mkt@gmail.com');
  });

  test('mot de passe oublié : réponse neutre (pas d’énumération de comptes)', async ({ page }) => {
    await page.goto('/forgot');
    await page.getByLabel(/e-mail/i).fill('personne.inexistante.mkt@gmail.com');
    await page.getByRole('button', { name: /Envoyer/ }).click();
    await expect(page.getByText(/Si un compte existe|L’envoi a échoué/)).toBeVisible();
  });
});

test.describe('espaces protégés sans connexion', () => {
  for (const url of ['/precollecteur', '/precollecteur/clients', '/citoyen', '/dashboard', '/dashboard/zones', '/settings']) {
    test(`${url} renvoie à la connexion`, async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(url).replace(/%2F/g, '(%2F|/)')}`));
    });
  }
  test('les exports CSV ne fuient pas sans connexion', async ({ request }) => {
    for (const url of ['/precollecteur/clients/export', '/dashboard/export']) {
      const r = await request.get(url, { maxRedirects: 0 });
      expect([302, 303, 307, 308], url).toContain(r.status());
    }
  });
});

test.describe('cloisonnement des espaces (connecté)', () => {
  test.describe('précollecteur', () => {
    test.use({ storageState: session('precoA') });
    for (const url of ['/dashboard', '/dashboard/zones', '/citoyen', '/citoyen/factures']) {
      test(`${url} → renvoyé vers son espace`, async ({ page }) => {
        await page.goto(url);
        await expect(page).toHaveURL(/\/precollecteur$/);
      });
    }
  });
  test.describe('ménage', () => {
    test.use({ storageState: session('souscripteur') });
    for (const url of ['/precollecteur', '/precollecteur/clients/export', '/dashboard', '/dashboard/export']) {
      test(`${url} → renvoyé vers son espace`, async ({ page }) => {
        await page.goto(url);
        await expect(page).toHaveURL(/\/citoyen$/);
      });
    }
  });
});

test.describe('pages de maquette retirées', () => {
  test.use({ storageState: session('souscripteur') });
  for (const url of ['/citoyen/marketplace', '/citoyen/recyclage', '/citoyen/abonnement']) {
    test(`${url} redirige vers l’accueil client`, async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveURL(/\/citoyen$/);
    });
  }
});

test('page d’accueil sans débordement horizontal', async ({ page }) => {
  await page.goto('/');
  await pasDeDebordement(page);
});
