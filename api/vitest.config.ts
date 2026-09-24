import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

  return {
    test: {
      include: ["test/**/*.test.ts"],
      // NB : pas de setupFiles — le pool 0.12 avale les erreurs des setup
      // (bindings absents) ; chaque test applique ses migrations lui-même.
      poolOptions: {
        workers: {
          wrangler: { configPath: path.resolve(__dirname, "../wrangler.jsonc") },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations, DEV_AUTH: "1" },
          },
        },
      },
    },
  };
});
