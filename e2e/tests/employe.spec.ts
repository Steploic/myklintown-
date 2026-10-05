/**
 * Espace employé (proposition de Pie), de bout en bout, dans un vrai navigateur :
 * le gérant invite, l'employé rejoint l'équipe, part en tournée (scan avec la
 * caméra simulée, position en direct, espèces reçues), le gérant valide.
 */
import type { Page } from '@playwright/test';
import { compte, emailDe, identifiants, iso, plans } from '../../apps/web/tests/support/fixtures';
import { etat, expect, session, test } from './base';

const SANS_MIGRATION_0007 = 'Migration 20261005000007_espace_employe.sql non exécutée';
const EMPLOYE = 'Ramasseur Essai';
// Foyer propre à ce test : ses espèces sont validées, il ne doit pas fausser
// les tests de recouvrement qui suivent (Famille Retard reste impayée).
const FOYER = 'Foyer Especes';

test.describe('espace employé : de l’invitation à la validation des espèces', () => {
  test.describe.configure({ mode: 'serial' });

  let code = '';
  let tourneeUrl = '';

  // Le compte employé de test repart toujours d'une fiche neuve (la remise à
  // zéro de l'entreprise A a supprimé l'ancienne, ce qui libère le compte).
  test.beforeAll(async () => {
    if (!etat().migration0007) return;
    const A = await compte('precoA', 'precollecteur');
    const e = etat().precoA;
    await A.sb.from('employes').delete().eq('entreprise_id', e).eq('nom', EMPLOYE);
    await A.sb.from('clients').delete().eq('entreprise_id', e).eq('nom', FOYER);
    const [plan] = await plans(A.sb);
    const { data } = await A.sb.from('clients').insert({ entreprise_id: e, nom: FOYER, telephone: '677000222', plan_id: plan!.id }).select('id').single();
    await A.sb.from('factures').insert({
      entreprise_id: e, client_id: (data as { id: string }).id, montant_fcfa: plan!.prix_fcfa,
      periode_debut: iso(-30), periode_fin: iso(-1), echeance: iso(-10),
    });
  });

  test.afterAll(async () => {
    if (!etat().migration0007) return;
    const A = await compte('precoA', 'precollecteur');
    await A.sb.from('clients').delete().eq('entreprise_id', etat().precoA).eq('nom', FOYER);
  });

  const gerant = async (browser: import('@playwright/test').Browser) => {
    const ctx = await browser.newContext({ storageState: session('precoA') });
    return { ctx, page: await ctx.newPage() };
  };
  const connecterEmploye = async (page: Page, suite = '/employe') => {
    await page.goto(`/login?next=${encodeURIComponent(suite)}`);
    await page.getByLabel('E-mail').fill(emailDe('employe'));
    await page.getByLabel('Mot de passe').fill(identifiants().motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
  };

  test('le gérant ajoute un employé et l’invite', async ({ browser }) => {
    test.skip(!etat().migration0007, SANS_MIGRATION_0007);
    const { ctx, page } = await gerant(browser);
    await page.goto('/precollecteur/flotte');
    const volet = page.locator('details', { hasText: 'Ajouter un employé' });
    if ((await volet.getAttribute('open')) === null) await volet.locator('summary').click();
    await page.locator('#e-nom').fill(EMPLOYE);
    await page.locator('#e-fn').selectOption('collecteur');
    await page.locator('#e-nom').locator('xpath=ancestor::form').getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText(`${EMPLOYE} a rejoint l’équipe.`)).toBeVisible();

    const ligne = page.locator('li', { hasText: EMPLOYE }).filter({ has: page.getByRole('button', { name: /Inviter/ }) });
    await ligne.getByRole('button', { name: /Inviter/ }).click();
    const bloc = page.locator('li', { hasText: EMPLOYE }).filter({ hasText: 'Code d’invitation' });
    await expect(bloc).toBeVisible();
    code = (await bloc.getByText(/^[0-9A-F]{8}$/).innerText()).trim();
    expect(code).toMatch(/^[0-9A-F]{8}$/);
    await expect(bloc.getByRole('link', { name: 'Envoyer par WhatsApp' })).toHaveAttribute('href', /wa\.me\/.*rejoindre%3Fcode%3D/);
    await ctx.close();
  });

  test('l’employé ouvre le lien, se connecte et rejoint l’équipe', async ({ page }) => {
    test.skip(!etat().migration0007, SANS_MIGRATION_0007);
    await page.goto(`/rejoindre?code=${code}`);
    await expect(page.getByText('Test Propreté A')).toBeVisible();
    await expect(page.getByText(new RegExp(`Pour ${EMPLOYE}, ramasseur`))).toBeVisible();
    // Compte existant : connexion, puis retour sur l'invitation.
    await page.getByRole('link', { name: 'Connectez-vous' }).click();
    // Attendre la page de connexion : « Rejoindre » a aussi un champ « E-mail ».
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel('E-mail').fill(emailDe('employe'));
    await page.getByLabel('Mot de passe').fill(identifiants().motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(new RegExp(`/rejoindre\\?code=${code}`));
    await page.getByRole('button', { name: 'Rejoindre l’équipe' }).click();
    await expect(page).toHaveURL(/\/employe$/);
    await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
    await expect(page.getByText('Aucune tournée prévue')).toBeVisible();
    // Un employé n'ouvre pas l'espace du gérant.
    await page.goto('/precollecteur/facturation');
    await expect(page).toHaveURL(/\/employe/);
  });

  test('le gérant planifie une tournée avec cet employé dans l’équipe', async ({ browser }) => {
    test.skip(!etat().migration0007, SANS_MIGRATION_0007);
    const { ctx, page } = await gerant(browser);
    await page.goto('/precollecteur/tournees');
    await page.getByLabel(EMPLOYE).check();
    await page.getByRole('button', { name: 'Planifier' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/tournees\/[0-9a-f-]+$/);
    tourneeUrl = new URL(page.url()).pathname;
    await expect(page.getByText(new RegExp(`Équipe : ${EMPLOYE}`))).toBeVisible();
    await ctx.close();
  });

  test('sur le terrain : démarrer, position en direct, scan, espèces, fin de tournée', async ({ page }) => {
    test.skip(!etat().migration0007, SANS_MIGRATION_0007);
    await connecterEmploye(page);
    await expect(page).toHaveURL(/\/employe$/);
    await page.locator('a[href^="/employe/tournees/"]').first().click();
    await expect(page.getByText(new RegExp(`Équipe : ${EMPLOYE}`))).toBeVisible();
    await page.getByRole('button', { name: 'Démarrer' }).click();
    await expect(page.getByText(/Position partagée avec le gérant/)).toBeVisible();
    await expect(page.getByText(/dernier envoi/)).toBeVisible({ timeout: 45_000 });

    // Scan : la caméra simulée filme le QR de « Famille Scan ».
    await page.getByRole('button', { name: 'Scanner' }).click();
    await page.getByRole('button', { name: /Activer la caméra/ }).click();
    const bandeau = page.getByRole('status').filter({ hasText: 'Famille Scan' });
    await expect(bandeau).toBeVisible({ timeout: 45_000 });
    await expect(bandeau).toContainText(/passage enregistré|déjà enregistré/);
    await page.getByRole('button', { name: 'Fermer le scan' }).click();

    // Le foyer doit sa facture : l'employé reçoit l'argent en espèces.
    const retard = page.locator('li', { hasText: FOYER });
    await retard.getByRole('button', { name: /Encaisser/ }).click();
    await retard.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(retard.getByText('Espèces enregistrées : le gérant doit les valider.')).toBeVisible();
    await expect(page.getByText(/en espèces reçus sur cette tournée attendent la validation du gérant/)).toBeVisible();
    await expect(retard.getByRole('button', { name: /Encaisser/ })).toHaveCount(0);
  });

  test('le gérant voit l’équipe en direct et valide les espèces', async ({ browser }) => {
    test.skip(!etat().migration0007, SANS_MIGRATION_0007);
    const { ctx, page } = await gerant(browser);
    await page.goto(tourneeUrl);
    await expect(page.getByText(new RegExp(`position en direct \\(${EMPLOYE} à \\d{2}:\\d{2}\\)`))).toBeVisible();

    await page.goto('/precollecteur');
    await expect(page.getByText(/1 paiement en espèces reçu par votre équipe à valider/)).toBeVisible();
    await page.goto('/precollecteur/facturation');
    const aValider = page.locator('section', { hasText: 'Espèces à valider' });
    await expect(aValider.getByText(new RegExp(`reçu par ${EMPLOYE}`))).toBeVisible();
    await aValider.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByText('Espèces à valider')).toHaveCount(0);
    await page.goto('/precollecteur/clients?filtre=impaye');
    await expect(page.getByRole('link', { name: FOYER })).toHaveCount(0);
    await ctx.close();
  });

  test('l’employé termine la tournée et retrouve tout dans son historique', async ({ page }) => {
    test.skip(!etat().migration0007, SANS_MIGRATION_0007);
    await connecterEmploye(page, tourneeUrl.replace('/precollecteur/', '/employe/'));
    await page.getByRole('button', { name: 'Terminer la tournée' }).click();
    await expect(page.getByText(/consultation seule/)).toBeVisible();
    await page.goto('/employe/historique');
    const ligne = page.locator('li', { hasText: FOYER });
    await expect(ligne.getByText('Validé')).toBeVisible();
    await page.goto('/employe');
    await expect(page.getByText('Espèces validées')).toBeVisible();
  });

  test('le gérant retire l’accès : l’employé redevient un compte ménage', async ({ browser, page }) => {
    test.skip(!etat().migration0007, SANS_MIGRATION_0007);
    const { ctx, page: g } = await gerant(browser);
    await g.goto('/precollecteur/flotte');
    await g.locator('li', { hasText: EMPLOYE }).getByRole('button', { name: 'Retirer l’accès' }).click();
    await expect(g.locator('li', { hasText: EMPLOYE }).getByText('Compte relié')).toHaveCount(0);
    await ctx.close();

    await connecterEmploye(page, '/employe');
    await expect(page).toHaveURL(/\/citoyen/);
  });
});
