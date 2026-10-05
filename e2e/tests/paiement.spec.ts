/**
 * Paiement en ligne, de bout en bout, en MODE SIMULATION (aucun argent réel) :
 * le gérant ouvre le paiement, le ménage paie depuis son espace, un lien
 * WhatsApp est payé sans compte, et un paiement est demandé sur le téléphone
 * du ménage pendant la tournée.
 *
 * Simulation : un numéro finissant par 000001 a un « solde insuffisant » ;
 * les autres paient au bout de 5 s (voir lib/paiement/regles.ts).
 */
import { CLE_SERVICE, clientServiceTest, compte, iso, plans } from '../../apps/web/tests/support/fixtures';
import { etat, expect, session, test } from './base';
import { CODE_LIEN } from './global-setup';

const FOYER_LIEN = 'Foyer Lien Paiement';
const FOYER_TOURNEE = 'Foyer Tournee Paiement';
const service = clientServiceTest;
const RAISON =
  'Paiement en ligne : migration 20261006000008 et SUPABASE_SECRET_KEY (apps/web/.env.local) requises ; simulation uniquement en local';

test.describe('paiement en ligne (simulation)', () => {
  test.describe.configure({ mode: 'serial' });
  const pret = () => etat().migration0008 && !!CLE_SERVICE && !process.env.E2E_BASE_URL;

  test.beforeAll(async () => {
    if (!pret()) return;
    const A = await compte('precoA', 'precollecteur');
    const e = etat().precoA;
    // Point de départ : paiement en ligne fermé.
    await service().from('entreprises').update({ paiement_statut: 'inactif', paiement_compte_id: null }).eq('id', e);
    // Le ménage de test est relié à sa fiche (« Foyer Lien ») : le test ne dépend pas de menage.spec.
    const M = await compte('menage', 'citoyen');
    await service().from('clients').update({ user_id: M.id }).eq('code', CODE_LIEN);
    const [plan] = await plans(A.sb);
    for (const [nom, telephone] of [[FOYER_LIEN, '677000444'], [FOYER_TOURNEE, '699000555']] as const) {
      await A.sb.from('clients').delete().eq('entreprise_id', e).eq('nom', nom);
      const { data } = await A.sb.from('clients').insert({ entreprise_id: e, nom, telephone, plan_id: plan!.id }).select('id').single();
      await A.sb.from('factures').insert({
        entreprise_id: e, client_id: (data as { id: string }).id, montant_fcfa: plan!.prix_fcfa,
        periode_debut: iso(-30), periode_fin: iso(-1), echeance: iso(-5),
      });
    }
  });

  test.afterAll(async () => {
    if (!pret()) return;
    const A = await compte('precoA', 'precollecteur');
    const e = etat().precoA;
    await A.sb.from('clients').delete().eq('entreprise_id', e).in('nom', [FOYER_LIEN, FOYER_TOURNEE]);
    await service().from('entreprises').update({ paiement_statut: 'inactif', paiement_compte_id: null }).eq('id', e);
  });

  test.describe('gérant', () => {
    test.use({ storageState: session('precoA') });
    test('ouvre le paiement en ligne (vérification simulée)', async ({ page }) => {
      test.skip(!pret(), RAISON);
      await page.goto('/precollecteur/facturation');
      await page.getByRole('link', { name: /Paiement en ligne/ }).click();
      await expect(page).toHaveURL(/\/precollecteur\/paiement-en-ligne/);
      await page.getByRole('button', { name: 'Activer le paiement en ligne' }).click();
      await expect(page.getByText('Paiement en ligne actif')).toBeVisible();
      await expect(page.getByText(/Commission MyKlinTown de 10 %/)).toBeVisible();
    });
  });

  test.describe('ménage', () => {
    test.use({ storageState: session('menage') });
    test('paie sa facture depuis son espace', async ({ page }) => {
      test.skip(!pret(), RAISON);
      await page.goto('/citoyen/factures');
      await page.getByText('Payer par Mobile Money').first().click();
      const tel = page.getByLabel('Numéro Mobile Money').first();
      await expect(tel).toHaveValue(/6/);
      await expect(page.getByRole('radio', { name: 'MTN MoMo' }).first()).toBeChecked();
      await page.getByRole('button', { name: /^Payer/ }).first().click();
      await expect(page.getByText('En attente de validation sur le téléphone')).toBeVisible();
      await expect(page.getByText(/Paiement de .* reçu\. Merci !/)).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByText('Payée').first()).toBeVisible();
    });
  });

  test.describe('lien WhatsApp et tournée', () => {
    test.use({ storageState: session('precoA') });

    test('lien de paiement : échec « solde insuffisant », puis paiement réussi, sans compte', async ({ page, browser }) => {
      test.skip(!pret(), RAISON);
      await page.goto(`/precollecteur/clients?q=${encodeURIComponent(FOYER_LIEN)}`);
      await page.getByRole('link', { name: FOYER_LIEN }).first().click();
      await page.getByRole('button', { name: 'Lien de paiement' }).click();
      const bloc = page.locator('div', { hasText: 'Lien de paiement prêt' }).last();
      await expect(bloc).toBeVisible();
      await expect(bloc.getByRole('link', { name: 'Envoyer par WhatsApp' })).toHaveAttribute('href', /wa\.me\/237677000444\?text=/);
      const url = (await bloc.locator('p').nth(1).innerText()).trim();
      expect(url).toMatch(/\/payer\/[0-9a-f]{32}$/);

      const anonyme = await browser.newContext();
      const p = await anonyme.newPage();
      await p.goto(new URL(url).pathname);
      await expect(p.getByRole('heading', { name: 'Payer ma facture' })).toBeVisible();
      await expect(p.getByText(FOYER_LIEN)).toBeVisible();
      await p.getByLabel('Numéro Mobile Money').fill('677000001');
      await p.getByRole('button', { name: /^Payer/ }).click();
      await expect(p.getByText('Solde insuffisant.')).toBeVisible({ timeout: 30_000 });
      await p.getByLabel('Numéro Mobile Money').fill('677000444');
      await p.getByRole('button', { name: /^Payer/ }).click();
      await expect(p.getByText(/Paiement de .* reçu\. Merci !/)).toBeVisible({ timeout: 30_000 });
      await p.reload();
      await expect(p.getByText('Facture réglée')).toBeVisible();
      await anonyme.close();
    });

    test('pendant la tournée : paiement demandé sur le téléphone du ménage', async ({ page }) => {
      test.skip(!pret(), RAISON);
      await page.goto('/precollecteur/tournees');
      await page.getByRole('button', { name: 'Planifier' }).click();
      await expect(page).toHaveURL(/\/precollecteur\/tournees\/[0-9a-f-]+$/);
      const ligne = page.locator('li', { hasText: FOYER_TOURNEE });
      await ligne.getByRole('button', { name: /Encaisser/ }).click();
      await ligne.getByRole('tab', { name: 'Mobile Money' }).click();
      await expect(ligne.getByLabel('Numéro du ménage')).toHaveValue('699000555');
      await expect(ligne.getByRole('radio', { name: 'Orange Money' })).toBeChecked();
      await ligne.getByRole('button', { name: /^Demander/ }).click();
      await expect(ligne.getByText(/Le ménage reçoit un message Orange Money/)).toBeVisible();
      await expect(ligne.getByText(/Paiement de .* reçu\. Merci !/)).toBeVisible({ timeout: 30_000 });
    });

    test('le gérant retrouve les paiements en ligne, commission comprise', async ({ page }) => {
      test.skip(!pret(), RAISON);
      await page.goto('/precollecteur/paiement-en-ligne');
      const liste = page.locator('section', { hasText: 'Paiements en ligne récents' });
      await expect(liste.getByText('Payé')).toHaveCount(3);
      await expect(liste.getByText('Échoué')).toHaveCount(1);
      await expect(liste.getByText(/dont commission 350 FCFA/).first()).toBeVisible();
    });
  });
});
