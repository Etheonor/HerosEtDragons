// Arrête les instances de dev (wrangler/workerd) du dépôt avant d'en démarrer
// une seule.
//
// POURQUOI. `wrangler dev` garde le SQLite local du Durable Object ouvert, et
// deux workers sur le même état échouent au boot en SQLITE_BUSY. L'ancien
// nettoyage de `scripts/e2e.mjs` faisait `pkill -f "wrangler dev"` : le motif
// NE MATCHE PAS les vraies lignes de commande (`wrangler.js dev`,
// `wrangler-dist/cli.js dev`), donc les parents orphelins s'accumulaient d'une
// session à l'autre — un workerd seul restait propriétaire du port, plusieurs
// arbres cohabitaient, et le worker suivant échouait au boot.
//
// DÉTECTION. Deux voies, volontairement redondantes :
//   1. les propriétaires de nos ports de dev (`lsof`) — le workerd tient le
//      SQLite, même si sa ligne de commande change ;
//   2. les processus du dépôt dont la commande lance wrangler/workerd (leur
//      chemin contient la racine du dépôt).
// On regroupe ces processus par arbre (remontée des ppid) : une instance saine
// = un seul groupe, celui du workerd qui écoute. Tout autre groupe est un
// orphelin, et `lsof` tranche aussi le cas de deux listeners.
//
// MODES.
//   node scripts/dev-clean.mjs          arrête tout (TERM, puis KILL)
//   node scripts/dev-clean.mjs --check  ne tue rien ; sort 1 s'il y a quelque
//                                       chose à nettoyer (instances en trop)

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORTS = [8787, 8788];
const CHECK = process.argv.includes("--check");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
}

function listenPids() {
  const pids = new Set();
  for (const port of API_PORTS) {
    const res = run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
    if (res.status !== 0) continue;
    for (const raw of res.stdout.split("\n")) {
      const pid = Number.parseInt(raw.trim(), 10);
      if (Number.isInteger(pid) && pid > 1) pids.add(pid);
    }
  }
  return pids;
}

function processTable() {
  const table = new Map();
  const res = run("ps", ["-A", "-o", "pid=,ppid=,command="]);
  if (res.status !== 0) return table;
  for (const line of res.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) table.set(Number(m[1]), { ppid: Number(m[2]), cmd: m[3] });
  }
  return table;
}

function repoDevPids(table) {
  const pids = new Set();
  for (const [pid, info] of table) {
    if (pid <= 1) continue;
    if (!info.cmd.includes(ROOT)) continue;
    if (!/wrangler|workerd/i.test(info.cmd)) continue;
    pids.add(pid);
  }
  return pids;
}

/** Racine de chaque pid dans le sous-graphe `pids` (remontée des ppid). */
function groupRoots(pids, table) {
  const roots = new Map();
  for (const pid of pids) {
    let root = pid;
    let cur = pid;
    const seen = new Set([pid]);
    for (;;) {
      const parent = table.get(cur)?.ppid;
      if (!parent || seen.has(parent) || !pids.has(parent)) break;
      seen.add(parent);
      root = parent;
      cur = parent;
    }
    roots.set(pid, root);
  }
  return roots;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitGone(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ([...pids].every((pid) => !isAlive(pid))) return true;
    await sleep(120);
  }
  return [...pids].every((pid) => !isAlive(pid));
}

const table = processTable();
const listeners = listenPids();
const pids = new Set([...listeners, ...repoDevPids(table)]);
const roots = groupRoots(pids, table);
const healthyRoots = new Set([...listeners].map((pid) => roots.get(pid)));
const extras = [...pids].filter((pid) => !healthyRoots.has(roots.get(pid)));
const clean = listeners.size <= 1 && extras.length === 0;

if (CHECK) {
  if (clean) {
    console.log(
      listeners.size === 1
        ? `[dev:clean] une seule instance (pid ${[...listeners][0]}).`
        : "[dev:clean] aucune instance.",
    );
    process.exit(0);
  }
  if (listeners.size > 1) {
    console.error(
      `[dev:clean] ${listeners.size} serveurs écoutent (${[...listeners].join(", ")}) — il n'en faut qu'un.`,
    );
  } else {
    console.error(`[dev:clean] instances en trop : ${extras.join(", ") || "aucune"}`);
  }
  process.exit(1);
}

if (pids.size === 0) {
  console.log("[dev:clean] aucun processus de dev à arrêter.");
  process.exit(0);
}

console.log(
  `[dev:clean] arrêt de ${pids.size} processus` +
    `${extras.length > 0 ? ` (dont ${extras.length} orphelin(s))` : ""}…`,
);
for (const pid of pids) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* déjà mort */
  }
}

await waitGone(pids, 5000);
const stubborn = [...pids].filter((pid) => isAlive(pid));
if (stubborn.length > 0) {
  console.log(`[dev:clean] ${stubborn.length} processus résistant(s) — KILL.`);
  for (const pid of stubborn) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* déjà mort */
    }
  }
  await waitGone(stubborn, 3000);
}

const portDeadline = Date.now() + 5000;
while (Date.now() < portDeadline && listenPids().size > 0) await sleep(150);

const remaining = listenPids();
if (remaining.size > 0) {
  console.error(`[dev:clean] ports encore occupés : ${[...remaining].join(", ")}`);
  process.exit(1);
}
console.log("[dev:clean] ports libres.");
