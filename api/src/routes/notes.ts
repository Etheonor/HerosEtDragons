import { Hono } from "hono";
import { createDb, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireMember, requireMj, type AuthVariables } from "../middleware";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const TARGET_TYPES = ["map", "campaign"] as const;
type TargetType = (typeof TARGET_TYPES)[number];
const MAX_NOTE = 20000;

function isTargetType(v: string | undefined): v is TargetType {
  return !!v && (TARGET_TYPES as readonly string[]).includes(v);
}

// ── Lister les notes MJ d'une campagne ────────────────────────

app.get("/campaigns/:campaignId", requireAuth, requireMember, requireMj, async (c) => {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.notes).where(eq(schema.notes.campaignId, campaignId));

  return c.json({
    notes: rows.map((r) => ({
      targetType: r.targetType,
      targetId: r.targetId,
      content: r.content,
      updatedAt: r.updatedAt,
    })),
  });
});

// ── Créer / mettre à jour une note (upsert par cible) ─────────

app.put(
  "/campaigns/:campaignId/:targetType/:targetId?",
  requireAuth,
  requireMember,
  requireMj,
  async (c) => {
    const campaignId = c.req.param("campaignId");
    const targetType = c.req.param("targetType");
    const targetId = c.req.param("targetId") ?? "";
    if (!campaignId || !isTargetType(targetType)) {
      return c.json({ error: "Paramètres invalides" }, 400);
    }

    const body = await c.req.json<{ content: string }>().catch(() => ({ content: "" }));
    if (typeof body.content !== "string" || body.content.length > MAX_NOTE) {
      return c.json({ error: `Note trop longue (max ${MAX_NOTE})` }, 400);
    }
    const content = body.content;

    const db = createDb(c.env.DB);
    const nowDate = new Date();
    const now = nowDate.getTime();

    const [existing] = await db
      .select({ id: schema.notes.id })
      .from(schema.notes)
      .where(
        and(
          eq(schema.notes.campaignId, campaignId),
          eq(schema.notes.targetType, targetType),
          eq(schema.notes.targetId, targetId),
        ),
      )
      .limit(1);

    if (content === "") {
      // Note vidée = suppression (garde la liste propre).
      if (existing) {
        await db.delete(schema.notes).where(eq(schema.notes.id, existing.id));
      }
      return c.json({ ok: true, removed: !!existing });
    }

    if (existing) {
      await db
        .update(schema.notes)
        .set({ content, updatedAt: nowDate })
        .where(eq(schema.notes.id, existing.id));
      return c.json({ ok: true, id: existing.id, updatedAt: now });
    }

    const id = crypto.randomUUID();
    await db.insert(schema.notes).values({
      id,
      campaignId,
      targetType,
      targetId,
      content,
      updatedAt: nowDate,
    });
    return c.json({ ok: true, id, updatedAt: now }, 201);
  },
);

export default app;
