import { describe, expect, it } from "vitest";
import { diceCol, inlineHtml, toBlocks } from "./markdown-lite";

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
