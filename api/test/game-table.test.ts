// ═══════════════════════════════════════════════════════════
// Tests d'intégration du GameTableDO (audit F) — tournent dans
// workerd via @cloudflare/vitest-pool-workers : D1 réel (migrations
// appliquées), bindings DO/R2 du wrangler.jsonc, WebSockets réels.
// Chaque test construit son monde (campagne + membres + personnages)
// puis pilote la table en WS comme le ferait un vrai joueur.
// ═══════════════════════════════════════════════════════════

import { env, applyD1Migrations, runInDurableObject } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createDb, schema } from "../src/db";
import { eq } from "drizzle-orm";
import { createSheet } from "@rollwith/shared/sheet";
import type { GameTableDO } from "../src/do/game-table";

const CAMPAIGN = "campaign-test";
const MJ = { userId: "mj-1", name: "Maître", role: "mj" as const };
const PLAYER = { userId: "p1", name: "Kaelith", role: "player" as const };

// NB : createDb doit être créé DANS le test (module scope = mauvais isolate).

/** Stub du DO typé (les RPC comme shareCompendium/notifyCharacterUpdated). */
function tableStub(): DurableObjectStub<GameTableDO> {
  const ns = env.GAME_TABLE as unknown as DurableObjectNamespace<GameTableDO>;
  return ns.get(ns.idFromName(CAMPAIGN));
}

/** Prépare la D1 du test : migrations (comme la prod) puis monde de départ.
 *  NB : les hooks beforeEach du pool 0.12 avalent les erreurs d'applyD1Migrations
 *  (et le storage est isolé par test) → chaque test appelle setupWorld() lui-même. */
let db: ReturnType<typeof createDb> | null = null;

function d(): ReturnType<typeof createDb> {
  if (!db) throw new Error("setupWorld non appelé");
  return db;
}

async function setupWorld() {
  db = createDb(env.DB);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await seedWorld();
}

/** Monde de départ : utilisateurs + campagne + MJ/joueur + PJ + 2 PNJ. */
async function seedWorld() {
  await d()
    .insert(schema.user)
    .values([
      { id: MJ.userId, name: MJ.name, email: "mj@test.local" },
      { id: PLAYER.userId, name: PLAYER.name, email: "p1@test.local" },
    ]);
  await db!.insert(schema.campaigns).values({
    id: CAMPAIGN,
    name: "Campagne de test",
    ownerId: MJ.userId,
  });
  await d()
    .insert(schema.members)
    .values([
      { campaignId: CAMPAIGN, userId: MJ.userId, role: "mj" },
      { campaignId: CAMPAIGN, userId: PLAYER.userId, role: "player" },
    ]);
  await d()
    .insert(schema.characters)
    .values([
      {
        id: "pj-1",
        campaignId: CAMPAIGN,
        ownerId: PLAYER.userId,
        kind: "pj",
        name: "Kaelith",
        color: "#8AB58D",
        active: true,
        sheet: createSheet({ identite: { nom: "Kaelith" }, pvMax: 45, ca: 17 }),
        pv: 45,
        pvMax: 45,
        pvTemp: 0,
        conditions: [],
      },
      {
        id: "pnj-1",
        campaignId: CAMPAIGN,
        ownerId: null,
        kind: "pnj",
        name: "Gobelin",
        color: "#C0392B",
        active: true,
        sheet: createSheet({ identite: { nom: "Gobelin" }, pvMax: 7, ca: 15, initiativeBonus: 2 }),
        pv: 7,
        pvMax: 7,
        pvTemp: 0,
        conditions: [],
      },
      {
        id: "pnj-2",
        campaignId: CAMPAIGN,
        ownerId: null,
        kind: "pnj",
        name: "Loup",
        color: "#7FA3B8",
        active: true,
        sheet: createSheet({ identite: { nom: "Loup" }, pvMax: 11, ca: 13 }),
        pv: 11,
        pvMax: 11,
        pvTemp: 0,
        conditions: [],
      },
    ]);
}

