import { describe, expect, it } from "vitest";
import {
  CLASSES,
  RACES,
  caracMod,
  findClass,
  findRace,
  freeChoiceCandidates,
  level1Pv,
  racialBonus,
} from "./hd";

describe("tables", () => {
  it("13 races et 12 classes officielles", () => {
    expect(RACES).toHaveLength(13);
    expect(CLASSES).toHaveLength(12);
  });

  it("DV conformes au DRS", () => {
    expect(findClass("Barbare")!.hitDie).toBe(12);
    expect(findClass("Magicien")!.hitDie).toBe(6);
    expect(findClass("Rôdeur")!.hitDie).toBe(10);
    expect(findClass("Ensorceleur")!.hitDie).toBe(6);
  });
});

describe("reconnaissance par nom libre", () => {
  it("féminins et variantes", () => {
    expect(findClass("Rôdeuse")?.key).toBe("rodeur");
    expect(findClass("rogue")?.key).toBeUndefined();
    expect(findClass("roublarde")?.key).toBe("roublard");
    expect(findRace("Elfe des bois")?.key).toBe("elfe");
    expect(findRace("halfellette")?.key).toBe("halfelin");
    expect(findRace("")).toBeNull();
  });
});

describe("bonus raciaux", () => {
  const demiElfe = findRace("Demi-elfe")!;
  const humain = findRace("Humain")!;
  const aasimar = findRace("Aasimar")!;

  it("fixes simples", () => {
    expect(racialBonus(aasimar)).toEqual({ cha: 2, sag: 1 });
  });

  it("humain : +1 partout", () => {
    const b = racialBonus(humain);
    expect(Object.values(b).every((v) => v === 1)).toBe(true);
    expect(Object.keys(b)).toHaveLength(6);
  });

  it("demi-elfe : 2 choix hors Charisme", () => {
    expect(freeChoiceCandidates(demiElfe)).toEqual(["for", "dex", "con", "int", "sag"]);
    expect(racialBonus(demiElfe, ["int", "dex"])).toEqual({ cha: 2, int: 1, dex: 1 });
    // choix invalide (charisme déjà fixe) ou en double ignoré
    expect(racialBonus(demiElfe, ["cha", "cha", "sag"])).toEqual({ cha: 2, sag: 1 });
    // incomplet : seulement ce qui est choisi
    expect(racialBonus(demiElfe, ["for"])).toEqual({ cha: 2, for: 1 });
  });
});

describe("pv niveau 1", () => {
  it("DV max + mod CON", () => {
    expect(level1Pv(12, 1)).toBe(13);
    expect(level1Pv(6, -1)).toBe(5);
    expect(caracMod(14)).toBe(2);
    expect(caracMod(8)).toBe(-1);
  });
});
