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

/** Sous-race (variante de race) : toujours rattachée à une race parente. */
export interface SubraceInfo {
  key: string;
  /** clé de la race parente dans RACES */
  race: string;
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

/** Sous-races officielles (sections `###` des docs/races du DRS).
 *  Seules les sous-races qui portent une augmentation de caractéristiques
 *  sont listées : en H&D R2 chacune vaut un simple +1. Les deux sections
 *  parasites du DRS sont volontairement exclues — « Variante technique »
 *  (humain : 3 caracs +1 au lieu de +1 partout) et « Ascendance » (sangdragon :
 *  type de dégâts / souffle / jet de sauvegarde) ne sont pas des sous-races. */
export const SUBRACES: SubraceInfo[] = [
  { key: "elfe-aether", race: "elfe", label: "Elfe d'aether", bonus: { fixed: { int: 1 } } },
  { key: "elfe-fer", race: "elfe", label: "Elfe de fer", bonus: { fixed: { cha: 1 } } },
  { key: "elfe-des-sylves", race: "elfe", label: "Elfe des sylves", bonus: { fixed: { sag: 1 } } },
  {
    key: "gnome-des-roches",
    race: "gnome",
    label: "Gnome des roches",
    bonus: { fixed: { con: 1 } },
  },
  { key: "gnome-des-fees", race: "gnome", label: "Gnome des fées", bonus: { fixed: { dex: 1 } } },
  { key: "gnome-des-lacs", race: "gnome", label: "Gnome des lacs", bonus: { fixed: { sag: 1 } } },
  {
    key: "halfelin-pied-leger",
    race: "halfelin",
    label: "Halfelin pied-léger",
    bonus: { fixed: { cha: 1 } },
  },
  {
    key: "halfelin-grand-sabot",
    race: "halfelin",
    label: "Halfelin grand-sabot",
    bonus: { fixed: { con: 1 } },
  },
  {
    key: "nain-des-tertres",
    race: "nain",
    label: "Nain des tertres",
    bonus: { fixed: { sag: 1 } },
  },
  {
    key: "nain-des-pierres",
    race: "nain",
    label: "Nain des pierres",
    bonus: { fixed: { int: 1 } },
  },
  { key: "nain-des-laves", race: "nain", label: "Nain des laves", bonus: { fixed: { for: 1 } } },
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

/** Sous-races : comme `normalize`, mais trait d'union = espace, pour que
 *  « Halfelin grand sabot » retrouve « Halfelin grand-sabot ». */
function normalizeSubrace(text: string): string {
  return normalize(text).replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

/** Sous-races d'une race (vide si la race n'en a pas). */
export function subracesFor(raceKey: string | undefined | null): SubraceInfo[] {
  if (!raceKey) return [];
  return SUBRACES.filter((s) => s.race === raceKey);
}

/** Sous-race par nom libre. `raceKey` restreint la recherche aux sous-races de
 *  cette race (une fiche ne peut pas porter la sous-race d'une autre race).
 *
 *  Matching volontairement plus strict que `matchByRoot` : une sous-race doit
 *  être nommée explicitement. Le préfixe inversé (`libellé commence par la
 *  saisie`) est proscrit — sans cela « Halfelin » retomberait sur « Halfelin
 *  pied-léger » et afficherait un +1 Charisme à un halfelin sans sous-race. */
export function findSubrace(
  name: string | undefined | null,
  raceKey?: string | null,
): SubraceInfo | null {
  if (!name) return null;
  const pool = raceKey ? SUBRACES.filter((s) => s.race === raceKey) : SUBRACES;
  if (!pool.length) return null;
  const q = normalizeSubrace(name);
  if (!q) return null;
  // Garde-fou : le nom d'une race n'est jamais une sous-race. Sans cela le
  // préfixe inversé (« halfelin-pied-leger » commence par « halfelin »)
  // attribuait un +1 Charisme fantôme aux halfelins sans sous-race.
  for (const r of RACES) {
    if (q === r.key || q === normalizeSubrace(r.label)) return null;
  }
  for (const s of pool) {
    for (const cand of [s.key, normalizeSubrace(s.label)]) {
      if (q === cand) return s;
      // saisie tronquée mais jamais triviale : « nain des » → « Nain des tertres »
      if (cand.startsWith(q) && q.length >= 8) return s;
    }
  }
  return null;
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

/** Bonus raciaux finaux : fixes (+all) + libres validés (ignorés hors candidats)
 *  + bonus de sous-race. Le même `freeChoices` sert la race et sa sous-race. */
export function racialBonus(
  race: RaceInfo,
  freeChoices: Carac[] = [],
  subrace?: SubraceInfo | null,
): Partial<Record<Carac, number>> {
  const out: Partial<Record<Carac, number>> = {};
  for (const b of [race.bonus, subrace?.bonus]) {
    if (!b) continue;
    if (b.all) {
      for (const c of CARAC_KEYS) out[c] = (out[c] ?? 0) + b.all;
    }
    for (const [c, v] of Object.entries(b.fixed ?? {}) as [Carac, number][]) {
      out[c] = (out[c] ?? 0) + v;
    }
    if (b.free) {
      const eligible = new Set(freeChoiceCandidates(race));
      const seen = new Set<Carac>();
      for (const c of freeChoices) {
        if (!eligible.has(c) || seen.has(c)) continue;
        seen.add(c);
        out[c] = (out[c] ?? 0) + b.free.value;
        if (seen.size >= b.free.count) break;
      }
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

// ── Emplacements de sorts par classe (tables officielles DRS) ──
// Extraites des tableaux d'évolution (docs/classes/*) : pour chaque niveau de
// personnage (index 0 = niveau 1), les emplacements max par niveau de sort
// (index 0 = niveau de sort 1, 0 = pas d'emplacement). Le sorcier suit le
// format « pacte » (tous ses emplacements sont de même niveau).
export const CLASS_SPELL_SLOTS: Record<string, number[][]> = {
  barde: [
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ],
  clerc: [
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ],
  druide: [
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ],
  ensorceleur: [
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ],
  magicien: [
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 0, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 0, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 0],
    [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ],
  paladin: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
  ],
  rodeur: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 0, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 2, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 0, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 1, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 2, 0, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 1, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
  ],
  sorcier: [
    [1, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 2, 0, 0, 0, 0, 0, 0],
    [0, 0, 2, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 0, 0, 0, 0],
    [0, 0, 0, 0, 4, 0, 0, 0, 0],
    [0, 0, 0, 0, 4, 0, 0, 0, 0],
    [0, 0, 0, 0, 4, 0, 0, 0, 0],
    [0, 0, 0, 0, 4, 0, 0, 0, 0],
  ],
};

/** Emplacements max par niveau de sort pour un personnage de ce niveau (9 valeurs). */
export function spellSlotsFor(classKey: string, level: number): number[] {
  const table = CLASS_SPELL_SLOTS[classKey];
  if (!table || level < 1 || level > 20) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  return table[level - 1] ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

// EOF hd.ts
