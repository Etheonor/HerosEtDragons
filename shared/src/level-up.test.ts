import { describe, expect, it } from "vitest";
import { CLASS_SPELL_SLOTS, CLASSES, spellSlotsFor } from "./hd";
import { applyLevelUp } from "./level-up";
import { createSheet } from "./sheet";

import { DRS_SPELL_SLOTS_REF } from "./level-up.drs-ref";

describe("tables d'emplacements DRS (référence)", () => {
  for (const [classKey, rows] of Object.entries(DRS_SPELL_SLOTS_REF)) {
    it(`${classKey} : les 20 niveaux correspondent à la table officielle DRS`, () => {
      expect(CLASS_SPELL_SLOTS[classKey]).toEqual(rows);
      for (let lvl = 1; lvl <= 20; lvl++) {
        expect(spellSlotsFor(classKey, lvl)).toEqual(rows[lvl - 1]);
      }
    });
  }

  it("les 8 classes incantatrices de la table ont bien une entrée", () => {
    const keys = new Set(Object.keys(CLASS_SPELL_SLOTS));
    for (const c of [
      "barde",
      "clerc",
      "druide",
      "ensorceleur",
      "magicien",
      "paladin",
      "rodeur",
      "sorcier",
    ]) {
      expect(keys.has(c), c).toBe(true);
    }
  });
});

function freshSheet(classe: string) {
  return createSheet({ identite: { nom: "Test", classe } });
}

describe("montée de niveau complète 1 → 20 (toutes les classes)", () => {
  it("incantateurs : à chaque niveau, emplacements = table officielle", () => {
    const casters = [
      "barde",
      "clerc",
      "druide",
      "ensorceleur",
      "magicien",
      "paladin",
      "rodeur",
      "sorcier",
    ];
    for (const key of casters) {
      const info = CLASSES.find((c) => c.key === key)!;
      let sheet = freshSheet(info.label);
      for (let lvl = 1; lvl <= 20; lvl++) {
        sheet = applyLevelUp(sheet, lvl);
        expect(sheet.identite.niveau, `${key} niveau ${lvl}`).toBe(lvl);
        expect(sheet.desDeVie.total, `${key} DV total ${lvl}`).toBe(lvl);
        expect(sheet.desDeVie.restants, `${key} DV restants ${lvl}`).toBe(lvl);
        expect(sheet.sorts.emplacements, `${key} emplacements ${lvl}`).toEqual(
          spellSlotsFor(key, lvl)
            .map((max, i) => ({ level: i + 1, max, used: 0 }))
            .filter((s) => s.max > 0),
        );
      }
    }
  });

  it("classes non incantatrices : aucun palier d'emplacements, DV suivent", () => {
    const martial = ["barbare", "guerrier", "moine", "roublard"];
    for (const key of martial) {
      const info = CLASSES.find((c) => c.key === key)!;
      let sheet = freshSheet(info.label);
      for (let lvl = 1; lvl <= 20; lvl++) {
        sheet = applyLevelUp(sheet, lvl);
        expect(sheet.sorts.emplacements, `${key} niveau ${lvl}`).toEqual([]);
        expect(sheet.desDeVie.total, `${key} ${lvl}`).toBe(lvl);
        expect(sheet.desDeVie.restants, `${key} ${lvl}`).toBe(lvl);
      }
    }
  });

  it("classes reconnues par label : la montée passe par findClass (rôdeuse → rôdeur)", () => {
    let sheet = freshSheet("Rôdeuse");
    sheet = applyLevelUp(sheet, 9);
    expect(sheet.sorts.emplacements).toEqual([
      { level: 1, max: 4, used: 0 },
      { level: 2, max: 3, used: 0 },
      { level: 3, max: 2, used: 0 },
    ]);
  });
});

describe("montée de niveau : cas concrets", () => {
  function sheetWithSlots(
    classe: string,
    emplacements: { level: number; max: number; used: number }[],
  ) {
    return createSheet({
      identite: { nom: "Test", classe },
      sorts: { caracIncantation: "sag", connus: [], emplacements },
    });
  }

  it("barde 1 → 2 : le palier existant garde son used, max mis à jour", () => {
    let sheet = sheetWithSlots("Barde", [{ level: 1, max: 2, used: 1 }]);
    sheet = applyLevelUp(sheet, 2);
    expect(sheet.sorts.emplacements).toEqual([{ level: 1, max: 3, used: 1 }]);
  });

  it("sorcier (pacte) 1 → 5 : le palier de niveau 1 disparaît, le niveau 3 apparaît", () => {
    let sheet = sheetWithSlots("Sorcier", [{ level: 1, max: 1, used: 1 }]);
    sheet = applyLevelUp(sheet, 5);
    expect(sheet.sorts.emplacements).toEqual([{ level: 3, max: 2, used: 0 }]);
  });

  it("paladin 5 → 9 : nouveaux paliers ajoutés, used borné au nouveau max", () => {
    let sheet = sheetWithSlots("Paladin", [
      { level: 1, max: 4, used: 4 },
      { level: 2, max: 2, used: 2 },
    ]);
    sheet = applyLevelUp(sheet, 9);
    expect(sheet.sorts.emplacements).toEqual([
      { level: 1, max: 4, used: 4 },
      { level: 2, max: 3, used: 2 },
      { level: 3, max: 2, used: 0 },
    ]);
  });

  it("montée d'un seul cran depuis n'importe quel niveau", () => {
    let sheet = sheetWithSlots("Clerc", [{ level: 1, max: 2, used: 1 }]);
    sheet = applyLevelUp(sheet, 2);
    expect(sheet.identite.niveau).toBe(2);
    expect(sheet.desDeVie.total).toBe(2);
    expect(sheet.desDeVie.restants).toBe(2);
  });

  it("classe inconnue (homebrew) : le niveau et les DV montent, les paliers sont retirés", () => {
    let sheet = sheetWithSlots("Myrmidon des steppes", [{ level: 1, max: 2, used: 1 }]);
    sheet = applyLevelUp(sheet, 3);
    expect(sheet.identite.niveau).toBe(3);
    expect(sheet.sorts.emplacements).toEqual([]);
  });

  it("bornes : niveau < 1 ou > 20 est clampé", () => {
    let sheet = freshSheet("Guerrier");
    sheet = applyLevelUp(sheet, 99);
    expect(sheet.identite.niveau).toBe(20);
    expect(sheet.desDeVie.total).toBe(20);
  });
});

// EOF level-up.test.ts
