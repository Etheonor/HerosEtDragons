import { Hono } from "hono";
import { createDb, schema } from "../db";
import { eq, count } from "drizzle-orm";
import {
  requireAuth,
  requireMemberOf,
  requireMj,
  type AppContext,
  type AuthVariables,
} from "../middleware";
import { validateNpcTemplate } from "@rollwith/shared/validation";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_TEMPLATES_PER_CAMPAIGN = 200;

interface TemplateBody {
  name?: string;
  ca?: number;
  pvMax?: number;
  initBonus?: number;
  color?: string;
  conditions?: string[];
  notes?: string;
}

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
    updatedAt: t.updatedAt,
  };
}

// ── Liste ──────────────────────────────────────────────────────

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

    return c.json({ templates: rows.map(toDto) });
  },
);

// ── Création ───────────────────────────────────────────────────

app.post(
  "/campaigns/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;

    const db = createDb(c.env.DB);

    const body = await c.req.json<TemplateBody>().catch(() => null);
    if (!body) return c.json({ error: "JSON invalide" }, 400);

    const normalized = {
      name: (body.name ?? "").trim(),
      ca: body.ca ?? 10,
      pvMax: body.pvMax ?? 1,
      initBonus: body.initBonus ?? 0,
      color: body.color ?? "#C0392B",
      conditions: body.conditions ?? [],
      notes: body.notes ?? "",
    };
    const error = validateNpcTemplate(normalized);
    if (error) return c.json({ error }, 400);

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
    return c.json(toDto(row!), 201);
  },
);

// ── Modification ───────────────────────────────────────────────

app.put("/:templateId", requireAuth, memberOfTemplate, requireMj, async (c) => {
  const templateId = c.req.param("templateId");
  if (!templateId) return c.json({ error: "Template ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const [tpl] = await db
    .select()
    .from(schema.npcTemplates)
    .where(eq(schema.npcTemplates.id, templateId))
    .limit(1);
  if (!tpl) return c.json({ error: "Modèle introuvable" }, 404);

  const body = await c.req.json<TemplateBody>().catch(() => null);
  if (!body) return c.json({ error: "JSON invalide" }, 400);

  const normalized = {
    name: (body.name ?? tpl.name).trim(),
    ca: body.ca ?? tpl.ca,
    pvMax: body.pvMax ?? tpl.pvMax,
    initBonus: body.initBonus ?? tpl.initBonus,
    color: body.color ?? tpl.color,
    conditions: body.conditions ?? tpl.conditions,
    notes: body.notes ?? tpl.notes,
  };
  const error = validateNpcTemplate(normalized);
  if (error) return c.json({ error }, 400);

  await db
    .update(schema.npcTemplates)
    .set({ ...normalized, updatedAt: new Date() })
    .where(eq(schema.npcTemplates.id, templateId));

  const [row] = await db
    .select()
    .from(schema.npcTemplates)
    .where(eq(schema.npcTemplates.id, templateId))
    .limit(1);
  return c.json(toDto(row!));
});

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
