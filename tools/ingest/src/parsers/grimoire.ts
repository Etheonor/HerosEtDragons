// Grimoire : fiches YAML (niveau, école, composants, durée, classes).
import matter from "gray-matter";
import type { SpellMeta } from "@rollwith/shared/compendium";
import { asNumber, asString, asStringArray, makeEntry, splitBodySections } from "../util.js";

export function parseSpellFile(slug: string, raw: string): ReturnType<typeof makeEntry> {
  const { data, content } = matter(raw);
  const d = (data ?? {}) as Record<string, unknown>;

  const components: SpellMeta["components"] = { verbal: false, somatic: false };
  const comp = d.components;
  if (comp && typeof comp === "object" && !Array.isArray(comp)) {
    const c = comp as Record<string, unknown>;
    components.verbal = c.verbal === true;
    components.somatic = c.somatic === true;
    components.material = c.material === true;
    const mats = asString(c.materials);
    if (mats) components.materials = mats;
  }

  const meta: SpellMeta = {
    level: asNumber(d.level) ?? 0,
    school: asString(d.school) ?? "",
    ritual: d.ritual === true,
    concentration: d.concentration === true,
    castingTime: asString(d.casting_time) ?? "",
    range: asString(d.range) ?? "",
    components,
    duration: asString(d.duration) ?? "",
    classes: asStringArray(d.classes) ?? [],
  };
  const description = asString(d.description);
  if (description) meta.description = description;

  const title = asString(d.title) ?? slug.replace(/-/g, " ");

  return makeEntry({
    slug,
    category: "grimoire",
    title,
    source: asString(d.source),
    meta,
    body: splitBodySections(content),
    keywords: [asString(d.school), `niveau ${meta.level}`, ...(meta.classes ?? [])],
    raw,
  });
}
