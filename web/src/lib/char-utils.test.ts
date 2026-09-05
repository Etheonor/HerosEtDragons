import { describe, expect, it } from "vitest";
import { effectiveCarac, getMod, getPassivePerception, racialBreakdown } from "./char-utils";
import type { CharacterSheet } from "./api";

function sheet(over: Partial<CharacterSheet>): CharacterSheet {
  return {
    identite: { nom: "T", race: "", classe: "", niveau: 1, historique: "", alignement: "", xp: 0 },
    caracs: { for: 10, dex: 10, con: 10, int: 10, sag: 10, cha: 10 },
    saveProficiencies: { for: false, dex: false, con: false, int: false, sag: false, cha: false },
    skillProficiencies: {},
    ca: 10,
    vitesse: "9 m",
    initiativeBonus: 0,
    pvMax: 1,
    desDeVie: { faces: 8, total: 1, restants: 1 },
    deathSaves: { successes: 0, failures: 0 },
    inspiration: false,
    attaques: [],
    sorts: { caracIncantation: null, connus: [], emplacements: [] },
    capacites: [],
    personnalite: {},
    languesEtMaitrises: "",
    equipement: { bourse: { po: 0, pa: 0, pc: 0 }, objets: [] },
    couleurPion: "#C0392B",
    ...over,
  } as CharacterSheet;
}

describe("bonus racial automatique", () => {
  it("race reconnue ⇒ valeur effective = base + bonus, sans action", () => {
    const s = sheet({
      identite: {
        nom: "x",
        race: "Elfe",
        classe: "Rôdeuse",
        niveau: 1,
        historique: "",
        alignement: "",
        xp: 0,
      },
      caracs: { for: 10, dex: 16, con: 10, int: 10, sag: 10, cha: 10 },
    });
    expect(racialBreakdown(s)).toEqual({ dex: 2 });
    expect(effectiveCarac(s, "dex")).toBe(18);
    expect(getMod(s, "dex")).toBe(4);
  });

  it("humain : +1 partout appliqué au calcul", () => {
    const s = sheet({
      identite: {
        nom: "x",
        race: "Humain",
        classe: "",
        niveau: 1,
        historique: "",
        alignement: "",
        xp: 0,
      },
    });
    expect(effectiveCarac(s, "sag")).toBe(11);
    expect(getPassivePerception(s)).toBe(10);
  });

  it("breakdown sauvé (avec choix libres) prime sur la table", () => {
    const s = sheet({
      identite: {
        nom: "x",
        race: "Demi-elfe",
        classe: "",
        niveau: 1,
        historique: "",
        alignement: "",
        xp: 0,
      },
      racial: { cha: 2, for: 1, con: 1 },
      caracs: { for: 12, dex: 10, con: 12, int: 10, sag: 10, cha: 10 },
    });
    expect(effectiveCarac(s, "for")).toBe(13);
    expect(effectiveCarac(s, "int")).toBe(10);
  });

  it("race inconnue (homebrew) ⇒ aucun bonus inventé", () => {
    const s = sheet({
      identite: {
        nom: "x",
        race: "Half-oni bruni",
        classe: "",
        niveau: 1,
        historique: "",
        alignement: "",
        xp: 0,
      },
    });
    expect(racialBreakdown(s)).toEqual({});
    expect(effectiveCarac(s, "dex")).toBe(10);
  });
});
