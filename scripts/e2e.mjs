// Lance les tests e2e Playwright en veillant à ce qu'aucun serveur de dev ne
// traîne.
//
// Pourquoi : wrangler garde le SQLite local du Durable Object ouvert. Si un
// `pnpm dev` / `dev:all` / run e2e précédent est encore vivant, le nouveau
// worker démarre sur le même état et wrangler échoue au boot avec
//   SQLITE_BUSY (SQLITE_BUSY_RECOVERY)
// et se manifest à l'utilisateur par un « Erreur » sur chaque appel API.
//
// On neTue que les serveurs de CE projet, sur les ports de dev attendus, et
// seulement s'ils répondent : un port occupé par autre chose n'est pas touché.

import { spawn } from "node:child_process";

const PORTS = [8787, 8788, 5173, 5174, 5175];

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

if (stale.length > 0) {
  console.log(`[e2e] serveur de dev trouvé sur ${stale.join(", ")} — arrêt…`);
  // On passe par pkill sur les deux binaires : vite ne répond pas sur /api/health
  // quand l'API est morte, mais occupe le port et fait échouer le build.
  for (const pattern of ["wrangler dev", "workerd", "vite.js dev"]) {
    spawn("pkill", ["-f", pattern], { stdio: "ignore" });
  }
  await new Promise((r) => setTimeout(r, 3000));
}

const args = ["playwright", "test", ...process.argv.slice(2)];
const child = spawn("npx", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
