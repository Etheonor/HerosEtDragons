import { describe, it, expect } from "vitest";
import {
  parseDiceCommand,
  rollDice,
  isCritical,
  isFumble,
  formatRollDetail,
  type DiceRoll,
  type Rng,
} from "./dice";

function fixedRng(faces: number[]): Rng {
  let i = 0;
  return {
    nextInt(maxExclusive: number): number {
      const val = faces[i % faces.length]!;
      i++;
      if (val < 0 || val >= maxExclusive) {
        throw new Error(`fixedRng: ${val} out of range [0, ${maxExclusive})`);
      }
      return val;
    },
  };
}

describe("parseDiceCommand", () => {
  it("parses /1d20", () => {
    expect(parseDiceCommand("/1d20")).toEqual({ n: 1, sides: 20, mod: 0 });
  });

  it("parses /2d6+3", () => {
    expect(parseDiceCommand("/2d6+3")).toEqual({ n: 2, sides: 6, mod: 3 });
  });

  it("parses /3d8-2", () => {
    expect(parseDiceCommand("/3d8-2")).toEqual({ n: 3, sides: 8, mod: -2 });
  });

  it("parses /d20 (implicit 1 die)", () => {
    expect(parseDiceCommand("/d20")).toEqual({ n: 1, sides: 20, mod: 0 });
  });

  it("parses /1d20+0", () => {
    expect(parseDiceCommand("/1d20+0")).toEqual({ n: 1, sides: 20, mod: 0 });
  });

  it("parses /20d100+5", () => {
    expect(parseDiceCommand("/20d100+5")).toEqual({ n: 20, sides: 100, mod: 5 });
  });

  it("parses /2d6 (no modifier)", () => {
    expect(parseDiceCommand("/2d6")).toEqual({ n: 2, sides: 6, mod: 0 });
  });

  it("rejects /21d6 (n > 20)", () => {
    expect(parseDiceCommand("/21d6")).toBeNull();
  });

  it("rejects /0d6 (n = 0)", () => {
    expect(parseDiceCommand("/0d6")).toBeNull();
  });

  it("rejects /2d1 (sides < 2)", () => {
    expect(parseDiceCommand("/2d1")).toBeNull();
  });

  it("rejects /2d101 (sides > 100)", () => {
    expect(parseDiceCommand("/2d101")).toBeNull();
  });

  it("rejects non-dice text", () => {
    expect(parseDiceCommand("hello world")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(parseDiceCommand("")).toBeNull();
  });

  it("rejects malformed dice expressions", () => {
    expect(parseDiceCommand("/2d")).toBeNull();
    expect(parseDiceCommand("/d")).toBeNull();
    expect(parseDiceCommand("/2d6+")).toBeNull();
    expect(parseDiceCommand("/2d6++3")).toBeNull();
  });

  it("handles negative modifier with large value", () => {
    expect(parseDiceCommand("/1d20-10")).toEqual({ n: 1, sides: 20, mod: -10 });
  });

  it("detects dice command in a chat message (not just /)", () => {
    expect(parseDiceCommand("2d6+3")).toEqual({ n: 2, sides: 6, mod: 3 });
    expect(parseDiceCommand("d20")).toEqual({ n: 1, sides: 20, mod: 0 });
  });
});

describe("rollDice", () => {
  it("rolls 1d20 with fixed RNG", () => {
    const rng = fixedRng([14]);
    const result = rollDice(1, 20, 0, rng);
    expect(result.faces).toEqual([15]);
    expect(result.total).toBe(15);
    expect(result.mod).toBe(0);
  });

  it("rolls 2d6+3 with fixed RNG", () => {
    const rng = fixedRng([2, 4]);
    const result = rollDice(2, 6, 3, rng);
    expect(result.faces).toEqual([3, 5]);
    expect(result.total).toBe(8 + 3);
    expect(result.mod).toBe(3);
  });

  it("rolls 1d20+7 with a natural 20", () => {
    const rng = fixedRng([19]);
    const result = rollDice(1, 20, 7, rng);
    expect(result.faces).toEqual([20]);
    expect(result.total).toBe(27);
    expect(isCritical(result)).toBe(true);
  });

  it("rolls 1d20 with a natural 1 (fumble)", () => {
    const rng = fixedRng([0]);
    const result = rollDice(1, 20, 0, rng);
    expect(result.faces).toEqual([1]);
    expect(isFumble(result)).toBe(true);
  });

  it("detects crit only on 1d20, not on multiple dice", () => {
    const rng = fixedRng([19, 10]);
    const result = rollDice(2, 20, 0, rng);
    expect(result.faces).toEqual([20, 11]);
    expect(isCritical(result)).toBe(false);
  });

  it("detects fumble only on 1d20, not on multiple dice", () => {
    const rng = fixedRng([0, 10]);
    const result = rollDice(2, 20, 0, rng);
    expect(result.faces).toEqual([1, 11]);
    expect(isFumble(result)).toBe(false);
  });

  it("does not detect crit on non-d20 dice", () => {
    const rng = fixedRng([19]);
    const result = rollDice(1, 20, 0, rng);
    expect(result.faces).toEqual([20]);
    expect(isCritical(result)).toBe(true);

    const rng2 = fixedRng([11]);
    const result2 = rollDice(1, 12, 0, rng2);
    expect(result2.faces).toEqual([12]);
    expect(isCritical(result2)).toBe(false);
  });

  it("handles negative modifier", () => {
    const rng = fixedRng([9]);
    const result = rollDice(1, 20, -5, rng);
    expect(result.faces).toEqual([10]);
    expect(result.total).toBe(5);
    expect(result.mod).toBe(-5);
  });

  it("handles multiple dice with modifier", () => {
    const rng = fixedRng([0, 1, 2, 3, 4]);
    const result = rollDice(5, 6, 2, rng);
    expect(result.faces).toEqual([1, 2, 3, 4, 5]);
    expect(result.total).toBe(15 + 2);
  });
});

describe("isCritical", () => {
  it("returns true for 1d20 natural 20", () => {
    const roll: DiceRoll = { n: 1, sides: 20, mod: 0, faces: [20], total: 20 };
    expect(isCritical(roll)).toBe(true);
  });

  it("returns false for 1d20 natural 19", () => {
    const roll: DiceRoll = { n: 1, sides: 20, mod: 0, faces: [19], total: 19 };
    expect(isCritical(roll)).toBe(false);
  });

  it("returns false for 2d20 even if one is 20", () => {
    const roll: DiceRoll = { n: 2, sides: 20, mod: 0, faces: [20, 5], total: 25 };
    expect(isCritical(roll)).toBe(false);
  });
});

describe("isFumble", () => {
  it("returns true for 1d20 natural 1", () => {
    const roll: DiceRoll = { n: 1, sides: 20, mod: 0, faces: [1], total: 1 };
    expect(isFumble(roll)).toBe(true);
  });

  it("returns false for 1d20 natural 2", () => {
    const roll: DiceRoll = { n: 1, sides: 20, mod: 0, faces: [2], total: 2 };
    expect(isFumble(roll)).toBe(false);
  });
});

describe("formatRollDetail", () => {
  it("formats 1d20+7 = 14+7", () => {
    const roll: DiceRoll = { n: 1, sides: 20, mod: 7, faces: [14], total: 21 };
    expect(formatRollDetail(roll)).toBe("14 + 7");
  });

  it("formats 2d6+3 = 3+5+3", () => {
    const roll: DiceRoll = { n: 2, sides: 6, mod: 3, faces: [3, 5], total: 11 };
    expect(formatRollDetail(roll)).toBe("3 + 5 + 3");
  });

  it("formats 1d20 without modifier", () => {
    const roll: DiceRoll = { n: 1, sides: 20, mod: 0, faces: [14], total: 14 };
    expect(formatRollDetail(roll)).toBe("14");
  });

  it("formats 1d20-5 with negative modifier", () => {
    const roll: DiceRoll = { n: 1, sides: 20, mod: -5, faces: [14], total: 9 };
    expect(formatRollDetail(roll)).toBe("14 - 5");
  });

  it("formats multiple dice without modifier", () => {
    const roll: DiceRoll = { n: 3, sides: 6, mod: 0, faces: [2, 4, 1], total: 7 };
    expect(formatRollDetail(roll)).toBe("2 + 4 + 1");
  });
});
