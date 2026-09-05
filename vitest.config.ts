import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      $shared: path.resolve(__dirname, "shared/src"),
      $lib: path.resolve(__dirname, "web/src/lib"),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.svelte-kit/**", "**/dist/**", "**/build/**"],
  },
});
