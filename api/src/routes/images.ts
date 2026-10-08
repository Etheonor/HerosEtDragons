// Images d'illustration (fenêtre « Illustration » du MJ) — upload R2 + liste.
// Mêmes règles que les cartes : signature vérifiée (sniff), 8 Mo, png/jpg/webp.
import { Hono } from "hono";
import type { CampaignImageDto } from "@rollwith/shared/dto";
import type { GameTableDO } from "../do/game-table";
import { createDb, schema } from "../db";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  requireAuth,
  requireMemberOf,
  requireMj,
  type AppContext,
  type AuthVariables,
} from "../middleware";
import { sniffImageType } from "./maps";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Résolveur : campagne d'une image adressée par /:imageId. */
async function imageCampaign(c: AppContext): Promise<string | null> {
  const imageId = c.req.param("imageId");
  if (!imageId) return null;
  const db = createDb(c.env.DB);
  const [img] = await db
    .select({ campaignId: schema.campaignImages.campaignId })
    .from(schema.campaignImages)
    .where(eq(schema.campaignImages.id, imageId))
    .limit(1);
  return img?.campaignId ?? null;
}

const memberOfImage = requireMemberOf(imageCampaign);

const uploadForm = zValidator(
  "form",
  z.object({
    name: z.string().trim().min(1).max(80),
    image: z.instanceof(File),
  }),
);

const renameJson = zValidator("json", z.object({ name: z.string().trim().min(1).max(80) }));

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function toDto(r: { id: string; name: string; createdAt: Date }): CampaignImageDto {
  return { id: r.id, name: r.name, createdAt: r.createdAt.getTime() };
}

// ── Lister les images d'une campagne (membres) ─────────────────

app.get(
  "/campaigns/:campaignId/images",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(schema.campaignImages)
      .where(eq(schema.campaignImages.campaignId, campaignId))
      .orderBy(asc(schema.campaignImages.createdAt));
    return c.json<{ images: CampaignImageDto[] }>({ images: rows.map(toDto) });
  },
);

// ── Uploader une image (MJ) ────────────────────────────────────

app.post(
  "/campaigns/:campaignId/images",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  uploadForm,
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const form = c.req.valid("form");
    const file = form.image;

    if (file.size === 0) return c.json({ error: "Fichier vide" }, 400);
    if (file.size > MAX_IMAGE_BYTES) {
      return c.json({ error: "Image trop lourde (max 8 Mo)" }, 400);
    }
    if (!ALLOWED_TYPES[file.type]) {
      return c.json({ error: "Format non supporté (png/jpg/webp uniquement)" }, 400);
    }
    const sniffed = await sniffImageType(file);
    if (!sniffed) {
      return c.json({ error: "Contenu d'image invalide (signature inconnue)" }, 400);
    }

    const id = crypto.randomUUID();
    const r2Key = `images/${campaignId}/${id}`;
    await c.env.MAPS.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    const db = createDb(c.env.DB);
    const now = new Date();
    await db.insert(schema.campaignImages).values({
      id,
      campaignId,
      name: form.name,
      r2Key,
      createdBy: c.get("user").id,
      createdAt: now,
    });

    return c.json<CampaignImageDto>({ id, name: form.name, createdAt: now.getTime() }, 201);
  },
);

// ── Renommer une image (MJ) ────────────────────────────────────

app.patch("/images/:imageId", requireAuth, memberOfImage, requireMj, renameJson, async (c) => {
  const imageId = c.req.param("imageId");
  if (!imageId) return c.json({ error: "Image ID manquant" }, 400);
  const { name } = c.req.valid("json");

  const db = createDb(c.env.DB);
  const [img] = await db
    .select()
    .from(schema.campaignImages)
    .where(eq(schema.campaignImages.id, imageId))
    .limit(1);
  if (!img) return c.json({ error: "Image introuvable" }, 404);

  await db.update(schema.campaignImages).set({ name }).where(eq(schema.campaignImages.id, imageId));
  return c.json<CampaignImageDto>({ id: img.id, name, createdAt: img.createdAt.getTime() });
});

// ── Supprimer une image (MJ) : R2 + D1 + purge de l'affichage ──

app.delete("/images/:imageId", requireAuth, memberOfImage, requireMj, async (c) => {
  const imageId = c.req.param("imageId");
  if (!imageId) return c.json({ error: "Image ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const [img] = await db
    .select()
    .from(schema.campaignImages)
    .where(eq(schema.campaignImages.id, imageId))
    .limit(1);
  if (!img) return c.json({ error: "Image introuvable" }, 404);

  await c.env.MAPS.delete(img.r2Key);
  await db.delete(schema.campaignImages).where(eq(schema.campaignImages.id, imageId));

  // Si c'est l'image affichée, la table revient à « rien » (comme cleanupMap).
  try {
    const ns = c.env.GAME_TABLE as unknown as DurableObjectNamespace<GameTableDO>;
    await ns.get(ns.idFromName(img.campaignId)).cleanupImage(imageId);
  } catch {
    /* table fermée : rien à purger */
  }

  return c.json<{ ok: true }>({ ok: true });
});

// ── Servir le fichier (membres) ────────────────────────────────

app.get("/images/:imageId/file", requireAuth, memberOfImage, async (c) => {
  const imageId = c.req.param("imageId");
  if (!imageId) return c.json({ error: "Image ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const [img] = await db
    .select()
    .from(schema.campaignImages)
    .where(eq(schema.campaignImages.id, imageId))
    .limit(1);
  if (!img) return c.json({ error: "Image introuvable" }, 404);

  const obj = await c.env.MAPS.get(img.r2Key);
  if (!obj) return c.json({ error: "Image introuvable" }, 404);

  // Type posé à l'upload après sniff (jamais celui déclaré par le client) ;
  // le contenu d'une image ne change jamais : cache immuable.
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export default app;
