import { Hono } from "hono";
import type { CharacterDetail, CharacterSummary } from "@rollwith/shared/dto";
import { createDb, schema, type CharacterSheet } from "../db";
import type { AppContext } from "../middleware";
import type { GameTableDO } from "../do/game-table";
import { applyDamage } from "@rollwith/shared/damage";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireMemberOf, type AuthVariables } from "../middleware";
import { createSheet, characterSheetSchema } from "@rollwith/shared/sheet";
import { sniffImageType } from "./maps";

/** Notifie le DO de la campagne après une mutation REST d'un personnage (§3.4). */
async function notifyTable(c: AppContext, campaignId: string, charId: string): Promise<void> {
  try {
    const ns = c.env.GAME_TABLE as unknown as DurableObjectNamespace<GameTableDO>;
    const stub = ns.get(ns.idFromName(campaignId));
    await stub.notifyCharacterUpdated(charId);
  } catch {
    /* table fermée ou DO absent : rien d'urgent, le prochain snapshot verra jour */
  }
}

/** Résolveur : campagne d'un personnage adressé par /:charId — charge la ligne
 *  complète et la pose en contexte (audit N2) : les handlers qui suivent la
 *  relisent au lieu de refaire le SELECT. */
async function charCampaign(c: AppContext): Promise<string | null> {
  const charId = c.req.param("charId");
  if (!charId) return null;
  const db = createDb(c.env.DB);
  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);
  if (!char) return null;
  c.set("character", char);
  return char.campaignId;
}

const memberOfChar = requireMemberOf(charCampaign);

const createBody = zValidator(
  "json",
  z.object({
    campaignId: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(100),
    sheet: characterSheetSchema.partial().optional(),
  }),
);

const pvPatchBody = zValidator("json", z.object({ delta: z.number().int().min(-100).max(100) }));
const pvTempBody = zValidator("json", z.object({ value: z.number().int().min(0).max(1000) }));
const sheetPutBody = zValidator("json", characterSheetSchema);

// ── Lister les personnages d'une campagne ─────────────────────

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.get(
  "/campaigns/:campaignId",
  requireAuth,
  requireMemberOf((c) => c.req.param("campaignId")),
  async (c) => {
    const campaignId = c.get("membership")!.campaignId;
    const db = createDb(c.env.DB);

    const chars = await db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.campaignId, campaignId));

    return c.json<{ characters: CharacterSummary[] }>({
      characters: chars.map((ch) => ({
        id: ch.id,
        name: ch.name,
        kind: ch.kind,
        ownerId: ch.ownerId,
        color: ch.color,
        active: ch.active,
        ca: ch.sheet.ca,
        sub:
          ch.kind === "pj"
            ? `${ch.sheet.identite.race} ${ch.sheet.identite.classe} niv. ${ch.sheet.identite.niveau}`
            : "",
        initiativeBonus: ch.sheet.initiativeBonus,
        pv: ch.pv,
        pvMax: ch.pvMax,
        pvTemp: ch.pvTemp,
        conditions: ch.conditions,
      })),
    });
  },
);

// ── Détail d'un personnage ────────────────────────────────────

app.get("/:charId", requireAuth, memberOfChar, async (c) => {
  const char = c.get("character")!;
  const userId = c.get("user").id;

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  const canEdit = isOwner || isMj;

  return c.json<CharacterDetail>({
    id: char.id,
    campaignId: char.campaignId,
    ownerId: char.ownerId,
    kind: char.kind,
    name: char.name,
    color: char.color,
    active: char.active,
    sheet: char.sheet,
    pv: char.pv,
    pvMax: char.pvMax,
    pvTemp: char.pvTemp,
    conditions: char.conditions,
    canEdit,
    role: c.get("memberRole"),
    updatedAt: char.updatedAt.toISOString(),
  });
});

// ── Créer un personnage ────────────────────────────────────────

