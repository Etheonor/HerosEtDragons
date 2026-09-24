// ═══════════════════════════════════════════════════════════
// Mode dev — accessible UNIQUEMENT en local (voir resolveDevUser).
// Trois verrous : env DEV_AUTH=1 (jamais en prod), hôte local, cookie posé par
// /api/dev/login. Sans le premier, ce routeur renvoie 404 sur TOUT, y compris
// /api/dev/login : un oubli de configuration ne laisse aucune porte ouverte.
// ═══════════════════════════════════════════════════════════

import { Hono } from "hono";
import { createDb, schema } from "../db";
import { and, eq } from "drizzle-orm";
import { createSheet } from "@rollwith/shared/sheet";
import { DEV_COOKIE, isLocalHost } from "../middleware";
import type { GameTableDO } from "../do/game-table";

const app = new Hono<{ Bindings: Env }>();

/** Garde global : sans env DEV_AUTH, aucune route de ce fichier n'existe. */
app.use("*", async (c, next) => {
  if (c.env.DEV_AUTH !== "1" || !isLocalHost(c.req.raw)) {
    return c.json({ error: "Introuvable" }, 404);
  }
  await next();
});

app.post("/login", async (c) => {
  const body = await c.req.json<{ user?: string }>().catch(() => null);
  const id = (body?.user ?? "").trim();
  if (!/^[a-z0-9_-]{1,64}$/i.test(id)) {
    return c.json({ error: "Identifiant invalide (a-z, 0-9, - et _)" }, 400);
  }
  return c.json(
    { ok: true, user: id },
    { headers: { "Set-Cookie": `${DEV_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax` } },
  );
});

app.post("/logout", async (c) => {
  return c.json(
    { ok: true },
    { headers: { "Set-Cookie": `${DEV_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` } },
  );
});

