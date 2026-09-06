import { Hono } from "hono";
import type { NpcTemplate } from "@rollwith/shared/dto";
import { createDb, schema } from "../db";
import { eq, count } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import {
  requireAuth,
  requireMemberOf,
  requireMj,
  type AppContext,
  type AuthVariables,
} from "../middleware";
import { npcTemplateSchema } from "@rollwith/shared/sheet";

const MAX_TEMPLATES_PER_CAMPAIGN = 200;

/** Résolveur : campagne d'un modèle adressé par /:templateId. */
async function templateCampaign(c: AppContext): Promise<string | null> {
  const templateId = c.req.param("templateId");
  if (!templateId) return null;
  const db = createDb(c.env.DB);
  const [tpl] = await db
    .select({ campaignId: schema.npcTemplates.campaignId })
    .from(schema.npcTemplates)
    .where(eq(schema.npcTemplates.id, templateId))
    .limit(1);
  return tpl?.campaignId ?? null;
}

const memberOfTemplate = requireMemberOf(templateCampaign);

function toDto(t: typeof schema.npcTemplates.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    ca: t.ca,
    pvMax: t.pvMax,
    initBonus: t.initBonus,
    color: t.color,
    conditions: t.conditions,
    notes: t.notes,
    source: t.source,
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ── Liste ──────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.get(
  "/campaigns/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;

    const db = createDb(c.env.DB);

    const rows = await db
      .select()
      .from(schema.npcTemplates)
      .where(eq(schema.npcTemplates.campaignId, campaignId))
      .orderBy(schema.npcTemplates.name);

    return c.json<{ templates: NpcTemplate[] }>({ templates: rows.map(toDto) });
  },
);

// ── Création ───────────────────────────────────────────────────

app.post(
  "/campaigns/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  zValidator("json", npcTemplateSchema),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;

    const db = createDb(c.env.DB);

    const body = c.req.valid("json");
    const normalized = { ...body, name: body.name.trim() };

    const [existing] = await db
      .select({ n: count() })
      .from(schema.npcTemplates)
      .where(eq(schema.npcTemplates.campaignId, campaignId));
    if ((existing?.n ?? 0) >= MAX_TEMPLATES_PER_CAMPAIGN) {
      return c.json({ error: "Bibliothèque pleine (200 modèles)" }, 409);
    }

    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(schema.npcTemplates).values({
      id,
      campaignId,
      ...normalized,
      source: null,
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(schema.npcTemplates)
      .where(eq(schema.npcTemplates.id, id))
      .limit(1);
    return c.json<NpcTemplate>(toDto(row!), 201);
  },
);

// ── Modification ───────────────────────────────────────────────

app.put(
  "/:templateId",
  requireAuth,
  memberOfTemplate,
  requireMj,
  zValidator("json", npcTemplateSchema),
  async (c) => {
    const templateId = c.req.param("templateId");
    if (!templateId) return c.json({ error: "Template ID manquant" }, 400);

    const db = createDb(c.env.DB);
    const [tpl] = await db
      .select()
      .from(schema.npcTemplates)
      .where(eq(schema.npcTemplates.id, templateId))
      .limit(1);
    if (!tpl) return c.json({ error: "Modèle introuvable" }, 404);

    const body = c.req.valid("json");
    const normalized = { ...body, name: body.name.trim() };

    await db
      .update(schema.npcTemplates)
      .set({ ...normalized, updatedAt: new Date() })
      .where(eq(schema.npcTemplates.id, templateId));

    const [row] = await db
      .select()
      .from(schema.npcTemplates)
      .where(eq(schema.npcTemplates.id, templateId))
      .limit(1);
    return c.json<NpcTemplate>(toDto(row!));
  },
);

// ── Suppression ────────────────────────────────────────────────

app.delete("/:templateId", requireAuth, memberOfTemplate, requireMj, async (c) => {
  const templateId = c.req.param("templateId");
  if (!templateId) return c.json({ error: "Template ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const [tpl] = await db
    .select()
    .from(schema.npcTemplates)
    .where(eq(schema.npcTemplates.id, templateId))
    .limit(1);
  if (!tpl) return c.json({ ok: true });

  await db.delete(schema.npcTemplates).where(eq(schema.npcTemplates.id, templateId));
  return c.json({ ok: true });
});

export default app;
