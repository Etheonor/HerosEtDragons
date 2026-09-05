// Fiches semi-typées : races, classes, historiques.
// Frontmatter pauvre (`title`), corps structuré par conventions markdown.
import matter from "gray-matter";
import { makeEntry, slugify, splitBodySections } from "../util.js";

/** Lignes `**Libellé**. texte` ou `**Libellé** : texte` → paires. */
export function parseBoldFields(content: string): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  for (const line of content.split("\n")) {
    const m = /^\s*\*\*(.+?)\*\*\s*[.:]?\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ label: m[1]!.trim(), text: m[2]!.replace(/ {2,}$/, "").trim() });
  }
  return out;
}

function titleOr(d: Record<string, unknown>, fallback: string): string {
  return typeof d.title === "string" && d.title.trim() ? d.title.trim() : fallback;
}

// ── Races ───────────────────────────────────────────────────────
export function parseRaceFile(slug: string, raw: string) {
  const { data, content } = matter(raw);
  const d = (data ?? {}) as Record<string, unknown>;
  const title = titleOr(d, slug.replace(/-/g, " "));
  const fields = parseBoldFields(content);
  return makeEntry({
    slug,
    category: "races",
    title,
    meta: { kind: "race", fields },
    body: splitBodySections(content),
    keywords: ["race", ...fields.map((f) => f.label)],
    raw,
  });
}

// ── Classes : tableau d'évolution typé ─────────────────────────
import { extractTables } from "../markdown-tables.js";

export interface ClassEvolutionRow {
  level: number;
  bonus: string;
  aptitudes: string[];
  extras: Record<string, string>;
}

export function parseClassFile(slug: string, raw: string) {
  const { data, content } = matter(raw);
  const d = (data ?? {}) as Record<string, unknown>;
  const title = titleOr(d, slug.replace(/-/g, " "));
  let evolution: ClassEvolutionRow[] = [];
  for (const table of extractTables(content)) {
    const lvlIdx = table.headers.findIndex((h) => /niveau/i.test(h));
    if (lvlIdx === -1) continue;
    evolution = [];
    for (const row of table.rows) {
      const lvl = Number((row.cells[lvlIdx] ?? "").replace(/\D/g, ""));
      if (!Number.isFinite(lvl) || lvl < 1) continue;
      const bonusIdx = table.headers.findIndex((h) => /ma[îi]trise/i.test(h));
      const aptIdx = table.headers.findIndex((h) => /aptitude/i.test(h));
      const extras: Record<string, string> = {};
      table.headers.forEach((h, i) => {
        if (i === lvlIdx || i === bonusIdx || i === aptIdx) return;
        const v = row.cells[i];
        if (v && !/niveau|ma[îi]trise|aptitude/i.test(h)) extras[h.trim()] = v;
      });
      evolution.push({
        level: lvl,
        bonus: bonusIdx !== -1 ? (row.cells[bonusIdx] ?? "").replace(/\*\*/g, "") : "",
        aptitudes:
          aptIdx !== -1
            ? (row.cells[aptIdx] ?? "")
                .split(",")
                .map((s) => s.replace(/\[|\]/g, "").replace(/\(.*?\)/g, "").replace(/\*\*/g, "").trim())
                .filter(Boolean)
            : [],
        extras,
      });
      if (evolution.length > 20) break;
    }
    if (evolution.length) break;
  }
  return makeEntry({
    slug,
    category: "classes",
    title,
    meta: { kind: "classe", evolution },
    body: splitBodySections(content),
    keywords: ["classe"],
    raw,
  });
}

// ── Historiques ────────────────────────────────────────────────
// Le fichier peut contenir des « ## Variante : X » avec leurs propres
// champs : le socle garde le premier bloc, les variantes sont typées à part.
function fieldsBySection(content: string): { label: string; text: string }[][] {
  const sections: { label: string; text: string }[][] = [[]];
  for (const line of content.split("\n")) {
    if (/^## Variante\s*[:：]/i.test(line)) {
      sections.push([]);
      continue;
    }
    const m = /^\s*\*\*(.+?)\*\*\s*[.:]?\s+(.+?)\s*$/.exec(line);
    if (m) sections[sections.length - 1]!.push({ label: m[1]!.trim(), text: m[2]!.replace(/ {2,}$/, "").trim() });
  }
  return sections;
}

export function parseBackgroundFile(slug: string, raw: string) {
  const { data, content } = matter(raw);
  const d = (data ?? {}) as Record<string, unknown>;
  const title = titleOr(d, slug.replace(/-/g, " "));
  const sections = fieldsBySection(content);
  const meta: Record<string, unknown> = { kind: "historique" };
  const list = (s: string) =>
    s
      .split(/,\s*/)
      .map((x) => x.replace(/[.;]\s*$/, "").trim())
      .filter(Boolean);
  const apply = (target: Record<string, unknown>, fields: { label: string; text: string }[]) => {
    for (const f of fields) {
      if (/comp[ée]tences/i.test(f.label)) target.skills = list(f.text);
      else if (/outils/i.test(f.label)) target.tools = list(f.text);
      else if (/[ée]quipement/i.test(f.label)) target.equipement = f.text;
      else if (/langues/i.test(f.label)) target.languages = list(f.text);
    }
  };
  apply(meta, sections[0] ?? []);
  const variants: Record<string, unknown>[] = [];
  const variantTitles = [...content.matchAll(/^## Variante\s*[:：]\s*(.+?)\s*$/gim)].map((m) => m[1]!.trim());
  sections.slice(1).forEach((fields, i) => {
    const v: Record<string, unknown> = { title: variantTitles[i] ?? `Variante ${i + 1}` };
    apply(v, fields);
    variants.push(v);
  });
  if (variants.length) meta.variants = variants;
  return makeEntry({
    slug,
    category: "historiques",
    title,
    meta,
    body: splitBodySections(content),
    keywords: ["historique", ...(Array.isArray(meta.skills) ? (meta.skills as string[]) : [])],
    raw,
  });
}
