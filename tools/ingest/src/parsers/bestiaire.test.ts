import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMonsterFile, splitBodySections } from "./bestiaire";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../../test/fixtures/bestiaire");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name, "README.md"), "utf8");
}

describe("parseMonsterFile — aboleth (fiche complète)", () => {
  const entry = parseMonsterFile("aboleth", fixture("aboleth"));

  it("catégorie, slug, visibilité MJ, origine DRS", () => {
    expect(entry.category).toBe("bestiaire");
    expect(entry.slug).toBe("aboleth");
    expect(entry.visibility).toBe("mj");
    expect(entry.origin).toBe("drs");
    expect(entry.title).toBe("Aboleth");
  });

  it("métadonnées typées", () => {
    const m = entry.meta as Record<string, any>;
    expect(m.type).toBe("Aberration");
    expect(m.fp).toBe(10);
    expect(m.caracs.dex).toBe(9);
    expect(m.caracs.int).toBe(18);
    expect(m.hitDiceCount).toBe(18);
    expect(m.ca).toEqual([{ value: 8, armor: "armure naturelle" }]);
    expect(m.savingThrows).toEqual(["con", "int", "sag"]);
    expect(m.movement).toEqual({ walk: 3, swim: 12 });
    expect(m.senses).toEqual({ darkvision: 36 });
    expect(m.telepathy).toBe(36);
    expect(m.languages).toEqual(["profond"]);
    expect(m.environments).toEqual(["Littoral"]);
  });

  it("compétences avec name/isExpert", () => {
    const m = entry.meta as Record<string, any>;
    expect(m.skills).toEqual([
      { name: "histoire", isExpert: true },
      { name: "perception", isExpert: true },
    ]);
  });

  it("corps découpé en sections ##", () => {
    const headings = entry.body.map((s) => s.heading);
    expect(headings).toContain("Capacités");
    expect(headings).toContain("Actions");
    const capacites = entry.body.find((s) => s.heading === "Capacités");
    expect(capacites?.markdown.length).toBeGreaterThan(20);
    expect(capacites?.markdown).not.toContain("## ");
  });

  it("source et page", () => {
    expect(entry.source).toBe("Créatures & Oppositions");
    expect(entry.sourcePage).toBe(21);
  });
});

describe("parseMonsterFile — gobelin (variantes de forme)", () => {
  const entry = parseMonsterFile("gobelin", fixture("gobelin"));
  const m = entry.meta as Record<string, any>;

  it("FP fractionnaire", () => {
    expect(m.fp).toBe(0.25);
  });

  it("ac sans valeur nominale → armure + bouclier conservés", () => {
    expect(m.ca).toEqual([{ armor: "armure de cuir", hasShield: true }]);
  });

  it("sous-type, langues, environnements, donjons", () => {
    expect(m.subtype).toBe("gobelinoïde");
    expect(m.languages).toEqual(["commun", "gobelin"]);
    expect(m.environments).toHaveLength(3);
    expect(m.dungeonTypes).toEqual(["Caverne aménagée"]);
  });

  it("compétence sans accents conservée telle quelle", () => {
    expect(m.skills).toEqual([{ name: "discretion", isExpert: true }]);
  });
});

describe("parseMonsterFile — robustesse", () => {
  it("vol des dragons conservé", () => {
    const entry = parseMonsterFile("dragon-noir-adulte", fixture("dragon-noir-adulte"));
    const m = entry.meta as Record<string, any>;
    expect(m.movement.fly).toBe(24);
  });

  it("fiche sans frontmatter ne casse pas", () => {
    const entry = parseMonsterFile("monstre-bizarre", "# Monstre bizarre\ntexte");
    expect(entry.title).toBe("Monstre bizarre");
    expect(entry.body[0]?.heading).toBeNull();
    expect((entry.meta as Record<string, any>).caracs).toEqual({
      for: 10,
      dex: 10,
      con: 10,
      int: 10,
      sag: 10,
      cha: 10,
    });
  });

  it("hash stable et sensible au contenu", () => {
    const raw = fixture("aboleth");
    expect(parseMonsterFile("aboleth", raw).hash).toBe(parseMonsterFile("aboleth", raw).hash);
    expect(parseMonsterFile("aboleth", raw + "\n").hash).not.toBe(
      parseMonsterFile("aboleth", raw).hash,
    );
  });
});

describe("splitBodySections", () => {
  it("extrait les sections ## dans l'ordre, préambule sans titre en tête", () => {
    const sections = splitBodySections("intro\n## Un\na\n### sous\n## Deux\nb");
    expect(sections.map((s) => s.heading)).toEqual([null, "Un", "Deux"]);
    expect(sections[1]?.markdown).toContain("### sous");
  });
});