/** Client WS de test : collecte les messages et permet d'attendre un type. */
class TestWs {
  private ws: WebSocket;
  messages: Record<string, unknown>[] = [];
  private waiters: {
    match: (m: Record<string, unknown>) => boolean;
    resolve: (m: Record<string, unknown>) => void;
  }[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data)) as Record<string, unknown>;
      const waiter = this.waiters.find((w) => w.match(m));
      if (waiter) {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        waiter.resolve(m);
      } else {
        this.messages.push(m);
      }
    });
  }

  /** Prochain message de ce type (déjà reçu ou à venir). */
  next(type: string): Promise<Record<string, unknown>> {
    return this.nextWhere((m) => m.type === type);
  }

  /** Prochain message satisfaisant le prédicat (déjà reçu ou à venir). */
  nextWhere(pred: (m: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
    const idx = this.messages.findIndex(pred);
    if (idx >= 0) {
      const [m] = this.messages.splice(idx, 1);
      return Promise.resolve(m!);
    }
    return new Promise((resolve) => this.waiters.push({ match: pred, resolve }));
  }

  /** Attend que le snapshot initial soit arrivé (envoyé après l'upgrade). */
  async ready(): Promise<void> {
    await this.next("snapshot");
  }

  send(msg: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }
}

async function connect(who: {
  userId: string;
  name: string;
  role: "mj" | "player";
  charId?: string;
}): Promise<TestWs> {
  const stub = tableStub();
  const url = new URL("https://internal/ws");
  url.searchParams.set("campaignId", CAMPAIGN);
  url.searchParams.set("userId", who.userId);
  url.searchParams.set("name", who.name);
  url.searchParams.set("role", who.role);
  url.searchParams.set("charId", who.charId ?? "");
  url.searchParams.set("color", "#C0392B");
  const res = await stub.fetch(url.toString(), { headers: { Upgrade: "websocket" } });
  const ws = res.webSocket;
  if (!ws) throw new Error("Connexion WS refusée");
  ws.accept();
  return new TestWs(ws);
}

/** Panne le tableau des cartes du snapshot pour en extraire les PV des PNJ. */
function pnjCards(snapshot: Record<string, unknown>): Record<string, unknown> {
  const chars = (snapshot.characters as { kind: string; id: string; pv: number | null }[]) ?? [];
  const out: Record<string, unknown> = {};
  for (const c of chars) if (c.kind === "pnj") out[c.id] = c;
  return out;
}

