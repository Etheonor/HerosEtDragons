import { Hono } from "hono";
import type { MapSummary } from "@rollwith/shared/dto";
import type { GameTableDO } from "../do/game-table";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  requireAuth,
  requireMemberOf,
  requireMj,
  type AppContext,
  type AuthVariables,
} from "../middleware";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Résolveur : campagne d'une carte adressée par /:mapId. */
async function mapCampaign(c: AppContext): Promise<string | null> {
  const mapId = c.req.param("mapId");
  if (!mapId) return null;
  const db = createDb(c.env.DB);
  const [map] = await db
    .select({ campaignId: schema.maps.campaignId })
    .from(schema.maps)
    .where(eq(schema.maps.id, mapId))
    .limit(1);
  return map?.campaignId ?? null;
}

const memberOfMap = requireMemberOf(mapCampaign);

const createMapForm = zValidator(
  "form",
  z.object({
    name: z.string().trim().min(1).max(80),
    image: z.instanceof(File).optional(),
  }),
);

const updateMapForm = zValidator(
  "form",
  z.object({
    name: z.string().trim().min(1).max(80).optional(),
    image: z.instanceof(File).optional(),
  }),
);

/** Vérifie la signature réelle du fichier (magic bytes), pas seulement le
 *  Content-Type déclaré par le client (audit §5.6). Retourne l'extension ou null. */
async function sniffImageType(file: File): Promise<"png" | "jpg" | "webp" | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

// ── Lister les cartes d'une campagne ──────────────────────────

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.get(
  "/campaigns/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const db = createDb(c.env.DB);

    const maps = await db.select().from(schema.maps).where(eq(schema.maps.campaignId, campaignId));

    return c.json<{ maps: MapSummary[] }>({
      maps: maps.map((m) => ({ id: m.id, name: m.name, hasImage: !!m.r2Key })),
    });
  },
);

// ── Créer une carte (MJ, image optionnelle → R2) ──────────────

app.post(
  "/campaigns/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  requireMj,
  createMapForm,
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const form = c.req.valid("form");
    const db = createDb(c.env.DB);

    const name = form.name;
    const id = crypto.randomUUID();
    let r2Key: string | null = null;

    const file = form.image;
    if (file && file.size > 0) {
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
      r2Key = `${campaignId}/${id}.${sniffed}`;
      await c.env.MAPS.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
    }

    await db.insert(schema.maps).values({ id, campaignId, name, r2Key });

    return c.json<MapSummary>({ id, name, hasImage: !!r2Key }, 201);
  },
);

// ── Modifier une carte (MJ) : nom et/ou image ─────────────────

app.patch("/:mapId", requireAuth, memberOfMap, requireMj, updateMapForm, async (c) => {
  const mapId = c.req.param("mapId");
  if (!mapId) return c.json({ error: "Map ID manquant" }, 400);

  const form = c.req.valid("form");
  const db = createDb(c.env.DB);

  const [map] = await db.select().from(schema.maps).where(eq(schema.maps.id, mapId)).limit(1);
  if (!map) return c.json({ error: "Carte introuvable" }, 404);

  const patch: { name?: string; r2Key?: string | null } = {};
  if (form.name !== undefined) patch.name = form.name;

  const file = form.image;
  if (file && file.size > 0) {
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
    const newKey = `${map.campaignId}/${mapId}.${sniffed}`;
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

  return c.json<MapSummary>({ id: mapId, name: patch.name ?? map.name, hasImage: !!patch.r2Key });
});

// ── Supprimer une carte (MJ) ───────────────────────────────────

app.delete("/:mapId", requireAuth, memberOfMap, requireMj, async (c) => {
  const mapId = c.req.param("mapId");
  if (!mapId) return c.json({ error: "Map ID manquant" }, 400);

  const db = createDb(c.env.DB);

  const [map] = await db.select().from(schema.maps).where(eq(schema.maps.id, mapId)).limit(1);
  if (!map) return c.json({ error: "Carte introuvable" }, 404);

  if (map.r2Key) await c.env.MAPS.delete(map.r2Key);
  await db.delete(schema.maps).where(eq(schema.maps.id, mapId));

  // Purge des pions/repères/brouillard de cette carte dans le DO (audit B7).
  try {
    const ns = c.env.GAME_TABLE as unknown as DurableObjectNamespace<GameTableDO>;
    const stub = ns.get(ns.idFromName(map.campaignId));
    await stub.cleanupMap(mapId);
  } catch {
    /* table fermée : rien à purger */
  }

  return c.json<{ ok: true }>({ ok: true });
});

// ── Servir l'image d'une carte (authentifié, membre) ──────────

app.get("/:mapId/image", requireAuth, memberOfMap, async (c) => {
  const mapId = c.req.param("mapId");
  if (!mapId) return c.json({ error: "Map ID manquant" }, 400);

  const db = createDb(c.env.DB);

  const [map] = await db.select().from(schema.maps).where(eq(schema.maps.id, mapId)).limit(1);
  if (!map || !map.r2Key) return c.json({ error: "Image introuvable" }, 404);

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
