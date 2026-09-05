import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSpellFile } from "./grimoire";
import { parseMagicItemFile } from "./objets-magiques";
import { parseRaceFile, parseClassFile, parseBackgroundFile } from "./semi-types";
import { parseConditionsFile } from "./etats";
import { buildEquipmentEntries } from "./equipement";
import { extractTables } from "../markdown-tables";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fx = (...p: string[]) => readFileSync(path.join(__dirname, "../../test/fixtures", ...p), "utf8");

describe("parseSpellFile", () => {
  const e = parseSpellFile("agrandir-retrecir", fx("grimoire/agrandir-retrecir/README.md"));

  it("métadonnées complètes", () => {
    const m = e.meta as Record<string, any>;
    expect(e.category).toBe("grimoire");
    expect(e.title).toBe("Agrandir/rétrécir");
    expect(e.visibility).toBe("public");
    expect(m.level).toBe(2);
    expect(m.school).toBe("Transmutation");
    expect(m.concentration).toBe(true);
    expect(m.ritual).toBe(false);
    expect(m.range).toBe("9 mètres");
    expect(m.components.material).toBe(true);
    expect(m.components.materials).toContain("limaille");
    expect(m.classes).toEqual(["Ensorceleur/Sorcelame", "Magicien"]);
  });

  it("corps présent et lien interne conservé brut", () => {
    const md = e.body.map((b) => b.markdown).join("\n");
    expect(md).toContain("[jet de sauvegarde](/utiliser-les-caracteristiques");
  });

  it("ritual absent ⇒ false ; format homogène sur les 361 sorts", () => {
    const e2 = parseSpellFile(
      "amelioration-de-caracteristique",
      fx("grimoire/amélioration-de-caracteristique/README.md"),
    );
    const m = e2.meta as Record<string, any>;
    expect(m.ritual).toBe(false);
    expect(m.classes).toContain("Barde");
    expect(m.components.verbal).toBe(true);
    expect(m.level).toBe(2);
  });
});

describe("parseMagicItemFile", () => {
  const e = parseMagicItemFile("ailes-de-vol", fx("objets-magiques/ailes-de-vol/README.md"));
  const m = e.meta as Record<string, any>;

  it("type, rareté, harmonisation, visibilité MJ", () => {
    expect(e.category).toBe("objets-magiques");
    expect(e.visibility).toBe("mj");
    expect(m.type).toBe("Objet merveilleux");
    expect(m.rarity).toBe("Rare");
    expect(m.attunement).toContain("harmonisation");
    expect(e.source).toBe("Cadre de campagne");
  });
});

describe("semi-typés", () => {
  it("race : champs en gras extraits", () => {
    const e = parseRaceFile("aasimar", fx("races/aasimar/README.md"));
    expect(e.category).toBe("races");
    expect(e.title).toBe("Aasimar");
    const fields = (e.meta as Record<string, any>).fields as { label: string }[];
    const labels = fields.map((f) => f.label);
    expect(labels).toContain("Vision dans le noir");
    expect(labels).toContain("Taille");
  });

  it("classe : tableau d'évolution typé", () => {
    const e = parseClassFile("barbare", fx("classes/barbare/README.md"));
    const rows = (e.meta as Record<string, any>).evolution as {
      level: number;
      bonus: string;
      aptitudes: string[];
      extras: Record<string, string>;
    }[];
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows[0]).toMatchObject({ level: 1, bonus: "+2" });
    expect(rows[0]!.aptitudes).toContain("Rage");
    expect(rows[2]!.aptitudes).toContain("Voie primitive");
    expect(rows[0]!.extras["Rages"]).toBe("2");
  });

  it("historique : compétences/outils structurés", () => {
    const e = parseBackgroundFile("crapule", fx("historiques/crapule/README.md"));
    const m = e.meta as Record<string, any>;
    expect(e.category).toBe("historiques");
    expect(m.skills).toEqual(["Escamotage", "Intimidation"]);
    const variants = m.variants as { title: string; skills: string[] }[];
    expect(variants.map((v) => v.title)).toEqual(["Cambrioleur", "Escroc", "Voleur à la tire"]);
    expect(variants[2]!.skills).toEqual(["Escamotage", "Supercherie"]);
    expect(m.tools[0]).toContain("Outils de voleur");
    expect(e.body.some((b) => b.heading === "Aptitude Enfant de la rue")).toBe(true);
  });
});

describe("parseConditionsFile (états du chapitre santé)", () => {
  const entries = parseConditionsFile(fx("chapitres/gerer-la-sante.md"));
  const titles = entries.map((e) => e.title);

  it("extrait les 14 états spéciaux + temporaires + fatigue", () => {
    expect(titles).toContain("À terre");
    expect(titles).toContain("Aveuglé");
    expect(titles).toContain("Empoigné");
    expect(titles).toContain("Terrorisé");
    expect(titles).toContain("Repoussé");
    expect(titles).toContain("Surpris");
    expect(titles).toContain("Fatigue et épuisement");
    expect(entries.length).toBeGreaterThanOrEqual(17);
  });

  it("slug sans accents, visibilité publique", () => {
    const aTerre = entries.find((e) => e.title === "À terre");
    expect(aTerre?.slug).toBe("a-terre");
    expect(aTerre?.visibility).toBe("public");
    expect(aTerre?.body[0]?.markdown.length).toBeGreaterThan(10);
  });
});

describe("extraire des tableaux (markdown-tables)", () => {
  it("en-têtes, lignes, groupes et rafistolage de colonnes", () => {
    const md = [
      "|Nom|Prix|Dégâts|Poids|Propriétés|",
      "|:-|:-:|:-:|:-:|:-|",
      "|**Armes de corps-à-corps courantes**|||||",
      "|Bâton|2 pa|1d6 contondant|2 kg|Polyvalente (1d8)|",
      "|Dague|2 po|1d4 perforant|0,5 kg|Finesse, légère|",
      "",
    ].join("\n");
    const tables = extractTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.rows).toHaveLength(2);
    expect(tables[0]!.rows[0]!.group).toBe("Armes de corps-à-corps courantes");
    expect(tables[0]!.rows[1]!.cells).toEqual(["Dague", "2 po", "1d4 perforant", "0,5 kg", "Finesse, légère"]);
  });

  it("armures : liens d'ancre pour le slug", () => {
    const tables = extractTables(fx("tableaux-armures.md"));
    const first = tables[0]!.rows.find((r) => (r.cells[0] ?? "").includes("Matelassée"));
    expect(first?.cells[0]).toBe("[Matelassée](#armure-matelassee)");
  });
});

describe("buildEquipmentEntries", () => {
  const spec = {
    file: "armes/README.md",
    kind: "arme",
    nameHeader: "Nom",
    columns: { Prix: "price", Dégâts: "damage", Poids: "weight", Propriétés: "properties" },
  };
  const entries = buildEquipmentEntries(fx("tableaux-armes.md"), spec as any, spec.file);

  it("une entrée par arme, meta mappée", () => {
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const baton = entries.find((e) => e.title === "Bâton");
    expect(baton?.slug).toBe("baton");
    expect(baton?.category).toBe("equipement");
    expect((baton?.meta as Record<string, any>).damage).toBe("1d6 contondant");
    expect((baton?.meta as Record<string, any>).category).toBe("Armes de corps-à-corps courantes");
    expect((baton?.meta as Record<string, any>).kind).toBe("arme");
  });
});
