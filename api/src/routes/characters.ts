import { Hono } from "hono";
import { createDb, schema, type CharacterSheet } from "../db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireMember, requireMj, type AuthVariables } from "../middleware";
import { validateCharacterSheet } from "@rollwith/shared/validation";
import { kaelithSheet } from "../db/seed";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// ── Lister les personnages d'une campagne ─────────────────────

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

  if (!membership) {
    return c.json({ error: "Accès refusé" }, 403);
  }

  const chars = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.campaignId, campaignId));

  return c.json({
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
});

// ── Détail d'un personnage ────────────────────────────────────

app.get("/:charId", requireAuth, async (c) => {
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

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, char.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) {
    return c.json({ error: "Accès refusé" }, 403);
  }

  const isOwner = char.ownerId === userId;
  const isMj = membership.role === "mj";
  const canEdit = isOwner || isMj;

  return c.json({
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
    role: membership.role,
  });
});

// ── Créer un personnage ────────────────────────────────────────

app.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{
    campaignId: string;
    name: string;
    sheet?: Partial<CharacterSheet>;
  }>();

  if (!body.campaignId?.trim() || !body.name?.trim()) {
    return c.json({ error: "campaignId et name requis" }, 400);
  }

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, body.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) {
    return c.json({ error: "Accès refusé" }, 403);
  }

  const id = crypto.randomUUID();
  const sheet: CharacterSheet = {
    identite: {
      nom: body.name,
      race: body.sheet?.identite?.race ?? "",
      classe: body.sheet?.identite?.classe ?? "",
      niveau: body.sheet?.identite?.niveau ?? 1,
      historique: body.sheet?.identite?.historique ?? "",
      alignement: body.sheet?.identite?.alignement ?? "",
      xp: body.sheet?.identite?.xp ?? 0,
      citation: body.sheet?.identite?.citation,
    },
    caracs: body.sheet?.caracs ?? { for: 10, dex: 10, con: 10, int: 10, sag: 10, cha: 10 },
    saveProficiencies: body.sheet?.saveProficiencies ?? {
      for: false,
      dex: false,
      con: false,
      int: false,
      sag: false,
      cha: false,
    },
    skillProficiencies: body.sheet?.skillProficiencies ?? {},
    ca: body.sheet?.ca ?? 10,
    vitesse: body.sheet?.vitesse ?? "9 m",
    initiativeBonus: body.sheet?.initiativeBonus ?? 0,
    pvMax: body.sheet?.pvMax ?? 0,
    desDeVie: body.sheet?.desDeVie ?? { faces: 8, total: 1, restants: 1 },
    deathSaves: { successes: 0, failures: 0 },
    inspiration: false,
    attaques: body.sheet?.attaques ?? [],
    sorts: body.sheet?.sorts ?? { caracIncantation: null, connus: [], emplacements: [] },
    capacites: body.sheet?.capacites ?? [],
    personnalite: body.sheet?.personnalite ?? {},
    languesEtMaitrises: body.sheet?.languesEtMaitrises ?? "",
    equipement: body.sheet?.equipement ?? { bourse: { po: 0, pa: 0, pc: 0 }, objets: [] },
    couleurPion: body.sheet?.couleurPion ?? "#C0392B",
  };

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

  return c.json({ id, name: body.name }, 201);
});

// ── Modifier PV (±) ────────────────────────────────────────────

app.patch("/:charId/pv", requireAuth, async (c) => {
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);

  const body = await c.req.json<{ delta: number }>();
  if (typeof body.delta !== "number") {
    return c.json({ error: "delta requis (number)" }, 400);
  }

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) return c.json({ error: "Personnage introuvable" }, 404);

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, char.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);

  const isOwner = char.ownerId === userId;
  const isMj = membership.role === "mj";
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

  return c.json({ pv: newPv, pvMax: char.pvMax });
});

// ── Modifier PV temporaires ───────────────────────────────────

app.patch("/:charId/pv-temp", requireAuth, async (c) => {
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);

  const body = await c.req.json<{ value: number }>();
  if (typeof body.value !== "number") {
    return c.json({ error: "value requis (number)" }, 400);
  }

  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) return c.json({ error: "Personnage introuvable" }, 404);

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, char.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);

  const isOwner = char.ownerId === userId;
  const isMj = membership.role === "mj";
  if (!isOwner && !isMj) {
    return c.json({ error: "Accès refusé" }, 403);
  }

  const pvTemp = Math.max(0, body.value);
  await db
    .update(schema.characters)
    .set({ pvTemp, updatedAt: new Date() })
    .where(eq(schema.characters.id, charId));

  return c.json({ pvTemp });
});

// ── Toggle inspiration ─────────────────────────────────────────

app.patch("/:charId/inspiration", requireAuth, async (c) => {
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

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, char.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);

  const isOwner = char.ownerId === userId;
  const isMj = membership.role === "mj";
  if (!isOwner && !isMj) return c.json({ error: "Accès refusé" }, 403);

  const sheet = char.sheet;
  sheet.inspiration = !sheet.inspiration;
  await db
    .update(schema.characters)
    .set({ sheet, updatedAt: new Date() })
    .where(eq(schema.characters.id, charId));

  return c.json({ inspiration: sheet.inspiration });
});

// ── Mettre à jour la feuille (édition) ────────────────────────

app.put("/:charId/sheet", requireAuth, async (c) => {
  const charId = c.req.param("charId");
  if (!charId) return c.json({ error: "Char ID manquant" }, 400);

  // Garde-fous taille + parsing (audit §5.2) : pas de JSON arbitraire.
  const raw = await c.req.text();
  if (raw.length > 200_000) {
    return c.json({ error: "Feuille trop volumineuse (max 200 ko)" }, 413);
  }
  let body: CharacterSheet;
  try {
    body = JSON.parse(raw) as CharacterSheet;
  } catch {
    return c.json({ error: "JSON invalide" }, 400);
  }
  const db = createDb(c.env.DB);
  const userId = c.get("user").id;

  const [char] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, charId))
    .limit(1);

  if (!char) return c.json({ error: "Personnage introuvable" }, 404);

  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, char.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Accès refusé" }, 403);

  const isOwner = char.ownerId === userId;
  const isMj = membership.role === "mj";
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

  const sheetError = validateCharacterSheet(body);
  if (sheetError) {
    return c.json({ error: `Feuille invalide : ${sheetError}` }, 400);
  }

  await db
    .update(schema.characters)
    .set({ sheet: body, pvMax: body.pvMax, updatedAt: new Date() })
    .where(eq(schema.characters.id, charId));

  return c.json({ ok: true });
});

// ── Seed Kaelith dans une campagne (dev) ──────────────────────

app.post("/seed/:campaignId", requireAuth, requireMember, requireMj, async (c) => {
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

  const existing = await db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.campaignId, campaignId), eq(schema.characters.name, "Kaelith")))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ id: existing[0]!.id, name: "Kaelith", alreadyExists: true });
  }

  const id = crypto.randomUUID();
  await db.insert(schema.characters).values({
    id,
    campaignId,
    ownerId: userId,
    kind: "pj",
    name: "Kaelith",
    color: kaelithSheet.couleurPion,
    active: true,
    sheet: kaelithSheet,
    pv: kaelithSheet.pvMax,
    pvMax: kaelithSheet.pvMax,
    pvTemp: 0,
    conditions: [],
  });

  return c.json({ id, name: "Kaelith" }, 201);
});

export default app;
