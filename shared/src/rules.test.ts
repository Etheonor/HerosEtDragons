import { describe, it, expect } from "vitest";
import {
  abilityModifier,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  passivePerception,
  spellSaveDc,
  spellAttackBonus,
  levelFromXp,
  xpThreshold,
  SKILLS,
  SKILL_CARAC,
  CARACS,
} from "./rules";

describe("abilityModifier", () => {
  it("returns 0 for 10 and 11", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
  });

  it("returns +1 for 12 and 13", () => {
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(13)).toBe(1);
  });

  it("returns -5 for 1 (minimum)", () => {
    expect(abilityModifier(1)).toBe(-5);
  });

  it("returns +10 for 30 (maximum)", () => {
    expect(abilityModifier(30)).toBe(10);
  });

  it("floors correctly (12 → +1, not +1.5)", () => {
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(13)).toBe(1);
    expect(abilityModifier(14)).toBe(2);
    expect(abilityModifier(15)).toBe(2);
  });

  it("handles odd values (8 → -1, 9 → -1)", () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(9)).toBe(-1);
  });

  it("throws for values out of range", () => {
    expect(() => abilityModifier(0)).toThrow();
    expect(() => abilityModifier(31)).toThrow();
    expect(() => abilityModifier(-1)).toThrow();
  });
});

describe("proficiencyBonus", () => {
  it("returns +2 for levels 1–4", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(2)).toBe(2);
    expect(proficiencyBonus(3)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
  });

  it("returns +3 for levels 5–8", () => {
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(6)).toBe(3);
    expect(proficiencyBonus(7)).toBe(3);
    expect(proficiencyBonus(8)).toBe(3);
  });

  it("returns +4 for levels 9–12", () => {
    expect(proficiencyBonus(9)).toBe(4);
    expect(proficiencyBonus(10)).toBe(4);
    expect(proficiencyBonus(12)).toBe(4);
  });

  it("returns +5 for levels 13–16", () => {
    expect(proficiencyBonus(13)).toBe(5);
    expect(proficiencyBonus(15)).toBe(5);
    expect(proficiencyBonus(16)).toBe(5);
  });

  it("returns +6 for levels 17–20", () => {
    expect(proficiencyBonus(17)).toBe(6);
    expect(proficiencyBonus(19)).toBe(6);
    expect(proficiencyBonus(20)).toBe(6);
  });

  it("throws for levels out of range", () => {
    expect(() => proficiencyBonus(0)).toThrow();
    expect(() => proficiencyBonus(21)).toThrow();
  });
});

describe("savingThrowBonus", () => {
  it("returns just the modifier when not proficient", () => {
    expect(savingThrowBonus(14, false, 1)).toBe(2);
  });

  it("returns modifier + proficiency when proficient", () => {
    expect(savingThrowBonus(14, true, 1)).toBe(4);
    expect(savingThrowBonus(14, true, 5)).toBe(5);
  });

  it("handles negative modifiers", () => {
    expect(savingThrowBonus(8, false, 1)).toBe(-1);
    expect(savingThrowBonus(8, true, 1)).toBe(1);
  });
});

describe("skillBonus", () => {
  it("returns just the modifier when not proficient", () => {
    expect(skillBonus(15, false, 1)).toBe(2);
  });

  it("returns modifier + proficiency when proficient", () => {
    expect(skillBonus(15, true, 1)).toBe(4);
    expect(skillBonus(15, true, 5)).toBe(5);
  });
});

describe("passivePerception", () => {
  it("is 10 + mod when not proficient", () => {
    expect(passivePerception(10, false, 1)).toBe(10);
    expect(passivePerception(15, false, 1)).toBe(12);
  });

  it("is 10 + mod + proficiency when proficient", () => {
    expect(passivePerception(15, true, 1)).toBe(14);
    expect(passivePerception(15, true, 5)).toBe(15);
  });

  it("handles negative modifiers", () => {
    expect(passivePerception(8, false, 1)).toBe(9);
    expect(passivePerception(8, true, 1)).toBe(11);
  });
});

