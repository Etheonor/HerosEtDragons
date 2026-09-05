import { describe, expect, it } from "vitest";
import { diceCol, inlineHtml, superHeaders, toBlocks } from "./markdown-lite";

describe("toBlocks", () => {
  it("ignore les conteneurs VuePress §§§", () => {
    const blocks = toBlocks("§§§ .table-container\n|A|B|\n|:-|:-|\n|1|2|\n§§§");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "table", rows: [["1", "2"]] });
  });

  it("headings ### → h4 et coupent les paragraphes", () => {
    const blocks = toBlocks("intro\n### Aptitude : X\ncorps");
    expect(blocks.map((b) => b.type)).toEqual(["para", "heading", "para"]);
  });

  it("lignes de groupe de tableau", () => {
    const blocks = toBlocks("|Nom|Prix|\n|:-|:-|\n|**Courantes**||\n|Épée|10 po|");
    const table = blocks[0] as { rows: string[][] };
    expect(table.rows[0]![0]).toBe("__group__Courantes");
    expect(table.rows[1]).toEqual(["Épée", "10 po"]);
  });

  it("listes et paragraphes", () => {
    const blocks = toBlocks("- un\n- deux\n\ntexte");
    expect(blocks[0]).toMatchObject({ type: "list", items: ["un", "deux"] });
    expect(blocks[1]).toMatchObject({ type: "para", text: "texte" });
  });

  it("en-tête DRS à 2 lignes (« ^^ ») : résolution + headerTop", () => {
    const blocks = toBlocks(
      "|Niveau|Bonus|Aptitudes|Sorts|||\n|^^|^^|^^|1er|2e|3e|\n|:-:|:-:|:-|:-:|:-:|:-:|\n|**1**|+2|X|2|-|-|\n|**2**|+2|Y|2|1|-|",
    );
    const table = blocks[0] as {
      headers: string[];
      headerTop?: string[];
      rows: string[][];
    };
    expect(table.headers).toEqual(["Niveau", "Bonus", "Aptitudes", "1er", "2e", "3e"]);
    expect(table.headerTop).toEqual(["Niveau", "Bonus", "Aptitudes", "Sorts", "", ""]);
    expect(table.rows[0]).toEqual(["**1**", "+2", "X", "2", "-", "-"]);
  });

  it("« ^^ » dans les données : répète la cellule au-dessus", () => {
    const blocks = toBlocks("|A|B|\n|:-|:-|\n|1|2|\n|^^|3|");
    const table = blocks[0] as { rows: string[][] };
    expect(table.rows[1]).toEqual(["1", "3"]);
  });
});

describe("superHeaders", () => {
  it("fusionne parent + sous-colonnes en colspan/rowspan", () => {
    const top = ["Niveau", "Bonus", "Aptitudes", "Sorts", "", ""];
    const bottom = ["Niveau", "Bonus", "Aptitudes", "1er", "2e", "3e"];
    expect(superHeaders(top, bottom)).toEqual([
      { text: "Niveau", span: 1, rowspan: 2 },
      { text: "Bonus", span: 1, rowspan: 2 },
      { text: "Aptitudes", span: 1, rowspan: 2 },
      { text: "Sorts", span: 3, rowspan: 1 },
    ]);
  });

  it("sans doublon parent → une simple rangée", () => {
    expect(superHeaders(["A", "B"], ["1", "2"])).toEqual([
      { text: "A", span: 1, rowspan: 1 },
      { text: "B", span: 1, rowspan: 1 },
    ]);
  });
});

describe("inlineHtml", () => {
  it("échappe le HTML puis autorise sup/sub seulement", () => {
    expect(inlineHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(inlineHtml("niveau 1<sup>e</sup> tour")).toContain("<sup>e</sup>");
  });

  it("gras, italique et liens internes DRS", () => {
    expect(inlineHtml("**Fuite** _agile_")).toBe("<strong>Fuite</strong> <em>agile</em>");
    expect(inlineHtml("[jet de sauvegarde](/utiliser-les-caracteristiques/#jets)")).toContain(
      '<span class="linkish">jet de sauvegarde</span>',
    );
  });
});

describe("diceCol", () => {
  it("D6 / D 10 / **d20** → nombre", () => {
    expect(diceCol("D6")).toBe(6);
    expect(diceCol("d 10")).toBe(10);
    expect(diceCol("**D20**")).toBe(20);
    expect(diceCol("Nom")).toBeNull();
  });
});
