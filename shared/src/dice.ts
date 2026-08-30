// ═══════════════════════════════════════════════════════════
// RollWith H&D — Dés (R6)
// Parse /XdY±Z, roll, crit/fumble detection.
// Le RNG est injecté pour les tests.
// Bornes : 1 ≤ X ≤ 20, 2 ≤ Y ≤ 100 (R6.3)
// ═══════════════════════════════════════════════════════════

export interface Rng {
  nextInt(maxExclusive: number): number;
}

export interface DiceRoll {
  n: number;
  sides: number;
  mod: number;
  faces: number[];
  total: number;
}

const DICE_REGEX = /^\/?(\d*)d(\d+)([+-]\d+)?$/;

export function parseDiceCommand(input: string): { n: number; sides: number; mod: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(DICE_REGEX);
  if (!match) return null;

  const nStr = match[1];
  const sides = parseInt(match[2]!, 10);
  const mod = match[3] ? parseInt(match[3], 10) : 0;

  const n = nStr ? parseInt(nStr, 10) : 1;

  if (n < 1 || n > 20) return null;
  if (sides < 2 || sides > 100) return null;

  return { n, sides, mod };
}

export function rollDice(n: number, sides: number, mod: number, rng: Rng): DiceRoll {
  const faces: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const face = rng.nextInt(sides) + 1;
    faces.push(face);
    sum += face;
  }
  return { n, sides, mod, faces, total: sum + mod };
}

export function isCritical(roll: DiceRoll): boolean {
  return roll.n === 1 && roll.sides === 20 && roll.faces[0] === 20;
}

export function isFumble(roll: DiceRoll): boolean {
  return roll.n === 1 && roll.sides === 20 && roll.faces[0] === 1;
}

export function formatRollDetail(roll: DiceRoll): string {
  const parts = [...roll.faces];
  if (roll.mod > 0) {
    parts.push(roll.mod);
    return parts.join(" + ");
  }
  if (roll.mod < 0) {
    return `${roll.faces.join(" + ")} - ${Math.abs(roll.mod)}`;
  }
  return roll.faces.join(" + ");
}

export function formatExpression(roll: Pick<DiceRoll, "n" | "sides" | "mod">): string {
  const base = `${roll.n}d${roll.sides}`;
  if (roll.mod > 0) return `${base}+${roll.mod}`;
  if (roll.mod < 0) return `${base}${roll.mod}`;
  return base;
}
