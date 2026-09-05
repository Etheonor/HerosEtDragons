// CLI d'ingestion : DRS → entrées canoniques → plan SQL (+ option d'application D1).
//
//   node src/index.js                       # génère out/compendium.sql + out/report.json
//   node src/index.js --apply --local       # applique au D1 local (wrangler)
//   node src/index.js --apply --remote      # applique au D1 de production
//   DRS_PATH=/chemin/vers/docs              # source (défaut : copie locale connue)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDrs, countByCategory } from "./collect.js";
import { buildUpsertSql, planDiff, type ExistingRow } from "./diff.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : undefined;
};

function defaultDrsPath(): string {
  return process.env.DRS_PATH ?? process.env.HOME + "/Documents/Git/heros-et-dragons-drs/docs";
}

interface WranglerJson {
  results?: ExistingRow[];
  result?: { results?: ExistingRow[] };
}

function readExisting(remote: boolean): ExistingRow[] {
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "rollwith-hd",
      "--command",
      "SELECT category, slug, hash, version FROM compendium_entries",
      "--json",
      remote ? "--remote" : "--local",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out.slice(out.indexOf("["))) as WranglerJson[] | WranglerJson;
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? first?.result?.results ?? [];
}

function main() {
  const drsPath = opt("drs") ?? defaultDrsPath();
  const outDir = opt("out") ?? path.join(__dirname, "../out");
  const { entries, errors } = collectDrs(drsPath);

  const existingPath = opt("existing");
  let existing: ExistingRow[] = [];
  if (existingPath) {
    const raw = JSON.parse(readFileSync(existingPath, "utf8")) as WranglerJson[] | WranglerJson;
    const first = Array.isArray(raw) ? raw[0] : raw;
    existing = first?.results ?? first?.result?.results ?? [];
  }

  const plan = planDiff(entries, existing);
  const sql = buildUpsertSql(plan, Date.now(), process.env.DRS_COMMIT ?? null);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "compendium.sql"), sql);
  writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      {
        drsPath,
        counts: countByCategory(entries),
        inserts: plan.inserts.length,
        updates: plan.updates.length,
        unchanged: plan.unchanged,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `[ingest] ${entries.length} entrées (inserts ${plan.inserts.length}, updates ${plan.updates.length}, inchangées ${plan.unchanged}), ${errors.length} erreurs → ${outDir}`,
  );
  for (const e of errors.slice(0, 10)) console.error(`  ! ${e}`);

  if (flag("apply")) {
    if (plan.inserts.length + plan.updates.length === 0) {
      console.log("[ingest] rien à appliquer.");
      return;
    }
    const remote = flag("remote");
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "rollwith-hd",
        "--file",
        path.join(outDir, "compendium.sql"),
        remote ? "--remote" : "--local",
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
    console.log(`[ingest] appliqué en ${remote ? "REMOTE" : "local"}.`);
  }
}

main();
