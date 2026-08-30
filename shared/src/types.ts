// ═══════════════════════════════════════════════════════════
// RollWith H&D — Types du domaine (R2)
// Sources uniquement — les dérivés sont calculés via rules.ts.
// ═══════════════════════════════════════════════════════════

import type { Carac, Skill } from "./rules";
import type { Money, Item } from "./inventory";

export type { Carac, Skill, Money, Item };

export type CaracScores = Record<Carac, number>;

export type SaveProficiencies = Record<Carac, boolean>;
export type SkillProficiencies = Record<Skill, boolean>;

export interface Attack {
  id: string;
  name: string;
  bonus: number;
  damage: string;
}

export interface SpellSlot {
  level: number;
  max: number;
  used: number;
}

export interface SpellKnown {
  slug: string;
  level: number;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface CharacterSheet {
  identite: {
    nom: string;
    race: string;
    classe: string;
    niveau: number;
    historique: string;
    alignement: string;
    xp: number;
    citation?: string;
  };
  caracs: CaracScores;
  saveProficiencies: SaveProficiencies;
  skillProficiencies: SkillProficiencies;
  ca: number;
  vitesse: number;
  initiativeBonus: number;
  pvMax: number;
  desDeVie: { faces: number; total: number; restants: number };
  deathSaves: DeathSaves;
  inspiration: boolean;
  attaques: Attack[];
  sorts: {
    caracIncantation: Carac | null;
    connus: SpellKnown[];
    emplacements: SpellSlot[];
  };
  capacites: Feature[];
  personnalite: {
    traits?: string;
    ideaux?: string;
    liens?: string;
    defauts?: string;
  };
  languesEtMaitrises: string;
  equipement: {
    bourse: Money;
    objets: Item[];
  };
  couleurPion: string;
}

export interface Character {
  id: string;
  campaignId: string;
  ownerId: string | null;
  kind: "pj" | "pnj";
  name: string;
  color: string;
  active: boolean;
  sheet: CharacterSheet;
  pv: number;
  pvMax: number;
  pvTemp: number;
  conditions: string[];
  updatedAt: number;
}

export interface Npc {
  id: string;
  campaignId: string;
  name: string;
  pv: number;
  pvMax: number;
  ca: number;
  init: number;
  conditions: string[];
  color: string;
}

export interface CompendiumEntryMeta {
  [key: string]: unknown;
}

export interface CompendiumEntryBodySection {
  heading: string;
  paras: string[];
}

export type CompendiumCategory =
  | "bestiaire"
  | "grimoire"
  | "races"
  | "classes"
  | "historiques"
  | "dons"
  | "équipement"
  | "objets-magiques"
  | "états"
  | "règles";

export interface CompendiumEntry {
  slug: string;
  category: CompendiumCategory;
  title: string;
  source: string;
  sourcePage?: string;
  meta: CompendiumEntryMeta;
  body: CompendiumEntryBodySection[];
  visibility: "public" | "mj";
  searchText: string;
  version: number;
  hash: string;
  isHomebrew: boolean;
  campaignId?: string;
}
