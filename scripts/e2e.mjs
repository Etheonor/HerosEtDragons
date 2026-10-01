// Lance les tests e2e Playwright sans rebuilding ni redémarrer ce qui est déjà
// bon.
//
// POURQUOI (le cout était de 40 s par passe, dont 15 s de `vite build` inutile).
// Ce script faisait deux choses nuisibles à chaque `pnpm e2e` :
//   1. tuer le serveur de dev, ce qui annulait le `reuseExistingServer` de la
//      config Playwright et imposait un rebuild complet + un boot wrangler ;
//   2. attendre 3 s pleines après le `pkill`, quoi qu'il arrive.
//
// Le `pkill` avait une vraie raison : wrangler garde le SQLite local du Durable
// Object ouvert, et deux workers sur le même état échouent au boot en
// SQLITE_BUSY. Mais ce risque n'existe que si on démarre un DEUXIÈME worker.
// Réutiliser le serveur déjà debout le supprime entièrement.
//
// DÉCISION. On ne tue un serveur que si on va réellement en démarrer un autre,
// c'est-à-dire si le front est périmé (`scripts/web-build.mjs --check`) ou si
// le serveur ne répond plus.
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

if (serverUp && !webStale) {
  console.log("[e2e] serveur déjà chaud et front à jour — réutilisation.");
} else {
  const why = !serverUp ? "aucun serveur" : "front périmé";
  console.log(`[e2e] ${why} — démarrage d'un worker neuf.`);

  // On ne tue que maintenant, et seulement si un vrai serveur répond : un port
  // occupé par autre chose n'est pas touché. On passe par pkill sur les deux
  // binaires — vite ne répond pas sur /api/health quand l'API est morte, mais
  // occupe le port et fait échouer le build.
  if (stale.length > 0) {
    console.log(`[e2e] serveur de dev trouvé sur ${stale.join(", ")} — arrêt…`);
    for (const pattern of ["wrangler dev", "workerd", "vite.js dev"]) {
      spawn("pkill", ["-f", pattern], { stdio: "ignore" });
    }
  }
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
