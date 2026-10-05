/**
 * Téléphone (Pixel 7) : chaque écran s'affiche sans défilement horizontal,
 * sans erreur, avec la barre d'onglets du bas.
 */
import { compte, emailDe, identifiants, iso } from '../../apps/web/tests/support/fixtures';
import { etat, expect, pasDeDebordement, seConnecter, session, test } from './base';

const PUBLIQUES = ['/', '/login', '/signup', '/marque', '/legal', '/acces-mairie', '/rejoindre'];
const PRECOLLECTEUR = [
  '/precollecteur',
  '/precollecteur/clients',
  '/precollecteur/clients/nouveau',
  '/precollecteur/facturation',
  '/precollecteur/facturation?onglet=factures',
  '/precollecteur/facturation?onglet=paiements',
  '/precollecteur/carte',
  '/precollecteur/demandes',
  '/precollecteur/tournees',
  '/precollecteur/flotte',
  '/precollecteur/incidents',
  '/precollecteur/incidents/nouveau',
  '/precollecteur/grille',
  '/settings',
];
const MENAGE = ['/citoyen', '/citoyen/collectes', '/citoyen/factures', '/citoyen/qr-code', '/citoyen/signaler', '/citoyen/souscrire'];

test.describe('pages publiques', () => {
  for (const url of PUBLIQUES) {
    test(`${url}`, async ({ page }) => {
      await page.goto(url);
      await pasDeDebordement(page);
    });
  }
});

test.describe('précollecteur', () => {
  test.use({ storageState: session('precoA') });
  for (const url of PRECOLLECTEUR) {
    test(`${url}`, async ({ page }) => {
      await page.goto(url);
      await pasDeDebordement(page);
      await expect(page.getByRole('navigation', { name: 'Navigation rapide' })).toBeVisible();
    });
  }
  test('le menu latéral s’ouvre et mène à la flotte', async ({ page }) => {
    await page.goto('/precollecteur');
    await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
    await page.getByRole('link', { name: 'Flotte & équipe' }).click();
    await expect(page).toHaveURL(/\/precollecteur\/flotte/);
  });
  test('la fiche client tient sur l’écran', async ({ page }) => {
    await page.goto('/precollecteur/clients');
    await page.locator('a[href^="/precollecteur/clients/"]').filter({ hasText: 'Famille Scan' }).first().click();
    await expect(page.getByText('QR code du foyer')).toBeVisible();
    await pasDeDebordement(page);
  });
});

test.describe('ménage', () => {
  test.use({ storageState: session('souscripteur') });
  for (const url of MENAGE) {
    test(`${url}`, async ({ page }) => {
      await page.goto(url);
      await pasDeDebordement(page);
    });
  }
});

// Retour R9 : sur téléphone, « Déconnexion » refermait le menu avant l'envoi
// du formulaire — on restait connecté.
test.describe('déconnexion sur téléphone', () => {
  test('depuis le menu latéral', async ({ page }) => {
    await seConnecter(page, emailDe('deconnexion'), identifiants().motDePasse);
    await expect(page).toHaveURL(/\/citoyen/);
    await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/logout$/);
    await page.goto('/citoyen');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('facturation sur téléphone', () => {
  test.use({ storageState: session('precoA') });
  test('les paiements s’affichent en cartes lisibles', async ({ page }) => {
    await page.goto('/precollecteur/facturation?onglet=paiements');
    await expect(page.locator('ul').getByText('Famille Scan').first()).toBeVisible();
    await expect(page.locator('table')).toBeHidden();
    await pasDeDebordement(page);
  });
});

test.describe('changer d’espace sur téléphone', () => {
  test.use({ storageState: session('admin') });
  test('depuis le menu latéral', async ({ page }) => {
    test.skip(!etat().adminPromu, `Compte administrateur de test non promu (${etat().adminEmail})`);
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
    const menu = page.getByRole('dialog');
    await menu.getByText('Changer d’espace').click();
    await menu.getByRole('link', { name: 'Espace Client' }).click();
    await expect(page).toHaveURL(/\/citoyen/);
    await pasDeDebordement(page);
  });
});

// Espace employé : c'est sur le téléphone que l'équipe s'en sert.
test.describe('espace employé sur téléphone', () => {
  test('les écrans de l’employé tiennent sur l’écran', async ({ page }, testInfo) => {
    test.skip(!etat().migration0007, 'Migration 20261005000007_espace_employe.sql non exécutée');
    const A = await compte('precoA', 'precollecteur');
    const E = await compte('employe', 'citoyen');
    const e = etat().precoA;
    // Compte employé libre (une fiche restée d'un essai interrompu est supprimée, ce qui le libère).
    await A.sb.from('employes').delete().eq('entreprise_id', e).eq('user_id', E.id);
    const { data: emp } = await A.sb.from('employes').insert({ entreprise_id: e, nom: 'Chauffeur Mobile', fonction: 'chauffeur' }).select('id').single();
    const empId = (emp as { id: string }).id;
    let tid = '';
    try {
      const { data: code } = await A.sb.rpc('creer_invitation_employe', { p_employe: empId });
      expect((await E.sb.rpc('rejoindre_entreprise', { p_code: code })).error).toBeNull();
      const { data: t } = await A.sb.from('tournees_precollecte').insert({ entreprise_id: e, date: iso(0), notes: 'mobile' }).select('id').single();
      tid = (t as { id: string }).id;
      await A.sb.from('tournee_equipe').insert({ tournee_id: tid, employe_id: empId, entreprise_id: e });
      await A.sb.from('collectes').insert({ entreprise_id: e, tournee_id: tid, client_id: etat().clientScan, date_prevue: iso(0) });

      await seConnecter(page, emailDe('employe'), identifiants().motDePasse);
      await expect(page).toHaveURL(/\/employe$/);
      await expect(page.getByRole('navigation', { name: 'Navigation rapide' })).toBeVisible();
      await pasDeDebordement(page);
      await page.screenshot({ path: testInfo.outputPath('employe-accueil.png'), fullPage: true });
      await page.goto(`/employe/tournees/${tid}`);
      await expect(page.getByText(/Équipe : Chauffeur Mobile/)).toBeVisible();
      await pasDeDebordement(page);
      await page.screenshot({ path: testInfo.outputPath('employe-tournee.png') });
      for (const url of ['/employe/historique', '/employe/incidents/nouveau']) {
        await page.goto(url);
        await pasDeDebordement(page);
      }
    } finally {
      if (tid) await A.sb.from('tournees_precollecte').delete().eq('id', tid);
      await A.sb.from('employes').delete().eq('id', empId);
    }
  });
});
