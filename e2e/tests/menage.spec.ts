import { carreEnMer, compte, mairie, POINT_EN_MER } from '../../apps/web/tests/support/fixtures';
import { expect, etat, RUN, SANS_MIGRATION_0006, session, test } from './base';
import { CODE_LIEN, TEL_LIEN } from './global-setup';

const CONTESTATION = `Bac toujours plein ${RUN}`;

test.describe('ménage déjà servi : rattachement puis suivi', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: session('menage') });

  // Chaque tentative (y compris une reprise) repart d'une fiche non rattachée,
  // avec deux passages ni confirmés ni contestés.
  test.beforeAll(async () => {
    const A = await compte('precoA', 'precollecteur');
    const { data } = await A.sb.from('clients').update({ user_id: null }).eq('code', CODE_LIEN).select('id').single();
    await A.sb.from('collectes').update({ confirmation_client: null, confirmation_at: null }).eq('client_id', data!.id);
  });

  test('code incorrect : refus clair', async ({ page }) => {
    await page.goto('/citoyen');
    await page.getByLabel('Code client').fill('MKT-00000000');
    await page.getByLabel('Téléphone').fill(TEL_LIEN);
    await page.getByRole('button', { name: 'Retrouver mon abonnement' }).click();
    await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText('Code ou téléphone incorrect');
  });

  test('bon code (minuscules) + téléphone : abonnement retrouvé', async ({ page }) => {
    await page.goto('/citoyen');
    await page.getByLabel('Code client').fill(CODE_LIEN.toLowerCase());
    await page.getByLabel('Téléphone').fill(`+237 ${TEL_LIEN}`);
    await page.getByRole('button', { name: 'Retrouver mon abonnement' }).click();
    await expect(page).toHaveURL(/\/citoyen\?rattache=1/);
    await expect(page.getByText('Compte rattaché : voici votre abonnement chez Test Propreté A.')).toBeVisible();
    await expect(page.getByText('Mon précollecteur')).toBeVisible();
  });

  test('confirme un passage', async ({ page }) => {
    await page.goto('/citoyen');
    const a = page.locator('section', { hasText: 'Confirmez les derniers passages' });
    await a.getByRole('button', { name: 'Il est passé' }).first().click();
    await expect(a.getByText('Confirmé')).toBeVisible();
  });

  test('conteste un passage : preuve obligatoire, prise sur le moment', async ({ page }) => {
    await page.goto('/citoyen/collectes');
    await page.getByRole('link', { name: 'Pas passé' }).first().click();
    await expect(page.getByRole('heading', { name: 'Le précollecteur n’est pas passé' })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Envoyer ma contestation' }).click();
    await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText('obligatoire');
    await page.getByRole('button', { name: /Ouvrir la caméra/ }).click();
    await page.getByRole('button', { name: 'Prendre la photo' }).click();
    await page.getByLabel('Description').fill(CONTESTATION);
    await page.getByRole('button', { name: 'Envoyer ma contestation' }).click();
    await expect(page).toHaveURL(/\/citoyen\/collectes/);
    await expect(page.getByText(/Contesté le/)).toBeVisible();
  });

  test('le précollecteur voit la contestation avec sa preuve', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: session('precoA') });
    const page = await ctx.newPage();
    await page.goto('/precollecteur/incidents');
    const item = page.locator('li', { hasText: CONTESTATION });
    await expect(item.getByText('Client', { exact: true })).toBeVisible();
    await expect(item.getByAltText('Preuve')).toBeVisible();
    await ctx.close();
  });

  test('factures, historique, QR code', async ({ page }) => {
    await page.goto('/citoyen/factures');
    await expect(page.getByText(/À régler avant le/)).toBeVisible();
    await page.goto('/citoyen/collectes');
    await expect(page.getByText('Vous avez confirmé')).toBeVisible();
    await page.goto('/citoyen/qr-code');
    await expect(page.getByText(CODE_LIEN, { exact: true })).toBeVisible();
    await expect(page.locator('main svg path').first()).toBeAttached();
  });

  test('signalement libre avec vidéo', async ({ page }) => {
    await page.goto('/citoyen/signaler');
    await page.getByText('Dépôt sauvage', { exact: true }).click();
    await page.getByRole('button', { name: /Vidéo/ }).click();
    await page.getByRole('button', { name: /Ouvrir la caméra/ }).click();
    await page.getByRole('button', { name: 'Démarrer l’enregistrement' }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Arrêter' }).click();
    await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(page.getByText('Signalement enregistré')).toBeVisible();
  });
});

