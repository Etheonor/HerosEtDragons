// Parsing des fiches de bestiaire DRS (frontmatter YAML + corps markdown).
import { createHash } from "node:crypto";
import matter from "gray-matter";
import {
  defaultVisibilityFor,
  type BodySection,
  type CompendiumEntry,
  type MonsterMeta,
} from "@rollwith/shared/compendium";

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return out.length ? out : undefined;
}

interface AcEntry {
  value?: number;
  armor?: string;
  hasShield?: boolean;
}

function parseAc(v: unknown): AcEntry[] {
  const items: unknown[] = Array.isArray(v) ? v : v ? [v] : [];
  const out: AcEntry[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const entry: AcEntry = {};
    const value = asNumber(o.value);
    if (value !== undefined) entry.value = value;
    if (typeof o.armorType === "string" && o.armorType.trim()) entry.armor = o.armorType.trim();
    if (o.hasShield === true) entry.hasShield = true;
    if (entry.value !== undefined || entry.armor) out.push(entry);
  }
  return out;
}

const CARACS = ["for", "dex", "con", "int", "sag", "cha"] as const;

function parseCaracs(v: unknown): MonsterMeta["caracs"] {
  const out = { for: 10, dex: 10, con: 10, int: 10, sag: 10, cha: 10 };
  if (v && typeof v === "object") {
    for (const k of CARACS) {
      const n = asNumber((v as Record<string, unknown>)[k]);
      if (n !== undefined) out[k] = n;
    }
  }
  return out;
}

function parseSkills(v: unknown): MonsterMeta["skills"] {
  if (!Array.isArray(v)) return undefined;
  const out: { name: string; isExpert: boolean }[] = [];
  for (const item of v) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.name === "string" && o.name.trim()) {
        out.push({ name: o.name.trim(), isExpert: o.isExpert === true });
      }
    } else if (typeof item === "string" && item.trim()) {
      out.push({ name: item.trim(), isExpert: false });
    }
  }
  return out.length ? out : undefined;
}

function parseNumMap(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = asNumber(raw);
    if (n !== undefined) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Découpe le corps en sections `## Titre` (le markdown brut est conservé). */
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

export function parseMonsterFile(slug: string, raw: string): CompendiumEntry {
  const { data, content } = matter(raw);
  const d = (data ?? {}) as Record<string, unknown>;

  const meta: Partial<MonsterMeta> = {};
  if (typeof d.type === "string") meta.type = d.type.trim();
  if (typeof d.subtype === "string" && d.subtype.trim()) meta.subtype = d.subtype.trim();
  if (typeof d.size === "string") meta.size = d.size.trim();
  if (typeof d.alignment === "string") meta.alignment = d.alignment.trim();
  const fp = asNumber(d.challenge);
  if (fp !== undefined) meta.fp = fp;
  meta.caracs = parseCaracs(d.abilityScores);
  const ac = parseAc(d.ac);
  if (ac.length) meta.ca = ac;
  const hdc = asNumber(d.hitDiceCount);
  if (hdc !== undefined) meta.hitDiceCount = hdc;
  const saves = asStringArray(d.savingThrows);
  if (saves) meta.savingThrows = saves;
  const skills = parseSkills(d.skills);
  if (skills) meta.skills = skills;
  const movement = parseNumMap(d.movement);
  if (movement) meta.movement = movement;
  const senses = parseNumMap(d.senses);
  if (senses) meta.senses = senses;
  const telepathy = asNumber(d.telepathy);
  if (telepathy !== undefined) meta.telepathy = telepathy;
  const languages = asStringArray(d.languages);
  if (languages) meta.languages = languages;
  const environments = asStringArray(d.environments);
  if (environments) meta.environments = environments;
  const dungeonTypes = asStringArray(d.dungeonTypes);
  if (dungeonTypes) meta.dungeonTypes = dungeonTypes;

  const title =
    typeof d.title === "string" && d.title.trim()
      ? d.title.trim()
      : slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  const keywords = [
    title,
    meta.type ?? "",
    meta.subtype ?? "",
    ...(meta.environments ?? []),
    ...(meta.languages ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return {
    slug,
    category: "bestiaire",
    title,
    source: typeof d.source === "string" ? d.source.trim() : "DRS",
    sourcePage: asNumber(d.source_page),
    meta,
    body: splitBodySections(content),
    visibility: defaultVisibilityFor("bestiaire"),
    origin: "drs",
    searchText: keywords,
    version: 1,
    hash: createHash("sha256").update(raw).digest("hex"),
  };
}
