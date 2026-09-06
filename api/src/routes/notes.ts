import { Hono } from "hono";

import { createDb, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireMemberOf, requireMj, type AuthVariables } from "../middleware";

const TARGET_TYPES = ["map", "campaign"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

function isTargetType(v: string | undefined): v is TargetType {
  return !!v && (TARGET_TYPES as readonly string[]).includes(v);
}

// ── Lister les notes MJ d'une campagne ────────────────────────

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.get(
  "/campaigns/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  async (c) => {
    const campaignId = c.req.param("campaignId");
    if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.campaignId, campaignId));

    return c.json({
      notes: rows.map((r) => ({
        targetType: r.targetType,
        targetId: r.targetId,
        content: r.content,
        updatedAt: r.updatedAt,
      })),
    });
  },
);

// ── Créer / mettre à jour une note (upsert par cible) ─────────

app.put(
  "/campaigns/:campaignId/:targetType/:targetId?",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  zValidator("json", z.object({ content: z.string().max(20000) })),
  async (c) => {
    const campaignId = c.req.param("campaignId");
    const targetType = c.req.param("targetType");
    const targetId = c.req.param("targetId") ?? "";
    if (!campaignId || !isTargetType(targetType)) {
      return c.json({ error: "Paramètres invalides" }, 400);
    }

    const content = c.req.valid("json").content;

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
      return c.json<{ ok: true; removed?: boolean }>({ ok: true, removed: !!existing });
    }

    if (existing) {
      await db
        .update(schema.notes)
        .set({ content, updatedAt: nowDate })
        .where(eq(schema.notes.id, existing.id));
      return c.json<{ ok: true; id: string; updatedAt: number }>({
        ok: true,
        id: existing.id,
        updatedAt: now,
      });
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
    return c.json<{ ok: true; id: string; updatedAt: number }>(
      { ok: true, id, updatedAt: now },
      201,
    );
  },
);

export default app;
