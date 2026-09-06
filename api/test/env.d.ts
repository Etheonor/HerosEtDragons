// Le module cloudflare:test fournit les bindings du Worker (déclarées dans
// worker-configuration.d.ts) dans l'environnement de test.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: import("@cloudflare/vitest-pool-workers/config").D1Migration[];
  }
}