app.post(
  "/",
  requireAuth,
  requireMemberOf(async (c) => {
    const body = await c.req.json<{ campaignId?: string }>().catch(() => null);
    return body?.campaignId ?? null;
  }),
  createBody,
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("user").id;

    const db = createDb(c.env.DB);

    // Règle métier : un seul PJ par joueur dans une campagne (le MJ, lui,
    // peut préparer plusieurs fiches).
    if (c.get("memberRole") !== "mj") {
      const [existing] = await db
        .select({ id: schema.characters.id })
        .from(schema.characters)
        .where(
          and(
            eq(schema.characters.campaignId, body.campaignId),
            eq(schema.characters.ownerId, userId),
            eq(schema.characters.kind, "pj"),
          ),
        )
        .limit(1);
      if (existing) {
        return c.json({ error: "Vous avez déjà un personnage dans cette campagne." }, 409);
      }
    }

    const id = crypto.randomUUID();
    // Builder partagé (shared/sheet) : mêmes defaults que les PNJ du DO. Le seul
    // override nécessaire est identite.nom — createSheet applique déjà tous les
    // defaults et Zod a déjà borné l'entrée (audit B2 : évite d'oublier un champ
    // du mapping, comme pvAuto/caAuto/portrait/inspiration/deathSaves).
    const sheet: CharacterSheet = createSheet({
      ...body.sheet,
      identite: { ...body.sheet?.identite, nom: body.name },
    });

    await db.insert(schema.characters).values({
      id,
      campaignId: body.campaignId,
      ownerId: userId,
      kind: "pj",
      name: body.name,
      color: sheet.couleurPion,
      active: true,
      sheet,
      pv: sheet.pvMax,
      pvMax: sheet.pvMax,
      pvTemp: 0,
      conditions: [],
    });

    return c.json<{ id: string; name: string }>({ id, name: body.name }, 201);
  },
);

// ── Modifier PV (±) ────────────────────────────────────────────

app.patch("/:charId/pv", requireAuth, memberOfChar, pvPatchBody, async (c) => {
  const char = c.get("character")!;
  const body = c.req.valid("json");
  const userId = c.get("user").id;

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) {
    return c.json({ error: "Vous ne pouvez modifier que vos PV" }, 403);
  }

  // Les PV temporaires absorbent les dégâts avant les PV réels (audit B3).
  const { pv: newPv, pvTemp: newPvTemp } = applyDamage(
    char.pv,
    char.pvTemp,
    char.pvMax,
    body.delta,
  );

  const db = createDb(c.env.DB);
  await db
    .update(schema.characters)
    .set({ pv: newPv, pvTemp: newPvTemp, updatedAt: new Date() })
    .where(eq(schema.characters.id, char.id));

  await notifyTable(c, char.campaignId, char.id);
  return c.json<{ pv: number; pvMax: number; pvTemp: number }>({
    pv: newPv,
    pvMax: char.pvMax,
    pvTemp: newPvTemp,
  });
});

// ── Modifier PV temporaires ───────────────────────────────────

app.patch("/:charId/pv-temp", requireAuth, memberOfChar, pvTempBody, async (c) => {
  const char = c.get("character")!;
  const body = c.req.valid("json");
  const userId = c.get("user").id;

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) {
    return c.json({ error: "Accès refusé" }, 403);
  }

  const pvTemp = Math.max(0, body.value);
  const db = createDb(c.env.DB);
  await db
    .update(schema.characters)
    .set({ pvTemp, updatedAt: new Date() })
    .where(eq(schema.characters.id, char.id));

  await notifyTable(c, char.campaignId, char.id);
  return c.json<{ pvTemp: number }>({ pvTemp });
});

// ── Toggle inspiration ─────────────────────────────────────────

app.patch("/:charId/inspiration", requireAuth, memberOfChar, async (c) => {
  const char = c.get("character")!;
  const userId = c.get("user").id;

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) return c.json({ error: "Accès refusé" }, 403);

  const sheet = char.sheet;
  sheet.inspiration = !sheet.inspiration;
  const db = createDb(c.env.DB);
  await db
    .update(schema.characters)
    .set({ sheet, updatedAt: new Date() })
    .where(eq(schema.characters.id, char.id));

  await notifyTable(c, char.campaignId, char.id);
  return c.json<{ inspiration: boolean }>({ inspiration: sheet.inspiration });
});

