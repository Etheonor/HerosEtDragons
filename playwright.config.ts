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
 * cf. resolveDevUser) et le build web à jour (`pnpm --filter web build`).
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Le build statique est servi par wrangler : sans lui, /renvoie un 404.
    command: "pnpm --filter web build && pnpm --filter api dev",
    url: "http://localhost:8787/api/health",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
  },
});
