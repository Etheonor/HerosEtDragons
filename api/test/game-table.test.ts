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
const PLAYER2 = { userId: "p2", name: "Ragnar", role: "player" as const };

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
      { id: PLAYER2.userId, name: PLAYER2.name, email: "p2@test.local" },
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
      { campaignId: CAMPAIGN, userId: PLAYER2.userId, role: "player" },
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
        id: "pj-2",
        campaignId: CAMPAIGN,
        ownerId: PLAYER2.userId,
        kind: "pj",
        name: "Ragnar",
        color: "#7FA3B8",
        active: true,
        sheet: createSheet({ identite: { nom: "Ragnar" }, pvMax: 30, ca: 14 }),
        pv: 30,
        pvMax: 30,
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
  it("snapshot initial : le MJ voit tous les personnages, un joueur ne reçoit pas les PNJ non révélés (B5)", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    const mjSnap = await mj.next("snapshot");
    const player = await connect(PLAYER);
    const plSnap = await player.next("snapshot");
    await mj.next("presence");

    expect((mjSnap!.characters as unknown[]).length).toBe(4);
    // B5 : sans pion révélé, un joueur ne reçoit pas la carte des PNJ —
    // ni leur nom, ni leurs PV. Un simple rechargement ne rend rien visible.
    const plChars = plSnap!.characters as { id: string; kind: string }[];
    expect(plChars.map((c) => c.id).sort()).toEqual(["pj-1", "pj-2"]);
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

  it("char.hp : le MJ inflige des dégâts (delta diffusé), un joueur ne touche pas aux PV d'autrui, 0 PV → journal réservé au MJ (B5)", async () => {
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

    // Le journal « tombe à 0 PV » part vers le MJ…
    const mjJournal = await mj.next("journal");
    expect((mjJournal.entry as { text: string }).text).toContain("tombe à 0 PV");

    // …mais pas vers le joueur (PNJ non révélé, B5), et le delta du joueur omet la carte.
    await new Promise((r) => setTimeout(r, 50));
    expect(player.messages.some((m) => m.type === "journal")).toBe(false);
    for (const d of player.messages.filter((m) => m.type === "delta")) {
      const chars = (d.patch as { characters?: Record<string, unknown> }).characters ?? {};
      expect(chars["pnj-1"]).toBeNull();
    }
  });

  it("char.condition : le MJ pose un état (delta au MJ), carte et journal réservés au MJ (B5)", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const player = await connect(PLAYER);
    await player.ready();

    mj.send({ type: "char.condition", charId: "pnj-1", cond: "Terrorisé", on: true });
    const mjDelta = await mj.next("delta");
    const mjConds = (mjDelta.patch as { characters: Record<string, { conditions: string[] }> })
      .characters["pnj-1"]!;
    expect(mjConds.conditions).toContain("Terrorisé");

    // Le journal qui nomme le PNJ ne part que vers le MJ…
    const mjJournal = await mj.next("journal");
    expect((mjJournal.entry as { text: string }).text).toContain("gagne l'état Terrorisé");

    // …le joueur ne reçoit ni la carte, ni le journal (B5).
    await new Promise((r) => setTimeout(r, 50));
    expect(player.messages.some((m) => m.type === "journal")).toBe(false);
    for (const d of player.messages.filter((m) => m.type === "delta")) {
      const chars = (d.patch as { characters?: Record<string, unknown> }).characters ?? {};
      expect(chars["pnj-1"]).toBeNull();
    }
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

  it("token.move : un drag soutenu ne déclenche PAS le rate limit (budget déplacement)", async () => {
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

    // Un drag de ~2 s à 60 messages/s : 120 messages. Avant le budget
    // déplacement, le compteur général (60/fenêtre) levait « RATE_LIMITED »
    // dès la première seconde de glissement.
    for (let i = 0; i < 120; i++) {
      mj.send({ type: "token.move", tokenId: "pnj-1", x: 40 + (i % 10) * 0.1, y: 40 });
    }
    // Laisse le DO traiter la rafale.
    await new Promise((r) => setTimeout(r, 300));
    const errors = mj.messages.filter((m) => m.type === "error");
    expect(errors).toEqual([]);
  });

  it("un Abuse de chat reste plafonné (le budget général n'a pas été relâché)", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();

    for (let i = 0; i < 80; i++) {
      mj.send({ type: "chat.say", text: `spam ${i}` });
    }
    await new Promise((r) => setTimeout(r, 300));
    const limited = mj.messages.filter((m) => (m as { code?: string }).code === "RATE_LIMITED");
    expect(limited.length).toBeGreaterThan(0);
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

  it("inventaire (R9) : le MJ ajoute, le joueur donne le sien, le sac reste privé", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const kaelith = await connect({ ...PLAYER, charId: "pj-1" });
    await kaelith.ready();
    const other = await connect({ ...PLAYER2, charId: "pj-2" });
    await other.ready();

    // 1. Le MJ ajoute des objets et de l'argent à Kaelith.
    mj.send({ type: "inv.add", charId: "pj-1", item: "Potion de soin", qty: 2 });
    mj.send({ type: "inv.add", charId: "pj-1", item: "Potion de soin", qty: 1 });
    await mj.nextWhere((m) => m.type === "inv");

    // La fusion par nom est insensible à la casse : 2 + 1 = 3.
    const mjInv = await mj.nextWhere((m) => m.type === "inv");
    const asInv = (m: Record<string, unknown>) =>
      (m.inventories as Record<string, { items: { name: string; qty: number }[] }>)["pj-1"]!;
    expect(asInv(mjInv).items).toEqual([{ name: "Potion de soin", qty: 3 }]);

    // 2. Le joueur ne voit QUE son sac (R9.1) : pas celui de l'autre PJ.
    const plInv = await kaelith.nextWhere((m) => m.type === "inv");
    const plBags = plInv.inventories as Record<string, unknown>;
    expect(Object.keys(plBags)).toEqual(["pj-1"]);

    // 3. Le joueur jette un objet de SON sac, et le mouvement est journalisé.
    kaelith.send({ type: "inv.drop", charId: "pj-1", item: "potion de soin" });
    const journal = await other.nextWhere(
      (m) => m.type === "journal" && (m.entry as { text: string }).text.includes("jette"),
    );
    expect((journal.entry as { text: string }).text).toContain("jette Potion de soin");
    const after = await kaelith.nextWhere((m) => {
      const bags = m.inventories as Record<string, { items: { qty: number }[] }> | undefined;
      return bags?.["pj-1"]?.items[0]?.qty === 2;
    });
    expect(
      (after.inventories as Record<string, { items: { qty: number }[] }>)["pj-1"]!.items[0]!.qty,
    ).toBe(2);
  });

  it("inventaire (R9) : un joueur ne peut pas toucher au sac d'un autre", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const kaelith = await connect({ ...PLAYER, charId: "pj-1" });
    await kaelith.ready();

    // Le sac du PNJ est REMPLI : sans le garde d'autorisation, les deux
    // tentatives ci-dessous réussiraient (l'objet existe, le solde existe).
    mj.send({ type: "inv.add", charId: "pnj-1", item: "Torche", qty: 4 });
    mj.send({ type: "inv.add", charId: "pj-2", item: "Parchemin", qty: 1 });
    await mj.nextWhere((m) => m.type === "inv");
    await mj.nextWhere((m) => m.type === "inv");
    await d()
      .update(schema.characters)
      .set({ inventory: { items: [{ name: "Torche", qty: 4 }], money: { po: 5, pa: 0, pc: 0 } } })
      .where(eq(schema.characters.id, "pnj-1"));
    await tableStub().notifyCharacterUpdated("pnj-1");
    await new Promise((r) => setTimeout(r, 100));

    // 1. Jeter depuis le sac d'un PNJ → refusé.
    kaelith.send({ type: "inv.drop", charId: "pnj-1", item: "Torche" });
    // 2. Donner AU NOM d'un autre (from ≠ son personnage) → refusé.
    kaelith.send({
      type: "inv.give",
      kind: "item",
      from: "pnj-1",
      to: "pj-1",
      item: "Torche",
    });
    // 3. Donner son propre objet à un tiers sans être MJ → autorisé (c'est le
    //    cas légitime), donc on cible bien pnj-1 pour tester le refus.
    await new Promise((r) => setTimeout(r, 150));

    const npj = await d()
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, "pnj-1"))
      .get();
    // La torche est toujours là, à 4 : ni jetée, ni donnée.
    expect((npj!.inventory as { items: { name: string; qty: number }[] }).items).toEqual([
      { name: "Torche", qty: 4 },
    ]);
  });

  it("inventaire (R9) : transfert d'argent et d'objet, atomique et vérifié des deux côtés", async () => {
    await setupWorld();
    const mj = await connect(MJ);
    await mj.ready();
    const kaelith = await connect({ ...PLAYER, charId: "pj-1" });
    await kaelith.ready();

    mj.send({ type: "inv.add", charId: "pj-1", item: "Épée", qty: 1 });
    await mj.nextWhere((m) => m.type === "inv");
    await d()
      .update(schema.characters)
      .set({ inventory: { items: [{ name: "Épée", qty: 1 }], money: { po: 10, pa: 0, pc: 0 } } })
      .where(eq(schema.characters.id, "pj-1"));
    await tableStub().notifyCharacterUpdated("pj-1");
    await mj.nextWhere((m) => m.type === "inv");

    // Don de 10 po + de l'épée à pj-2 (le PNJ Loup, alone propriétaire).
    kaelith.send({
      type: "inv.give",
      kind: "money",
      from: "pj-1",
      to: "pj-2",
      money: { po: 10, pa: 0, pc: 0 },
    });
    await mj.nextWhere((m) => m.type === "inv");

    // Fonds insuffisants ensuite → rien ne bouge, pas de duplication d'argent.
    kaelith.send({
      type: "inv.give",
      kind: "money",
      from: "pj-1",
      to: "pj-2",
      money: { po: 10, pa: 0, pc: 0 },
    });
    await new Promise((r) => setTimeout(r, 120));

    const [from, to] = await Promise.all([
      d().select().from(schema.characters).where(eq(schema.characters.id, "pj-1")).get(),
      d().select().from(schema.characters).where(eq(schema.characters.id, "pj-2")).get(),
    ]);
    expect((from!.inventory as { money: { po: number } }).money.po).toBe(0);
    expect((to!.inventory as { money: { po: number } }).money.po).toBe(10);
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

  it("notifyCharacterUpdated (RPC) : le MJ modifie les PV en REST, la table diffuse la carte (PNJ non révélé omis au joueur — B5)", async () => {
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

    // Le joueur ne reçoit pas la carte du PNJ non révélé (B5).
    const plDelta = await player.next("delta");
    const plChars = (
      plDelta.patch as {
        characters: Record<string, { pv: number | null } | null>;
      }
    ).characters;
    expect(plChars["pnj-1"]).toBeNull();
  });
});
