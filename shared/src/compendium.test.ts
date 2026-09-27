import { describe, expect, it } from "vitest";
import {
  buildSortKey,
  defaultVisibilityFor,
  entryKey,
  monsterAveragePv,
  monsterCa,
  normalizeFr,
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

describe("normalisation FR (recherche et tri)", () => {
  it("minuscules, sans accents, ligatures dépliées", () => {
    expect(normalizeFr("Éclat de bois")).toBe("eclat de bois");
    expect(normalizeFr("Aigle géant")).toBe("aigle geant");
    expect(normalizeFr("Mauvais œil")).toBe("mauvais oeil");
    expect(normalizeFr("Bâton")).toBe("baton");
    expect(normalizeFr("Félys")).toBe("felys");
    expect(normalizeFr("  Â   terre ")).toBe("a terre");
  });

  it("la clé de tri place les titres accentés à leur rang alphabétique", () => {
    // Le symptôme remonté : « Éclat de bois » arrivait en 354ᵉ sur 361 parce
    // que SQLite compare les octets (É = 0xC3 0x89 se classe après Z).
    const titres = ["Zèbre", "Éclat de bois", "Aide", "Éponge", "Âne", "Bête"];
    const tri = [...titres].sort((a, b) => (buildSortKey(a) < buildSortKey(b) ? -1 : 1));
    expect(tri).toEqual(["Aide", "Âne", "Bête", "Éclat de bois", "Éponge", "Zèbre"]);
  });
});