describe("GameTableDO — intégration", () => {
  it("snapshot initial : personnages + présence, PV des PNJ masqués au joueur", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    const mjSnap = await mj.next("snapshot");
    const player = await connect(PLAYER);
    const plSnap = await player.next("snapshot");
    await mj.next("presence");

    expect((mjSnap!.characters as unknown[]).length).toBe(3);
    expect((plSnap!.characters as unknown[]).length).toBe(3);
    // pnjPvVisible=false (défaut) : le joueur reçoit pv:null pour les PNJ.
    const pnj = pnjCards(plSnap!);
    expect((pnj["pnj-1"] as { pv: number | null }).pv).toBeNull();
    expect((pnj["pnj-1"] as { pvMax: number | null }).pvMax).toBeNull();
    const mjPnj = pnjCards(mjSnap!);
    expect((mjPnj["pnj-1"] as { pv: number | null }).pv).toBe(7);
  });

  it("chat.say : message journalisé et diffusé à tous", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect(PLAYER);
    await player.ready();

    mj.send({ type: "chat.say", text: "Bonjour la compagnie" });

    const j1 = await mj.next("journal");
    const j2 = await player.next("journal");
    expect((j1.entry as { kind: string; text: string }).text).toBe("Bonjour la compagnie");
    expect(j2.entry).toEqual(j1.entry);
  });

  it("dice.roll : jet diffusé au journal, résultat d'animation réservé au lanceur ; hors bornes rejeté", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect(PLAYER);
    await player.ready();

    mj.send({ type: "dice.roll", sides: 20, n: 1, mod: 3, label: "Test de Force" });

    const journal = await mj.next("journal");
    const anim = await mj.next("dice.result");
    expect((journal.entry as { roll: { total: number; mod: number } }).roll.mod).toBe(3);
    expect((anim.anim as { faces: number[] }).faces.length).toBe(1);
    // L'animation ne part que vers le lanceur.
    await new Promise((r) => setTimeout(r, 50));
    expect(player.messages.some((m) => m.type === "dice.result")).toBe(false);

    // DoS CPU : n = 10 000 refusé par la validation WS.
    mj.send({ type: "dice.roll", sides: 20, n: 10_000 });
    const err = await mj.next("error");
    expect((err as { code: string }).code).toBe("INVALID");
  });

  it("char.hp : le MJ inflige des dégâts (delta diffusé), un joueur ne touche pas aux PV d'autrui, 0 PV → journal", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect({ ...PLAYER, charId: "pj-1" });
    await player.ready();

    // Le joueur tente de modifier les PV du PNJ : refusé (pas son personnage).
    player.send({ type: "char.hp", charId: "pnj-1", delta: -5 });
    await new Promise((r) => setTimeout(r, 50));
    expect(player.messages.some((m) => m.type === "journal")).toBe(false);

    // Le MJ descend le gobelin à 0.
    mj.send({ type: "char.hp", charId: "pnj-1", delta: -7 });
    const delta = await mj.next("delta");
    const patch = delta.patch as { characters: Record<string, { pv: number }> };
    expect(patch.characters["pnj-1"]!.pv).toBe(0);

    const journal = await player.next("journal");
    expect((journal.entry as { text: string }).text).toContain("tombe à 0 PV");
  });

  it("char.condition : le MJ pose et retire un état (delta + journal)", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect(PLAYER);
    await player.ready();

    mj.send({ type: "char.condition", charId: "pnj-1", cond: "Terrorisé", on: true });
    const delta = await player.next("delta");
    const conds = (delta.patch as { characters: Record<string, { conditions: string[] }> })
      .characters["pnj-1"]!.conditions;
    expect(conds).toContain("Terrorisé");
    const journal = await mj.next("journal");
    expect((journal.entry as { text: string }).text).toContain("gagne l'état Terrorisé");
  });

  it("combat : lancement avec initiative PNJ automatique, jet du PJ, tours qui avancent", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect({ ...PLAYER, charId: "pj-1" });
    await player.ready();

    // Carte + pions (le MJ place PJ et PNJ).
    await d().insert(schema.maps).values({ id: "map-1", campaignId: CAMPAIGN, name: "Salle" });
    mj.send({ type: "map.select", mapId: "map-1" });
    await mj.next("delta");
    mj.send({ type: "token.put", charId: "pj-1", x: 50, y: 50 });
    await mj.next("delta");
    mj.send({ type: "token.put", charId: "pnj-1", x: 40, y: 50 });
    await mj.next("delta");
    mj.send({ type: "token.put", charId: "pnj-2", x: 60, y: 50 });
    await mj.next("delta");

    // Lancement du combat : participants = pions avec PV > 0 (3).
    mj.send({ type: "mode.set", mode: "combat" });
    const combatDelta = await mj.nextWhere(
      (m) => (m.patch as { combat?: unknown } | undefined)?.combat !== undefined,
    );
    const combat = (combatDelta.patch as { combat: { phase: string; participants: string[] } })
      .combat;
    expect(combat.phase).toBe("init");
    expect(combat.participants.sort()).toEqual(["pj-1", "pnj-1", "pnj-2"]);

    // Les PNJ ont déjà un score (lancé par le serveur), pas le PJ.
    await player.next("journal"); // « Combat lancé… »
    const initDelta = (
      await player.nextWhere(
        (m) => (m.patch as { combat?: unknown } | undefined)?.combat !== undefined,
      )
    ).patch as { combat: { scores: Record<string, number> } };
    expect(initDelta.combat.scores["pnj-1"]).toBeGreaterThan(0);
    expect(initDelta.combat.scores["pj-1"]).toBeUndefined();

    // Le joueur lance son initiative → combat finalisé.
    player.send({ type: "initiative.roll", charId: "pj-1" });
    const finalDelta = await player.nextWhere(
      (m) => (m.patch as { combat?: { phase: string } } | undefined)?.combat?.phase === "run",
    );
    const finalCombat = (finalDelta.patch as { combat: { phase: string; order: string[] } }).combat;
    expect(finalCombat.phase).toBe("run");
    expect(finalCombat.order).toHaveLength(3);

    // Tour suivant (MJ).
    mj.send({ type: "combat.next" });
    const next = await mj.nextWhere(
      (m) => (m.patch as { combat?: { turn: number } } | undefined)?.combat?.turn === 1,
    );
    expect((next.patch as { combat: { turn: number } }).combat.turn).toBe(1);
  });

  it("brouillard : les pions PNJ non révélés sont filtrés pour les joueurs, visibles pour le MJ", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect(PLAYER);
    await player.ready();

    await d().insert(schema.maps).values({ id: "map-1", campaignId: CAMPAIGN, name: "Salle" });
    mj.send({ type: "map.select", mapId: "map-1" });
    await mj.next("delta");

    mj.send({ type: "fog.enable" });
    await mj.next("delta");

    // Pose d'un PNJ sous brouillard non révélé.
    mj.send({ type: "token.put", charId: "pnj-1", x: 30, y: 30 });
    const mjDelta = await mj.nextWhere(
      (m) =>
        (m.patch as { tokens?: Record<string, unknown> } | undefined)?.tokens?.["pnj-1"] !==
        undefined,
    );
    expect((mjDelta.patch as { tokens: Record<string, unknown> }).tokens["pnj-1"]).toBeDefined();

    // Le joueur ne doit PAS recevoir ce pion.
    await new Promise((r) => setTimeout(r, 100));
    const plDelta = player.messages.filter((m) => m.type === "delta");
    for (const d of plDelta) {
      expect((d.patch as { tokens?: Record<string, unknown> }).tokens?.["pnj-1"]).toBeUndefined();
    }

    // Un PJ posé est visible (pas filtré par le brouillard).
    mj.send({ type: "token.put", charId: "pj-1", x: 50, y: 50 });
    const plDelta2 = await player.nextWhere(
      (m) =>
        (m.patch as { tokens?: Record<string, unknown> } | undefined)?.tokens?.["pj-1"] !==
        undefined,
    );
    expect((plDelta2.patch as { tokens: Record<string, unknown> }).tokens["pj-1"]).toBeDefined();
  });

  it("token.move : le MJ déplace un pion (diffusé) ; un joueur ne bouge que son propre pion", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect({ ...PLAYER, charId: "pj-1" });
    await player.ready();

    await d().insert(schema.maps).values({ id: "map-1", campaignId: CAMPAIGN, name: "Salle" });
    mj.send({ type: "map.select", mapId: "map-1" });
    await mj.nextWhere((m) => (m.patch as { mapId?: unknown } | undefined)?.mapId !== undefined);
    mj.send({ type: "token.put", charId: "pnj-1", x: 40, y: 40 });
    await mj.nextWhere(
      (m) =>
        (m.patch as { tokens?: Record<string, unknown> } | undefined)?.tokens?.["pnj-1"] !==
        undefined,
    );
    mj.send({ type: "token.put", charId: "pj-1", x: 50, y: 50 });
    await mj.nextWhere(
      (m) =>
        (m.patch as { tokens?: Record<string, unknown> } | undefined)?.tokens?.["pj-1"] !==
        undefined,
    );

    // Le joueur déplace SON pion.
    player.send({ type: "token.move", tokenId: "pj-1", x: 55, y: 55 });
    const d1 = await player.nextWhere(
      (m) =>
        (m.patch as { tokens?: Record<string, { x: number }> } | undefined)?.tokens?.["pj-1"]?.x ===
        55,
    );
    expect((d1.patch as { tokens: Record<string, { x: number }> }).tokens["pj-1"]!.x).toBe(55);

    // Le joueur tente de déplacer le PNJ : refusé (pas le sien, pas MJ).
    player.send({ type: "token.move", tokenId: "pnj-1", x: 10, y: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const patches = player.messages.filter((m) => m.type === "delta");
    for (const d of patches) {
      const t = (d.patch as { tokens?: Record<string, { x: number }> }).tokens?.["pnj-1"];
      expect(t?.x).not.toBe(10);
    }
  });

  it("npc.add puis npc.remove : carte diffusée, suppression qui nettoie le pion", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();

    mj.send({ type: "npc.add", name: "Orc", pv: 15, ca: 13, init: 1 });
    const delta = await mj.next("delta");
    const card = Object.values(
      (delta.patch as { characters: Record<string, { name: string }> }).characters,
    )[0];
    expect((card as { name: string }).name).toBe("Orc");

    const id = Object.keys((delta.patch as { characters: Record<string, unknown> }).characters)[0]!;
    mj.send({ type: "npc.remove", charId: id });
    const removeDelta = await mj.next("delta");
    expect(
      (removeDelta.patch as { characters: Record<string, unknown> }).characters[id],
    ).toBeNull();
  });

  it("cleanupMap (RPC) : suppression d'une carte = pions/repères purgés, carte active → aucune carte", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();

    await d().insert(schema.maps).values({ id: "map-1", campaignId: CAMPAIGN, name: "Salle" });
    mj.send({ type: "map.select", mapId: "map-1" });
    await mj.nextWhere((m) => (m.patch as { mapId?: unknown } | undefined)?.mapId !== undefined);
    mj.send({ type: "token.put", charId: "pnj-1", x: 40, y: 40 });
    await mj.nextWhere(
      (m) =>
        (m.patch as { tokens?: Record<string, unknown> } | undefined)?.tokens?.["pnj-1"] !==
        undefined,
    );
    mj.send({ type: "marker.set", x: 10, y: 10, text: "piège" });
    await mj.nextWhere(
      (m) => (m.patch as { markers?: unknown[] } | undefined)?.markers !== undefined,
    );

    // Suppression de la carte ACTIVE : le DO purge et repasse sur aucune carte.
    await tableStub().cleanupMap("map-1");
    const delta = await mj.nextWhere(
      (m) => (m.patch as { mapId?: unknown } | undefined)?.mapId !== undefined,
    );
    const patch = delta.patch as {
      mapId: string | null;
      tokens: Record<string, unknown>;
      markers: unknown[];
    };
    expect(patch.mapId).toBeNull();
    expect(patch.tokens["pnj-1"]).toBeUndefined();
    expect(patch.markers).toEqual([]);

    // L'état interne est purgé (storage du DO).
    await runInDurableObject(tableStub(), async (_instance, state) => {
      const live = await state.storage.get<{
        mapId: string | null;
        tokensByMap: Record<string, unknown>;
      }>("liveState");
      expect(live?.mapId).toBeNull();
      expect(live?.tokensByMap["map-1"]).toBeUndefined();
    });
  });

  it("shareCompendium (RPC) : entrée de journal + ligne compendium_shares, broadcast aux connectés", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect(PLAYER);
    await player.ready();

    const stub = tableStub();
    await stub.shareCompendium({
      category: "bestiaire",
      slug: "gobelin",
      title: "Gobelin",
      sharedBy: "Maître",
    });

    const journal = await player.next("journal");
    const ref = (journal.entry as { ref: { type: string; category: string; slug: string } }).ref;
    expect(ref).toMatchObject({ type: "compendium", category: "bestiaire", slug: "gobelin" });

    const row = await d()
      .select()
      .from(schema.compendiumShares)
      .where(eq(schema.compendiumShares.campaignId, CAMPAIGN))
      .all();
    expect(row.length).toBe(1);
  });

  it("notifyCharacterUpdated (RPC) : le MJ modifie les PV en REST, la table diffuse la carte (PV masqués au joueur)", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect(PLAYER);
    await player.ready();

    // Mutation hors WS (équivalent PUT sheet / PATCH pv REST).
    await d().update(schema.characters).set({ pv: 3 }).where(eq(schema.characters.id, "pnj-1"));

    const stub = tableStub();
    await stub.notifyCharacterUpdated("pnj-1");

    const mjDelta = await mj.next("delta");
    const mjPnj = (mjDelta.patch as { characters: Record<string, { pv: number | null }> })
      .characters["pnj-1"]!;
    expect(mjPnj.pv).toBe(3);

    const plDelta = await player.next("delta");
    const plPnj = (plDelta.patch as { characters: Record<string, { pv: number | null }> })
      .characters["pnj-1"]!;
    expect(plPnj.pv).toBeNull();
  });
});
