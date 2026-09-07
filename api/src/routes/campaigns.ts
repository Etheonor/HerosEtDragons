import { Hono } from "hono";
import type {
  CampaignSummary,
  InvitationResult,
  JoinResult,
  JournalPage,
  TableSettings,
} from "@rollwith/shared/dto";
import { createDb, schema, DEFAULT_SETTINGS, type CampaignSettings } from "../db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireMemberOf, requireMj, type AuthVariables } from "../middleware";
import { consumeInvitation } from "../invitations";
import type { GameTableDO } from "../do/game-table";

/** Stub RPC du DO d'une campagne — le journal (audit P3) et les notifications
 *  de settings (B1) transitent par lui plutôt que par une lecture D1 directe. */
function tableStub(c: AppContextLike, campaignId: string): DurableObjectStub<GameTableDO> {
  const ns = c.env.GAME_TABLE as unknown as DurableObjectNamespace<GameTableDO>;
  return ns.get(ns.idFromName(campaignId));
}

interface AppContextLike {
  env: Env;
}

const settingsPatchSchema = z.object({
  pnjPvVisible: z.boolean().optional(),
  sheetsLocked: z.boolean().optional(),
  diceDuration: z.number().int().min(200).max(10000).optional(),
  tokenSize: z.number().int().min(16).max(96).optional(),
});

const journalQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.coerce.number().int().positive().optional(),
});

function generateId(): string {
  return crypto.randomUUID();
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Lister mes campagnes ──────────────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

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

  return c.json<{ campaigns: CampaignSummary[] }>({
    campaigns: myMemberships.map((m) => ({
      id: m.campaignId,
      name: m.name,
      role: m.role,
      isOwner: m.ownerId === userId,
      settings: m.settings,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// ── Créer une campagne (→ MJ) ─────────────────────────────────

const createCampaignBody = zValidator(
  "json",
  z.object({ name: z.string().trim().min(1).max(100) }),
);

app.post("/", requireAuth, createCampaignBody, async (c) => {
  const body = c.req.valid("json");

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;
  const id = generateId();

  await db.insert(schema.campaigns).values({
    id,
    name: body.name,
    ownerId: userId,
    settings: DEFAULT_SETTINGS,
  });

  await db.insert(schema.members).values({
    campaignId: id,
    userId,
    role: "mj",
  });

  return c.json<{ id: string; name: string; role: "mj" }>({ id, name: body.name, role: "mj" }, 201);
});

// ── Détail d'une campagne ─────────────────────────────────────

app.get(
  "/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
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
      role: c.get("memberRole"),
      isOwner: campaign.ownerId === userId,
      settings: campaign.settings,
      createdAt: campaign.createdAt.toISOString(),
      members: allMembers,
    });
  },
);

// ── Modifier les settings (MJ) ────────────────────────────────

app.patch(
  "/:campaignId/settings",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  zValidator("json", settingsPatchSchema),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const body = c.req.valid("json");
    const db = createDb(c.env.DB);
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

    // Invalide le cache du DO (audit B1) : sans ça, les joueurs déjà connectés
    // gardaient l'ancien réglage jusqu'à reconnexion.
    try {
      await tableStub(c, campaignId).notifySettingsUpdated();
    } catch {
      /* table fermée : le prochain snapshot verra le nouveau réglage */
    }

    return c.json<{ settings: TableSettings }>({ settings: newSettings });
  },
);

// ── Générer une invitation (MJ) ───────────────────────────────

app.post(
  "/:campaignId/invitations",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  zValidator(
    "json",
    z.object({
      usesLeft: z.union([z.literal(-1), z.number().int().min(1).max(100)]).optional(),
      expiresInSeconds: z
        .number()
        .int()
        .min(60)
        .max(366 * 24 * 60 * 60)
        .optional(),
    }),
  ),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const body = c.req.valid("json");
    const db = createDb(c.env.DB);

    // -1 = illimité. Une table privée a besoin d'un lien qui couvre tous les
    // joueurs ; la sécurité vient du secret du token, pas d'un quota.
    const usesLeft = body.usesLeft ?? -1;
    const expiresInSeconds = body.expiresInSeconds ?? 30 * 24 * 60 * 60;
    const token = generateToken();
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    await db.insert(schema.invitations).values({
      token,
      campaignId,
      usesLeft,
      expiresAt,
    });

    return c.json<InvitationResult>({ token, usesLeft, expiresAt: expiresAt.toISOString() }, 201);
  },
);

// ── Journal paginé (R7.3) : avant = id de la plus ancienne entrée vue ──
// Le journal vit dans le SQLite du Durable Object (audit P3) : la route
// devient une RPC au lieu d'une lecture D1 directe (retire aussi les entrées
// visibility:"mj" pour un joueur — B5).

app.get(
  "/:campaignId/journal",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  zValidator("query", journalQuerySchema),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const { limit, before } = c.req.valid("query");
    const role = c.get("memberRole");

    const page = await tableStub(c, campaignId).getJournalPage({ role, limit, before });
    return c.json<JournalPage>(page);
  },
);

