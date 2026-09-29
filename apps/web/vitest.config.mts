import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': ici },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Les tests d'intégration touchent la vraie base : séquentiels, délais larges.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
