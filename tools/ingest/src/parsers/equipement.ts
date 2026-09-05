// Équipements issus des gros tableaux du DRS : armes, armures, outils,
// montures, marchandises. 1 ligne = 1 entrée.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { EquipmentMeta } from "@rollwith/shared/compendium";
import { extractTables, type Table } from "../markdown-tables.js";
import { makeEntry, slugify } from "../util.js";

interface EquipSpec {
  file: string;
  kind: string;
  nameHeader: string;
  /** en-tête → clé meta */
  columns: Record<string, keyof EquipmentMeta & string>;
}

const SPECS: Record<string, EquipSpec> = {
  armes: {
    file: "armes/README.md",
    kind: "arme",
    nameHeader: "Nom",
    columns: { Prix: "price", Dégâts: "damage", Poids: "weight", Propriétés: "properties" },
  },
  armures: {
    file: "armures/README.md",
    kind: "armure",
    nameHeader: "Armure",
    columns: {
      Prix: "price",
      "Classe d'armure (CA)": "ac",
      Force: "strength",
      Discrétion: "stealth",
      Poids: "weight",
    },
  },
  outils: {
    file: "outils/README.md",
    kind: "outil",
    nameHeader: "Objet",
    columns: { Prix: "price", Poids: "weight" },
  },
  montures: {
    file: "montures-et-vehicules/README.md",
    kind: "monture",
    columns: {},
    nameHeader: "Animal",
  },
  marchandises: {
    file: "marchandises/README.md",
    kind: "marchandise",
    nameHeader: "Marchandises",
    columns: { Prix: "price" },
  },
};

export type EquipmentSource = keyof typeof SPECS;

function normalizeName(cell: string): { text: string; anchor: string | null } {
  const m = /^\[(.+?)\]\(#(.+?)\)$/.exec(cell.trim());
  if (m) return { text: m[1]!.replace(/\*\*/g, "").trim(), anchor: m[2] ?? null };
  return { text: cell.replace(/\*\*/g, "").trim(), anchor: null };
}

export function parseEquipmentTables(drsDocsDir: string, source: EquipmentSource) {
  const spec = SPECS[source];
  if (!spec) throw new Error(`Source d'équipement inconnue : ${source}`);
  const md = readFileSync(path.join(drsDocsDir, spec.file), "utf8");
  return buildEquipmentEntries(md, spec, spec.file);
}

/** Exporté pour tests : prend le markdown directement. */
export function buildEquipmentEntries(md: string, spec: EquipSpec, sourceFile: string) {
  const tables: Table[] = extractTables(md);
  const seen = new Set<string>();
  const entries: ReturnType<typeof makeEntry>[] = [];
  for (const table of tables) {
    const nameIdx = table.headers.findIndex((h) => h.replace(/\s+/g, " ") === spec.nameHeader);
    if (nameIdx === -1) continue;
    const colIdx: Record<string, number> = {};
    for (const [header, key] of Object.entries(spec.columns)) {
      const idx = table.headers.findIndex((h) => h.replace(/\s+/g, " ") === header);
      if (idx !== -1) colIdx[key] = idx;
    }
    for (const row of table.rows) {
      const { text: name, anchor } = normalizeName(row.cells[nameIdx] ?? "");
      if (!name || name === spec.nameHeader) continue;
      const slug = slugify(anchor ?? name);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const meta: EquipmentMeta = { kind: spec.kind };
      if (row.group) meta.category = row.group;
      for (const [key, idx] of Object.entries(colIdx)) {
        const v = row.cells[idx];
        if (v) (meta as Record<string, unknown>)[key] = v;
      }
      entries.push(
        makeEntry({
          slug,
          category: "equipement",
          title: name,
          source: "Manuel des règles",
          meta,
          body: [],
          keywords: [spec.kind, row.group ?? "", meta.properties ?? ""],
          raw: `${sourceFile}#${slug}:${row.cells.join("|")}`,
        }),
      );
    }
  }
  return entries;
}
