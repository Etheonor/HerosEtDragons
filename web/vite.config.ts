import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      // Relaie aussi les upgrades WebSocket (/api/tables/.../ws) vers le
      // worker — sinon le temps réel (chat, pions, combat) ne marche que sur
      // 8787 et pas sur le port Vite.
      "/api": {
        target: "http://localhost:8787",
        ws: true,
      },
    },
  },
});
