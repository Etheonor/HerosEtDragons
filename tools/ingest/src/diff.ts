// Diff ingestion ↔ D1 et génération SQL. Fonctions pures, testables.
import type { CompendiumEntry } from "@rollwith/shared/compendium";

export interface ExistingRow {
  category: string;
  slug: string;
  hash: string;
  version: number;
}

export interface IngestPlan {
  inserts: CompendiumEntry[];
  updates: { entry: CompendiumEntry; version: number }[];
  unchanged: number;
}

export function planDiff(entries: CompendiumEntry[], existing: ExistingRow[]): IngestPlan {
  const byKey = new Map(existing.map((e) => [`${e.category}/${e.slug}`, e]));
  const inserts: CompendiumEntry[] = [];
  const updates: { entry: CompendiumEntry; version: number }[] = [];
  let unchanged = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.category}/${entry.slug}`;
    if (seen.has(key)) continue; // doublon interne (slug en conflit) : premier gagne
    seen.add(key);
    const prev = byKey.get(key);
    if (!prev) {
      inserts.push(entry);
    } else if (prev.hash !== entry.hash) {
      updates.push({ entry, version: prev.version + 1 });
    } else {
      unchanged++;
    }
  }
  return { inserts, updates, unchanged };
}

function q(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function rowValues(
  entry: CompendiumEntry,
  version: number,
  now: number,
  commit: string | null,
): string {
  return [
    q(`${entry.category}/${entry.slug}`),
    q(entry.category),
    q(entry.slug),
    q(entry.title),
    q(entry.source),
    q(entry.sourcePage ?? null),
    q(JSON.stringify(entry.meta ?? {})),
    q(JSON.stringify(entry.body ?? [])),
    q(entry.visibility),
    q(entry.origin),
    q(entry.searchText),
    String(version),
    q(entry.hash),
    q(commit),
    "NULL",
    String(now),
    String(now),
  ].join(", ");
}

const COLS =
  "key, category, slug, title, source, source_page, meta, body, visibility, origin, search_text, version, hash, ingest_commit, campaign_id, created_at, updated_at";

/** SQL D1 (upsert) : les inchangés ne sont pas écrits ; une modif incrémente version. */
export function buildUpsertSql(plan: IngestPlan, now: number, commit: string | null): string {
  const stmts: string[] = [];
  for (const e of plan.inserts) {
    stmts.push(
      `INSERT INTO compendium_entries (${COLS}) VALUES (${rowValues(e, 1, now, commit)}) ON CONFLICT(key) DO NOTHING;`,
    );
  }
  for (const { entry, version } of plan.updates) {
    stmts.push(
      `INSERT INTO compendium_entries (${COLS}) VALUES (${rowValues(entry, version, now, commit)}) ON CONFLICT(key) DO UPDATE SET
        title = excluded.title, source = excluded.source, source_page = excluded.source_page,
        meta = excluded.meta, body = excluded.body, visibility = excluded.visibility,
        search_text = excluded.search_text, version = excluded.version, hash = excluded.hash,
        ingest_commit = excluded.ingest_commit, updated_at = excluded.updated_at;`,
    );
  }
  return stmts.join("\n");
}
