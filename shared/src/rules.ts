// ═══════════════════════════════════════════════════════════
// RollWith H&D — Règles 5E (R2.2)
// Fonctions pures uniquement. Aucun import Workers/DOM.
// ═══════════════════════════════════════════════════════════

export const CARACS = ["for", "dex", "con", "int", "sag", "cha"] as const;
export type Carac = (typeof CARACS)[number];

export const SKILLS = [
  "Athlétisme",
  "Acrobaties",
  "Discrétion",
  "Escamotage",
  "Arcanes",
  "Histoire",
  "Investigation",
  "Nature",
  "Religion",
  "Dressage",
  "Médecine",
  "Perception",
  "Perspicacité",
  "Survie",
  "Intimidation",
  "Persuasion",
  "Représentation",
  "Supercherie",
] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_CARAC: Record<Skill, Carac> = {
  Athlétisme: "for",
  Acrobaties: "dex",
  Discrétion: "dex",
  Escamotage: "dex",
  Arcanes: "int",
  Histoire: "int",
  Investigation: "int",
  Nature: "int",
  Religion: "int",
  Dressage: "sag",
  Médecine: "sag",
  Perception: "sag",
  Perspicacité: "sag",
  Survie: "sag",
  Intimidation: "cha",
  Persuasion: "cha",
  Représentation: "cha",
  Supercherie: "cha",
};

// XP thresholds: index 0 = level 1, index 19 = level 20
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
];

export function abilityModifier(score: number): number {
  if (score < 1 || score > 30) {
    throw new Error(`Valeur de caractéristique hors bornes: ${score}`);
  }
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  if (level < 1 || level > 20) {
    throw new Error(`Niveau hors bornes: ${level}`);
  }
  return Math.floor((level - 1) / 4) + 2;
}

export function savingThrowBonus(caracScore: number, proficient: boolean, level: number): number {
  const prof = proficient ? proficiencyBonus(level) : 0;
  return abilityModifier(caracScore) + prof;
}

export function skillBonus(caracScore: number, proficient: boolean, level: number): number {
  const prof = proficient ? proficiencyBonus(level) : 0;
  return abilityModifier(caracScore) + prof;
}

export function passivePerception(wisdomScore: number, proficient: boolean, level: number): number {
  return 10 + skillBonus(wisdomScore, proficient, level);
}

export function spellSaveDc(castingCaracScore: number, level: number): number {
  return 8 + proficiencyBonus(level) + abilityModifier(castingCaracScore);
}

export function spellAttackBonus(castingCaracScore: number, level: number): number {
  return proficiencyBonus(level) + abilityModifier(castingCaracScore);
}

export function levelFromXp(xp: number): number {
  if (xp < 0) return 1;
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]!) return i + 1;
  }
  return 1;
}

export function xpThreshold(level: number): number {
  if (level < 1 || level > 20) {
    throw new Error(`Niveau hors bornes: ${level}`);
  }
  return XP_THRESHOLDS[level - 1]!;
}
