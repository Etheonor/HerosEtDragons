// Collecte : parcourt le DRS et produit les entrées canoniques de toutes les catégories v1.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { CompendiumEntry } from "@rollwith/shared/compendium";
import { parseMonsterFile } from "./parsers/bestiaire.js";
import { parseSpellFile } from "./parsers/grimoire.js";
import { parseMagicItemFile } from "./parsers/objets-magiques.js";
import { parseRaceFile, parseClassFile, parseBackgroundFile } from "./parsers/semi-types.js";
import { parseConditionsFile } from "./parsers/etats.js";
import { parseEquipmentTables } from "./parsers/equipement.js";

function cardDirs(docsDir: string, rel: string): string[] {
  const dir = path.join(docsDir, rel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function readFile(dirs: string, rel: string): string | null {
  try {
    return readFileSync(path.join(dirs, rel), "utf8");
  } catch {
    return null;
  }
}

/** Les 68 premières fiches (tri alphabétique) étaient testées manuellement :
 *  on liste celles dont le frontmatter n'est pas un YAML valide pour rapport. */
export function collectDrs(docsDir: string): { entries: CompendiumEntry[]; errors: string[] } {
  const entries: CompendiumEntry[] = [];
  const errors: string[] = [];
  const tryPush = (label: string, fn: () => CompendiumEntry | CompendiumEntry[]) => {
    try {
      const r = fn();
      if (Array.isArray(r)) entries.push(...r);
      else entries.push(r);
    } catch (e) {
      errors.push(`${label} : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  for (const slug of cardDirs(docsDir, "bestiaire")) {
    const raw = readFile(docsDir, `bestiaire/${slug}/README.md`);
    if (raw) tryPush(`bestiaire/${slug}`, () => parseMonsterFile(slug, raw));
  }
  for (const slug of cardDirs(docsDir, "grimoire")) {
    const raw = readFile(docsDir, `grimoire/${slug}/README.md`);
    if (raw) tryPush(`grimoire/${slug}`, () => parseSpellFile(slug, raw));
  }
  for (const slug of cardDirs(docsDir, "liste-objets-magiques")) {
    const raw = readFile(docsDir, `liste-objets-magiques/${slug}/README.md`);
    if (raw) tryPush(`objets-magiques/${slug}`, () => parseMagicItemFile(slug, raw));
  }
  for (const slug of cardDirs(docsDir, "races")) {
    const raw = readFile(docsDir, `races/${slug}/README.md`);
    if (raw) tryPush(`races/${slug}`, () => parseRaceFile(slug, raw));
  }
  for (const slug of cardDirs(docsDir, "classes")) {
    const raw = readFile(docsDir, `classes/${slug}/README.md`);
    if (raw) tryPush(`classes/${slug}`, () => parseClassFile(slug, raw));
  }
  for (const slug of cardDirs(docsDir, "personnalite-et-historique")) {
    const raw = readFile(docsDir, `personnalite-et-historique/${slug}/README.md`);
    if (raw) tryPush(`historiques/${slug}`, () => parseBackgroundFile(slug, raw));
  }
  for (const src of ["armes", "armures", "outils", "montures", "marchandises"] as const) {
    tryPush(`equipement/${src}`, () =>
      parseEquipmentTables(docsDir, src === "montures" ? "montures" : src),
    );
  }
  const sante = readFile(docsDir, "gerer-la-sante-du-personnage/README.md");
  if (sante) tryPush("etats", () => parseConditionsFile(sante));

  return { entries, errors };
}

export function countByCategory(entries: CompendiumEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) out[e.category] = (out[e.category] ?? 0) + 1;
  return out;
}
