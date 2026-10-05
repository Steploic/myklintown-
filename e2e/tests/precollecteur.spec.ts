import fs from 'node:fs';
import { compte, emailDe, identifiants } from '../../apps/web/tests/support/fixtures';
import { etat, expect, RUN, session, test } from './base';

// Nom unique par exécution : une reprise ne tombe jamais sur le client d'un essai précédent.
const NOM = `Famille Nouvelle ${Date.now().toString().slice(-8)}`;

test.describe('précollecteur : inscription et démarrage', () => {
  test('s’inscrire → créer son entreprise → tableau de bord', async ({ page }) => {
    const cle = `inscrit${Date.now()}`;
    await page.goto('/signup?role=precollecteur');
    await page.getByLabel('Nom complet').fill('Test Inscrit');
    await page.getByLabel('Téléphone').fill('690000123');
    await page.getByLabel('E-mail').fill(emailDe(cle));
    await page.getByLabel('Mot de passe').fill(identifiants().motDePasse);
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/demarrage/, { timeout: 90_000 });
    await page.getByLabel('Nom de l’entreprise *').fill('Test Inscrit SARL');
    await page.getByRole('button', { name: 'Créer mon espace' }).click();
    await expect(page).toHaveURL(/\/precollecteur\?bienvenue=1/);
    await expect(page.getByRole('heading', { name: /Bienvenue, Test Inscrit SARL/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Charger la démo/ })).toBeVisible();
  });
});

