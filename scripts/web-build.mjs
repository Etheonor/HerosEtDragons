// Build web incrémental, pour les tests e2e et les scripts de dev.
//
// POURQUOI. `vite build` n'a aucun incrémental : `pnpm --filter web build`
// coûte ~15 s à chaque fois, même sans une ligne de code modifiée. Comme la
// config Playwright lance ce build avant `wrangler dev`, chaque `pnpm e2e`
// payait 15 s de rebuild — soit 40 % du temps d'une passe de 23 tests.
//
// COMMENT. On horodate les sources et on compare au dernier build réussi
// (un estampille par paquet, dans node_modules/.cache). Rien changé → on
// n'appelle pas vite. Quelque chose changé → on construit, et seulement ça.
//
// PIÈGE `shared/`. Le front importe `@rollwith/shared/*` depuis `shared/dist`
// (cf. AGENTS.md §3), PAS depuis les sources. Deux conséquences, toutes deux
// traitées ici :
//   1. `shared` doit être construit AVANT `web`, sinon le front embarque un
//      dist périmé — c'est un piège documenté du projet ;
//   2. `shared/src` fait partie des sources surveillées pour `web` : un
//      changement côté domaine doit forcer la reconstruction du front.
//
// Modes :
//   node scripts/web-build.mjs            construit si besoin
//   node scripts/web-build.mjs --check    ne construit rien, exit 1 si périmé
//   node scripts/web-build.mjs --force    reconstruit tout

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "node_modules", ".cache", "rollwith");

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes("--check");
const FORCE = argv.includes("--force");

/** Répertoires jamais attendus comme sources (sorties de build, caches). */
const IGNORED = new Set(["node_modules", ".svelte-kit", "build", "dist", ".git", "test-results"]);

function stampPath(name) {
  return path.join(CACHE, `${name}.json`);
}

function readStamp(name) {
  try {
    return JSON.parse(fs.readFileSync(stampPath(name), "utf8")).at ?? 0;
  } catch {
    return 0;
  }
}

function writeStamp(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(stampPath(name), JSON.stringify({ at: Date.now() }));
}

/** Horodate le plus récent sous `targets` (fichiers et répertoires récursifs). */
function newestMtime(targets) {
  let newest = 0;
  const walk = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isFile()) {
      newest = Math.max(newest, st.mtimeMs);
      return;
    }
    if (!st.isDirectory()) return;
    for (const entry of fs.readdirSync(p)) {
      if (IGNORED.has(entry)) continue;
      walk(path.join(p, entry));
    }
  };
  for (const t of targets) walk(t);
  return newest;
}

function exists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function run(label, args) {
  const started = Date.now();
  const res = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`[build] ${label} : échec (code ${res.status})`);
    process.exit(res.status ?? 1);
  }
  console.log(`[build] ${label} : ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const sharedSrc = newestMtime([
  path.join(ROOT, "shared/src"),
  path.join(ROOT, "shared/tsconfig.json"),
]);
const sharedDist = path.join(ROOT, "shared/dist");
const webSources = newestMtime([
  path.join(ROOT, "web/src"),
  path.join(ROOT, "web/svelte.config.js"),
  path.join(ROOT, "web/vite.config.ts"),
  path.join(ROOT, "web/package.json"),
  path.join(ROOT, "package.json"),
]);

const needShared =
  FORCE || !exists(path.join(sharedDist, "index.js")) || sharedSrc > readStamp("shared");

if (CHECK_ONLY) {
  // Le front est périmé si ses sources le sont, ou si `shared/dist` est plus
  // récent que le dernier build front (donc pas encore absorbé).
  const needWeb =
    FORCE ||
    !exists(path.join(ROOT, "web/build/index.html")) ||
    Math.max(webSources, newestMtime([sharedDist])) > readStamp("web");
  process.exit(needShared || needWeb ? 1 : 0);
}

if (needShared) {
  run("shared", ["--filter", "shared", "build"]);
  writeStamp("shared");
} else {
  console.log("[build] shared : à jour");
}

const needWeb =
  FORCE ||
  !exists(path.join(ROOT, "web/build/index.html")) ||
  Math.max(webSources, newestMtime([sharedDist])) > readStamp("web");

if (needWeb) {
  run("web", ["--filter", "web", "build"]);
  writeStamp("web");
} else {
  console.log("[build] web : à jour");
}
