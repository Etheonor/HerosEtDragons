import { describe, expect, it } from "vitest";
import {
  defaultVisibilityFor,
  entryKey,
  monsterAveragePv,
  monsterCa,
  sizeHitDie,
  type MonsterMeta,
} from "./compendium";

describe("visibilité par défaut", () => {
  it("bestiaire et objets magiques sont réservés au MJ", () => {
    expect(defaultVisibilityFor("bestiaire")).toBe("mj");
    expect(defaultVisibilityFor("objets-magiques")).toBe("mj");
    expect(defaultVisibilityFor("grimoire")).toBe("public");
    expect(defaultVisibilityFor("etats")).toBe("public");
  });
});

describe("dérivés de monstre", () => {
  it("dé de vie selon la taille", () => {
    expect(sizeHitDie("P")).toBe(6);
    expect(sizeHitDie("M")).toBe(8);
    expect(sizeHitDie("G")).toBe(10);
    expect(sizeHitDie(undefined)).toBe(8);
  });

  it("PV moyens ≈ (dés+1)/2 × count + conMod × count", () => {
    // 2d6, con 10 (mod 0) : (7)/2*2 = 7
    const gobelin: Partial<MonsterMeta> = {
      hitDiceCount: 2,
      size: "P",
      caracs: { for: 8, dex: 14, con: 10, int: 10, sag: 8, cha: 8 },
    };
    expect(monsterAveragePv(gobelin)).toBe(7);
  });

  it("CA : valeur explicite prioritaire", () => {
    const m: Partial<MonsterMeta> = {
      ca: [{ value: 15, armor: "armure naturelle" }],
      caracs: { for: 8, dex: 14, con: 10, int: 10, sag: 8, cha: 8 },
    };
    expect(monsterCa(m)).toBe(15);
  });

  it("CA estimée sans valeur : 10 + dex + bouclier", () => {
    const m: Partial<MonsterMeta> = {
      ca: [{ armor: "armure de cuir", hasShield: true }],
      caracs: { for: 8, dex: 14, con: 10, int: 10, sag: 8, cha: 8 },
    };
    // 10 + 2 (dex) + 2 (bouclier) = 14
    expect(monsterCa(m)).toBe(14);
  });

  it("clé d'entrée", () => {
    expect(entryKey("bestiaire", "gobelin")).toBe("bestiaire/gobelin");
  });
});
