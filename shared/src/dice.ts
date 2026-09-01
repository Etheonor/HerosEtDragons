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
  /** dés conservés, dans l'ordre de tirage */
  faces: number[];
  /** dés retirés (biffés), triés croissants */
  dropped: number[];
  total: number;
}

// /2d6+3 · /4d6b (biffer le dé le plus bas) · /4d6b2 · /caracs
const DICE_REGEX = /^\/?(\d*)d(\d+)(?:(?:b|B)(\d*)|([+-]\d+))?$/;

/** Commande dédiée aux jets de création : 6 × (4d6 biffer le plus bas). */
const CARACS_REGEX = /^\/?caracs\/?$/i;

export function isScoresCommand(input: string): boolean {
  return CARACS_REGEX.test(input.trim());
}

/** Les 6 valeurs de caracs, dans l'ordre FOR/DEX/CON/INT/SAG/CHA. */
export function formatScoresSummary(scores: number[]): string {
  return scores.join(" · ");
}

export interface ParsedDice {
  n: number;
  sides: number;
  mod: number;
  /** nombre de dés à retirer, les plus bas d'abord */
  drop: number;
}

export function parseDiceCommand(input: string): ParsedDice | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(DICE_REGEX);
  if (!match) return null;

  const nStr = match[1];
  const sides = parseInt(match[2]!, 10);
  // `b` seul = biffer 1 dé ; `bN` = biffer N dés.
  const drop = match[3] !== undefined ? (match[3] === "" ? 1 : parseInt(match[3], 10)) : 0;
  const mod = match[4] ? parseInt(match[4], 10) : 0;

  const n = nStr ? parseInt(nStr, 10) : 1;

  if (n < 1 || n > 20) return null;
  if (sides < 2 || sides > 100) return null;
  if (drop < 0 || drop > n - 1) return null;

  return { n, sides, mod, drop };
}

export function rollDice(n: number, sides: number, mod: number, rng: Rng, drop = 0): DiceRoll {
  const all: number[] = [];
  for (let i = 0; i < n; i++) all.push(rng.nextInt(sides) + 1);
  const dropCount = Math.max(0, Math.min(drop, n - 1));
  const order = all.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const dropped = order.slice(0, dropCount).map(([v]) => v);
  const droppedSlots = new Set(order.slice(0, dropCount).map(([, i]) => i));
  const faces = all.filter((_, i) => !droppedSlots.has(i));
  const sum = faces.reduce((a, b) => a + b, 0);
  return { n, sides, mod, faces, dropped, total: sum + mod };
}

export function isCritical(roll: DiceRoll): boolean {
  return roll.n === 1 && roll.sides === 20 && roll.faces[0] === 20;
}

export function isFumble(roll: DiceRoll): boolean {
  return roll.n === 1 && roll.sides === 20 && roll.faces[0] === 1;
}

export function formatRollDetail(roll: DiceRoll): string {
  const parts = [...roll.faces];
  let out: string;
  if (roll.mod > 0) {
    parts.push(roll.mod);
    out = parts.join(" + ");
  } else if (roll.mod < 0) {
    out = `${roll.faces.join(" + ")} - ${Math.abs(roll.mod)}`;
  } else {
    out = roll.faces.join(" + ");
  }
  if (roll.dropped.length > 0) {
    out += ` (biffé ${roll.dropped.join(", ")})`;
  }
  return out;
}

export function formatExpression(
  roll: Pick<DiceRoll, "n" | "sides" | "mod"> & { drop?: number },
): string {
  const base = `${roll.n}d${roll.sides}${roll.drop ? `b${roll.drop}` : ""}`;
  if (roll.mod > 0) return `${base}+${roll.mod}`;
  if (roll.mod < 0) return `${base}${roll.mod}`;
  return base;
}
