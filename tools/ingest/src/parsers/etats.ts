// États : découpés dans gerer-la-sante-du-personnage (§ « Les états
// spéciaux », § « Autres états temporaires », § « Fatigue et épuisement »).
import type { BodySection } from "@rollwith/shared/compendium";
import { makeEntry, slugify } from "../util.js";

interface StateGroup {
  heading: string;
  kind: "special" | "temporaire";
}

const GROUPS: StateGroup[] = [
  { heading: "Les états spéciaux", kind: "special" },
  { heading: "Autres états temporaires", kind: "temporaire" },
];

function extractGroup(md: string, groupHeading: string): { name: string; body: string }[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: { name: string; body: string }[] = [];
  let inGroup = false;
  let current: { name: string; body: string } | null = null;
  for (const line of lines) {
    if (/^## (?!#)/.test(line)) {
      // un nouveau ## ferme la section courante
      inGroup = false;
      current = null;
    }
    if (!inGroup) {
      const m = new RegExp(`^###\\s+${groupHeading}\\s*$`, "i").exec(line);
      if (m) inGroup = true;
      continue;
    }
    const sub = /^#### (?!#)(.+?)\s*$/.exec(line);
    if (sub) {
      if (current) out.push(current);
      current = { name: sub[1]!.trim(), body: "" };
      continue;
    }
    if (/^### (?!#)/.test(line)) {
      // « Fatigue et épuisement » etc. : on sort du groupe d'états
      if (current) out.push(current);
      current = null;
      inGroup = false;
      continue;
    }
    if (current) current.body += line + "\n";
  }
  if (current) out.push(current);
  return out;
}

export function parseConditionsFile(raw: string): ReturnType<typeof makeEntry>[] {
  const entries: ReturnType<typeof makeEntry>[] = [];
  for (const group of GROUPS) {
    for (const state of extractGroup(raw, group.heading)) {
      const body: BodySection[] = [{ heading: null, markdown: state.body.trim() }];
      entries.push(
        makeEntry({
          slug: slugify(state.name),
          category: "etats",
          title: state.name,
          source: "Manuel des règles",
          meta: { kind: "etat", group: group.kind },
          body,
          keywords: ["état"],
          raw: `${state.name}\n${state.body}`,
        }),
      );
    }
  }
  // Fatigue & épuisement : une fiche consolidée (les paliers 1-5 restent du texte).
  const fat = /^### Fatigue et épuisement\s*$/im.exec(raw);
  if (fat && fat.index !== undefined) {
    const rest = raw.slice(fat.index + fat[0].length);
    const stop = rest.search(/^#{2,3} /m);
    const bodyMd = (stop === -1 ? rest : rest.slice(0, stop)).trim();
    entries.push(
      makeEntry({
        slug: "fatigue-et-epuisement",
        category: "etats",
        title: "Fatigue et épuisement",
        source: "Manuel des règles",
        meta: { kind: "regles-groupe", group: "fatigue" },
        body: [{ heading: null, markdown: bodyMd }],
        keywords: ["fatigue", "épuisement"],
        raw: bodyMd,
      }),
    );
  }
  return entries;
}
