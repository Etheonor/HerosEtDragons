import { defineConfig, devices } from "@playwright/test";

/**
 * E2E navigateur (Playwright) contre le serveur de dev complet sur :8787.
 *
 * Pourquoi 8787 et pas 5173 : c'est wrangler qui sert la SPA statique ET
 * l'API ET le WebSocket. Le serveur Vite ne fait que du HMR et relaie /api —
 * mais pas le WebSocket de façon fiable. On teste donc l'app telle qu'elle est
 * réellement servie.
 *
 * Prérequis : DEV_AUTH=1 dans .dev.vars (le mode dev est sinon un 404 complet,
 * cf. resolveDevUser) et le build web à jour (`pnpm web:build`).
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 45_000,
  expect: { timeout: 10_000 },

  // `fullyParallel: false` : les tests d'un MÊME fichier restent séquentiels,
  // parce qu'ils partagent l'état du Durable Object de `dev-camp` et s'y
  // reconfigurent. La concurrence est donc limitée à un worker par fichier.
  fullyParallel: false,
  // 2 = un worker par fichier de spec. Au-delà, deux fichiers se marcheraient
  // dessus sur le DO partagé. Le compendium ne purge plus (voir helpers.ts),
  // c'est ce qui rend ce partage sans danger.
  workers: 2,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: "http://localhost:8787",
    // `retain-on-failure` enregistre la trace de CHAQUE test et ne conserve que
    // ceux qui échouent : le coût est payé 23 fois pour n'en exploiter qu'une.
    // `on-first-retry` ne trace que le retry, seul moment où la trace sert à
    // diagnostiquer un flake.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Le build statique est servi par wrangler : sans lui, `/` renvoie un 404.
    // `scripts/web-build.mjs` ne reconstruit que ce qui a changé — et construit
    // `shared` avant `web` (cf. AGENTS.md §3). Un `vite build` à l'aveugle
    // coûtait 15 s à chaque passe, même sans une ligne de code modifiée.
    command: "node scripts/web-build.mjs && pnpm --filter api dev",
    url: "http://localhost:8787/api/health",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
  },
});
