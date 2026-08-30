import { describe, it, expect } from "vitest";
import { sortInitiative, type InitiativeEntry } from "./initiative";

function entry(
  id: string,
  name: string,
  score: number,
  initBonus: number,
  kind: "pj" | "pnj",
  rollIndex: number,
): InitiativeEntry {
  return { id, name, score, initBonus, kind, rollIndex };
}

describe("sortInitiative", () => {
  it("sorts by score descending", () => {
    const entries = [
      entry("a", "Alice", 12, 2, "pj", 0),
      entry("b", "Bob", 18, 3, "pj", 1),
      entry("c", "Carol", 7, 0, "pj", 2),
    ];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("breaks ties by higher init bonus (R8.7)", () => {
    const entries = [entry("a", "Alice", 15, 2, "pj", 0), entry("b", "Bob", 15, 4, "pj", 1)];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("breaks ties by PJ before PNJ when score and bonus equal (R8.7)", () => {
    const entries = [entry("n1", "Gobelin", 14, 2, "pnj", 0), entry("p1", "Alice", 14, 2, "pj", 1)];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["p1", "n1"]);
  });

  it("breaks ties by roll order when score, bonus, and kind are all equal (R8.7)", () => {
    const entries = [entry("a", "Alice", 14, 2, "pj", 3), entry("b", "Bob", 14, 2, "pj", 1)];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("applies tiebreakers in order: score → bonus → kind → rollIndex", () => {
    const entries = [
      entry("n1", "Orc", 15, 3, "pnj", 5),
      entry("p1", "Alice", 15, 3, "pj", 2),
      entry("p2", "Bob", 15, 3, "pj", 1),
      entry("p3", "Carol", 20, 4, "pj", 3),
      entry("n2", "Gobelin", 15, 1, "pnj", 0),
    ];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["p3", "p2", "p1", "n1", "n2"]);
  });

  it("handles a single entry", () => {
    const entries = [entry("a", "Alice", 10, 0, "pj", 0)];
    const sorted = sortInitiative(entries);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.id).toBe("a");
  });

  it("handles empty array", () => {
    expect(sortInitiative([])).toEqual([]);
  });

  it("preserves stable order for identical entries (same rollIndex is impossible but tested)", () => {
    const entries = [entry("a", "Alice", 14, 2, "pj", 0), entry("b", "Bob", 14, 2, "pj", 0)];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("handles all PNJ with same score", () => {
    const entries = [
      entry("n1", "Orc 1", 12, 2, "pnj", 0),
      entry("n2", "Orc 2", 12, 2, "pnj", 1),
      entry("n3", "Orc 3", 12, 2, "pnj", 2),
    ];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("handles mixed PJ and PNJ with different scores", () => {
    const entries = [
      entry("n1", "Dragon", 18, 8, "pnj", 0),
      entry("p1", "Alice", 22, 5, "pj", 1),
      entry("p2", "Bob", 12, 2, "pj", 2),
      entry("n2", "Gobelin", 8, 0, "pnj", 3),
    ];
    const sorted = sortInitiative(entries);
    expect(sorted.map((e) => e.id)).toEqual(["p1", "n1", "p2", "n2"]);
  });
});
