import { Hono } from "hono";
import { createDb, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthVariables } from "../middleware";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// ── Lister les cartes d'une campagne ──────────────────────────

app.get("/campaigns/:campaignId", requireAuth, async (c) => {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);

  const maps = await db.select().from(schema.maps).where(eq(schema.maps.campaignId, campaignId));

  return c.json({
    maps: maps.map((m) => ({ id: m.id, name: m.name, hasImage: !!m.r2Key })),
  });
});

// ── Créer une carte (MJ, image optionnelle → R2) ──────────────

app.post("/campaigns/:campaignId", requireAuth, async (c) => {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);
  if (membership.role !== "mj") return c.json({ error: "Réservé au MJ" }, 403);

  const form = await c.req.formData();
  const name = (form.get("name") as string | null)?.trim();
  if (!name) return c.json({ error: "Nom de carte requis" }, 400);

  const id = crypto.randomUUID();
  let r2Key: string | null = null;

  const fileEntry = form.get("image");
  const isUploadedFile =
    typeof fileEntry === "object" && fileEntry !== null && "arrayBuffer" in fileEntry;
  if (isUploadedFile && (fileEntry as File).size > 0) {
    const file = fileEntry as File;
    if (file.size > MAX_IMAGE_BYTES) {
      return c.json({ error: "Image trop lourde (max 8 Mo)" }, 400);
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return c.json({ error: "Format non supporté (png/jpg/webp uniquement)" }, 400);
    }
    r2Key = `${campaignId}/${id}.${ext}`;
    await c.env.MAPS.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
  }

  await db.insert(schema.maps).values({ id, campaignId, name, r2Key });

  return c.json({ id, name, hasImage: !!r2Key }, 201);
});

// ── Modifier une carte (MJ) : nom et/ou image ─────────────────

app.patch("/:mapId", requireAuth, async (c) => {
  const mapId = c.req.param("mapId");
  if (!mapId) return c.json({ error: "Map ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [map] = await db.select().from(schema.maps).where(eq(schema.maps.id, mapId)).limit(1);
  if (!map) return c.json({ error: "Carte introuvable" }, 404);

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, map.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);
  if (membership.role !== "mj") return c.json({ error: "Réservé au MJ" }, 403);

  const form = await c.req.formData();
  const patch: { name?: string; r2Key?: string | null } = {};

  const rawName = form.get("name");
  if (typeof rawName === "string") {
    const name = rawName.trim();
    if (!name) return c.json({ error: "Nom requis" }, 400);
    patch.name = name;
  }

  const fileEntry = form.get("image");
  const isUploadedFile =
    typeof fileEntry === "object" && fileEntry !== null && "arrayBuffer" in fileEntry;
  if (isUploadedFile && (fileEntry as File).size > 0) {
    const file = fileEntry as File;
    if (file.size > MAX_IMAGE_BYTES) {
      return c.json({ error: "Image trop lourde (max 8 Mo)" }, 400);
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return c.json({ error: "Format non supporté (png/jpg/webp uniquement)" }, 400);
    }
    const newKey = `${map.campaignId}/${mapId}.${ext}`;
    await c.env.MAPS.put(newKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    if (map.r2Key && map.r2Key !== newKey) await c.env.MAPS.delete(map.r2Key);
    patch.r2Key = newKey;
  }

  if (patch.name === undefined && patch.r2Key === undefined) {
    return c.json({ error: "Rien à modifier" }, 400);
  }

  await db.update(schema.maps).set(patch).where(eq(schema.maps.id, mapId));

  return c.json({ id: mapId, name: patch.name ?? map.name, hasImage: !!patch.r2Key });
});

// ── Supprimer une carte (MJ) ───────────────────────────────────

app.delete("/:mapId", requireAuth, async (c) => {
  const mapId = c.req.param("mapId");
  if (!mapId) return c.json({ error: "Map ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [map] = await db.select().from(schema.maps).where(eq(schema.maps.id, mapId)).limit(1);
  if (!map) return c.json({ error: "Carte introuvable" }, 404);

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, map.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);
  if (membership.role !== "mj") return c.json({ error: "Réservé au MJ" }, 403);

  if (map.r2Key) await c.env.MAPS.delete(map.r2Key);
  await db.delete(schema.maps).where(eq(schema.maps.id, mapId));

  return c.json({ ok: true });
});

// ── Servir l'image d'une carte (authentifié, membre) ──────────

app.get("/:mapId/image", requireAuth, async (c) => {
  const mapId = c.req.param("mapId");
  if (!mapId) return c.json({ error: "Map ID manquant" }, 400);

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [map] = await db.select().from(schema.maps).where(eq(schema.maps.id, mapId)).limit(1);
  if (!map || !map.r2Key) return c.json({ error: "Image introuvable" }, 404);

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, map.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);

  const obj = await c.env.MAPS.get(map.r2Key);
  if (!obj) return c.json({ error: "Image introuvable" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

export default app;