// ── Mettre à jour la feuille (édition) ────────────────────────

app.put("/:charId/sheet", requireAuth, memberOfChar, sheetPutBody, async (c) => {
  const char = c.get("character")!;

  // Corps validé + borné par le schéma canonique (characterSheetSchema) :
  // remplace l'ancien garde-fou 200 ko + validation manuelle.
  const body = c.req.valid("json");
  const userId = c.get("user").id;

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) return c.json({ error: "Accès refusé" }, 403);

  // Concurrence (audit S6) : deux onglets/deux personnes qui éditent la même
  // feuille en même temps s'écrasent silencieusement en dernier-écrivain-gagne.
  // If-Match optionnel (rétro-compatible avec un client qui ne l'envoie pas).
  const ifMatch = c.req.header("If-Match");
  if (ifMatch && ifMatch !== char.updatedAt.toISOString()) {
    return c.json({ error: "Modifié entre-temps ailleurs — rechargez la feuille." }, 409);
  }

  const db = createDb(c.env.DB);

  // Verrou MJ (R10.10) : quand sheetsLocked est actif, seuls les MJ éditent.
  if (!isMj) {
    const [campaign] = await db
      .select({ settings: schema.campaigns.settings })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, char.campaignId))
      .limit(1);
    if (campaign?.settings?.sheetsLocked) {
      return c.json({ error: "Édition verrouillée par le MJ" }, 403);
    }
  }

  const updatedAt = new Date();
  await db
    .update(schema.characters)
    .set({
      sheet: body,
      pvMax: body.pvMax,
      name: body.identite?.nom?.trim() || char.name,
      updatedAt,
    })
    .where(eq(schema.characters.id, char.id));

  await notifyTable(c, char.campaignId, char.id);
  return c.json<{ ok: true; updatedAt: string }>({ ok: true, updatedAt: updatedAt.toISOString() });
});

// ── Avatar d'un personnage (upload sans recadrage) ────────────
// L'image vit dans R2 (clé déterministe sans extension : le type vient des
// métadonnées de l'objet) ; la feuille ne stocke qu'un marqueur versionné
// `custom:<charId>:<version>` que `portraitUrl` sait résoudre (cache-busting).

const MAX_PORTRAIT_BYTES = 4 * 1024 * 1024;

app.put("/:charId/portrait", requireAuth, memberOfChar, async (c) => {
  const char = c.get("character")!;
  const userId = c.get("user").id;
  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) return c.json({ error: "Accès refusé" }, 403);

  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("image");
  if (!entry || typeof entry === "string") {
    return c.json({ error: "Image manquante" }, 400);
  }
  const file = entry as File;
  if (file.size === 0) return c.json({ error: "Image manquante" }, 400);
  if (file.size > MAX_PORTRAIT_BYTES) {
    return c.json({ error: "Image trop lourde (max 4 Mo)" }, 400);
  }
  const sniffed = await sniffImageType(file);
  if (!sniffed) {
    return c.json({ error: "Contenu d'image invalide (signature inconnue)" }, 400);
  }

  const db = createDb(c.env.DB);
  const contentType = sniffed === "jpg" ? "image/jpeg" : `image/${sniffed}`;
  await c.env.MAPS.put(`portraits/${char.campaignId}/${char.id}`, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  const portrait = `custom:${char.id}:${Date.now()}`;
  await db
    .update(schema.characters)
    .set({ sheet: { ...char.sheet, portrait }, updatedAt: new Date() })
    .where(eq(schema.characters.id, char.id));
  await notifyTable(c, char.campaignId, char.id);
  return c.json<{ portrait: string }>({ portrait });
});

app.get("/:charId/portrait", requireAuth, memberOfChar, async (c) => {
  const char = c.get("character")!;
  const key = char.sheet.portrait ?? "";
  if (!key.startsWith("custom:")) return c.json({ error: "Avatar introuvable" }, 404);

  const obj = await c.env.MAPS.get(`portraits/${char.campaignId}/${char.id}`);
  if (!obj) return c.json({ error: "Avatar introuvable" }, 404);

  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      // L'URL porte la version : le même objet peut être écrasé sans douleur.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
});

export default app;
