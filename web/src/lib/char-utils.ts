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
import { findClass, findRace, racialBonus } from "$shared/hd";
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

/**
 * Détail du bonus racial appliqué automatiquement : breakdown sauvé sur la
 * fiche (création assistée / choix libres), sinon déduit de la table officielle
 * (partie fixe ; les choix libres du demi-elfe comptent 0 tant qu'ils ne sont
 * pas désignés). Aucune action manuelle n'est requise pour le calcul.
 */
export function racialBreakdown(sheet: CharacterSheet): Partial<Record<CaracKey, number>> {
  if (sheet.racial && Object.keys(sheet.racial).length) return sheet.racial;
  const r = findRace(sheet.identite?.race);
  if (!r) return {};
  return racialBonus(r) as Partial<Record<CaracKey, number>>;
}

export function effectiveCarac(sheet: CharacterSheet, carac: CaracKey): number {
  return sheet.caracs[carac] + (racialBreakdown(sheet)[carac] ?? 0);
}

/**
 * PV officiels H&D : niveau 1 = DV max + mod CON ; ensuite moyenne du DV
 * (moitié + 1) + mod CON par niveau. null si la classe n'est pas reconnue.
 */
export function suggestedPvMax(sheet: CharacterSheet): number | null {
  const c = findClass(sheet.identite?.classe);
  if (!c) return null;
  const con = abilityModifier(effectiveCarac(sheet, "con"));
  const level = Math.max(1, Math.min(20, sheet.identite?.niveau || 1));
  const avg = c.hitDie / 2 + 1;
  return Math.max(1, c.hitDie + con + (level - 1) * (avg + con));
}

export function getMod(sheet: CharacterSheet, carac: CaracKey): number {
  return abilityModifier(effectiveCarac(sheet, carac));
}

export function getLevel(sheet: CharacterSheet): number {
  return sheet.identite.niveau;
}

export function getProficiency(sheet: CharacterSheet): number {
  return proficiencyBonus(getLevel(sheet));
}

export function getSaveBonus(sheet: CharacterSheet, carac: CaracKey): number {
  const proficient = sheet.saveProficiencies[carac];
  return abilityModifier(effectiveCarac(sheet, carac)) + (proficient ? getProficiency(sheet) : 0);
}

export function getSkillBonus(sheet: CharacterSheet, skill: Skill): number {
  const proficient = sheet.skillProficiencies[skill] ?? false;
  const carac = SKILL_CARAC[skill];
  return abilityModifier(effectiveCarac(sheet, carac)) + (proficient ? getProficiency(sheet) : 0);
}

export function getPassivePerception(sheet: CharacterSheet): number {
  const proficient = sheet.skillProficiencies["Perception"] ?? false;
  return passivePerception(effectiveCarac(sheet, "sag"), proficient, getLevel(sheet));
}

export function getInitiativeBonus(sheet: CharacterSheet): number {
  return getMod(sheet, "dex") + sheet.initiativeBonus;
}

export function getShowSpells(sheet: CharacterSheet): boolean {
  return sheet.sorts.caracIncantation !== null;
}

export function getSpellSaveDc(sheet: CharacterSheet): number | null {
  if (!sheet.sorts.caracIncantation) return null;
  return spellSaveDc(effectiveCarac(sheet, sheet.sorts.caracIncantation), getLevel(sheet));
}

export function getSpellAttackBonus(sheet: CharacterSheet): number | null {
  if (!sheet.sorts.caracIncantation) return null;
  return spellAttackBonus(effectiveCarac(sheet, sheet.sorts.caracIncantation), getLevel(sheet));
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
