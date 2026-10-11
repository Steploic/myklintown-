import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { BASE, ENV_TESTS } from '../apps/web/tests/support/fixtures';

/**
 * Tests de bout en bout dans un vrai navigateur.
 *
 *   cd e2e && pnpm test        → l'appli est construite et lancée sur la BASE DE TEST
 *                                (apps/web/.env.test.local), dans apps/web/.next-tests
 *   E2E_SANS_BUILD=1 pnpm test → réutilise le dernier build de test (plus rapide)
 *   TESTS_SUR_PROD=1 E2E_BASE_URL=https://myklintown-web.vercel.app pnpm test
 *                              → contre le site en ligne et la vraie base (exprès)
 *
 * Dossier HORS de l'espace de travail pnpm : placé dans apps/web, Playwright
 * (pair optionnel de Next.js) forçait pnpm à dupliquer Next.js.
 *
 * Caméra : Chromium reçoit une caméra SIMULÉE qui filme un QR code
 * (.media/qr.y4m, fabriqué par global-setup) — le scan et la capture de
 * preuves sont testés pour de vrai, sans téléphone.
 */
// Port dédié : ne jamais se brancher par erreur sur un serveur de dev déjà lancé.
const PORT = 3100;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const VIDEO = path.resolve(__dirname, '.media', 'qr.y4m');

// Chromium déjà présent sur la machine (évite un téléchargement de 150 Mo).
// (version « headless shell » : chrome.exe complet est bloqué sur ce poste).
const CHROMIUM_LOCAL = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium_headless_shell-1208', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const executablePath = process.env.E2E_CHROMIUM ?? (fs.existsSync(CHROMIUM_LOCAL) ? CHROMIUM_LOCAL : undefined);

const launchOptions = {
  executablePath,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${VIDEO}`,
  ],
};

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  // Une reprise : absorbe une coupure réseau ponctuelle. Un test repris est
  // signalé « flaky » dans le rapport — rien n'est masqué.
  retries: 1,
  timeout: 150_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    permissions: ['camera', 'microphone', 'geolocation'],
    geolocation: { latitude: 3.848, longitude: 11.502 },
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'connexions', testMatch: /auth\.setup\.ts/ },
    {
      name: 'ordinateur',
      dependencies: ['connexions'],
      testIgnore: /auth\.setup\.ts|mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      name: 'telephone',
      dependencies: ['connexions'],
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], launchOptions },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Build dédié : les variables NEXT_PUBLIC_* (adresse de la base) sont
        // figées à la construction, il faut donc un build par base.
        command: process.env.E2E_SANS_BUILD === '1' ? `pnpm start -p ${PORT}` : `pnpm build && pnpm start -p ${PORT}`,
        cwd: path.resolve(__dirname, '..', 'apps', 'web'),
        env: {
          NEXT_DIST_DIR: BASE === 'test' ? '.next-tests' : '.next',
          NEXT_PUBLIC_SUPABASE_URL: ENV_TESTS.NEXT_PUBLIC_SUPABASE_URL!,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ENV_TESTS.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          ...(ENV_TESTS.SUPABASE_SECRET_KEY ? { SUPABASE_SECRET_KEY: ENV_TESTS.SUPABASE_SECRET_KEY } : {}),
        },
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 900_000,
      },
});

// Le site en ligne parle à la vraie base : des comptes de la base de test n'y existent pas.
if (process.env.E2E_BASE_URL && BASE !== 'production') {
  throw new Error('E2E_BASE_URL vise un site déployé (vraie base) : ajouter TESTS_SUR_PROD=1, ou retirer E2E_BASE_URL pour tester sur la base de test.');
}
