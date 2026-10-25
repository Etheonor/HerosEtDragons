import { describe, expect, it } from "vitest";
import { cellsToMeters, distanceInCells, formatCells, formatMeters } from "./measure";

describe("distanceInCells", () => {
  it("convertit des pixels en cases (3-4-5)", () => {
    expect(distanceInCells(96, 128, 32)).toBeCloseTo(5);
  });

  it("une case fait 1,50 m", () => {
    expect(cellsToMeters(1)).toBeCloseTo(1.5);
    expect(cellsToMeters(4)).toBeCloseTo(6);
  });

  it("case nulle : 0 au lieu de NaN/Infinity", () => {
    expect(distanceInCells(10, 10, 0)).toBe(0);
  });
});

describe("formatage", () => {
  it("mètres avec virgule française", () => {
    expect(formatMeters(4.5)).toBe("4,5 m");
    expect(formatMeters(9)).toBe("9 m");
  });

  it("cases avec singulier/pluriel", () => {
    expect(formatCells(1)).toBe("1 case");
    expect(formatCells(1.5)).toBe("1,5 case");
    expect(formatCells(3)).toBe("3 cases");
  });
});
