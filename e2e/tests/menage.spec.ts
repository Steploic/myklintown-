import type { Page } from '@playwright/test';
import { CLE_SERVICE, clientServiceTest, compte, supprimerClientsDeTest } from '../../apps/web/tests/support/fixtures';
import { expect, etat, RUN, SANS_MIGRATION_0018, session, test } from './base';
import { CODE_LIEN, TEL_LIEN } from './global-setup';

const CONTESTATION = `Bac toujours plein ${RUN}`;

test.describe('ménage déjà servi : rattachement puis suivi', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: session('menage') });

  // Chaque tentative (y compris une reprise) repart d'une fiche non rattachée,
  // avec deux passages ni confirmés ni contestés. Ces colonnes (compte
  // rattaché, réponse du ménage) ne se changent plus par l'API qu'en
  // administrateur (audit du 11/10/2026) : la remise à zéro passe par le
  // compte de test admin.
  test.beforeAll(async () => {
    const ADM = await compte('admin', 'citoyen');
    const { data } = await ADM.sb.from('clients').update({ user_id: null }).eq('code', CODE_LIEN).select('id').single();
    await ADM.sb.from('collectes').update({ confirmation_client: null, confirmation_at: null }).eq('client_id', data!.id);
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
    await expect(a.getByRole('button', { name: 'Il est passé' })).toHaveCount(2);
    await a.getByRole('button', { name: 'Il est passé' }).first().click();
    // Retour visible tout de suite (en production, la liste rafraîchie le faisait disparaître).
    await expect(a.getByText('Confirmé')).toBeVisible();
    // Et c'est en base : à la visite suivante, ce passage n'est plus à confirmer.
    await page.reload();
    await expect(a.getByRole('button', { name: 'Il est passé' })).toHaveCount(1);
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

// Demande de devis (retours de l'équipe, 08/11/2026) : l'abonné décrit ses
// besoins, les précollecteurs vérifiés de son secteur proposent leur tarif,
// il en accepte un. Plus de formule à choisir dans une grille commune.
test.describe('nouvel abonné : demande de devis', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: session('souscripteur') });

  /** Remplit la demande jusqu'à l'envoi ; `choisir` : le précollecteur à cibler dans l'annuaire. */
  async function demander(page: Page, quartier: string, choisir?: RegExp) {
    await page.goto('/citoyen');
    await page.getByRole('link', { name: /Demander un devis/ }).click();
    await expect(page).toHaveURL(/\/citoyen\/souscrire$/);
    await page.getByRole('button', { name: /Mon domicile/ }).click();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel('Quartier *').fill(quartier);
    await page.getByLabel('Repère exact *').fill('Portail bleu face à la pharmacie');
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByRole('radio', { name: '3 fois par semaine' }).check();
    await page.getByRole('checkbox', { name: 'J’ai besoin de sacs poubelles' }).check();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByRole('heading', { name: 'Position et précollecteur' })).toBeVisible();
    if (choisir) await page.getByRole('radio', { name: choisir }).check();
    // Sans la case cochée, la demande ne part pas.
    await expect(page.getByRole('button', { name: /Demander une évaluation/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: /J’ai lu et j’accepte/ }).check();
    await page.getByRole('button', { name: /Demander une évaluation/ }).click();
    await expect(page).toHaveURL(/\/citoyen\?demande=1/);
  }

  test.beforeEach(async () => {
    test.skip(!etat().migration0018, SANS_MIGRATION_0018);
    // Rien ne reste ouvert d'un essai précédent.
    await (await compte('souscripteur', 'citoyen')).sb.rpc('annuler_demande_devis');
  });

  test('liste d’attente : demande enregistrée, puis retirée', async ({ page }) => {
    const quartier = `Quartier Attente ${RUN}`;
    await demander(page, quartier);
    await expect(page.getByText('Votre demande est enregistrée')).toBeVisible();
    await expect(page.getByText(new RegExp(`pour ${quartier}`)).first()).toBeVisible();
    await expect(page.getByText(/liste d’attente/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Retirer ma demande' }).click();
    await expect(page.getByRole('link', { name: /Demander un devis/ })).toBeVisible();
  });

  test('devis : le précollecteur vérifié propose son tarif, l’abonné l’accepte', async ({ page, browser }) => {
    test.skip(!CLE_SERVICE, 'Clé de service de la base de test absente');
    const sb = clientServiceTest();
    const quartier = `Quartier Devis ${RUN}`;
    const A = await compte('precoA', 'precollecteur');
    await sb.from('entreprises').update({ dossier_statut: 'valide', quartiers: [quartier] }).eq('id', etat().precoA);
    await sb.from('parametres_plateforme').update({ valeur: '1' }).eq('cle', 'devis_ouverts');
    try {
      await demander(page, quartier, /Test Propreté A/);

      // Côté précollecteur : la demande, sans le nom ni le téléphone de l'abonné.
      const ctx = await browser.newContext({ storageState: session('precoA') });
      const p2 = await ctx.newPage();
      await p2.goto('/precollecteur/demandes');
      const carte = p2.locator('li', { hasText: quartier }).first();
      await expect(carte).toBeVisible();
      await expect(carte).toContainText('Vous a choisi');
      await expect(carte).toContainText('3 fois par semaine · sacs demandés (50 L)');
      await expect(carte).not.toContainText(/Test souscripteur/i);
      await expect(carte).not.toContainText('690000000');
      await expect(carte).not.toContainText('Portail bleu');
      await carte.getByLabel('Montant de chaque facture (FCFA) *').fill('4000');
      await carte.getByRole('button', { name: 'Proposer ce tarif' }).click();
      await expect(p2.locator('li', { hasText: quartier }).first()).toContainText(/Votre devis : 4\s000\sFCFA \/ mois/);

      // Côté abonné : le devis reçu, accepté.
      await page.goto('/citoyen');
      await expect(page.getByText('1 devis reçu')).toBeVisible();
      await expect(page.getByText(/4\s000\sFCFA \/ mois/).first()).toBeVisible();
      await page.getByRole('button', { name: 'Accepter ce devis' }).click();
      await expect(page).toHaveURL(/\/citoyen\?devis=accepte/);
      await expect(page.getByText(/Devis accepté : Test Propreté A est votre précollecteur/)).toBeVisible();

      // Le précollecteur a son nouveau client, au tarif du devis, avec le repère.
      await p2.goto(`/precollecteur/clients?q=${encodeURIComponent('Test souscripteur')}`);
      await p2.getByRole('link', { name: /Test souscripteur/i }).first().click();
      await expect(p2.getByText(/4\s000\sFCFA \/ mois · 3 fois par semaine · sacs fournis/)).toBeVisible();
      await expect(p2.getByText('Portail bleu face à la pharmacie').first()).toBeVisible();
      await ctx.close();
    } finally {
      await sb.from('parametres_plateforme').update({ valeur: '0' }).eq('cle', 'devis_ouverts');
      await sb.from('entreprises').update({ dossier_statut: 'incomplet', quartiers: [] }).eq('id', etat().precoA);
      await supprimerClientsDeTest(A.sb, etat().precoA, { quartier });
    }
  });
});
