import { DurableObject } from "cloudflare:workers";
import { createDb, schema, type CharacterSheet } from "../db";
import type {
  JournalEntry,
  Marker,
  FogState,
  CombatState,
  CharacterCard,
  TableSettings,
  TableLiveState,
} from "@rollwith/shared/protocol";
import {
  parseDiceCommand,
  rollDice,
  isCritical,
  isFumble,
  formatRollDetail,
  formatExpression,
} from "@rollwith/shared/dice";
import { sortInitiative, type InitiativeEntry } from "@rollwith/shared/initiative";
import { eq, and, inArray, desc } from "drizzle-orm";

interface WsAttachment {
  userId: string;
  name: string;
  role: "mj" | "player";
  charId: string | null;
  color: string;
}

interface TokenState {
  charId: string;
  x: number;
  y: number;
}

interface LiveState {
  mode: "exploration" | "combat";
  mapId: string | null;
  /** Pions et repères sont stockés PAR carte ("" = aucune carte sélectionnée) :
   *  changer de carte ne doit pas emporter le placement d'une autre. */
  tokensByMap: Record<string, Record<string, TokenState>>;
  markersByMap: Record<string, Marker[]>;
  fog: Record<string, FogState>;
  combat: CombatState | null;
}

const MAX_CHAT_LENGTH = 2000;
const FOG_REVEAL_RADIUS_PCT = 9;
const FOG_REVEAL_MIN_SPACING_PCT = 3;
const FOG_MAX_REVEALS = 600;

function defaultLiveState(): LiveState {
  return {
    mode: "exploration",
    mapId: null,
    tokensByMap: {},
    markersByMap: {},
    fog: {},
    combat: null,
  };
}

function blankSheet(name: string): CharacterSheet {
  return {
    identite: {
      nom: name,
      race: "",
      classe: "",
      niveau: 1,
      historique: "",
      alignement: "",
      xp: 0,
    },
    caracs: { for: 10, dex: 10, con: 10, int: 10, sag: 10, cha: 10 },
    saveProficiencies: { for: false, dex: false, con: false, int: false, sag: false, cha: false },
    skillProficiencies: {},
    ca: 10,
    vitesse: "9 m",
    initiativeBonus: 0,
    pvMax: 0,
    desDeVie: { faces: 8, total: 1, restants: 1 },
    deathSaves: { successes: 0, failures: 0 },
    inspiration: false,
    attaques: [],
    sorts: { caracIncantation: null, connus: [], emplacements: [] },
    capacites: [],
    personnalite: {},
    languesEtMaitrises: "",
    equipement: { bourse: { po: 0, pa: 0, pc: 0 }, objets: [] },
    couleurPion: "#C0392B",
  };
}

export class GameTableDO extends DurableObject<Env> {
  private db: ReturnType<typeof createDb> | null = null;
  private campaignId: string = "";
  private liveState: LiveState | null = null;
  private npcIds: Set<string> = new Set();
  private npcIdsLoaded = false;
  private cachedSettings: TableSettings | null = null;

  private getDb(): ReturnType<typeof createDb> {
    if (!this.db) {
      this.db = createDb(this.env.DB);
    }
    return this.db;
  }

  private async getState(): Promise<LiveState> {
    if (!this.liveState) {
      const stored = await this.ctx.storage.get<LiveState>("liveState");
      this.liveState = this.migrateLiveState(stored);
      if (stored !== this.liveState) {
        await this.ctx.storage.put("liveState", this.liveState);
      }
    }
    return this.liveState;
  }

  /** v1 (pions/repères globaux) → v2 (par carte) : l'ancien placement est
   *  rattaché à la carte alors active (ou « aucune carte »). */
  private migrateLiveState(stored: LiveState | undefined): LiveState {
    if (!stored) return defaultLiveState();
    const legacy = stored as unknown as Record<string, unknown>;
    if (legacy.tokensByMap && legacy.markersByMap) return stored;
    const key = ((legacy.mapId as string | null) ?? "") as string;
    return {
      mode: (legacy.mode as "exploration" | "combat") ?? "exploration",
      mapId: (legacy.mapId as string | null) ?? null,
      tokensByMap: { [key]: (legacy.tokens as Record<string, TokenState>) ?? {} },
      markersByMap: { [key]: (legacy.markers as Marker[]) ?? [] },
      fog: (legacy.fog as Record<string, FogState>) ?? {},
      combat: (legacy.combat as CombatState | null) ?? null,
    };
  }

  private mapKey(mapId: string | null | undefined): string {
    return mapId ?? "";
  }

  private tokensOf(
    state: LiveState,
    mapId: string | null = state.mapId,
  ): Record<string, TokenState> {
    return state.tokensByMap[this.mapKey(mapId)] ?? {};
  }

  private markersOf(state: LiveState, mapId: string | null = state.mapId): Marker[] {
    return state.markersByMap[this.mapKey(mapId)] ?? [];
  }

  private patchTokens(state: LiveState, tokens: Record<string, TokenState>): Partial<LiveState> {
    return { tokensByMap: { ...state.tokensByMap, [this.mapKey(state.mapId)]: tokens } };
  }

  private patchMarkers(state: LiveState, markers: Marker[]): Partial<LiveState> {
    return { markersByMap: { ...state.markersByMap, [this.mapKey(state.mapId)]: markers } };
  }

  private async ensureCampaignId(): Promise<void> {
    if (this.campaignId) return;
    const stored = await this.ctx.storage.get<string>("campaignId");
    if (stored) this.campaignId = stored;
  }

