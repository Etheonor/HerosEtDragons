import { Hono } from "hono";
import { createDb, schema, DEFAULT_SETTINGS, type CampaignSettings } from "../db";
import { eq, and, gt, lt, desc } from "drizzle-orm";
import { requireAuth, type AuthVariables } from "../middleware";
import { consumeInvitation } from "../invitations";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function generateId(): string {
  return crypto.randomUUID();
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getCampaignId(c: { req: { param: (k: string) => string | undefined } }): string | null {
  const id = c.req.param("campaignId");
  return id ?? null;
}

// ── Lister mes campagnes ──────────────────────────────────────

app.get("/", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const myMemberships = await db
    .select({
      campaignId: schema.members.campaignId,
      role: schema.members.role,
      name: schema.campaigns.name,
      ownerId: schema.campaigns.ownerId,
      settings: schema.campaigns.settings,
      createdAt: schema.campaigns.createdAt,
    })
    .from(schema.members)
    .innerJoin(schema.campaigns, eq(schema.members.campaignId, schema.campaigns.id))
    .where(eq(schema.members.userId, userId));

  return c.json({
    campaigns: myMemberships.map((m) => ({
      id: m.campaignId,
      name: m.name,
      role: m.role,
      isOwner: m.ownerId === userId,
      settings: m.settings,
      createdAt: m.createdAt,
    })),
  });
});

// ── Créer une campagne (→ MJ) ─────────────────────────────────

app.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ name?: string }>();
  if (!body.name?.trim()) {
    return c.json({ error: "Nom de campagne requis" }, 400);
  }

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;
  const id = generateId();

  await db.insert(schema.campaigns).values({
    id,
    name: body.name.trim(),
    ownerId: userId,
    settings: DEFAULT_SETTINGS,
  });

  await db.insert(schema.members).values({
    campaignId: id,
    userId,
    role: "mj",
  });

  return c.json({ id, name: body.name.trim(), role: "mj" }, 201);
});

// ── Détail d'une campagne ─────────────────────────────────────

app.get("/:campaignId", requireAuth, async (c) => {
  const campaignId = getCampaignId(c);
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return c.json({ error: "Campagne introuvable" }, 404);
  }

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) {
    return c.json({ error: "Vous n'êtes pas membre de cette campagne" }, 403);
  }

  const allMembers = await db
    .select({
      userId: schema.members.userId,
      role: schema.members.role,
      name: schema.user.name,
      image: schema.user.image,
    })
    .from(schema.members)
    .innerJoin(schema.user, eq(schema.members.userId, schema.user.id))
    .where(eq(schema.members.campaignId, campaignId));

  return c.json({
    id: campaign.id,
    name: campaign.name,
    role: membership.role,
    isOwner: campaign.ownerId === userId,
    settings: campaign.settings,
    createdAt: campaign.createdAt,
    members: allMembers,
  });
});

// ── Modifier les settings (MJ) ────────────────────────────────

app.patch("/:campaignId/settings", requireAuth, async (c) => {
  const campaignId = getCampaignId(c);
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) {
    return c.json({ error: "Vous n'êtes pas membre de cette campagne" }, 403);
  }
  if (membership.role !== "mj") {
    return c.json({ error: "Réservé au MJ" }, 403);
  }

  const body = await c.req.json<Partial<CampaignSettings>>();
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return c.json({ error: "Campagne introuvable" }, 404);
  }

  const newSettings: CampaignSettings = {
    pnjPvVisible: body.pnjPvVisible ?? campaign.settings.pnjPvVisible,
    sheetsLocked: body.sheetsLocked ?? campaign.settings.sheetsLocked,
    diceDuration: body.diceDuration ?? campaign.settings.diceDuration,
    tokenSize: body.tokenSize ?? campaign.settings.tokenSize,
  };

  await db
    .update(schema.campaigns)
    .set({ settings: newSettings })
    .where(eq(schema.campaigns.id, campaignId));

  return c.json({ settings: newSettings });
});

// ── Générer une invitation (MJ) ───────────────────────────────

app.post("/:campaignId/invitations", requireAuth, async (c) => {
  const campaignId = getCampaignId(c);
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) {
    return c.json({ error: "Vous n'êtes pas membre de cette campagne" }, 403);
  }
  if (membership.role !== "mj") {
    return c.json({ error: "Réservé au MJ" }, 403);
  }

  const body = await c.req.json<{ usesLeft?: number; expiresInSeconds?: number }>().catch(
    () =>
      ({ usesLeft: 1, expiresInSeconds: 7 * 24 * 60 * 60 }) as {
        usesLeft: number;
        expiresInSeconds: number;
      },
  );
  const usesLeft = body.usesLeft ?? 1;
  const expiresInSeconds = body.expiresInSeconds ?? 7 * 24 * 60 * 60;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await db.insert(schema.invitations).values({
    token,
    campaignId,
    usesLeft,
    expiresAt,
  });

  return c.json({ token, usesLeft, expiresAt }, 201);
});

// ── Journal paginé (R7.3) : avant = id de la plus ancienne entrée vue ──

app.get("/:campaignId/journal", requireAuth, async (c) => {
  const campaignId = getCampaignId(c);
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);
  if (!membership) return c.json({ error: "Accès refusé" }, 403);

  const limitRaw = parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
  const beforeRaw = parseInt(c.req.query("before") ?? "", 10);

  const conds = [eq(schema.journal.campaignId, campaignId)];
  if (Number.isFinite(beforeRaw)) conds.push(lt(schema.journal.id, beforeRaw));

  const rows = await db
    .select()
    .from(schema.journal)
    .where(and(...conds))
    .orderBy(desc(schema.journal.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).reverse();

  return c.json({
    entries: entries.map((r) => ({
      id: r.id,
      ts: r.ts,
      kind: r.kind,
      who: r.who,
      whoColor: r.whoColor,
      text: r.text,
      roll: r.roll,
      ref: r.ref,
    })),
    hasMore,
  });
});

// ── Rejoindre via invitation ──────────────────────────────────

app.post("/join/:token", requireAuth, async (c) => {
  const token = c.req.param("token");
  if (!token) return c.json({ error: "Token manquant" }, 400);

  const db = createDb(c.env.DB);
  const res = await consumeInvitation(db, token, c.get("user").id, c.get("discordId"));
  if (!res.ok) {
    return c.json(
      {
        error: res.reason === "exhausted" ? "Invitation épuisée" : "Invitation invalide ou expirée",
      },
      res.reason === "exhausted" ? 409 : 404,
    );
  }

  return c.json({ campaignId: res.campaignId, role: "player" }, 201);
});

export default app;
