import { describe, expect, it } from "vitest";
import { fitToolbar, type ToolbarItem } from "./toolbarFit";

const item = (id: string, width: number, priority: number, pinned = false): ToolbarItem => ({
  id,
  width,
  priority,
  pinned,
});

describe("fitToolbar", () => {
  it("garde tout quand la place suffit", () => {
    const items = [item("a", 40, 10), item("b", 40, 20)];
    const { visible, overflow } = fitToolbar(items, 200);
    expect(visible.map((i) => i.id)).toEqual(["a", "b"]);
    expect(overflow).toEqual([]);
  });

  it("sort la priorité la plus faible d'abord", () => {
    const items = [item("a", 100, 10), item("b", 100, 50), item("c", 100, 30)];
    const { visible, overflow } = fitToolbar(items, 210);
    expect(visible.map((i) => i.id)).toEqual(["b", "c"]);
    expect(overflow.map((i) => i.id)).toEqual(["a"]);
  });

  it("à priorité égale, sort les derniers de la liste", () => {
    const items = [item("a", 100, 20), item("b", 100, 20), item("c", 100, 20)];
    const { visible, overflow } = fitToolbar(items, 210);
    expect(visible.map((i) => i.id)).toEqual(["a", "b"]);
    expect(overflow.map((i) => i.id)).toEqual(["c"]);
  });

  it("n'évince jamais un élément épinglé, même le moins prioritaire", () => {
    const items = [item("low", 100, 1, true), item("high", 100, 99)];
    const { visible, overflow } = fitToolbar(items, 110);
    expect(visible.map((i) => i.id)).toEqual(["low"]);
    expect(overflow.map((i) => i.id)).toEqual(["high"]);
  });

  it("conserve l'ordre visuel dans les deux sorties", () => {
    const items = [item("a", 80, 10), item("b", 80, 5), item("c", 80, 50)];
    const { visible, overflow } = fitToolbar(items, 170);
    expect(visible.map((i) => i.id)).toEqual(["a", "c"]);
    expect(overflow.map((i) => i.id)).toEqual(["b"]);
  });

  it("s'arrête proprement quand même les épinglés débordent", () => {
    const items = [item("a", 100, 1, true), item("b", 100, 1, true)];
    const { visible, overflow } = fitToolbar(items, 50);
    expect(visible).toHaveLength(2);
    expect(overflow).toEqual([]);
  });
});
