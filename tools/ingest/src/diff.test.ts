import { describe, expect, it } from "vitest";
import { buildUpsertSql, planDiff } from "./diff";
import type { CompendiumEntry } from "@rollwith/shared/compendium";

function entry(slug: string, hash: string, title = slug): CompendiumEntry {
  return {
    slug,
    category: "bestiaire",
    title,
    source: "DRS",
    meta: {},
    body: [],
    visibility: "mj",
    origin: "drs",
    searchText: slug,
    version: 1,
    hash,
  };
}

describe("planDiff", () => {
  it("classe inserts / updates / inchangés", () => {
    const plan = planDiff(
      [entry("a", "h1"), entry("b", "h2"), entry("c", "h3")],
      [
        { category: "bestiaire", slug: "b", hash: "x", version: 3 },
        { category: "bestiaire", slug: "c", hash: "h3", version: 1 },
      ],
    );
    expect(plan.inserts.map((e) => e.slug)).toEqual(["a"]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.entry.slug).toBe("b");
    expect(plan.updates[0]!.version).toBe(4);
    expect(plan.unchanged).toBe(1);
  });

  it("doublon de slug interne : premier gagne", () => {
    const plan = planDiff([entry("dup", "h1", "un"), entry("dup", "h2", "deux")], []);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]!.title).toBe("un");
  });
});

describe("buildUpsertSql", () => {
  const plan = planDiff(
    [entry("gobelin", "h1", "Gobelin d'attaque"), entry("aboleth", "h2")],
    [{ category: "bestiaire", slug: "aboleth", hash: "OLD", version: 2 }],
  );
  const sql = buildUpsertSql(plan, 1700000000000, "deadbeef");

  it("un upsert par changement, échappement des quotes", () => {
    const stmts = sql.split(";").filter((x) => x.trim());
    expect(stmts).toHaveLength(2);
    expect(sql).toContain("'Gobelin d''attaque'");
    expect(sql).toContain("ON CONFLICT(key) DO UPDATE");
    expect(sql).toContain("'deadbeef'");
  });

  it("incrmente la version sur update (3 = 2+1)", () => {
    const upsert = sql.split("\n").join(" ");
    const abolethInsert = upsert.match(/'bestiaire\/aboleth'.*?search_text/s);
    expect(abolethInsert?.[0]).toContain(", 3, 'h2'");
  });
});
