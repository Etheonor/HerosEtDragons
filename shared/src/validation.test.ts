import { describe, expect, it } from "vitest";
import { validateCharacterSheet } from "./validation";

function baseSheet(): Record<string, unknown> {
  return {
    identite: {
      nom: "Kaelith",
      race: "Elfe",
      classe: "Rôdeuse",
      niveau: 5,
      historique: "Hors-la-loi",
      alignement: "CB",
      xp: 7340,
    },
    caracs: { for: 12, dex: 17, con: 13, int: 10, sag: 14, cha: 8 },
    saveProficiencies: { for: true, dex: true, con: false, int: false, sag: false, cha: false },
    skillProficiencies: { Discrétion: true },
    ca: 17,
    vitesse: "10,5 m",
    initiativeBonus: 3,
    pvMax: 45,
    pvTemp: 0,
    desDeVie: { faces: 10, total: 5, restants: 4 },
    deathSaves: { successes: 0, failures: 0 },
    inspiration: false,
    attaques: [{ id: "a1", name: "Arc long", bonus: 7, damage: "1d8+3" }],
    sorts: { caracIncantation: "sag", connus: [], emplacements: [] },
    capacites: [{ id: "c1", name: "Archétype", description: "…" }],
    personnalite: { traits: "Je parle peu." },
    languesEtMaitrises: "Commun, elfique",
    equipement: { bourse: { po: 25, pa: 14, pc: 30 }, objets: [{ name: "Corde", qty: 1 }] },
    couleurPion: "#8AB58D",
  };
}

describe("validateCharacterSheet", () => {
  it("accepte une feuille conforme", () => {
    expect(validateCharacterSheet(baseSheet())).toBeNull();
  });

  it("refuse une carac hors bornes", () => {
    const s = baseSheet();
    (s.caracs as Record<string, number>).dex = 999;
    expect(validateCharacterSheet(s)).toMatch(/carac dex/);
  });

  it("refuse un niveau hors bornes", () => {
    const s = baseSheet();
    (s.identite as Record<string, unknown>).niveau = 0;
    expect(validateCharacterSheet(s)).toMatch(/niveau/);
  });

  it("refuse un pvMax déraisonnable", () => {
    const s = baseSheet();
    s.pvMax = 99999;
    expect(validateCharacterSheet(s)).toMatch(/pvMax/);
  });

  it("refuse une chaîne trop longue (payload gonflé)", () => {
    const s = baseSheet();
    (s.equipement as Record<string, unknown>).objets = [{ name: "x".repeat(100_000), qty: 1 }];
    expect(validateCharacterSheet(s)).toMatch(/objet nom/);
  });

  it("refuse un tableau surdimensionné", () => {
    const s = baseSheet();
    s.attaques = Array.from({ length: 500 }, (_, i) => ({
      id: `a${i}`,
      name: "dague",
      bonus: 1,
      damage: "1d4",
    }));
    expect(validateCharacterSheet(s)).toMatch(/attaques/);
  });

  it("refuse un objet non-objet / null", () => {
    expect(validateCharacterSheet(null)).toBe("Feuille invalide");
    expect(validateCharacterSheet("nope")).toBe("Feuille invalide");
  });
});
