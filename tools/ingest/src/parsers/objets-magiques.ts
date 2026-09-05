// liste-objets-magiques : YAML (type, rareté, harmonisation).
import matter from "gray-matter";
import type { ObjectMeta } from "@rollwith/shared/compendium";
import { asString, makeEntry, splitBodySections } from "../util.js";

export function parseMagicItemFile(slug: string, raw: string): ReturnType<typeof makeEntry> {
  const { data, content } = matter(raw);
  const d = (data ?? {}) as Record<string, unknown>;

  const meta: ObjectMeta = {
    type: asString(d.type) ?? "",
    rarity: asString(d.rarity) ?? "",
  };
  if (typeof d.subtype === "string" && d.subtype.trim()) meta.subtype = d.subtype.trim();
  const att = asString(d.attunement);
  if (att) meta.attunement = att;

  const title = asString(d.title) ?? slug.replace(/-/g, " ");

  return makeEntry({
    slug,
    category: "objets-magiques",
    title,
    source: asString(d.source),
    meta,
    body: splitBodySections(content),
    keywords: [meta.type, meta.rarity, meta.attunement],
    raw,
  });
}
