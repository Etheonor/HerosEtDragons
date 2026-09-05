// Helpers communs à l'ingestion DRS.
import { createHash } from "node:crypto";
import type {
  BodySection,
  CompendiumCategory,
  CompendiumEntry,
  CompendiumMeta,
} from "@rollwith/shared/compendium";
import { defaultVisibilityFor } from "@rollwith/shared/compendium";

export function hashRaw(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** « Gobe-legs » → gobe-legs ; conserve les tirets, drop accents/ponctuation. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\\_/g, "_")
    .trim();
}

/** [Texte](ancre) → {text, anchor} ; texte simple → {text, anchor:null} */
export function parseCellLink(cell: string): { text: string; anchor: string | null } {
  const m = /^\[(.+?)\]\(#(.+?)\)$/.exec(cell.trim());
  if (m) return { text: cleanText(m[1]!), anchor: m[2]! };
  return { text: cleanText(cell), anchor: null };
}

export function buildSearchText(parts: (string | number | undefined | null)[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function makeEntry(input: {
  slug: string;
  category: CompendiumCategory;
  title: string;
  source?: string;
  sourcePage?: number;
  meta: CompendiumMeta;
  body: BodySection[];
  keywords: (string | number | undefined | null)[];
  raw: string;
  origin?: "drs" | "maison";
}): CompendiumEntry {
  return {
    slug: input.slug,
    category: input.category,
    title: input.title,
    source: input.source ?? "DRS",
    sourcePage: input.sourcePage,
    meta: input.meta,
    body: input.body,
    visibility: defaultVisibilityFor(input.category),
    origin: input.origin ?? "drs",
    searchText: buildSearchText([input.title, ...input.keywords]),
    version: 1,
    hash: hashRaw(input.raw),
  };
}

/** Découpe le corps en sections `## Titre` (partagé bestiaire/semi-typé). */
export function splitBodySections(content: string): BodySection[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sections: BodySection[] = [];
  let heading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const markdown = buf.join("\n").trim();
    if (heading !== null || markdown) sections.push({ heading, markdown });
    buf = [];
  };
  for (const line of lines) {
    const m = /^## (?!#)(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      heading = m[1]!.trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

export function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

export function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return out.length ? out : undefined;
}
