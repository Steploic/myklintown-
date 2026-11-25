import { expect, session, test } from './base';

/**
 * Planche d'impression des QR (imprimeur, vinyle au m²) : étiquettes de
 * 10 × 15 cm, une page du PDF = 1 m². On mesure en mode impression et on lit
 * le format du PDF produit par le navigateur.
 */
test.describe('planche QR pour l’imprimeur', () => {
  test.use({ storageState: session('precoA') });

  test('toutes les étiquettes, à la bonne taille, dans un PDF de 1 m²', async ({ page }) => {
    await page.goto('/precollecteur/clients');
    await page.getByRole('link', { name: /Planche QR/ }).click();
    await expect(page).toHaveURL(/\/precollecteur\/clients\/planche$/);

    const etiquettes = page.locator('.planche-page article');
    await expect(etiquettes.filter({ hasText: 'MKT-E2E0SCAN' })).toHaveCount(1);
    const n = await etiquettes.count();
    await expect(page.getByText(new RegExp(`^${n} étiquettes? · ${Math.ceil(n / 54)} pages? de 1 m²`))).toBeVisible();

    // En impression, pas de réduction d'aperçu : 96 px CSS = 25,4 mm.
    await page.emulateMedia({ media: 'print' });
    const mm = (px: number) => Math.round((px / 96) * 25.4);
    const r = await etiquettes.first().evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    expect([mm(r.width), mm(r.height)]).toEqual([100, 150]);
    // Écart de 0,5 cm avec la voisine de droite (si la page en a une).
    if (n > 1) {
      const r2 = await etiquettes.nth(1).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
      expect(Math.round(((r2.left - r.right) / 96) * 254) / 10).toBe(5);
    }

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    // Joint au rapport Playwright (artefact de la CI) : le PDF se relit tel quel.
    await test.info().attach('planche.pdf', { body: pdf, contentType: 'application/pdf' });
    const boite = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
    expect(boite, 'format de page du PDF').not.toBeNull();
    // 1 pt = 1/72 de pouce : 1000 mm ≈ 2834,6 pt.
    expect([Math.round((Number(boite![1]) / 72) * 25.4), Math.round((Number(boite![2]) / 72) * 25.4)]).toEqual([1000, 1000]);
  });
});
