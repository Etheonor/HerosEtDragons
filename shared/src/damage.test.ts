import { describe, it, expect } from "vitest";
import { applyDamage } from "./damage";

describe("applyDamage", () => {
  it("dégâts sans PV temporaires : entament directement les PV", () => {
    expect(applyDamage(20, 0, 20, -7)).toEqual({ pv: 13, pvTemp: 0 });
  });

  it("dégâts absorbés entièrement par les PV temporaires", () => {
    expect(applyDamage(20, 10, 20, -6)).toEqual({ pv: 20, pvTemp: 4 });
  });

  it("dégâts qui épuisent les PV temporaires puis entament les PV", () => {
    expect(applyDamage(20, 5, 20, -8)).toEqual({ pv: 17, pvTemp: 0 });
  });

  it("dégâts fatals : les PV ne descendent pas sous 0", () => {
    expect(applyDamage(5, 0, 20, -50)).toEqual({ pv: 0, pvTemp: 0 });
  });

  it("soin : ne touche jamais les PV temporaires, borné à pvMax", () => {
    expect(applyDamage(10, 5, 20, +100)).toEqual({ pv: 20, pvTemp: 5 });
  });

  it("delta nul : no-op", () => {
    expect(applyDamage(10, 3, 20, 0)).toEqual({ pv: 10, pvTemp: 3 });
  });
});
