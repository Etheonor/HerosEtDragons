// Compendium (phase 8.3) — lecture seule, filtrée par rôle côté serveur.
// Règle absolue (design §7 / audit) : une fiche `visibility:"mj"` n'est JAMAIS
// retournée à un joueur ; l'UI n'a donc pas à filtrer, l'API ne fuit rien.
import { Hono } from "hono";
import { createDb, schema } from "../db";
import { eq, and, like, or, sql, count } from "drizzle-orm";
import { requireAuth, type AuthVariables } from "../middleware";

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

/** Accès compendium = être membre de la campagne en contexte. Rôle MJ ⇒ voit `mj`. */
async function resolveAccess(db: ReturnType<typeof createDb>, campaignId: string, userId: string) {
  const [membership] = await db
    .select({ role: schema.members.role })
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);
  if (!membership) return null;
  return { campaignId, isMj: membership.role === "mj" };
}

async function campaignIdFromQuery(c: { req: { query: (k: string) => string | undefined } }) {
  return c.req.query("campaign");
}

function visibilityWhere(access: { isMj: boolean; campaignId: string }) {
  // public, ou mj si le demandeur est MJ de cette campagne. Homebrew : restreint
  // à la campagne courante.
  const vis = access.isMj ? sql`1=1` : sql`${schema.compendiumEntries.visibility} = 'public'`;
  const origin = sql`(origin = 'drs' OR (origin = 'maison' AND campaign_id = ${access.campaignId}))`;
  return and(vis, origin);
}

// ── Catégories + compteurs visibles ────────────────────────────

app.get("/categories", requireAuth, async (c) => {
  const campaignId = await campaignIdFromQuery(c);
  if (!campaignId) return c.json({ error: "campaign requise" }, 400);
  const db = createDb(c.env.DB);
  const access = await resolveAccess(db, campaignId, c.get("user").id);
  if (!access) return c.json({ error: "Accès refusé" }, 403);

  const where = visibilityWhere(access);
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
    locked: !access.isMj && (cat === "bestiaire" || cat === "objets-magiques"),
  }));
  return c.json({ categories, isMj: access.isMj });
});

// ── Liste paginée + recherche ──────────────────────────────────

app.get("/entries", requireAuth, async (c) => {
  const campaignId = await campaignIdFromQuery(c);
  if (!campaignId) return c.json({ error: "campaign requise" }, 400);
  const category = c.req.query("category");
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 60));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return c.json({ error: "catégorie inconnue" }, 400);
  }

  const db = createDb(c.env.DB);
  const access = await resolveAccess(db, campaignId, c.get("user").id);
  if (!access) return c.json({ error: "Accès refusé" }, 403);

  const conds = [visibilityWhere(access)];
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

app.get("/entry/:category/:slug", requireAuth, async (c) => {
  const campaignId = await campaignIdFromQuery(c);
  if (!campaignId) return c.json({ error: "campaign requise" }, 400);
  const category = c.req.param("category");
  const slug = c.req.param("slug");
  if (!category || !slug) return c.json({ error: "paramètres requis" }, 400);

  const db = createDb(c.env.DB);
  const access = await resolveAccess(db, campaignId, c.get("user").id);
  if (!access) return c.json({ error: "Accès refusé" }, 403);

  const [row] = await db
    .select()
    .from(schema.compendiumEntries)
    .where(
      and(
        visibilityWhere(access),
        eq(schema.compendiumEntries.category, category),
        eq(schema.compendiumEntries.slug, slug),
      ),
    )
    .limit(1);

  // Une fiche `mj` demandée par un joueur → 404 (on ne confirme pas son existence).
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

export default app;