/** Identité courante (utile aux tests pour vérifier quel cookie est actif). */
app.get("/whoami", async (c) => {
  const cookie = c.req.raw.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${DEV_COOKIE}=`));
  const id = cookie?.slice(DEV_COOKIE.length + 1) ?? null;
  return c.json({ user: id });
});

/** Image de carte générée à la volée (fixture e2e déterministe, aucun binaire
 *  dans le dépôt). */
const CARD_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAAAAXNSR0IArs4c6QAAAARnQU1BAACx" +
      "jwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAMBSURBVHhe7dQxAcAwDMCw9O90/aDHdAAAAJ0" +
      "dEVKQVRVbu7Nr63VB3BMTQPYBKo4aL3Jn6WLkzECc5GZzbxIXrPe4p+W5e6TDsrFwz39jaL9HZL" +
      "9j63xMbHMzP//u3BhkYXRmVzhjYmF2c4fXz//59///9jY2Y8/P//59///9jY2Y8Pf///5+/v//Z2b3" +
      "t7O7d7u7e7v//7u7v//f39/f3D////////////////////////////////////////////////////////////////" +
      "//////////////////////////////8J+RvAAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const SEED = {
  campaign: { id: "dev-camp", name: "Campagne de dev" },
  mj: { id: "mj", name: "Maître" },
  players: [
    { id: "kaelith", name: "Kaelith" },
    { id: "ragnar", name: "Ragnar" },
  ],
};

/**
 * Fixture complète et idempotente : mêmes identifiants à chaque appel, donc
 * les tests e2e peuvent la rejouer sans état résiduel.
 *
 * `reset=true` purge EN PLUS le Durable Object de la campagne (journal, carte
 * active, pions) : sans ça, l'état du DO survit d'une exécution à l'autre et
 * les tests deviennent ordonnés-par-hasard.
 */
app.post("/seed", async (c) => {
  const body = await c.req.json<{ reset?: boolean }>().catch(() => null);
  const reset = body?.reset === true;
  const db = createDb(c.env.DB);
  const { campaign, mj, players } = SEED;

  if (reset) {
    const ns = c.env.GAME_TABLE as unknown as DurableObjectNamespace<GameTableDO>;
    await ns.get(ns.idFromName(campaign.id)).purgeAll();
    // Le sac du PJ est réécrit plus bas ; on repart aussi des PV pleins.
    await db
      .update(schema.characters)
      .set({ pv: 45, pvMax: 45, pvTemp: 0, conditions: [] })
      .where(eq(schema.characters.campaignId, campaign.id));
  }

  for (const u of [{ id: mj.id, name: mj.name }, ...players]) {
    await db
      .insert(schema.user)
      .values({ id: u.id, name: u.name, email: `${u.id}@dev.local` })
      .onConflictDoNothing();
    await db
      .insert(schema.allowedUsers)
      .values({ discordId: u.id, note: "dev" })
      .onConflictDoNothing();
  }

  await db
    .insert(schema.campaigns)
    .values({ id: campaign.id, name: campaign.name, ownerId: mj.id })
    .onConflictDoNothing();

  await db
    .insert(schema.members)
    .values([
      { campaignId: campaign.id, userId: mj.id, role: "mj" },
      { campaignId: campaign.id, userId: players[0]!.id, role: "player" },
      { campaignId: campaign.id, userId: players[1]!.id, role: "player" },
    ])
    .onConflictDoNothing();

  const chars = [
    {
      id: "pj-kaelith",
      ownerId: players[0]!.id,
      kind: "pj" as const,
      name: "Kaelith",
      color: "#8AB58D",
      sheet: createSheet({
        identite: { nom: "Kaelith", race: "Elfe", classe: "Rôdeuse", niveau: 5 },
        pvMax: 45,
        ca: 16,
      }),
    },
    {
      id: "pj-ragnar",
      ownerId: players[1]!.id,
      kind: "pj" as const,
      name: "Ragnar",
      color: "#7FA3B8",
      sheet: createSheet({
        identite: { nom: "Ragnar", race: "Nain", classe: "Guerrier", niveau: 3 },
        pvMax: 30,
        ca: 16,
      }),
    },
    {
      id: "pnj-gobelin",
      ownerId: null,
      kind: "pnj" as const,
      name: "Gobelin",
      color: "#C0392B",
      sheet: createSheet({ identite: { nom: "Gobelin" }, pvMax: 7, ca: 15 }),
    },
  ];
  for (const ch of chars) {
    await db
      .insert(schema.characters)
      .values({
        id: ch.id,
        campaignId: campaign.id,
        ownerId: ch.ownerId,
        kind: ch.kind,
        name: ch.name,
        color: ch.color,
        sheet: ch.sheet,
        pv: ch.sheet.pvMax,
        pvMax: ch.sheet.pvMax,
        pvTemp: 0,
        conditions: [],
      })
      .onConflictDoNothing();
  }

  // Deux cartes : une avec image (pour la grille / le zoom), une quadrillée.
  await db
    .insert(schema.maps)
    .values([
      {
        id: "map-image",
        campaignId: campaign.id,
        name: "Carte illustrée",
        r2Key: null,
        gridSize: 32,
      },
      {
        id: "map-grid",
        campaignId: campaign.id,
        name: "Carte quadrillée",
        r2Key: null,
        gridSize: 32,
      },
    ])
    .onConflictDoNothing();
  // Le gridSize est REMIS à 32 à chaque seed : un test qui vient de retirer la
  // grille ne doit pas polluer les suivants (l'upsert ne le ferait pas).
  await db.update(schema.maps).set({ gridSize: 32 }).where(eq(schema.maps.campaignId, campaign.id));

  if (!(await c.env.MAPS.head("dev-camp/map-image.png"))) {
    await c.env.MAPS.put("dev-camp/map-image.png", CARD_PNG, {
      httpMetadata: { contentType: "image/png" },
    });
    await db
      .update(schema.maps)
      .set({ r2Key: "dev-camp/map-image.png" })
      .where(and(eq(schema.maps.id, "map-image"), eq(schema.maps.campaignId, campaign.id)));
  }

  // Un objet et de l'argent dans le sac du premier PJ, pour l'onglet Inventaire.
  await db
    .update(schema.characters)
    .set({
      inventory: { items: [{ name: "Potion de soin", qty: 2 }], money: { po: 12, pa: 3, pc: 0 } },
    })
    .where(eq(schema.characters.id, "pj-kaelith"));

  return c.json({
    ok: true,
    campaign: campaign.id,
    users: [mj.id, ...players.map((p) => p.id)],
    characters: chars.map((c) => c.id),
    maps: ["map-image", "map-grid"],
  });
});

export default app;
