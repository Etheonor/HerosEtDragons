// ═══════════════════════════════════════════════════════════
// RollWith H&D — Tables officielles races & classes (R2, données DRS)
// Source : heros-et-dragons-drs (docs/races, docs/classes), vérifiées
// par extraction le 2026-09-06. Pur + testé : c'est la référence des
// bonus appliqués aux stats (création assistée 9b, montée de niveau 9c).
// ═══════════════════════════════════════════════════════════

import { CARACS, abilityModifier, type Carac } from "./rules";

export type { Carac };

export interface RaceBonus {
  /** bonus fixes (caractéristique → valeur) */
  fixed?: Partial<Record<Carac, number>>;
  /** bonus « tous » (Humain : +1 partout) */
  all?: number;
  /** bonus libres : `count` caractéristiques au choix du joueur, +value chacune.
   *  Exclusions calculées : le choix ne peut pas retomber sur une carac déjà
   *  boosted par `fixed` (demi-elfe : les 2×+1 hors Charisme). */
  free?: { count: number; value: number };
}

export interface RaceInfo {
  key: string;
  label: string;
  bonus: RaceBonus;
}

export interface ClassInfo {
  key: string;
  label: string;
  /** dé de vie (faces) */
  hitDie: number;
  saves: Carac[];
  /** caractéristique d'incantation (ki des moines inclus en sag) */
  casting: Carac | null;
}

export const RACES: RaceInfo[] = [
  { key: "aasimar", label: "Aasimar", bonus: { fixed: { cha: 2, sag: 1 } } },
  {
    key: "demi-elfe",
    label: "Demi-elfe",
    bonus: { fixed: { cha: 2 }, free: { count: 2, value: 1 } },
  },
  { key: "demi-ogre", label: "Demi-ogre", bonus: { fixed: { con: 2, for: 2 } } },
  { key: "demi-orc", label: "Demi-orc", bonus: { fixed: { for: 2, con: 1 } } },
  { key: "elfe", label: "Elfe", bonus: { fixed: { dex: 2 } } },
  { key: "felys", label: "Félys", bonus: { fixed: { dex: 2, sag: 1 } } },
  { key: "gnome", label: "Gnome", bonus: { fixed: { int: 2 } } },
  { key: "halfelin", label: "Halfelin", bonus: { fixed: { dex: 2 } } },
  { key: "homme-serpent", label: "Homme-serpent", bonus: { fixed: { sag: 2, cha: 1 } } },
  { key: "humain", label: "Humain", bonus: { all: 1 } },
  { key: "nain", label: "Nain", bonus: { fixed: { con: 2 } } },
  { key: "sangdragon", label: "Sangdragon", bonus: { fixed: { for: 2, cha: 1 } } },
  { key: "tieffelin", label: "Tieffelin", bonus: { fixed: { cha: 2, int: 1 } } },
];

export const CLASSES: ClassInfo[] = [
  { key: "barbare", label: "Barbare", hitDie: 12, saves: ["for", "con"], casting: null },
  { key: "barde", label: "Barde", hitDie: 8, saves: ["dex", "cha"], casting: "cha" },
  { key: "clerc", label: "Clerc", hitDie: 8, saves: ["sag", "cha"], casting: "sag" },
  { key: "druide", label: "Druide", hitDie: 8, saves: ["int", "sag"], casting: "sag" },
  { key: "ensorceleur", label: "Ensorceleur", hitDie: 6, saves: ["con", "cha"], casting: "cha" },
  { key: "guerrier", label: "Guerrier", hitDie: 10, saves: ["for", "con"], casting: null },
  { key: "magicien", label: "Magicien", hitDie: 6, saves: ["int", "sag"], casting: "int" },
  { key: "moine", label: "Moine", hitDie: 8, saves: ["for", "dex"], casting: "sag" },
  { key: "paladin", label: "Paladin", hitDie: 10, saves: ["sag", "cha"], casting: "cha" },
  { key: "rodeur", label: "Rôdeur", hitDie: 10, saves: ["for", "dex"], casting: "sag" },
  { key: "roublard", label: "Roublard", hitDie: 8, saves: ["dex", "int"], casting: null },
  { key: "sorcier", label: "Sorcier", hitDie: 8, saves: ["sag", "cha"], casting: "cha" },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z -]/g, "")
    .trim();
}

/** Les variantes de genre/Pluriel (« Rôdeuse », « elfes ») ramènent à la fiche. */
function matchByRoot<T extends { key: string; label: string }>(
  table: T[],
  input: string,
): T | null {
  const q = normalize(input);
  if (!q) return null;
  let best: { root: string; item: (typeof table)[number] } | null = null;
  for (const item of table) {
    for (const cand of [item.key, normalize(item.label)]) {
      if (q === cand || q.startsWith(cand) || cand.startsWith(q)) return item;
      // « rodeuse » vs « rodeur » : accord sur le radical (5 premières lettres)
      const root = cand.slice(0, 5);
      if (
        root.length === 5 &&
        q.slice(0, 5) === root &&
        (!best || cand.length > best.root.length)
      ) {
        best = { root: cand, item };
      }
    }
  }
  return best?.item ?? null;
}

export function findRace(name: string | undefined | null): RaceInfo | null {
  if (!name) return null;
  return matchByRoot(RACES, name);
}

export function findClass(name: string | undefined | null): ClassInfo | null {
  if (!name) return null;
  return matchByRoot(CLASSES, name);
}

const CARAC_KEYS = CARACS;

/** Choix libres requis pour une race (0 si aucune sélection à faire). */
export function freeChoiceCount(race: RaceInfo): number {
  return race.bonus.free?.count ?? 0;
}

/** Caractéristiques éligibles aux choix libres (exclues : déjà fixées). */
export function freeChoiceCandidates(race: RaceInfo): Carac[] {
  const fixed = new Set(Object.keys(race.bonus.fixed ?? {}) as Carac[]);
  return CARAC_KEYS.filter((c) => !fixed.has(c));
}

/** Bonus raciaux finaux : fixes (+all) + libres validés (ignorés hors candidats). */
export function racialBonus(
  race: RaceInfo,
  freeChoices: Carac[] = [],
): Partial<Record<Carac, number>> {
  const out: Partial<Record<Carac, number>> = {};
  if (race.bonus.all) {
    for (const c of CARAC_KEYS) out[c] = (out[c] ?? 0) + race.bonus.all;
  }
  for (const [c, v] of Object.entries(race.bonus.fixed ?? {}) as [Carac, number][]) {
    out[c] = (out[c] ?? 0) + v;
  }
  if (race.bonus.free) {
    const eligible = new Set(freeChoiceCandidates(race));
    const seen = new Set<Carac>();
    for (const c of freeChoices) {
      if (!eligible.has(c) || seen.has(c)) continue;
      seen.add(c);
      out[c] = (out[c] ?? 0) + race.bonus.free.value;
      if (seen.size >= race.bonus.free.count) break;
    }
  }
  return out;
}

/** Total du bonus racial (répartition pour l'affichage). */
export function racialTotal(bonus: Partial<Record<Carac, number>>): number {
  return Object.values(bonus).reduce((a, b) => a + (b ?? 0), 0);
}

/** PV du niveau 1 : DV au maximum + modificateur de CON. */
export function level1Pv(hitDie: number, conMod: number): number {
  return Math.max(1, hitDie + conMod);
}

export const caracMod = abilityModifier;

// EOF hd.ts
