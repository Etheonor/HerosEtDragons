import { describe, expect, it } from "vitest";
import {
  spellSlotsFor,
  cantripsFor,
  CLASSES,
  CLASS_CANTRIPS,
  RACES,
  SUBRACES,
  caracMod,
  findClass,
  findRace,
  findSubrace,
  freeChoiceCandidates,
  level1Pv,
  racialBonus,
  subracesFor,
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

describe("sous-races", () => {
  it("chaque sous-race est rattachée à une race connue", () => {
    const keys = new Set(RACES.map((r) => r.key));
    for (const s of SUBRACES) expect(keys.has(s.race)).toBe(true);
  });

  it("les races du DRS qui ont des sous-races sont couvertes", () => {
    expect(subracesFor("elfe").map((s) => s.label)).toEqual([
      "Elfe d'aether",
      "Elfe de fer",
      "Elfe des sylves",
    ]);
    expect(subracesFor("gnome")).toHaveLength(3);
    expect(subracesFor("halfelin")).toHaveLength(2);
    expect(subracesFor("nain")).toHaveLength(3);
    // races sans sous-race dans le DRS
    expect(subracesFor("humain")).toEqual([]);
    expect(subracesFor("sangdragon")).toEqual([]);
    expect(subracesFor(null)).toEqual([]);
  });

  it("reconnaissance par nom libre, restreinte à la race", () => {
    expect(findSubrace("Gnome des lacs", "gnome")?.key).toBe("gnome-des-lacs");
    expect(findSubrace("Gnome des lacs")?.race).toBe("gnome");
    // une sous-race n'appartient pas à une autre race
    expect(findSubrace("Gnome des lacs", "elfe")).toBeNull();
    expect(findSubrace("", "gnome")).toBeNull();
  });

  it("ne confond jamais le nom d'une race avec une sous-race", () => {
    // régression : le préfixe inversé faisait retomber « Halfelin » sur
    // « Halfelin pied-léger » (et « Elfe » sur « Elfe d'aether »).
    expect(findSubrace("Halfelin", "halfelin")).toBeNull();
    expect(findSubrace("Elfe", "elfe")).toBeNull();
    expect(findSubrace("Gnome", "gnome")).toBeNull();
    expect(findSubrace("Nain", "nain")).toBeNull();
    // en revanche la saisie explicite ou tronquée fonctionne
    expect(findSubrace("Halfelin grand sabot", "halfelin")?.key).toBe("halfelin-grand-sabot");
    expect(findSubrace("nain des pierres", "nain")?.key).toBe("nain-des-pierres");
  });

  it("bonus de sous-race cumulés avec ceux de la race", () => {
    const gnome = findRace("Gnome")!;
    const halfelin = findRace("Halfelin")!;
    expect(racialBonus(gnome)).toEqual({ int: 2 });
    expect(racialBonus(gnome, [], findSubrace("Gnome des lacs"))).toEqual({ int: 2, sag: 1 });
    expect(racialBonus(halfelin, [], findSubrace("Halfelin pied-léger", "halfelin"))).toEqual({
      dex: 2,
      cha: 1,
    });
    // race sans sous-race : rien ne change
    expect(racialBonus(halfelin, [], null)).toEqual({ dex: 2 });
  });
});

describe("emplacements de sorts (tables DRS)", () => {
  it("barde : table d'incantateur complet", () => {
    expect(spellSlotsFor("barde", 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("barde", 5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("barde", 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it("magicien : pas d'emplacements au niveau 2, table complète au niveau 9", () => {
    expect(spellSlotsFor("magicien", 2)).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("magicien", 9)).toEqual([4, 3, 3, 3, 1, 0, 0, 0, 0]);
  });

  it("paladin (½ incantateur) : emplacements tardifs, max niveau 5", () => {
    expect(spellSlotsFor("paladin", 1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("paladin", 2)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("paladin", 5)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("sorcier (pacte) : tous les emplacements au même niveau", () => {
    expect(spellSlotsFor("sorcier", 1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("sorcier", 5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("sorcier", 20)).toEqual([0, 0, 0, 0, 4, 0, 0, 0, 0]);
  });

  it("classe non incantatrice ou niveau hors bornes : zéro", () => {
    expect(spellSlotsFor("barbare", 5)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor("barde", 21)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
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

describe("tours de magie (niveau 0)", () => {
  it("colonne « Tours de magie connus » du DRS", () => {
    expect(cantripsFor("ensorceleur", 1)).toBe(4);
    expect(cantripsFor("magicien", 1)).toBe(3);
    expect(cantripsFor("barde", 1)).toBe(2);
    expect(cantripsFor("druide", 1)).toBe(2);
    expect(cantripsFor("sorcier", 1)).toBe(2);
    expect(cantripsFor("clerc", 1)).toBe(3);
    // paliers du palier 3 (niv 4) et du palier 9 (niv 10)
    expect(cantripsFor("ensorceleur", 3)).toBe(4);
    expect(cantripsFor("ensorceleur", 4)).toBe(5);
    expect(cantripsFor("barde", 9)).toBe(3);
    expect(cantripsFor("barde", 10)).toBe(4);
    expect(cantripsFor("sorcier", 20)).toBe(4);
  });

  it("seules les 6 classes incantatrices en ont", () => {
    for (const key of ["barbare", "guerrier", "moine", "roublard"]) {
      expect(cantripsFor(key, 1)).toBe(0);
    }
    for (const c of CLASSES) {
      const attendu = ["barde", "clerc", "druide", "ensorceleur", "magicien", "sorcier"].includes(
        c.key,
      );
      expect(cantripsFor(c.key, 1) > 0, c.key).toBe(attendu);
    }
  });

  it("bornes : niveau hors table ou classe inconnue -> 0", () => {
    expect(cantripsFor("barde", 0)).toBe(0);
    expect(cantripsFor("barde", 21)).toBe(0);
    expect(cantripsFor("licorne", 1)).toBe(0);
  });

  it("20 niveaux pour chaque classe incantatrice (comme les emplacements)", () => {
    for (const key of ["barde", "clerc", "druide", "ensorceleur", "magicien", "sorcier"]) {
      expect(CLASS_CANTRIPS[key]).toHaveLength(20);
    }
  });
});