describe("spellSaveDc", () => {
  it("is 8 + proficiency + casting modifier", () => {
    expect(spellSaveDc(16, 1)).toBe(8 + 3 + 2); // 13
    expect(spellSaveDc(16, 5)).toBe(8 + 3 + 3); // 14
    expect(spellSaveDc(20, 17)).toBe(8 + 6 + 5); // 19
  });

  it("handles low casting stats", () => {
    expect(spellSaveDc(8, 1)).toBe(8 + 2 + -1); // 9
  });
});

describe("spellAttackBonus", () => {
  it("is proficiency + casting modifier", () => {
    expect(spellAttackBonus(16, 1)).toBe(2 + 3); // 5
    expect(spellAttackBonus(16, 5)).toBe(3 + 3); // 6
    expect(spellAttackBonus(20, 17)).toBe(6 + 5); // 11
  });
});

describe("levelFromXp", () => {
  it("returns 1 for 0 XP", () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it("returns 2 for 300 XP", () => {
    expect(levelFromXp(300)).toBe(2);
  });

  it("returns 4 for 2700 XP (boundary)", () => {
    expect(levelFromXp(2700)).toBe(4);
  });

  it("returns 5 for 6500 XP", () => {
    expect(levelFromXp(6500)).toBe(5);
  });

  it("returns 5 for 6499 XP (just below)", () => {
    expect(levelFromXp(6499)).toBe(4);
  });

  it("returns 20 for 355000 XP", () => {
    expect(levelFromXp(355000)).toBe(20);
  });

  it("returns 20 for XP beyond max", () => {
    expect(levelFromXp(999999)).toBe(20);
  });

  it("returns 1 for negative XP", () => {
    expect(levelFromXp(-100)).toBe(1);
  });
});

describe("xpThreshold", () => {
  it("returns XP needed to reach a given level", () => {
    expect(xpThreshold(1)).toBe(0);
    expect(xpThreshold(2)).toBe(300);
    expect(xpThreshold(5)).toBe(6500);
    expect(xpThreshold(20)).toBe(355000);
  });

  it("throws for levels out of range", () => {
    expect(() => xpThreshold(0)).toThrow();
    expect(() => xpThreshold(21)).toThrow();
  });
});

describe("SKILLS constant", () => {
  it("has exactly 18 skills", () => {
    expect(SKILLS).toHaveLength(18);
  });

  it("includes all H&D skills", () => {
    expect(SKILLS).toContain("Athlétisme");
    expect(SKILLS).toContain("Acrobaties");
    expect(SKILLS).toContain("Discrétion");
    expect(SKILLS).toContain("Escamotage");
    expect(SKILLS).toContain("Arcanes");
    expect(SKILLS).toContain("Histoire");
    expect(SKILLS).toContain("Investigation");
    expect(SKILLS).toContain("Nature");
    expect(SKILLS).toContain("Religion");
    expect(SKILLS).toContain("Dressage");
    expect(SKILLS).toContain("Médecine");
    expect(SKILLS).toContain("Perception");
    expect(SKILLS).toContain("Perspicacité");
    expect(SKILLS).toContain("Survie");
    expect(SKILLS).toContain("Intimidation");
    expect(SKILLS).toContain("Persuasion");
    expect(SKILLS).toContain("Représentation");
    expect(SKILLS).toContain("Supercherie");
  });
});

describe("SKILL_CARAC mapping", () => {
  it("maps Athlétisme to Force", () => {
    expect(SKILL_CARAC["Athlétisme"]).toBe("for");
  });

  it("maps Acrobaties to Dextérité", () => {
    expect(SKILL_CARAC["Acrobaties"]).toBe("dex");
  });

  it("maps Perception to Sagesse", () => {
    expect(SKILL_CARAC["Perception"]).toBe("sag");
  });

  it("maps Persuasion to Charisme", () => {
    expect(SKILL_CARAC["Persuasion"]).toBe("cha");
  });

  it("maps all 18 skills", () => {
    for (const skill of SKILLS) {
      expect(SKILL_CARAC[skill]).toBeDefined();
    }
  });
});

describe("CARACS constant", () => {
  it("has exactly 6 characteristics", () => {
    expect(CARACS).toHaveLength(6);
  });

  it("contains for, dex, con, int, sag, cha", () => {
    expect(CARACS).toEqual(["for", "dex", "con", "int", "sag", "cha"]);
  });
});
