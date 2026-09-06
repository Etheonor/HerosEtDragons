// Compendium (phase 8.3) — lecture seule, filtrée par rôle côté serveur.
// Règle absolue (design §7 / audit) : une fiche `visibility:"mj"` n'est JAMAIS
// retournée à un joueur ; l'UI n'a donc pas à filtrer, l'API ne fuit rien.
import { Hono } from "hono";
import { createDb, schema } from "../db";
import { eq, and, like, or, sql, count } from "drizzle-orm";
import { requireAuth, requireMemberOf, requireMj, type AuthVariables } from "../middleware";
import type { GameTableDO } from "../do/game-table";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const CATEGORIES = [
  "bestiaire",
  "grimoire",
  "races",
  "classes",
  "historiques",
  "dons",
  "equipement",
  "objets-magiques",
  "etats",
  "regles",
] as const;

const memberOfCampaign = requireMemberOf((c) => c.req.query("campaign") ?? null);

function visibilityWhere(isMj: boolean, campaignId: string) {
  // public, ou mj si le demandeur est MJ de cette campagne. Homebrew : restreint
  // à la campagne courante.
  const vis = isMj ? sql`1=1` : sql`${schema.compendiumEntries.visibility} = 'public'`;
  const origin = sql`(origin = 'drs' OR (origin = 'maison' AND campaign_id = ${campaignId}))`;
  return and(vis, origin);
}

// ── Catégories + compteurs visibles ────────────────────────────

app.get("/categories", requireAuth, memberOfCampaign, async (c) => {
  const isMj = c.get("memberRole") === "mj";
  const campaignId = c.get("membership")!.campaignId;
  const db = createDb(c.env.DB);

  const where = visibilityWhere(isMj, campaignId);
  const rows = await db
    .select({ category: schema.compendiumEntries.category, n: count() })
    .from(schema.compendiumEntries)
    .where(where)
    .groupBy(schema.compendiumEntries.category);
  const counts: Record<string, number> = {};
  for (const r of rows) if (r.category) counts[r.category] = r.n;
  const categories = CATEGORIES.filter((cat) => (counts[cat] ?? 0) > 0).map((cat) => ({
    category: cat,
    count: counts[cat] ?? 0,
    locked: !isMj && (cat === "bestiaire" || cat === "objets-magiques"),
  }));
  return c.json({ categories, isMj });
});

// ── Liste paginée + recherche ──────────────────────────────────

app.get("/entries", requireAuth, memberOfCampaign, async (c) => {
  const isMj = c.get("memberRole") === "mj";
  const campaignId = c.get("membership")!.campaignId;
  const category = c.req.query("category");
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 60));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return c.json({ error: "catégorie inconnue" }, 400);
  }

  const db = createDb(c.env.DB);

  const conds = [visibilityWhere(isMj, campaignId)];
  if (category) conds.push(eq(schema.compendiumEntries.category, category));
  if (q) {
    const needle = `%${q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")}%`;
    conds.push(
      or(
        like(schema.compendiumEntries.searchText, needle),
        like(sql`lower(${schema.compendiumEntries.title})`, needle),
      ),
    );
  }
  const where = and(...conds);

  const totalRow = (
    await db.select({ n: count() }).from(schema.compendiumEntries).where(where).get()
  )?.n;
  const rows = await db
    .select({
      category: schema.compendiumEntries.category,
      slug: schema.compendiumEntries.slug,
      title: schema.compendiumEntries.title,
      meta: schema.compendiumEntries.meta,
      origin: schema.compendiumEntries.origin,
    })
    .from(schema.compendiumEntries)
    .where(where)
    .orderBy(schema.compendiumEntries.title)
    .limit(limit)
    .offset(offset);

  return c.json({
    entries: rows.map((r) => ({
      category: r.category,
      slug: r.slug,
      title: r.title,
      origin: r.origin,
      meta: r.meta,
    })),
    total: totalRow ?? 0,
    offset,
    limit,
  });
});

// ── Fiche complète ─────────────────────────────────────────────

app.get("/entry/:category/:slug", requireAuth, memberOfCampaign, async (c) => {
  const isMj = c.get("memberRole") === "mj";
  const campaignId = c.get("membership")!.campaignId;
  const category = c.req.param("category");
  const slug = c.req.param("slug");
  if (!category || !slug) return c.json({ error: "paramètres requis" }, 400);

  const db = createDb(c.env.DB);

  const [row] = await db
    .select()
    .from(schema.compendiumEntries)
    .where(
      and(
        isMj
          ? sql`1=1`
          : sql`(${schema.compendiumEntries.visibility} = 'public'
            OR exists (
              select 1 from compendium_shares
              where compendium_shares.campaign_id = ${campaignId}
                and compendium_shares.category = ${schema.compendiumEntries.category}
                and compendium_shares.slug = ${schema.compendiumEntries.slug}
            ))`,
        eq(schema.compendiumEntries.category, category),
        eq(schema.compendiumEntries.slug, slug),
      ),
    )
    .limit(1);

  // Une fiche `mj` non partagée demandée par un joueur → 404 (existence non confirmée).
  if (!row) return c.json({ error: "Introuvable" }, 404);

  return c.json({
    category: row.category,
    slug: row.slug,
    title: row.title,
    source: row.source,
    sourcePage: row.sourcePage,
    meta: row.meta,
    body: row.body,
    visibility: row.visibility,
    origin: row.origin,
  });
});

// ── Partager une fiche au journal (MJ) ─────────────────────────

app.post(
  "/share",
  requireAuth,
  requireMemberOf(async (c) => {
    const body = await c.req.json<{ campaignId?: string }>().catch(() => null);
    return body?.campaignId ?? null;
  }),
  requireMj,
  async (c) => {
    const body = await c.req
      .json<{ campaignId?: string; category?: string; slug?: string }>()
      .catch(() => null);
    const { category, slug } = body ?? {};
    const campaignId = c.get("membership")!.campaignId;
    if (!category || !slug) return c.json({ error: "paramètres requis" }, 400);

    const db = createDb(c.env.DB);

    const [entry] = await db
      .select({ title: schema.compendiumEntries.title })
      .from(schema.compendiumEntries)
      .where(
        and(
          eq(schema.compendiumEntries.category, category),
          eq(schema.compendiumEntries.slug, slug),
        ),
      )
      .limit(1);
    if (!entry) return c.json({ error: "Fiche introuvable" }, 404);

    const ns = c.env.GAME_TABLE as unknown as DurableObjectNamespace<GameTableDO>;
    const stub = ns.get(ns.idFromName(campaignId));
    await stub.shareCompendium({
      category,
      slug,
      title: entry.title,
      sharedBy: c.get("user").name,
    });
    return c.json({ ok: true });
  },
);

export default app;
