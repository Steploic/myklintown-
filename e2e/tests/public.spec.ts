import { expect, pasDeDebordement, session, test } from './base';

test.describe('pages publiques', () => {
  test('accueil : message, appels à l’action, plus de grille tarifaire', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/MyKlinTown/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('La collecte des déchets, enfin simple et fiable pour tous.');
    await expect(page.getByRole('link', { name: /Créer mon espace précollecteur/ })).toHaveAttribute('href', '/signup?role=precollecteur');
    await expect(page.getByRole('link', { name: 'Faire ramasser mes déchets' }).first()).toHaveAttribute('href', '/signup?role=citoyen');
    await expect(page.getByText('Lancement officiel · décembre 2026').first()).toBeVisible();
    // Retours de l'équipe (08/11/2026) : ni grille commune, ni « pilote Yaoundé », ni étape Mairie.
    await expect(page.getByText(/FCFA/)).toHaveCount(0);
    await expect(page.getByText(/pilote/i)).toHaveCount(0);
    await expect(page.getByText('La Mairie découpe')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Une chaîne simple entre les acteurs.' })).toBeVisible();
  });

  test('les ancres du menu mènent aux bonnes sections', async ({ page }) => {
    await page.goto('/');
    for (const id of ['precollecteurs', 'abonnes', 'fonctionnement']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    for (const id of ['menages', 'mairies', 'tarifs']) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
  });

  test('contacts : appels uniquement, WhatsApp et e-mail', async ({ page }) => {
    await page.goto('/');
    const pied = page.locator('footer');
    await expect(pied.getByText('Appels uniquement')).toBeVisible();
    await expect(pied.getByRole('link', { name: '+237 6 40 12 90 41' })).toHaveAttribute('href', 'https://wa.me/237640129041');
    await expect(pied.getByRole('link', { name: 'projet.myklintown@gmail.com' })).toHaveAttribute('href', 'mailto:projet.myklintown@gmail.com');
  });

  test('connexion, inscription, charte, mentions légales', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await page.goto('/signup?role=citoyen');
    await expect(page.getByRole('radio', { name: /Abonné/ })).toBeChecked();
    await page.goto('/signup?role=precollecteur');
    await expect(page.getByRole('radio', { name: /Précollecteur/ })).toBeChecked();
    await page.goto('/marque');
    await expect(page.getByRole('heading', { name: 'L’identité MyKlinTown' })).toBeVisible();
    await page.goto('/legal');
    await expect(page.getByText('VRP')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Données personnelles' })).toBeVisible();
  });

  test('charte et contrat lisibles sans compte ; inscription abonné : case obligatoire', async ({ page }) => {
    await page.goto('/legal');
    await page.getByRole('link', { name: 'Charte de l’abonné' }).first().click();
    await expect(page).toHaveURL(/\/legal\/charte/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/^Version \d+$/).first()).toBeVisible();
    await page.goto('/legal/contrat');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Une version qui n'existe pas : message clair, pas d'erreur.
    await page.goto('/legal/contrat?version=999');
    await expect(page.getByText(/n’existe pas ou n’est pas publiée/)).toBeVisible();

    await page.goto('/signup?role=citoyen');
    const caseDocs = page.getByRole('checkbox', { name: /J’ai lu et j’accepte/ });
    await expect(caseDocs).toBeVisible();
    await page.getByRole('radio', { name: /Précollecteur/ }).check({ force: true });
    await expect(caseDocs).toHaveCount(0);
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

  test('connexion et inscription : retour vers le site, « déjà un compte ? », mot de passe visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Créer mon espace précollecteur/ }).first().click();
    await expect(page).toHaveURL(/\/signup/);
    // Sous le bouton de création : on a déjà un compte, on va se connecter.
    await page.getByRole('link', { name: 'Se connecter' }).last().click();
    await expect(page).toHaveURL(/\/login$/);

    const mdp = page.getByLabel('Mot de passe');
    await mdp.fill('secret-123');
    await expect(mdp).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Afficher la saisie' }).click();
    await expect(mdp).toHaveAttribute('type', 'text');
    await expect(mdp).toHaveValue('secret-123');
    await page.getByRole('button', { name: 'Masquer la saisie' }).click();
    await expect(mdp).toHaveAttribute('type', 'password');

    await page.getByRole('link', { name: 'Retour vers le site' }).click();
    await expect(page).toHaveURL(/\/$/);
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
    // Application installée : elle démarre sur /login. Une session ouverte ne
    // redemande pas le mot de passe (retour de l'équipe, 08/11/2026).
    test('/login avec une session ouverte → son espace, ou la page demandée', async ({ page }) => {
      await page.goto('/login');
      await expect(page).toHaveURL(/\/precollecteur$/);
      await page.goto('/login?next=/precollecteur/clients');
      await expect(page).toHaveURL(/\/precollecteur\/clients$/);
      await page.goto('/login?next=/dashboard');
      await expect(page).toHaveURL(/\/precollecteur$/);
      await page.goto('/signup?role=citoyen');
      await expect(page).toHaveURL(/\/precollecteur$/);
    });
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

// Portails Collecteur et Partenaire B2B (maquettes) retirés : un ancien lien
// ou favori mène à l'accueil, connecté ou non (redirection de next.config).
test.describe('portails de démonstration retirés', () => {
  const ANCIENS = ['/collecteur', '/collecteur/scan', '/enterprise', '/enterprise/marketplace'];
  for (const url of ANCIENS) {
    test(`${url} → accueil`, async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('La collecte des déchets');
    });
  }
  test.describe('connecté', () => {
    test.use({ storageState: session('precoA') });
    test('même chose pour un compte connecté', async ({ page }) => {
      for (const url of ANCIENS) {
        await page.goto(url);
        await expect(page, url).toHaveURL(/\/$/);
      }
    });
  });
});

test('page d’accueil sans débordement horizontal', async ({ page }) => {
  await page.goto('/');
  await pasDeDebordement(page);
});