  private async ensureSettings(): Promise<TableSettings | null> {
    if (this.cachedSettings) return this.cachedSettings;
    const db = this.getDb();
    const [campaign] = await db
      .select({ settings: schema.campaigns.settings })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, this.campaignId))
      .limit(1);
    this.cachedSettings = campaign?.settings ?? null;
    return this.cachedSettings;
  }

  /** Les PV des PNJ ne quittent JAMAIS le serveur quand pnjPvVisible=false (§5.3). */
  private hidePnjPvFor(role: "mj" | "player"): boolean {
    return role === "player" && !(this.cachedSettings?.pnjPvVisible ?? false);
  }

  private filterCharactersForPlayers(
    characters: Record<string, Partial<CharacterCard> | null>,
  ): Record<string, Partial<CharacterCard> | null> {
    if (!this.hidePnjPvFor("player")) return characters;
    const out: Record<string, Partial<CharacterCard> | null> = {};
    for (const [id, val] of Object.entries(characters)) {
      if (!val) {
        out[id] = null;
        continue;
      }
      const isPnj = val.kind === "pnj" || (!val.kind && this.npcIds.has(id));
      out[id] = isPnj ? { ...val, pv: null, pvMax: null } : val;
    }
    return out;
  }

  private async ensureNpcIds(): Promise<void> {
    if (this.npcIdsLoaded) return;
    const db = this.getDb();
    const rows = await db
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(
        and(eq(schema.characters.campaignId, this.campaignId), eq(schema.characters.kind, "pnj")),
      );
    this.npcIds = new Set(rows.map((r) => r.id));
    this.npcIdsLoaded = true;
  }

  private async patchState(patch: Partial<LiveState>): Promise<LiveState> {
    const state = await this.getState();
    this.liveState = { ...state, ...patch };
    await this.ctx.storage.put("liveState", this.liveState);
    return this.liveState;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const userId = url.searchParams.get("userId") ?? "";
    const name = url.searchParams.get("name") ?? "";
    const role = (url.searchParams.get("role") as "mj" | "player") ?? "player";
    const charId = url.searchParams.get("charId") || null;
    const color = url.searchParams.get("color") ?? "#C0392B";
    const campaignId = url.searchParams.get("campaignId") ?? "";

    // A5 : refuser qu'on réveille ce DO pour une AUTRE campagne (le worker
    // doit être le seul chemin, mais on ne lui fait pas une confiance aveugle).
    const derivedId = this.env.GAME_TABLE.idFromName(campaignId).toString();
    if (derivedId !== this.ctx.id.toString()) {
      return new Response("Forbidden", { status: 403 });
    }

    this.campaignId = campaignId;
    await this.ctx.storage.put("campaignId", campaignId);

    const pair = new WebSocketPair();
    const client = pair[0] as WebSocket;
    const server = pair[1] as WebSocket;

    this.ctx.acceptWebSocket(server);

    const attachment: WsAttachment = { userId, name, role, charId, color };
    server.serializeAttachment(attachment);

    const snapshot = await this.buildSnapshot(role);
    server.send(JSON.stringify({ type: "snapshot", ...snapshot }));

    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  // Les handlers DO font des cycles lecture/modification/écriture (cache liveState
  // + D1 + broadcast). Sans sérialisation, deux actions concurrentes peuvent
  // écraser l'état de l'autre (audit A1 : lost updates).
  private mutationChain: Promise<void> = Promise.resolve();

  override webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    this.mutationChain = this.mutationChain
      .then(() => this.handleWsMessage(ws, message))
      .catch(() => {
        try {
          ws.send(JSON.stringify({ type: "error", code: "INTERNAL", msg: "Erreur interne" }));
        } catch {
          /* socket fermée */
        }
      });
    return this.mutationChain;
  }

  private async handleWsMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: "error", code: "PARSE", msg: "Invalid JSON" }));
      return;
    }

    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment) return;
    await this.ensureCampaignId();
    await this.getState();
    await this.ensureNpcIds();
    await this.ensureSettings();

    const type = msg.type as string;
    try {
      switch (type) {
        case "chat.say":
          await this.handleChatSay(ws, attachment, msg.text as string);
          break;
        case "dice.roll":
          await this.handleDiceRoll(ws, attachment, msg);
          break;
        case "char.hp":
          await this.handleCharHp(ws, attachment, msg);
          break;
        case "char.condition":
          await this.handleCharCondition(ws, attachment, msg);
          break;
        case "token.move":
          await this.handleTokenMove(ws, attachment, msg);
          break;
        case "token.put":
          await this.handleTokenPut(ws, attachment, msg);
          break;
        case "npc.add":
          await this.handleNpcAdd(ws, attachment, msg);
          break;
        case "npc.addFromMonster":
          ws.send(
            JSON.stringify({ type: "error", code: "NOT_IMPLEMENTED", msg: "Bientôt disponible" }),
          );
          break;
        case "npc.remove":
          await this.handleNpcRemove(ws, attachment, msg);
          break;
        case "map.select":
          await this.handleMapSelect(ws, attachment, msg);
          break;
        case "marker.set":
          await this.handleMarkerSet(ws, attachment, msg);
          break;
        case "marker.move":
          await this.handleMarkerMove(ws, attachment, msg);
          break;
        case "marker.remove":
          await this.handleMarkerRemove(ws, attachment, msg);
          break;
        case "marker.clear":
          await this.handleMarkerClear(ws, attachment);
          break;
        case "fog.enable":
          await this.handleFogEnable(ws, attachment);
          break;
        case "fog.reveal":
          await this.handleFogReveal(ws, attachment, msg);
          break;
        case "fog.cover":
          await this.handleFogCover(ws, attachment);
          break;
        case "fog.disable":
          await this.handleFogDisable(ws, attachment);
          break;
        case "ping":
          this.handlePing(attachment, msg);
          break;
        case "mode.set":
          await this.handleModeSet(ws, attachment, msg);
          break;
        case "initiative.roll":
          await this.handleInitiativeRoll(ws, attachment, msg);
          break;
        case "combat.next":
          await this.handleCombatNext(ws, attachment);
          break;
        default:
          ws.send(JSON.stringify({ type: "error", code: "UNKNOWN", msg: `Unknown: ${type}` }));
      }
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "INTERNAL",
          msg: err instanceof Error ? err.message : "Erreur interne",
        }),
      );
    }
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    this.broadcastPresence();
    ws.close(code, reason);
  }

  override async webSocketError(_ws: WebSocket): Promise<void> {
    // Best practice hibernation : un socket en erreur part sans webSocketClose ;
    // on rafraîchit la présence pour que la liste ne garde pas un fantôme.
    this.broadcastPresence();
  }

  /**
   * RPC appelé par les routes REST après une modification de personnage hors WS
   * (feuille, PV REST…) — audit §3.4 : la table voit la changement immédiatement.
   * Diffuse la carte complète via le canal role-aware (masque PV PNJ si besoin).
   */
  async notifyCharacterUpdated(charId: string): Promise<void> {
    if (this.ctx.getWebSockets().length === 0) return; // table fermée : rien à faire
    await this.ensureCampaignId();
    if (!this.campaignId) return;
    await this.getState();
    await this.ensureNpcIds();
    await this.ensureSettings();

    const db = this.getDb();
    const [ch] = await db
      .select()
      .from(schema.characters)
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      )
      .limit(1);
    if (!ch) return;

    const hidePv = this.hidePnjPvFor("player");
    const card: CharacterCard = {
      id: ch.id,
      kind: ch.kind,
      ownerId: ch.ownerId,
      name: ch.name,
      color: ch.color,
      active: ch.active,
      ca: ch.sheet.ca,
      sub:
        ch.kind === "pj"
          ? `${ch.sheet.identite.race} ${ch.sheet.identite.classe} niv. ${ch.sheet.identite.niveau}`
          : "",
      initiativeBonus: ch.sheet.initiativeBonus,
      pv: hidePv && ch.kind === "pnj" ? null : ch.pv,
      pvMax: hidePv && ch.kind === "pnj" ? null : ch.pvMax,
      pvTemp: ch.pvTemp,
      conditions: ch.conditions,
    };
    this.broadcastRoleAware({ characters: { [charId]: card } });
  }

  // ── Handlers : chat & dés ─────────────────────────────────────

  private async handleChatSay(ws: WebSocket, att: WsAttachment, text: string) {
    if (!text?.trim()) return;
    const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);

    const diceParsed = parseDiceCommand(trimmed);
    if (diceParsed) {
      await this.executeDiceRoll(ws, att, diceParsed.n, diceParsed.sides, diceParsed.mod, trimmed);
      return;
    }

    const entry = this.makeJournalEntry("say", att.name ?? null, att.color, trimmed);
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
  }

  private async handleDiceRoll(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    const sides = Number.isFinite(msg.sides) ? Math.trunc(msg.sides as number) : 20;
    const n = Number.isFinite(msg.n) ? Math.trunc(msg.n as number) : 1;
    const mod = Number.isFinite(msg.mod) ? Math.trunc(msg.mod as number) : 0;
    // Bornes R6.3 : pas de DoS CPU (n = 10⁹) ni de dés absurdes.
    if (n < 1 || n > 20 || sides < 2 || sides > 100) {
      ws.send(
        JSON.stringify({ type: "error", code: "INVALID", msg: "Paramètres de jet hors bornes" }),
      );
      return;
    }
    const modC = Math.max(-100, Math.min(100, mod));
    const label = (typeof msg.label === "string" ? msg.label.slice(0, 120) : "") || undefined;
    const expr = label ?? formatExpression({ n, sides, mod: modC });
    await this.executeDiceRoll(ws, att, n, sides, modC, expr);
  }

  private makeRng() {
    return {
      nextInt(maxExclusive: number): number {
        // Rejection sampling (design §5) : supprime le biais modulo.
        const range = 0x100000000;
        const limit = range - (range % maxExclusive);
        const arr = new Uint32Array(1);
        for (;;) {
          crypto.getRandomValues(arr);
          if (arr[0]! < limit) return arr[0]! % maxExclusive;
        }
      },
    };
  }

  private async executeDiceRoll(
    ws: WebSocket,
    att: WsAttachment,
    n: number,
    sides: number,
    mod: number,
    expr: string,
  ) {
    const roll = rollDice(n, sides, mod, this.makeRng());
    const crit = isCritical(roll);
    const fumble = isFumble(roll);
    const detail = formatRollDetail(roll);

    const entry = this.makeJournalEntry("roll", att.name ?? null, att.color, expr);
    entry.roll = {
      expression: expr,
      total: roll.total,
      detail,
      faces: roll.faces,
      sides,
      n,
      mod,
      crit,
      fumble,
    };

    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });

    ws.send(
      JSON.stringify({
        type: "dice.result",
        forUserId: att.userId,
        anim: { sides, faces: roll.faces, total: roll.total, detail, n, mod },
      }),
    );
  }

  // ── Handlers : personnages ─────────────────────────────────────

  private async handleCharHp(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    const charId = typeof msg.charId === "string" ? msg.charId : "";
    const deltaRaw = Number.isFinite(msg.delta) ? Math.trunc(msg.delta as number) : 0;
    const delta = Math.max(-100, Math.min(100, deltaRaw));
    if (!charId || delta === 0) return;

    const db = this.getDb();
    const [char] = await db
      .select()
      .from(schema.characters)
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      )
      .limit(1);

    if (!char) return;

    if (att.role !== "mj" && char.ownerId !== att.userId) return;

    let newPv = char.pv + delta;
    if (newPv < 0) newPv = 0;
    if (newPv > char.pvMax) newPv = char.pvMax;

    await db
      .update(schema.characters)
      .set({ pv: newPv, updatedAt: new Date() })
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      );

    if (newPv === 0 && char.pv > 0) {
      const entry = this.makeJournalEntry("system", null, null, `✦ ${char.name} tombe à 0 PV !`);
      await this.appendJournal(entry);
      this.broadcastAll({ type: "journal", entry });
    }

    this.broadcastRoleAware({ characters: { [charId]: { pv: newPv, pvMax: char.pvMax } } });
  }

  private async handleCharCondition(
    ws: WebSocket,
    att: WsAttachment,
    msg: Record<string, unknown>,
  ) {
    if (att.role !== "mj") return;
    const charId = typeof msg.charId === "string" ? msg.charId : "";
    const cond = typeof msg.cond === "string" ? msg.cond.slice(0, 40) : "";
    const on = msg.on === true;
    if (!charId || !cond) return;

    const db = this.getDb();
    const [char] = await db
      .select()
      .from(schema.characters)
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      )
      .limit(1);
    if (!char) return;

    const conditions = on
      ? Array.from(new Set([...char.conditions, cond]))
      : char.conditions.filter((c) => c !== cond);

    await db
      .update(schema.characters)
      .set({ conditions, updatedAt: new Date() })
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      );

    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `✦ ${char.name} ${on ? "gagne" : "perd"} l'état ${cond}.`,
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastAll({ type: "delta", patch: { characters: { [charId]: { conditions } } } });
  }

  private async handleNpcAdd(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const name = (((typeof msg.name === "string" ? msg.name : "") || "PNJ").trim() || "PNJ").slice(
      0,
      80,
    );
    const pv = Number.isFinite(msg.pv)
      ? Math.max(1, Math.min(999, Math.trunc(msg.pv as number)))
      : 1;
    const ca = Number.isFinite(msg.ca)
      ? Math.max(1, Math.min(30, Math.trunc(msg.ca as number)))
      : 10;
    const init = Number.isFinite(msg.init)
      ? Math.max(-10, Math.min(20, Math.trunc(msg.init as number)))
      : 0;
    const x = Number.isFinite(msg.x) ? (msg.x as number) : null;
    const y = Number.isFinite(msg.y) ? (msg.y as number) : null;

    await this.ensureNpcIds();
    const db = this.getDb();
    const id = crypto.randomUUID();
    const sheet = blankSheet(name);
    sheet.pvMax = pv;
    sheet.ca = ca;
    sheet.initiativeBonus = init;

    await db.insert(schema.characters).values({
      id,
      campaignId: this.campaignId,
      ownerId: null,
      kind: "pnj",
      name,
      color: "#C0392B",
      active: true,
      sheet,
      pv,
      pvMax: pv,
      pvTemp: 0,
      conditions: [],
    });
    this.npcIds.add(id);

    const card: CharacterCard = {
      id,
      kind: "pnj",
      ownerId: null,
      name,
      color: "#C0392B",
      active: true,
      ca,
      sub: "",
      initiativeBonus: init,
      pv,
      pvMax: pv,
      pvTemp: 0,
      conditions: [],
    };

    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `✦ Le MJ ajoute ${name} sur la carte.`,
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });

    const patch: Record<string, unknown> = { characters: { [id]: card } };
    if (x !== null && y !== null) {
      const state = await this.getState();
      const tokens = {
        ...this.tokensOf(state),
        [id]: { charId: id, x: this.clamp(x), y: this.clamp(y) },
      };
      const next = await this.patchState(this.patchTokens(state, tokens));
      patch.tokens = { [id]: tokens[id] };

      // Cas limite R8/6.4 : PNJ ajouté en cours de combat → rejoint l'initiative.
      if (next.mode === "combat" && next.combat && pv > 0) {
        await this.addLateParticipant(id, init);
      }
    }
    this.broadcastRoleAware(patch);
  }

  /** Ajoute un participant (typiquement un PNJ) à un combat déjà en cours. */
  private async addLateParticipant(charId: string, initBonus: number): Promise<void> {
    const state = await this.getState();
    if (!state.combat) return;
    const roll = rollDice(1, 20, initBonus, this.makeRng()).total;

    let combat: CombatState = {
      ...state.combat,
      participants: [...state.combat.participants, charId],
      scores: { ...state.combat.scores, [charId]: roll },
      rollIndex: {
        ...state.combat.rollIndex,
        [charId]: Object.keys(state.combat.rollIndex).length,
      },
    };

    if (combat.phase === "init") {
      if (combat.participants.every((id) => combat.scores[id] !== undefined)) {
        combat = await this.finalizeInitiative(combat);
      }
    } else if (combat.phase === "run") {
      const previousActiveId = combat.order?.[combat.turn] ?? null;
      const entries = await this.buildInitiativeEntries(
        combat.participants,
        combat.scores,
        combat.rollIndex,
      );
      const order = sortInitiative(entries).map((e) => e.id);
      const turn = previousActiveId ? Math.max(0, order.indexOf(previousActiveId)) : 0;
      combat = { ...combat, order, turn };
    }

    await this.patchState({ combat });
    this.broadcastAll({ type: "delta", patch: { combat } });
  }

  /** Retire un participant (PNJ supprimé en cours de combat) sans casser l'ordre/le tour en cours. */
  private removeParticipant(combat: CombatState, charId: string): CombatState {
    const participants = combat.participants.filter((id) => id !== charId);
    const scores = { ...combat.scores };
    delete scores[charId];
    const rollIndex = { ...combat.rollIndex };
    delete rollIndex[charId];

    if (combat.phase === "init" || !combat.order) {
      return { ...combat, participants, scores, rollIndex };
    }

    const activeId = combat.order[combat.turn];
    const order = combat.order.filter((id) => id !== charId);
    const turn = activeId && activeId !== charId ? Math.max(0, order.indexOf(activeId)) : 0;
    return { ...combat, participants, scores, rollIndex, order, turn };
  }

  private async handleNpcRemove(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const charId = msg.charId as string;
    if (!charId) return;

    await this.ensureNpcIds();
    const db = this.getDb();
    const [char] = await db
      .select()
      .from(schema.characters)
      .where(
        and(
          eq(schema.characters.id, charId),
          eq(schema.characters.kind, "pnj"),
          eq(schema.characters.campaignId, this.campaignId),
        ),
      )
      .limit(1);
    if (!char) return;

    await db
      .delete(schema.characters)
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      );
    this.npcIds.delete(charId);

    const state = await this.getState();
    let touched = false;
    const tokensByMap: LiveState["tokensByMap"] = {};
    for (const [key, toks] of Object.entries(state.tokensByMap)) {
      if (toks[charId]) {
        touched = true;
        const { [charId]: _drop, ...rest } = toks;
        tokensByMap[key] = rest;
      } else {
        tokensByMap[key] = toks;
      }
    }
    if (touched) await this.patchState({ tokensByMap });

    let combatPatch: CombatState | null | undefined;
    if (state.combat?.participants.includes(charId)) {
      combatPatch = this.removeParticipant(state.combat, charId);
      await this.patchState({ combat: combatPatch });
    }

    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `✦ Le MJ retire ${char.name}.`,
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastAll({
      type: "delta",
      patch: {
        characters: { [charId]: null },
        tokens: { [charId]: null },
        ...(combatPatch !== undefined ? { combat: combatPatch } : {}),
      },
    });
  }

  // ── Handlers : carte, pions ─────────────────────────────────────

  private clamp(v: number): number {
    if (!Number.isFinite(v)) return 50;
    return Math.max(2, Math.min(98, v));
  }

  private async handleTokenMove(_ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    const tokenId = typeof msg.tokenId === "string" ? msg.tokenId : "";
    const x = Number.isFinite(msg.x) ? (msg.x as number) : NaN;
    const y = Number.isFinite(msg.y) ? (msg.y as number) : NaN;
    if (!tokenId || Number.isNaN(x) || Number.isNaN(y)) return;

    if (att.role !== "mj" && tokenId !== att.charId) return;

    const cx = this.clamp(x);
    const cy = this.clamp(y);

    const state = await this.getState();
    const current = this.tokensOf(state);
    if (!current[tokenId]) return;
    const tokens = { ...current, [tokenId]: { charId: tokenId, x: cx, y: cy } };
    await this.patchState(this.patchTokens(state, tokens));
    this.broadcastRoleAware({ tokens: { [tokenId]: tokens[tokenId]! } });
  }

  /** Le MJ place un personnage (PJ ou PNJ) sur la carte active. */
  private async handleTokenPut(_ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const charId = typeof msg.charId === "string" ? msg.charId : "";
    const x = Number.isFinite(msg.x) ? (msg.x as number) : NaN;
    const y = Number.isFinite(msg.y) ? (msg.y as number) : NaN;
    if (!charId || Number.isNaN(x) || Number.isNaN(y)) return;

    const state = await this.getState();
    if (!state.mapId) return;
    if (this.tokensOf(state)[charId]) return;

    const db = this.getDb();
    const [char] = await db
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      )
      .limit(1);
    if (!char) return;

    const tokens = {
      ...this.tokensOf(state),
      [charId]: { charId, x: this.clamp(x), y: this.clamp(y) },
    };
    await this.patchState(this.patchTokens(state, tokens));
    this.broadcastRoleAware({ tokens: { [charId]: tokens[charId]! } });
  }

  private async handleMapSelect(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const mapId = msg.mapId as string;
    if (!mapId) return;

    const db = this.getDb();
    const [map] = await db
      .select()
      .from(schema.maps)
      .where(and(eq(schema.maps.id, mapId), eq(schema.maps.campaignId, this.campaignId)))
      .limit(1);
    if (!map) {
      ws.send(JSON.stringify({ type: "error", code: "NOT_FOUND", msg: "Carte introuvable" }));
      return;
    }

    const state = await this.getState();
    await this.patchState({ mapId });
    const view = { ...state, mapId };
    // mapId présent dans le patch ⇒ le client REMPLACE tokens/markers (vue de
    // la nouvelle carte) au lieu de fusionner (voir ws.ts).
    this.broadcastRoleAware({
      mapId,
      tokens: this.tokensOf(view),
      markers: this.markersOf(view),
    });
  }

  private async handleMarkerSet(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const x = Number.isFinite(msg.x) ? (msg.x as number) : NaN;
    const y = Number.isFinite(msg.y) ? (msg.y as number) : NaN;
    const text = (
      ((typeof msg.text === "string" ? msg.text : "") || "repère").trim() || "repère"
    ).slice(0, 200);
    if (Number.isNaN(x) || Number.isNaN(y)) return;

    const state = await this.getState();
    const id = (msg.id as string) || crypto.randomUUID();
    const marker: Marker = { id, x: this.clamp(x), y: this.clamp(y), text };
    const markers = [...this.markersOf(state), marker];
    await this.patchState(this.patchMarkers(state, markers));
    this.broadcastAll({ type: "delta", patch: { markers } });
  }

  private async handleMarkerMove(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const id = typeof msg.id === "string" ? msg.id : "";
    const x = Number.isFinite(msg.x) ? (msg.x as number) : NaN;
    const y = Number.isFinite(msg.y) ? (msg.y as number) : NaN;
    if (!id || Number.isNaN(x) || Number.isNaN(y)) return;

    const state = await this.getState();
    const markers = this.markersOf(state).map((m) =>
      m.id === id ? { ...m, x: this.clamp(x), y: this.clamp(y) } : m,
    );
    await this.patchState(this.patchMarkers(state, markers));
    this.broadcastAll({ type: "delta", patch: { markers } });
  }

  private async handleMarkerRemove(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const id = msg.id as string;
    if (!id) return;

    const state = await this.getState();
    const markers = this.markersOf(state).filter((m) => m.id !== id);
    await this.patchState(this.patchMarkers(state, markers));
    this.broadcastAll({ type: "delta", patch: { markers } });
  }

  private async handleMarkerClear(ws: WebSocket, att: WsAttachment) {
    if (att.role !== "mj") return;
    const state = await this.getState();
    await this.patchState(this.patchMarkers(state, []));
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      "✦ Le MJ efface les repères.",
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastAll({ type: "delta", patch: { markers: [] } });
  }

  // ── Handlers : brouillard ───────────────────────────────────────

  private async handleFogEnable(ws: WebSocket, att: WsAttachment) {
    if (att.role !== "mj") return;
    const state = await this.getState();
    if (!state.mapId) return;
    const fog = { ...state.fog, [state.mapId]: { on: true, reveals: [] } };
    await this.patchState({ fog });
    this.broadcastRoleAware({ fog });
  }

  private async handleFogReveal(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const state = await this.getState();
    if (!state.mapId) return;
    const current = state.fog[state.mapId];
    if (!current || !current.on) return;
    const x = this.clamp(msg.x as number);
    const y = this.clamp(msg.y as number);

    // Skip points too close to an existing reveal: keeps the array bounded
    // (a map can only hold so many non-overlapping circles) instead of growing
    // without limit for the whole session, which used to make every storage
    // write, broadcast and canvas redraw progressively slower.
    const tooClose = current.reveals.some((r) => {
      const dx = r.x - x;
      const dy = r.y - y;
      return Math.sqrt(dx * dx + dy * dy) < FOG_REVEAL_MIN_SPACING_PCT;
    });
    if (tooClose || current.reveals.length >= FOG_MAX_REVEALS) return;

    const fog = {
      ...state.fog,
      [state.mapId]: { on: true, reveals: [...current.reveals, { x, y }] },
    };
    await this.patchState({ fog });
    this.broadcastRoleAware({ fog });
  }

  private async handleFogCover(ws: WebSocket, att: WsAttachment) {
    if (att.role !== "mj") return;
    const state = await this.getState();
    if (!state.mapId) return;
    const fog = { ...state.fog, [state.mapId]: { on: true, reveals: [] } };
    await this.patchState({ fog });
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      "✦ Le MJ recouvre toute la carte de brouillard.",
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastRoleAware({ fog });
  }

  private async handleFogDisable(ws: WebSocket, att: WsAttachment) {
    if (att.role !== "mj") return;
    const state = await this.getState();
    if (!state.mapId) return;
    const fog = { ...state.fog, [state.mapId]: { on: false, reveals: [] } };
    await this.patchState({ fog });
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      "✦ Le brouillard se dissipe.",
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastRoleAware({ fog });
  }

  private handlePing(att: WsAttachment, msg: Record<string, unknown>) {
    const x = Number.isFinite(msg.x) ? (msg.x as number) : NaN;
    const y = Number.isFinite(msg.y) ? (msg.y as number) : NaN;
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    this.broadcastAll({ type: "ping", x: this.clamp(x), y: this.clamp(y) });
  }

  private async handleModeSet(ws: WebSocket, att: WsAttachment, msg: Record<string, unknown>) {
    if (att.role !== "mj") return;
    const mode = msg.mode as "exploration" | "combat";
    if (mode === "combat") {
      const state = await this.getState();
      const db = this.getDb();
      const charRows = await db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.campaignId, this.campaignId));

      // R8.1 : participants = pion sur la carte active ET pv > 0.
      const participants = charRows
        .filter((c) => c.pv > 0 && !!this.tokensOf(state)[c.id])
        .map((c) => c.id);

      if (participants.length === 0) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "NO_PARTICIPANTS",
            msg: "Aucun participant (pion + PV > 0) pour lancer le combat.",
          }),
        );
        return;
      }

      // R8.2 : initiative des PNJ lancée automatiquement et silencieusement.
      const rng = this.makeRng();
      const scores: Record<string, number> = {};
      const rollIndex: Record<string, number> = {};
      let idx = 0;
      for (const c of charRows) {
        if (c.kind !== "pnj" || !participants.includes(c.id)) continue;
        scores[c.id] = rollDice(1, 20, c.sheet.initiativeBonus, rng).total;
        rollIndex[c.id] = idx++;
      }

      let combat: CombatState = {
        phase: "init",
        participants,
        scores,
        order: null,
        turn: 0,
        round: 1,
        rollIndex,
      };

      const entry = this.makeJournalEntry(
        "system",
        att.name ?? null,
        att.color,
        "✦ Combat lancé. Chaque héros lance sa propre initiative.",
      );
      await this.appendJournal(entry);
      this.broadcastAll({ type: "journal", entry });

      // Cas limite : que des PNJ (aucun joueur à attendre) → bascule immédiate.
      if (participants.every((id) => scores[id] !== undefined)) {
        combat = await this.finalizeInitiative(combat);
      }

      await this.patchState({ mode: "combat", combat });
      this.broadcastAll({ type: "delta", patch: { mode: "combat", combat } });
    } else {
      await this.patchState({ mode: "exploration", combat: null });
      const entry = this.makeJournalEntry(
        "system",
        att.name ?? null,
        att.color,
        "✦ Fin du combat.",
      );
      await this.appendJournal(entry);
      this.broadcastAll({ type: "journal", entry });
      this.broadcastAll({ type: "delta", patch: { mode: "exploration", combat: null } });
    }
  }

  private async handleInitiativeRoll(
    ws: WebSocket,
    att: WsAttachment,
    msg: Record<string, unknown>,
  ) {
    const charId = msg.charId as string;
    if (!charId) return;

    const state = await this.getState();
    const combat = state.combat;
    if (state.mode !== "combat" || !combat || combat.phase !== "init") return;
    if (!combat.participants.includes(charId)) return;
    if (combat.scores[charId] !== undefined) return;
    // R8.3 : un joueur ne lance que sa propre initiative ; le MJ peut secourir.
    if (att.role !== "mj" && charId !== att.charId) return;

    const db = this.getDb();
    const [char] = await db
      .select()
      .from(schema.characters)
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      )
      .limit(1);
    if (!char) return;

    const roll = rollDice(1, 20, char.sheet.initiativeBonus, this.makeRng());
    const total = roll.total;

    const entry = this.makeJournalEntry("roll", char.name, char.color, "lance son initiative");
    entry.roll = {
      expression: formatExpression({ n: 1, sides: 20, mod: char.sheet.initiativeBonus }),
      total,
      detail: formatRollDetail(roll),
      faces: roll.faces,
      sides: 20,
      n: 1,
      mod: char.sheet.initiativeBonus,
      crit: isCritical(roll),
      fumble: isFumble(roll),
    };
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    ws.send(
      JSON.stringify({
        type: "dice.result",
        forUserId: att.userId,
        anim: {
          sides: 20,
          faces: roll.faces,
          total,
          detail: formatRollDetail(roll),
          n: 1,
          mod: char.sheet.initiativeBonus,
        },
      }),
    );

    let newCombat: CombatState = {
      ...combat,
      scores: { ...combat.scores, [charId]: total },
      rollIndex: { ...combat.rollIndex, [charId]: Object.keys(combat.rollIndex).length },
    };

    if (newCombat.participants.every((id) => newCombat.scores[id] !== undefined)) {
      newCombat = await this.finalizeInitiative(newCombat);
    }

    await this.patchState({ combat: newCombat });
    this.broadcastAll({ type: "delta", patch: { combat: newCombat } });
  }

  /** R8.4 : quand tous les participants ont un score, tri décroissant et bascule en phase `run`. */
  private async finalizeInitiative(combat: CombatState): Promise<CombatState> {
    const entries = await this.buildInitiativeEntries(
      combat.participants,
      combat.scores,
      combat.rollIndex,
    );
    const order = sortInitiative(entries);
    const summary = order.map((e) => `${e.name} (${e.score})`).join(", ");
    const entry = this.makeJournalEntry(
      "system",
      null,
      null,
      `✦ Initiative complète : ${summary}. C'est à ${order[0]?.name ?? "?"} !`,
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    return { ...combat, phase: "run", order: order.map((e) => e.id), turn: 0 };
  }

  private async buildInitiativeEntries(
    participantIds: string[],
    scores: Record<string, number>,
    rollIndex: Record<string, number>,
  ): Promise<InitiativeEntry[]> {
    if (participantIds.length === 0) return [];
    const db = this.getDb();
    const rows = await db
      .select()
      .from(schema.characters)
      .where(
        and(
          inArray(schema.characters.id, participantIds),
          eq(schema.characters.campaignId, this.campaignId),
        ),
      );
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      score: scores[c.id] ?? 0,
      initBonus: c.sheet.initiativeBonus,
      kind: c.kind,
      rollIndex: rollIndex[c.id] ?? 0,
    }));
  }

  private async handleCombatNext(ws: WebSocket, att: WsAttachment) {
    if (att.role !== "mj") return;
    const state = await this.getState();
    const combat = state.combat;
    if (state.mode !== "combat" || !combat || combat.phase !== "run" || !combat.order) return;
    if (combat.order.length === 0) return;

    let turn = combat.turn + 1;
    let round = combat.round;
    if (turn >= combat.order.length) {
      turn = 0;
      round++;
    }
    const newCombat: CombatState = { ...combat, turn, round };
    await this.patchState({ combat: newCombat });

    const activeId = combat.order[turn]!;
    const db = this.getDb();
    const [activeChar] = await db
      .select({ name: schema.characters.name })
      .from(schema.characters)
      .where(
        and(eq(schema.characters.id, activeId), eq(schema.characters.campaignId, this.campaignId)),
      )
      .limit(1);
    const entry = this.makeJournalEntry(
      "system",
      null,
      null,
      `✦ C'est au tour de ${activeChar?.name ?? "?"}${turn === 0 ? ` — round ${round}` : ""}.`,
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastAll({ type: "delta", patch: { combat: newCombat } });
  }

  // ── Helpers ───────────────────────────────────────────────────

  private journalSeq = 0;

  private makeJournalEntry(
    kind: "say" | "system" | "roll" | "share",
    who: string | null,
    whoColor: string | null,
    text: string,
  ): JournalEntry {
    return {
      id: Date.now() * 1000 + (this.journalSeq++ % 1000),
      ts: Date.now(),
      kind,
      who,
      whoColor,
      text,
    };
  }

  private isRevealed(x: number, y: number, fog: FogState | undefined): boolean {
    if (!fog || !fog.on) return true;
    return fog.reveals.some((r) => {
      const dx = r.x - x;
      const dy = r.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= FOG_REVEAL_RADIUS_PCT;
    });
  }

  /** Removes PNJ tokens hidden under un-revealed fog from the tokens patch, for players.
   *  Synchrone (npcIds + liveState préchargés en entrée de message) — les deltas
   *  partent donc dans l'ordre, sans floating promise (audit A2). */
  private filterTokensForPlayers(
    tokens: Record<string, { charId: string; x: number; y: number } | null>,
  ): Record<string, { charId: string; x: number; y: number } | null> {
    const state = this.liveState;
    const fog = state?.mapId ? state.fog[state.mapId] : undefined;
    if (!fog || !fog.on) return tokens;

    const filtered: Record<string, { charId: string; x: number; y: number } | null> = {};
    for (const [id, token] of Object.entries(tokens)) {
      if (!token) {
        filtered[id] = null;
        continue;
      }
      if (!this.npcIds.has(token.charId) || this.isRevealed(token.x, token.y, fog)) {
        filtered[id] = token;
      }
    }
    return filtered;
  }

  /** Broadcasts a delta patch, filtering hidden PNJ tokens AND PNJ pv per-recipient role. */
  private broadcastRoleAware(patch: Record<string, unknown>): void {
    const sockets = this.ctx.getWebSockets();
    const playerTokens =
      patch.tokens !== undefined
        ? this.filterTokensForPlayers(
            patch.tokens as Record<string, { charId: string; x: number; y: number } | null>,
          )
        : undefined;
    const playerCharacters =
      patch.characters !== undefined
        ? this.filterCharactersForPlayers(
            patch.characters as Record<string, Partial<CharacterCard> | null>,
          )
        : undefined;
    for (const ws of sockets) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      const isMj = att?.role === "mj";
      let outPatch = patch;
      if (!isMj) {
        outPatch = {
          ...patch,
          ...(playerTokens ? { tokens: playerTokens } : {}),
          ...(playerCharacters ? { characters: playerCharacters } : {}),
        };
      }
      try {
        ws.send(JSON.stringify({ type: "delta", patch: outPatch }));
      } catch {
        /* socket might be closed */
      }
    }
  }

  private async buildSnapshot(role: "mj" | "player"): Promise<{
    state: TableLiveState;
    characters: CharacterCard[];
    settings: TableSettings;
    journalTail: JournalEntry[];
    presence: {
      userId: string;
      name: string;
      role: string;
      charId: string | null;
      color: string;
    }[];
  }> {
    const db = this.getDb();
    const state = await this.getState();

    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, this.campaignId))
      .limit(1);

    const charRows = await db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.campaignId, this.campaignId));

    this.npcIds = new Set(charRows.filter((r) => r.kind === "pnj").map((r) => r.id));
    this.npcIdsLoaded = true;

    this.cachedSettings = campaign?.settings ?? null;

    const hidePv = this.hidePnjPvFor(role);
    const characters: CharacterCard[] = charRows.map((ch) => ({
      id: ch.id,
      kind: ch.kind,
      ownerId: ch.ownerId,
      name: ch.name,
      color: ch.color,
      active: ch.active,
      ca: ch.sheet.ca,
      sub:
        ch.kind === "pj"
          ? `${ch.sheet.identite.race} ${ch.sheet.identite.classe} niv. ${ch.sheet.identite.niveau}`
          : "",
      initiativeBonus: ch.sheet.initiativeBonus,
      pv: hidePv && ch.kind === "pnj" ? null : ch.pv,
      pvMax: hidePv && ch.kind === "pnj" ? null : ch.pvMax,
      pvTemp: ch.pvTemp,
      conditions: ch.conditions,
    }));

    const rawTokens = this.tokensOf(state);
    const tokens =
      role === "mj" ? rawTokens : (this.filterTokensForPlayers(rawTokens) as typeof rawTokens);

    const journalTail = await this.getJournalTail();
    const presence = this.getPresence();

    return {
      state: {
        mode: state.mode,
        mapId: state.mapId,
        tokens,
        markers: this.markersOf(state),
        fog: state.fog,
        combat: state.combat,
      },
      characters,
      settings: campaign?.settings ?? {
        pnjPvVisible: false,
        sheetsLocked: false,
        diceDuration: 1200,
        tokenSize: 32,
      },
      journalTail,
      presence,
    };
  }

  private async getJournalTail(limit = 50): Promise<JournalEntry[]> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(schema.journal)
      .where(eq(schema.journal.campaignId, this.campaignId))
      .orderBy(desc(schema.journal.id))
      .limit(limit);

    // Les 50 DERNIÈRES entrées, rendues en ordre chronologique.
    return rows.reverse().map((r) => ({
      id: r.id,
      ts: r.ts,
      kind: r.kind as JournalEntry["kind"],
      who: r.who,
      whoColor: r.whoColor,
      text: r.text,
      roll: r.roll as JournalEntry["roll"],
      ref: r.ref as JournalEntry["ref"],
    }));
  }

  private async appendJournal(entry: JournalEntry): Promise<void> {
    const db = this.getDb();
    const inserted = await db
      .insert(schema.journal)
      .values({
        campaignId: this.campaignId,
        ts: entry.ts,
        kind: entry.kind,
        who: entry.who,
        whoColor: entry.whoColor,
        text: entry.text,
        roll: entry.roll as never,
        ref: entry.ref as never,
      })
      .returning({ id: schema.journal.id });
    // L'id diffusé doit être l'id réel (autoincrement D1) : sinon les clés
    // live et reload divergent (audit A4).
    const realId = inserted[0]?.id;
    if (typeof realId === "number") entry.id = realId;
  }

  private getPresence(): {
    userId: string;
    name: string;
    role: string;
    charId: string | null;
    color: string;
  }[] {
    const sockets = this.ctx.getWebSockets();
    // Un par utilisateur : après un rechargement, l'ancienne socket peut encore
    // hiberner (userId en double) ou coexister avec un second onglet. Les clés
    // de présence doivent être uniques, sinon le client plante (each_key_duplicate).
    const byUser = new Map<
      string,
      { userId: string; name: string; role: string; charId: string | null; color: string }
    >();
    for (const ws of sockets) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (!att?.userId) continue;
      byUser.set(att.userId, {
        userId: att.userId,
        name: att.name,
        role: att.role,
        charId: att.charId,
        color: att.color,
      });
    }
    return Array.from(byUser.values());
  }

  private broadcastPresence(): void {
    this.broadcastAll({ type: "presence", users: this.getPresence() });
  }

  private broadcastAll(msg: Record<string, unknown>): void {
    const data = JSON.stringify(msg);
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(data);
      } catch {
        /* socket might be closed */
      }
    }
  }
}
