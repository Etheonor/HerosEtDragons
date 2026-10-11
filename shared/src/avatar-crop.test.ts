import { describe, expect, it } from "vitest";
import {
  centeredOffset,
  clampOffset,
  clampZoom,
  coverScale,
  cropRect,
  zoomAt,
} from "./avatar-crop";

describe("coverScale", () => {
  it("couvre un carré : le plus grand des deux rapports", () => {
    // Paysage 400×200 dans un carré 100 : c'est la hauteur qui contraint.
    expect(coverScale(400, 200, 100)).toBeCloseTo(0.5);
    // Portrait 200×400 : c'est la largeur.
    expect(coverScale(200, 400, 100)).toBeCloseTo(0.5);
    // Petit : on agrandit.
    expect(coverScale(50, 50, 100)).toBeCloseTo(2);
  });

  it("valeurs dégénérées : jamais 0 ni NaN", () => {
    expect(coverScale(0, 100, 100)).toBe(1);
    expect(coverScale(100, 0, 100)).toBe(1);
    expect(coverScale(100, 100, 0)).toBe(1);
  });
});

describe("clampZoom", () => {
  it("borne le facteur entre cover (1) et ×4", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(9)).toBe(4);
  });
});

describe("clampOffset", () => {
  it("interdit tout vide : l'image couvre toujours le carré", () => {
    // Image affichée 200×200 dans un carré 100 : ox ∈ [-100, 0].
    expect(clampOffset(50, 50, 200, 200, 100)).toEqual({ ox: 0, oy: 0 });
    expect(clampOffset(-500, -500, 200, 200, 100)).toEqual({ ox: -100, oy: -100 });
    expect(clampOffset(-40, -60, 200, 200, 100)).toEqual({ ox: -40, oy: -60 });
  });

  it("ne laisse pas de vide même sur un axe non couvert (fallback)", () => {
    // Cas impossible avec cover, mais la fonction ne doit pas casser.
    expect(clampOffset(10, 10, 50, 50, 100)).toEqual({ ox: 0, oy: 0 });
  });
});

describe("centeredOffset", () => {
  it("centre l'image dans le carré", () => {
    expect(centeredOffset(200, 400, 100)).toEqual({ ox: -50, oy: -150 });
  });
});

describe("cropRect", () => {
  it("image centrée : le carré source est centré", () => {
    // Image 400×200, cover 0.5 → affichée 200×100, centrée dans 100 :
    // ox = -50, size = 100 / 0.5 = 200.
    const r = cropRect(-50, 0, 0.5, 100);
    expect(r.size).toBeCloseTo(200);
    expect(r.sx).toBeCloseTo(100);
    expect(r.sy).toBeCloseTo(0);
  });

  it("coin haut-gauche : le carré source colle à l'origine", () => {
    const r = cropRect(0, 0, 0.5, 100);
    expect(r.sx).toBeCloseTo(0);
    expect(r.sy).toBeCloseTo(0);
  });

  it("échelle dégénérée : rectangle valide par défaut", () => {
    expect(cropRect(0, 0, 0, 100)).toEqual({ sx: 0, sy: 0, size: 1 });
  });
});

describe("zoomAt", () => {
  it("le point ancré ne bouge pas après zoom", () => {
    // Le pixel (30, 40) du viewport doit rester sous le pointeur.
    const before = { ox: -20, oy: -30 };
    const from = 1;
    const to = 2;
    const after = zoomAt(30, 40, before.ox, before.oy, from, to);
    // Position image du point avant / après : identiques.
    const imgX1 = (30 - before.ox) / from;
    const imgX2 = (30 - after.ox) / to;
    expect(imgX2).toBeCloseTo(imgX1);
    const imgY1 = (40 - before.oy) / from;
    const imgY2 = (40 - after.oy) / to;
    expect(imgY2).toBeCloseTo(imgY1);
  });
});
