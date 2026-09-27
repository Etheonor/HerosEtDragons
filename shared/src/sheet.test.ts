import { describe, expect, it } from "vitest";
import { characterSheetSchema, createSheet, normalizeSheet } from "./sheet";

describe("createSheet", () => {
  it("défaut d'identite complet (sous-race vide)", () => {
    const s = createSheet();
    expect(s.identite.race).toBe("");
    expect(s.identite.sousRace).toBe("");
    expect(s.racial).toBeNull();
  });

  it("accepte une sous-race en override", () => {
    const s = createSheet({ identite: { race: "Gnome", sousRace: "Gnome des lacs" } });
    expect(s.identite.sousRace).toBe("Gnome des lacs");
  });
});

describe("normalizeSheet", () => {
  it("conserve les drapeaux auto PV/CA à la normalisation", () => {
    const auto = normalizeSheet({ ...createSheet(), pvAuto: true, caAuto: true });
    expect(auto.pvAuto).toBe(true);
    expect(auto.caAuto).toBe(true);
    // forcés à la main : le « false » doit survivre à l'autosave, sinon le
    // calcul auto écrase la valeur choisie par le MJ.
    const pinned = normalizeSheet({ ...createSheet(), pvAuto: false, caAuto: false });
    expect(pinned.pvAuto).toBe(false);
    expect(pinned.caAuto).toBe(false);
  });

  it("borne les champs et normalise la sous-race", () => {
    const n = normalizeSheet({
      ...createSheet(),
      identite: { ...createSheet().identite, niveau: 99, sousRace: "Gnome des lacs" },
      pvMax: 99999,
    });
    expect(n.identite.niveau).toBe(20);
    expect(n.identite.sousRace).toBe("Gnome des lacs");
    expect(n.pvMax).toBeLessThanOrEqual(1000);
  });

  it("tolère une fiche ancienne sans sous-race", () => {
    const legacy = { ...createSheet() } as Record<string, unknown>;
    delete (legacy.identite as Record<string, unknown>).sousRace;
    const n = normalizeSheet(legacy as never);
    expect(n.identite.sousRace).toBe("");
    expect(characterSheetSchema.safeParse(n).success).toBe(true);
  });
});