test.describe('nouveau ménage : souscription en ligne', () => {
  test.use({ storageState: session('souscripteur') });

  test('hors zone couverte : message clair et alternative par code', async ({ page }) => {
    await page.goto('/citoyen');
    await page.getByRole('link', { name: /M’abonner maintenant/ }).click();
    await page.getByRole('button', { name: /Trimestriel/ }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Quartier').fill('Mvog-Mbi');
    await page.getByRole('button', { name: 'Ma position' }).click();
    await expect(page.getByText(/Position : 3\.84/)).toBeVisible();
    await page.getByRole('button', { name: /Trouver mon précollecteur/ }).click();
    await expect(page.getByText(/n’a pas encore de précollecteur partenaire attitré/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transmettre ma demande' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'J’ai déjà un code client' })).toBeVisible();
  });

  // Retour R3 : plus d'impasse hors zone — la demande part en liste d'attente
  // et un précollecteur la prend en charge. Point en mer : aucun vrai
  // précollecteur ne peut la voir dans sa zone.
  test('hors zone : demande en liste d’attente, prise en charge par un précollecteur', async ({ page, browser, context }) => {
    test.skip(!etat().migration0006, SANS_MIGRATION_0006);
    const quartier = `Quartier Essai ${Date.now().toString().slice(-6)}`;
    const S = await compte('souscripteur', 'citoyen');
    const A = await compte('precoA', 'precollecteur');
    try {
      await context.setGeolocation({ latitude: POINT_EN_MER.lat + 0.3, longitude: POINT_EN_MER.lng + 0.3 });
      await page.goto('/citoyen/souscrire');
      await page.getByRole('button', { name: /Mensuel/ }).click();
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.getByLabel('Quartier').fill(quartier);
      await page.getByRole('button', { name: 'Ma position' }).click();
      await page.getByRole('button', { name: /Trouver mon précollecteur/ }).click();
      await page.getByRole('button', { name: 'Transmettre ma demande' }).click();
      await expect(page).toHaveURL(/\/citoyen\?demande=attente/);
      await expect(page.getByText('Demande transmise')).toBeVisible();
      await expect(page.getByText(new RegExp(`pour ${quartier}`))).toBeVisible();

      // Côté précollecteur : la demande est visible SANS nom ni téléphone, puis prise.
      const ctx = await browser.newContext({ storageState: session('precoA') });
      const p2 = await ctx.newPage();
      await p2.goto('/precollecteur/demandes');
      const carte = p2.locator('li', { hasText: quartier });
      await expect(carte).toBeVisible();
      await expect(carte).not.toContainText('Test Souscripteur');
      await expect(carte).not.toContainText('690000000');
      await carte.getByRole('button', { name: 'Prendre en charge' }).click();
      await expect(p2).toHaveURL(/\/precollecteur\/clients\/[0-9a-f-]+\?pris=1/);
      await expect(p2.getByText('Test Souscripteur').first()).toBeVisible();
      await ctx.close();

      await page.goto('/citoyen');
      await expect(page.getByText('Demande transmise')).toHaveCount(0);
      await expect(page.getByText(/Test Propreté A/).first()).toBeVisible();
    } finally {
      await S.sb.from('demandes_abonnement').update({ statut: 'annulee' }).eq('statut', 'en_attente');
      await A.sb.from('clients').delete().eq('entreprise_id', etat().precoA).eq('quartier', quartier);
    }
  });

  test('liste d’attente : le ménage peut retirer sa demande', async ({ page, context }) => {
    test.skip(!etat().migration0006, SANS_MIGRATION_0006);
    const S = await compte('souscripteur', 'citoyen');
    try {
      await context.setGeolocation({ latitude: POINT_EN_MER.lat + 0.3, longitude: POINT_EN_MER.lng + 0.3 });
      await page.goto('/citoyen/souscrire');
      await page.getByRole('button', { name: /Mensuel/ }).click();
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.getByRole('button', { name: 'Ma position' }).click();
      await page.getByRole('button', { name: /Trouver mon précollecteur/ }).click();
      await page.getByRole('button', { name: 'Transmettre ma demande' }).click();
      await expect(page.getByText('Demande transmise')).toBeVisible();
      await page.getByRole('button', { name: 'Annuler ma demande' }).click();
      await expect(page.getByRole('link', { name: /M’abonner maintenant/ })).toBeVisible();
    } finally {
      await S.sb.from('demandes_abonnement').update({ statut: 'annulee' }).eq('statut', 'en_attente');
    }
  });

  test('dans une zone couverte : demande envoyée, acceptée par le précollecteur', async ({ page, browser, context }) => {
    test.skip(!etat().mairiePromue, `Compte Mairie non promu (${etat().mairieEmail})`);
    const M = await mairie();
    const A = await compte('precoA', 'precollecteur');
    const z = await M.sb.from('zones').insert({ nom: 'Zone test souscription', contour: carreEnMer(0) }).select('id').single();
    await M.sb.from('zone_affectations').insert({ zone_id: z.data!.id, entreprise_id: etat().precoA });
    try {
      await context.setGeolocation({ latitude: POINT_EN_MER.lat, longitude: POINT_EN_MER.lng });
      await page.goto('/citoyen/souscrire');
      await page.getByRole('button', { name: /Mensuel/ }).click();
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.getByRole('button', { name: 'Ma position' }).click();
      await page.getByRole('button', { name: /Trouver mon précollecteur/ }).click();
      await expect(page.getByText('Test Propreté A')).toBeVisible();
      await expect(page.getByText(/zone Zone test souscription/)).toBeVisible();
      await page.getByRole('button', { name: 'Envoyer ma demande' }).click();
      await expect(page).toHaveURL(/\/citoyen\?demande=1/);
      await expect(page.getByText(/Demande envoyée à Test Propreté A/)).toBeVisible();

      const ctx = await browser.newContext({ storageState: session('precoA') });
      const p2 = await ctx.newPage();
      await p2.goto('/precollecteur/clients?filtre=demande');
      await p2.getByRole('link', { name: 'Test Souscripteur' }).first().click();
      await p2.getByRole('button', { name: 'Accepter le client' }).click();
      await expect(p2.getByText(/À régler avant le/)).toBeVisible();
      await ctx.close();

      await page.goto('/citoyen');
      await expect(page.getByText(/première période à régler|À régler/)).toBeVisible();
    } finally {
      await A.sb.from('clients').delete().eq('entreprise_id', etat().precoA).eq('nom', 'Test Souscripteur');
      await M.sb.from('zones').delete().eq('id', z.data!.id);
    }
  });
});
