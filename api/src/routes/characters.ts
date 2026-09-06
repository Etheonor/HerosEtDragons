import { Hono } from "hono";
import type { CharacterDetail, CharacterSummary } from "@rollwith/shared/dto";
import { createDb, schema, type CharacterSheet } from "../db";
import type { AppContext } from "../middleware";
import type { GameTableDO } from "../do/game-table";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireMemberOf, type AuthVariables } from "../middleware";
import { createSheet, characterSheetSchema } from "@rollwith/shared/sheet";

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

/** Résolveur : campagne d'un personnage adressé par /:charId. */
async function charCampaign(c: AppContext): Promise<string | null> {
  const charId = c.req.param("charId");
  if (!charId) return null;
  const db = createDb(c.env.DB);
  const [char] = await db
    .select({ campaignId: schema.characters.campaignId })
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);
  return char?.campaignId ?? null;
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
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);
  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) {
    return c.json({ error: "Personnage introuvable" }, 404);
  }

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
    // Builder partagé (shared/sheet) : mêmes defaults que les PNJ du DO.
    const sheet: CharacterSheet = createSheet({
      identite: { nom: body.name, ...body.sheet?.identite },
      caracs: body.sheet?.caracs,
      saveProficiencies: body.sheet?.saveProficiencies,
      skillProficiencies: body.sheet?.skillProficiencies,
      ca: body.sheet?.ca,
      vitesse: body.sheet?.vitesse,
      initiativeBonus: body.sheet?.initiativeBonus,
      pvMax: body.sheet?.pvMax,
      desDeVie: body.sheet?.desDeVie,
      attaques: body.sheet?.attaques,
      armures: body.sheet?.armures,
      sorts: body.sheet?.sorts,
      capacites: body.sheet?.capacites,
      personnalite: body.sheet?.personnalite,
      languesEtMaitrises: body.sheet?.languesEtMaitrises,
      racial: body.sheet?.racial,
      equipement: body.sheet?.equipement,
      couleurPion: body.sheet?.couleurPion,
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
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);
  const body = c.req.valid("json");

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) return c.json({ error: "Personnage introuvable" }, 404);

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) {
    return c.json({ error: "Vous ne pouvez modifier que vos PV" }, 403);
  }

  let newPv = char.pv + body.delta;
  if (newPv < 0) newPv = 0;
  if (newPv > char.pvMax) newPv = char.pvMax;

  await db
    .update(schema.characters)
    .set({ pv: newPv, updatedAt: new Date() })
    .where(eq(schema.characters.id, charId));

  await notifyTable(c, char.campaignId, charId);
  return c.json<{ pv: number; pvMax: number }>({ pv: newPv, pvMax: char.pvMax });
});

// ── Modifier PV temporaires ───────────────────────────────────

app.patch("/:charId/pv-temp", requireAuth, memberOfChar, pvTempBody, async (c) => {
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);
  const body = c.req.valid("json");

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) return c.json({ error: "Personnage introuvable" }, 404);

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) {
    return c.json({ error: "Accès refusé" }, 403);
  }

  const pvTemp = Math.max(0, body.value);
  await db
    .update(schema.characters)
    .set({ pvTemp, updatedAt: new Date() })
    .where(eq(schema.characters.id, charId));

  await notifyTable(c, char.campaignId, charId);
  return c.json<{ pvTemp: number }>({ pvTemp });
});

// ── Toggle inspiration ─────────────────────────────────────────

app.patch("/:charId/inspiration", requireAuth, memberOfChar, async (c) => {
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);
  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) return c.json({ error: "Personnage introuvable" }, 404);

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) return c.json({ error: "Accès refusé" }, 403);

  const sheet = char.sheet;
  sheet.inspiration = !sheet.inspiration;
  await db
    .update(schema.characters)
    .set({ sheet, updatedAt: new Date() })
    .where(eq(schema.characters.id, charId));

  await notifyTable(c, char.campaignId, charId);
  return c.json<{ inspiration: boolean }>({ inspiration: sheet.inspiration });
});

// ── Mettre à jour la feuille (édition) ────────────────────────

app.put("/:charId/sheet", requireAuth, memberOfChar, sheetPutBody, async (c) => {
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);

  // Corps validé + borné par le schéma canonique (characterSheetSchema) :
  // remplace l'ancien garde-fou 200 ko + validation manuelle.
  const body = c.req.valid("json");
  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) return c.json({ error: "Personnage introuvable" }, 404);

  const isOwner = char.ownerId === userId;
  const isMj = c.get("memberRole") === "mj";
  if (!isOwner && !isMj) return c.json({ error: "Accès refusé" }, 403);

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

  await db
    .update(schema.characters)
    .set({
      sheet: body,
      pvMax: body.pvMax,
      name: body.identite?.nom?.trim() || char.name,
      updatedAt: new Date(),
    })
    .where(eq(schema.characters.id, charId));

  await notifyTable(c, char.campaignId, charId);
  return c.json<{ ok: true }>({ ok: true });
});

export default app;