// ── Rejoindre via invitation ──────────────────────────────────

app.post("/join/:token", requireAuth, async (c) => {
  const token = c.req.param("token");
  if (!token) return c.json({ error: "Token manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;
  // discordId ne sert qu'ici (audit N2) : plus de SELECT account sur chaque
  // requête authentifiée dans requireAuth, on le charge à la demande.
  const [acct] = await db
    .select({ accountId: schema.account.accountId })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "discord")))
    .limit(1);

  const res = await consumeInvitation(db, token, userId, acct?.accountId ?? null);
  if (!res.ok) {
    return c.json(
      {
        error: res.reason === "exhausted" ? "Invitation épuisée" : "Invitation invalide ou expirée",
      },
      res.reason === "exhausted" ? 409 : 404,
    );
  }

  return c.json<JoinResult>({ campaignId: res.campaignId, role: "player" }, 201);
});

// ── Révoquer une invitation (MJ) — audit S5 ────────────────────

app.delete(
  "/:campaignId/invitations/:token",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const token = c.req.param("token");
    if (!token) return c.json({ error: "Token manquant" }, 400);

    const db = createDb(c.env.DB);
    await db
      .delete(schema.invitations)
      .where(
        and(eq(schema.invitations.token, token), eq(schema.invitations.campaignId, campaignId)),
      );

    return c.json<{ ok: true }>({ ok: true });
  },
);

// ── Supprimer une campagne (MJ) — audit S5 ─────────────────────
// Les ON DELETE CASCADE purgent les lignes D1 (personnages, cartes, membres,
// invitations…) ; il reste à purger les images R2 des cartes (jamais fait
// jusqu'ici) et l'état vivant du Durable Object.

app.delete(
  "/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const db = createDb(c.env.DB);

    const [campaign] = await db
      .select({ ownerId: schema.campaigns.ownerId })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);
    if (!campaign) return c.json({ error: "Campagne introuvable" }, 404);
    if (campaign.ownerId !== c.get("user").id) {
      return c.json({ error: "Seul le propriétaire peut supprimer la campagne" }, 403);
    }

    const maps = await db
      .select({ r2Key: schema.maps.r2Key })
      .from(schema.maps)
      .where(eq(schema.maps.campaignId, campaignId));
    for (const m of maps) {
      if (m.r2Key) await c.env.MAPS.delete(m.r2Key);
    }

    await db.delete(schema.campaigns).where(eq(schema.campaigns.id, campaignId));

    try {
      await tableStub(c, campaignId).purgeAll();
    } catch {
      /* DO absent : rien à purger côté état vivant */
    }

    return c.json<{ ok: true }>({ ok: true });
  },
);

export default app;
