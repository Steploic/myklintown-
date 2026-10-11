import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout dans un vrai navigateur.
 *
 *   cd e2e && pnpm test                         → contre le build local (apps/web : pnpm build d'abord)
 *   E2E_BASE_URL=https://… pnpm test            → contre un déploiement (preview, prod)
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
        command: `pnpm start -p ${PORT}`,
        cwd: path.resolve(__dirname, '..', 'apps', 'web'),
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 180_000,
        // Paiement en ligne en mode SIMULATION (aucun argent réel) pour les tests locaux.
        env: { PAIEMENT_SIMULATION: '1' },
      },
});
