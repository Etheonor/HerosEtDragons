// Compendium (phase 8.3) — lecture seule, filtrée par rôle côté serveur.
// Règle absolue (design §7 / audit) : une fiche `visibility:"mj"` n'est JAMAIS
// retournée à un joueur ; l'UI n'a donc pas à filtrer, l'API ne fuit rien.
import { Hono } from "hono";
import type { CompendiumEntryDto, CompendiumListPage } from "@rollwith/shared/dto";
import { createDb, schema } from "../db";
import { eq, and, like, or, sql, count } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireMemberOf, requireMj, type AuthVariables } from "../middleware";
import type { GameTableDO } from "../do/game-table";

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

const campaignQuery = zValidator("query", z.object({ campaign: z.string().min(1).max(64) }));

const entriesQuery = zValidator(
  "query",
  z.object({
    campaign: z.string().min(1).max(64),
    category: z.enum(CATEGORIES).optional(),
    q: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).max(100000).optional(),
  }),
);

const shareBody = zValidator(
  "json",
  z.object({
    campaignId: z.string().min(1).max(64),
    category: z.enum(CATEGORIES),
    slug: z.string().min(1).max(200),
  }),
);

function originWhere(campaignId: string) {
  // Homebrew : restreint à la campagne courante ; le DRS reste partagé.
  return sql`(origin = 'drs' OR (origin = 'maison' AND campaign_id = ${campaignId}))`;
}

function visibilityWhere(isMj: boolean, campaignId: string) {
  // public, ou mj si le demandeur est MJ de cette campagne.
  const vis = isMj ? sql`1=1` : sql`${schema.compendiumEntries.visibility} = 'public'`;
  return and(vis, originWhere(campaignId));
}

// ── Catégories + compteurs visibles ────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.get("/categories", requireAuth, memberOfCampaign, campaignQuery, async (c) => {
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
  return c.json<{
    categories: { category: string; count: number; locked: boolean }[];
    isMj: boolean;
  }>({ categories, isMj });
});

// ── Liste paginée + recherche ──────────────────────────────────

app.get("/entries", requireAuth, memberOfCampaign, entriesQuery, async (c) => {
  const isMj = c.get("memberRole") === "mj";
  const campaignId = c.get("membership")!.campaignId;
  const { category, q: qRaw, limit, offset } = c.req.valid("query");
  const q = (qRaw ?? "").trim();
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
    .limit(limit ?? 60)
    .offset(offset ?? 0);

  return c.json<CompendiumListPage>({
    entries: rows.map((r) => ({
      category: r.category,
      slug: r.slug,
      title: r.title,
      origin: r.origin,
      meta: r.meta as Record<string, unknown> | null,
    })),
    total: totalRow ?? 0,
    offset: offset ?? 0,
    limit: limit ?? 60,
  });
});

// ── Fiche complète ─────────────────────────────────────────────

app.get("/entry/:category/:slug", requireAuth, memberOfCampaign, campaignQuery, async (c) => {
  const isMj = c.get("memberRole") === "mj";
  const campaignId = c.get("membership")!.campaignId;
  const category = c.req.param("category");
  const slug = c.req.param("slug");
  if (!category || !slug) return c.json({ error: "paramètres requis" }, 400);

  const db = createDb(c.env.DB);

  // B4 (audit) : composer au lieu de dupliquer — le filtre d'ORIGINE (partagé
  // avec /entries et /categories) est réutilisé ici, pour que la clé globale
  // <category>/<slug> ne permette pas de lire le homebrew d'une AUTRE campagne.
  const publicOrShared = isMj
    ? sql`1=1`
    : sql`(${schema.compendiumEntries.visibility} = 'public'
      OR exists (
        select 1 from compendium_shares
        where compendium_shares.campaign_id = ${campaignId}
          and compendium_shares.category = ${schema.compendiumEntries.category}
          and compendium_shares.slug = ${schema.compendiumEntries.slug}
      ))`;

  const [row] = await db
    .select()
    .from(schema.compendiumEntries)
    .where(
      and(
        originWhere(campaignId),
        publicOrShared,
        eq(schema.compendiumEntries.category, category),
        eq(schema.compendiumEntries.slug, slug),
      ),
    )
    .limit(1);

  // Une fiche `mj` non partagée demandée par un joueur → 404 (existence non confirmée).
  if (!row) return c.json({ error: "Introuvable" }, 404);

  return c.json<CompendiumEntryDto>({
    category: row.category,
    slug: row.slug,
    title: row.title,
    source: row.source,
    sourcePage: row.sourcePage,
    meta: row.meta as CompendiumEntryDto["meta"],
    body: row.body as CompendiumEntryDto["body"],
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
  shareBody,
  async (c) => {
    const { category, slug } = c.req.valid("json");
    const campaignId = c.get("membership")!.campaignId;
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
    return c.json<{ ok: true }>({ ok: true });
  },
);

export default app;
