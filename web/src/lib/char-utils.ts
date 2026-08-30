import {
  abilityModifier,
  proficiencyBonus,
  passivePerception,
  spellSaveDc,
  spellAttackBonus,
  levelFromXp,
  xpThreshold,
  SKILLS,
  SKILL_CARAC,
  type Carac,
  type Skill,
} from "$shared/rules";
import type { CharacterSheet } from "./api";

export type CaracKey = "for" | "dex" | "con" | "int" | "sag" | "cha";

export const CARAC_LABELS: Record<CaracKey, string> = {
  for: "FOR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  sag: "SAG",
  cha: "CHA",
};

export const CARAC_NAMES: Record<CaracKey, string> = {
  for: "Force",
  dex: "Dextérité",
  con: "Constitution",
  int: "Intelligence",
  sag: "Sagesse",
  cha: "Charisme",
};

export function getMod(sheet: CharacterSheet, carac: CaracKey): number {
  return abilityModifier(sheet.caracs[carac]);
}

export function getLevel(sheet: CharacterSheet): number {
  return sheet.identite.niveau;
}

export function getProficiency(sheet: CharacterSheet): number {
  return proficiencyBonus(getLevel(sheet));
}

export function getSaveBonus(sheet: CharacterSheet, carac: CaracKey): number {
  const proficient = sheet.saveProficiencies[carac];
  return abilityModifier(sheet.caracs[carac]) + (proficient ? getProficiency(sheet) : 0);
}

export function getSkillBonus(sheet: CharacterSheet, skill: Skill): number {
  const proficient = sheet.skillProficiencies[skill] ?? false;
  const carac = SKILL_CARAC[skill];
  return abilityModifier(sheet.caracs[carac]) + (proficient ? getProficiency(sheet) : 0);
}

export function getPassivePerception(sheet: CharacterSheet): number {
  const proficient = sheet.skillProficiencies["Perception"] ?? false;
  return passivePerception(sheet.caracs.sag, proficient, getLevel(sheet));
}

export function getInitiativeBonus(sheet: CharacterSheet): number {
  return getMod(sheet, "dex") + sheet.initiativeBonus;
}

export function getShowSpells(sheet: CharacterSheet): boolean {
  return sheet.sorts.caracIncantation !== null;
}

export function getSpellSaveDc(sheet: CharacterSheet): number | null {
  if (!sheet.sorts.caracIncantation) return null;
  return spellSaveDc(sheet.caracs[sheet.sorts.caracIncantation], getLevel(sheet));
}

export function getSpellAttackBonus(sheet: CharacterSheet): number | null {
  if (!sheet.sorts.caracIncantation) return null;
  return spellAttackBonus(sheet.caracs[sheet.sorts.caracIncantation], getLevel(sheet));
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function getLevelFromXp(xp: number): number {
  return levelFromXp(xp);
}

export function getNextXpThreshold(xp: number): number {
  const level = levelFromXp(xp);
  if (level >= 20) return xp;
  return xpThreshold(level + 1);
}

export { SKILLS, SKILL_CARAC };
export type { Carac, Skill };
