// Lance les tests e2e Playwright sans rebuilding ni redémarrer ce qui est déjà
// bon.
//
// POURQUOI (le cout était de 40 s par passe, dont 15 s de `vite build` inutile).
// Ce script faisait deux choses nuisibles à chaque `pnpm e2e` :
//   1. tuer le serveur de dev, ce qui annulait le `reuseExistingServer` de la
//      config Playwright et imposait un rebuild complet + un boot wrangler ;
//   2. attendre 3 s pleines après le `pkill`, quoi qu'il arrive.
//
// Le nettoyage avait une vraie raison : wrangler garde le SQLite local du
// Durable Object ouvert, et deux workers sur le même état échouent au boot en
// SQLITE_BUSY. Mais ce risque n'existe que si on démarre un DEUXIÈME worker.
// Réutiliser le serveur déjà debout le supprime entièrement.
//
// DÉCISION. On réutilise tant que le serveur répond, que le front est à jour
// (`scripts/web-build.mjs --check`) et qu'il n'y a pas d'instance orphelines.
// `scripts/dev-clean.mjs` détecte les arbres wrangler/workerd en trop (que le
// health check ne voit pas mais qui font échouer le prochain boot), et c'est
// lui qui tue — plus jamais un `pkill -f "wrangler dev"` qui ne matche rien.
//
// OPTIONS.
//   --rebuild   force la reconstruction du front et le redémarrage du worker
//   --headed / --ui / …  transmis tels quels à Playwright

import { spawn, spawnSync } from "node:child_process";

const PORTS = [8787, 8788, 5173, 5174, 5175];
const argv = process.argv.slice(2);
const FORCE = argv.includes("--rebuild");

async function isOurs(port) {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const stale = [];
for (const port of PORTS) {
  if (await isOurs(port)) stale.push(port);
}

const serverUp = stale.includes(8787);

// Le front est-il à jour ? `--check` ne construit rien et sort 1 si périmé.
const webStale =
  FORCE ||
  spawnSync("node", ["scripts/web-build.mjs", "--check"], { stdio: "ignore" }).status !== 0;

// Un arbre wrangler orphelin (parent sans listener, deuxième instance) ne se
// voit pas au health check mais fait échouer le prochain démarrage en
// SQLITE_BUSY : `--check` le détecte sans rien tuer.
const orphans =
  spawnSync("node", ["scripts/dev-clean.mjs", "--check"], { stdio: "ignore" }).status !== 0;

if (serverUp && !webStale && !orphans) {
  console.log("[e2e] serveur déjà chaud et front à jour — réutilisation.");
} else {
  const why = !serverUp ? "aucun serveur" : webStale ? "front périmé" : "instances orphelines";
  console.log(`[e2e] ${why} — nettoyage puis démarrage d'un worker neuf.`);
  spawnSync("node", ["scripts/dev-clean.mjs"], { stdio: "inherit" });
  // Attente active de la libération du port (SQLITE_BUSY si on repart trop vite),
  // au lieu d'un sleep fixe de 3 s.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!(await isOurs(8787))) break;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const args = ["playwright", "test", ...argv];
const child = spawn("npx", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
