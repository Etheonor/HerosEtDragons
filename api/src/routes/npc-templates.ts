import { Hono } from "hono";
import { createDb, schema } from "../db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, type AuthVariables } from "../middleware";
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

async function getMjMembership(
  db: ReturnType<typeof createDb>,
  campaignId: string,
  userId: string,
) {
  const [membership] = await db
    .select({ role: schema.members.role })
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);
  return membership ?? null;
}

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

app.get("/campaigns/:campaignId", requireAuth, async (c) => {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const membership = await getMjMembership(db, campaignId, c.get("user").id);
  if (!membership) return c.json({ error: "Accès refusé" }, 403);
  if (membership.role !== "mj") return c.json({ error: "Réservé au MJ" }, 403);

  const rows = await db
    .select()
    .from(schema.npcTemplates)
    .where(eq(schema.npcTemplates.campaignId, campaignId))
    .orderBy(schema.npcTemplates.name);

  return c.json({ templates: rows.map(toDto) });
});

// ── Création ───────────────────────────────────────────────────

app.post("/campaigns/:campaignId", requireAuth, async (c) => {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const membership = await getMjMembership(db, campaignId, c.get("user").id);
  if (!membership) return c.json({ error: "Accès refusé" }, 403);
  if (membership.role !== "mj") return c.json({ error: "Réservé au MJ" }, 403);

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
});

// ── Modification ───────────────────────────────────────────────

app.put("/:templateId", requireAuth, async (c) => {
  const templateId = c.req.param("templateId");
  if (!templateId) return c.json({ error: "Template ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const [tpl] = await db
    .select()
    .from(schema.npcTemplates)
    .where(eq(schema.npcTemplates.id, templateId))
    .limit(1);
  if (!tpl) return c.json({ error: "Modèle introuvable" }, 404);

  const membership = await getMjMembership(db, tpl.campaignId, c.get("user").id);
  if (!membership) return c.json({ error: "Accès refusé" }, 403);
  if (membership.role !== "mj") return c.json({ error: "Réservé au MJ" }, 403);

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

app.delete("/:templateId", requireAuth, async (c) => {
  const templateId = c.req.param("templateId");
  if (!templateId) return c.json({ error: "Template ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const [tpl] = await db
    .select()
    .from(schema.npcTemplates)
    .where(eq(schema.npcTemplates.id, templateId))
    .limit(1);
  if (!tpl) return c.json({ ok: true });

  const membership = await getMjMembership(db, tpl.campaignId, c.get("user").id);
  if (!membership) return c.json({ error: "Accès refusé" }, 403);
  if (membership.role !== "mj") return c.json({ error: "Réservé au MJ" }, 403);

  await db.delete(schema.npcTemplates).where(eq(schema.npcTemplates.id, templateId));
  return c.json({ ok: true });
});

export default app;