test.describe('précollecteur : exploitation', () => {
  // Ces étapes s'enchaînent (le client créé est ensuite encaissé, etc.).
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: session('precoA') });

  test('tableau de bord : indicateurs réels', async ({ page }) => {
    await page.goto('/precollecteur');
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    await expect(page.getByText('Clients actifs')).toBeVisible();
    await expect(page.getByText('Factures impayées')).toBeVisible();
    await expect(page.getByText(/Commission MyKlinTown 10 %/)).toBeVisible();
  });

  test('nouveau client : carte, formule de la grille, première facture, QR', async ({ page }) => {
    await page.goto('/precollecteur/clients/nouveau');
    await page.getByLabel('Nom du client / du foyer *').fill(NOM);
    await page.getByLabel('Téléphone').fill('677 55 66 77');
    await page.getByLabel('Quartier').fill('Nsam');
    await page.getByRole('radio', { name: /Trimestriel/ }).check({ force: true });
    const carte = page.locator('.leaflet-container');
    await expect(carte).toBeVisible();
    await carte.click({ position: { x: 200, y: 150 } });
    await expect(page.getByText(/Position : 3\.\d+, 11\.\d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer le client' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/clients\/[0-9a-f-]+\?cree=1/);
    await expect(page.getByText('Client enregistré.')).toBeVisible();
    await expect(page.getByRole('heading', { name: NOM })).toBeVisible();
    await expect(page.locator('section', { hasText: 'QR code du foyer' }).locator('svg path').first()).toBeAttached();
    await expect(page.getByText(/9\s500\sFCFA/).first()).toBeVisible();
    await expect(page.getByText(/À régler avant le/)).toBeVisible();
  });

  test('encaisser la facture → payée, client à jour', async ({ page }) => {
    await page.goto(`/precollecteur/clients?q=${encodeURIComponent(NOM)}`);
    await page.getByRole('link', { name: NOM }).first().click();
    await page.locator('summary', { hasText: 'Encaisser' }).first().click();
    await page.getByLabel('Moyen de paiement').first().selectOption('mtn_momo');
    await page.getByRole('button', { name: 'Enregistrer le paiement' }).first().click();
    await expect(page.getByText(/référence de la transaction/)).toBeVisible();
    // Régression : un envoi refusé ne doit PAS remettre le moyen de paiement sur « Espèces ».
    await expect(page.getByLabel('Moyen de paiement').first()).toHaveValue('mtn_momo');
    await page.getByLabel('Référence (MoMo / virement)').first().fill('MP-E2E-001');
    await page.getByRole('button', { name: 'Enregistrer le paiement' }).first().click();
    await expect(page.getByText('Payée').first()).toBeVisible();
    await expect(page.getByText('À jour').first()).toBeVisible();
    await expect(page.getByText(/MTN Mobile Money · réf\. MP-E2E-001/)).toBeVisible();
  });

  test('reçu imprimable et étiquette QR', async ({ page }) => {
    await page.goto(`/precollecteur/clients?q=${encodeURIComponent(NOM)}`);
    await page.getByRole('link', { name: NOM }).first().click();
    await page.getByRole('link', { name: 'Reçu imprimable' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/facturation\/[0-9a-f-]+$/);
    await expect(page.getByText('Reçu de paiement')).toBeVisible();
    await expect(page.getByText('Reste à payer')).toBeVisible();
    await page.goBack();
    await page.getByRole('link', { name: 'Imprimer l’étiquette' }).click();
    await expect(page).toHaveURL(/\/etiquette$/);
    await expect(page.locator('article').getByText(/^MKT-[0-9A-F]{8}$/)).toBeVisible();
    await expect(page.locator('article svg path').first()).toBeAttached();
    await expect(page.getByText(/saisissez ce code et votre téléphone/)).toBeVisible();
  });

  test('liste clients : filtres, recherche, export CSV', async ({ page }) => {
    await page.goto('/precollecteur/clients');
    await expect(page.getByRole('link', { name: 'Famille Scan' }).first()).toBeVisible();
    await page.getByRole('link', { name: /^Impayés/ }).click();
    await expect(page.getByRole('link', { name: 'Famille Retard' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Famille Scan' })).toHaveCount(0);
    await page.goto('/precollecteur/clients');
    await page.getByLabel('Rechercher un client').fill('E2E0SCAN');
    await page.getByLabel('Rechercher un client').press('Enter');
    await expect(page.getByRole('link', { name: 'Famille Scan' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Famille Retard' })).toHaveCount(0);
    const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Exporter' }).click()]);
    const csv = fs.readFileSync((await telechargement.path())!, 'utf8');
    expect(csv).toContain('Famille Scan');
    expect(csv).toContain('MKT-E2E0SCAN');
    expect(csv.split('\n')[0]).toContain('Code;Nom;Téléphone');
  });

  test('recouvrement : niveau de relance, relance WhatsApp tracée', async ({ page, context }) => {
    await context.route(/wa\.me/, (r) => r.fulfill({ status: 200, body: 'WhatsApp simulé' }));
    await page.goto('/precollecteur/facturation');
    const carte = page.locator('li', { hasText: 'Famille Retard' });
    await expect(carte.getByText('Mise en demeure')).toBeVisible();
    const lien = carte.getByRole('link', { name: 'WhatsApp' });
    await expect(lien).toHaveAttribute('href', /wa\.me\/237677000888\?text=.*Famille%20Retard/);
    const [popup] = await Promise.all([page.waitForEvent('popup'), lien.click()]);
    await popup.close();
    await expect(carte.getByText('Relance tracée')).toBeVisible();
  });

  test('facturer les échéances en un clic', async ({ page }) => {
    await page.goto('/precollecteur/facturation');
    await page.getByRole('button', { name: /Facturer les échéances/ }).click();
    await expect(page.getByRole('status')).toContainText(/facture|Aucun abonnement/);
  });

  test('onglets de facturation', async ({ page }) => {
    for (const [onglet, attendu] of [['echeances', /Échéance|Aucune échéance/], ['factures', /Facture|Aucune facture/], ['paiements', /MP-E2E-001/]] as const) {
      await page.goto(`/precollecteur/facturation?onglet=${onglet}`);
      await expect(page.locator('main')).toContainText(attendu);
    }
  });

  test('flotte : tricycle, employé, équipage, état', async ({ page }) => {
    // Rejouable : une reprise ne doit pas tomber sur le tricycle d'un essai précédent.
    const A = await compte('precoA', 'precollecteur');
    await A.sb.from('tricycles').delete().eq('entreprise_id', etat().precoA).eq('nom', 'Tricycle UI');
    await A.sb.from('employes').delete().eq('entreprise_id', etat().precoA).eq('nom', 'Agent Terrain');
    await page.goto('/precollecteur/flotte');
    const volet = page.locator('details', { hasText: 'Ajouter un employé' });
    if ((await volet.getAttribute('open')) === null) await volet.locator('summary').click();
    await page.locator('#e-nom').fill('Agent Terrain');
    await page.locator('#e-nom').locator('xpath=ancestor::form').getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('Agent Terrain a rejoint l’équipe.')).toBeVisible();
    await page.getByText('Ajouter un tricycle').click();
    await page.locator('#t-nom').fill('Tricycle UI');
    await page.locator('#t-imm').fill('CE-999-UI');
    await page.locator('#t-nom').locator('xpath=ancestor::form').getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('Tricycle UI ajouté à la flotte.')).toBeVisible();
    const tri = page.locator('li', { hasText: 'Tricycle UI' });
    await tri.getByLabel('Affecter un employé').selectOption({ label: 'Agent Terrain' });
    await tri.getByRole('button', { name: 'Affecter' }).click();
    await expect(tri.getByRole('button', { name: /Agent Terrain/ })).toBeVisible();
    await tri.getByLabel('Changer l’état').selectOption('maintenance');
    await tri.getByRole('button', { name: 'OK' }).click();
    await expect(tri.getByText('Maintenance').first()).toBeVisible();
  });

  test('tournée : planifier, pointer, scanner un vrai QR, terminer', async ({ page }) => {
    await page.goto('/precollecteur/tournees');
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/tournees\/[0-9a-f-]+$/);
    const url = page.url();

    const retard = page.locator('li', { hasText: 'Famille Retard' });
    await expect(retard.getByText('Impayé')).toBeVisible();
    await retard.getByRole('button', { name: 'Non collecté' }).click();
    await retard.getByRole('button', { name: 'Client absent' }).click();
    await expect(retard.getByText('Non fait · Client absent')).toBeVisible();

    const lien = page.locator('li', { hasText: 'Foyer Lien' });
    await lien.getByRole('button', { name: 'Collecté', exact: true }).click();
    await expect(lien.getByText('Collecté', { exact: true })).toBeVisible();

    // Scan : la caméra simulée filme le QR de « Famille Scan ».
    await page.getByRole('button', { name: 'Scanner' }).click();
    await page.getByRole('button', { name: /Activer la caméra/ }).click();
    const bandeau = page.getByRole('status').filter({ hasText: 'Famille Scan' });
    await expect(bandeau).toBeVisible({ timeout: 45_000 });
    await expect(bandeau).toContainText('Servir');
    await expect(bandeau).toContainText(/passage enregistré|déjà enregistré/);

    // Tout est en base : un rechargement ne perd rien.
    await page.goto(url);
    await expect(page.getByText(/2 faits/)).toBeVisible();
    await expect(page.getByText(/1 non faits/)).toBeVisible();

    await page.getByRole('button', { name: 'Démarrer' }).click();
    await expect(page.getByText('En cours').first()).toBeVisible();
    await page.getByRole('button', { name: 'Terminer la tournée' }).click();
    await expect(page.getByText('Terminée').first()).toBeVisible();
    await expect(page.getByText(/0 restants/)).toBeVisible();
  });

  test('incident avec PHOTO prise dans l’application', async ({ page }) => {
    await page.goto('/precollecteur/incidents/nouveau');
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    await page.getByRole('button', { name: /Ouvrir la caméra/ }).click();
    await page.getByRole('button', { name: 'Prendre la photo' }).click();
    await expect(page.getByAltText('Preuve capturée')).toBeVisible();
    await page.getByText('Dépôt sauvage', { exact: true }).click();
    await page.getByLabel('Description').fill(`Tas d’ordures au carrefour ${RUN}`);
    await page.getByRole('button', { name: 'Enregistrer l’incident' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/incidents$/);
    const item = page.locator('li', { hasText: `Tas d’ordures au carrefour ${RUN}` });
    await expect(item.getByAltText('Preuve')).toBeVisible();
    await expect(item.getByAltText('Preuve')).toHaveJSProperty('complete', true);
  });

  test('incident avec VIDÉO enregistrée dans l’application', async ({ page }) => {
    await page.goto('/precollecteur/incidents/nouveau');
    await page.getByRole('button', { name: /Vidéo/ }).click();
    await page.getByRole('button', { name: /Ouvrir la caméra/ }).click();
    await page.getByRole('button', { name: 'Démarrer l’enregistrement' }).click();
    await expect(page.getByText(/REC \d+s/)).toBeVisible();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Arrêter' }).click();
    await expect(page.locator('video[controls]')).toBeVisible();
    await page.getByText('Panne de tricycle', { exact: true }).click();
    await page.getByLabel('Description').fill(`Chaîne cassée ${RUN}`);
    await page.getByRole('button', { name: 'Enregistrer l’incident' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/incidents$/);
    const item = page.locator('li', { hasText: `Chaîne cassée ${RUN}` });
    await expect(item.locator('video')).toHaveCount(1);
    await item.getByRole('button', { name: 'Résolu' }).click();
    await expect(page.locator('li', { hasText: `Chaîne cassée ${RUN}` })).toHaveCount(0);
  });

  test('grille tarifaire en lecture seule', async ({ page }) => {
    await page.goto('/precollecteur/grille');
    await expect(page.getByText(/35\s000\sFCFA/)).toBeVisible();
    await expect(page.getByText(/Vous recevez/).first()).toBeVisible();
    await expect(page.locator('main input')).toHaveCount(0);
  });

  test('paramètres : profil et entreprise', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByLabel('Nom de l’entreprise')).toHaveValue('Test Propreté A');
    await page.getByLabel('Téléphone').first().fill('690000321');
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(page.getByText('Profil mis à jour.')).toBeVisible();
    await page.getByLabel('Nouveau mot de passe').fill('abcdef');
    await page.getByLabel('Confirmation').fill('abcdeg');
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
    await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible();
  });
});

test.describe('précollecteur : données de démonstration', () => {
  test.use({ storageState: session('precoB') });
  test('charger puis supprimer la démo', async ({ page }) => {
    await page.goto('/precollecteur');
    await page.getByRole('button', { name: /Charger la démo/ }).click();
    await expect(page.getByText('Des données de démonstration sont affichées')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('1 nouvelle demande d’abonnement en ligne à valider')).toBeVisible();
    await page.goto('/precollecteur/flotte');
    await expect(page.getByText('Tricycle A (démo)')).toBeVisible();
    await expect(page.getByText('Tricycle B (démo)')).toBeVisible();
    await page.goto('/precollecteur/tournees');
    await expect(page.getByText('Terminée').first()).toBeVisible();
    await page.goto('/precollecteur');
    await page.getByRole('button', { name: 'Supprimer la démo' }).click();
    await expect(page.getByText('Commencez par vos clients')).toBeVisible({ timeout: 60_000 });
  });
});
