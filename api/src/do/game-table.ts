import { DurableObject } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { createSheet } from "@rollwith/shared/sheet";
import { applyDamage } from "@rollwith/shared/damage";
import {
  addItem,
  removeItem,
  transferItem,
  transferMoney,
  type Inventory,
  type Money,
} from "@rollwith/shared/inventory";
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
  isScoresCommand,
  formatScoresSummary,
  rollDice,
  isCritical,
  isFumble,
  formatRollDetail,
  formatExpression,
} from "@rollwith/shared/dice";
import { DEFAULT_SETTINGS } from "@rollwith/shared/protocol";
import type { JournalPage } from "@rollwith/shared/dto";
import { sortInitiative, type InitiativeEntry } from "@rollwith/shared/initiative";
import { clientMessageSchema, type ClientMessageInput } from "@rollwith/shared/ws-validation";
import { eq, and, inArray, asc } from "drizzle-orm";

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

/** Rendu d'un montant pour le journal : « 1 po 20 pa 5 pc », zéro omis. */
function formatMoney(m: Money): string {
  const parts: string[] = [];
  if (m.po) parts.push(`${m.po} po`);
  if (m.pa) parts.push(`${m.pa} pa`);
  if (m.pc) parts.push(`${m.pc} pc`);
  return parts.length > 0 ? parts.join(" ") : "rien";
}

/** Réflexe défensif : la colonne est NOT NULL mais une ligne ancienne ou une
 *  écriture manuelle pourrait contenir null/un objet partiel. */
function normalizeInventory(raw: unknown): Inventory {
  const v = (raw ?? {}) as Partial<Inventory>;
  const money = (v.money ?? {}) as Partial<Money>;
  const items = Array.isArray(v.items)
    ? v.items
        .filter((i): i is { name: string; qty: number } => !!i && typeof i.name === "string")
        .map((i) => ({ name: i.name, qty: Math.max(1, Math.floor(i.qty) || 1) }))
    : [];
  return {
    items,
    money: {
      po: Math.max(0, Math.floor(money.po ?? 0) || 0),
      pa: Math.max(0, Math.floor(money.pa ?? 0) || 0),
      pc: Math.max(0, Math.floor(money.pc ?? 0) || 0),
    },
  };
}

// Sécurité (audit S1/S2) : un membre authentifié reste borné.
const MAX_RAW_MESSAGE_BYTES = 32_000;
const MAX_SOCKETS_PER_USER = 4;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 60;
/** Budget distinct pour les messages de déplacement (pion/repère/brouillard).
 *  Un glisser legitime envoi ~30-60 messages/s : les compter dans le budget
 *  general (60 par fenetre) faisait tomber le joueur en "trop de messages"
 *  apres une seule seconde de drag. Un budget propre, plus large mais toujours
 *  borne, evite ce faux positif SANS ouvrir la porte a une boucle abusive. */
const RATE_LIMIT_MAX_MOVES = 900;

// Perf (audit P2) : la persistance des déplacements de pion est débounced,
// seule la diffusion reste immédiate.
const TOKEN_PERSIST_DEBOUNCE_MS = 500;

// Perf (audit P3) : le journal vit dans le SQLite du DO (voir plus bas) ;
// fenêtre glissante en attendant une politique d'archivage R2 dédiée.
const JOURNAL_RETENTION_MAX = 5000;

/** Messages validés (ws-validation) — chaque handler reçoit son payload typé. */
type DiceRollMsg = Extract<ClientMessageInput, { type: "dice.roll" }>;
type CharHpMsg = Extract<ClientMessageInput, { type: "char.hp" }>;
type CharConditionMsg = Extract<ClientMessageInput, { type: "char.condition" }>;
type TokenMoveMsg = Extract<ClientMessageInput, { type: "token.move" }>;
type TokenPutMsg = Extract<ClientMessageInput, { type: "token.put" }>;
type TokenRemoveMsg = Extract<ClientMessageInput, { type: "token.remove" }>;
type NpcDuplicateMsg = Extract<ClientMessageInput, { type: "npc.duplicate" }>;
type NpcAddFromTemplateMsg = Extract<ClientMessageInput, { type: "npc.addFromTemplate" }>;
type NpcSaveAsTemplateMsg = Extract<ClientMessageInput, { type: "npc.saveAsTemplate" }>;
type NpcAddMsg = Extract<ClientMessageInput, { type: "npc.add" }>;
type NpcRemoveMsg = Extract<ClientMessageInput, { type: "npc.remove" }>;
type MapSelectMsg = Extract<ClientMessageInput, { type: "map.select" }>;
type MarkerSetMsg = Extract<ClientMessageInput, { type: "marker.set" }>;
type MarkerMoveMsg = Extract<ClientMessageInput, { type: "marker.move" }>;
type MarkerRemoveMsg = Extract<ClientMessageInput, { type: "marker.remove" }>;
type FogRevealMsg = Extract<ClientMessageInput, { type: "fog.reveal" }>;
type PingMsg = Extract<ClientMessageInput, { type: "ping" }>;
type InvAddMsg = Extract<ClientMessageInput, { type: "inv.add" }>;
type InvDropMsg = Extract<ClientMessageInput, { type: "inv.drop" }>;
type InvGiveMsg = Extract<ClientMessageInput, { type: "inv.give" }>;
type ModeSetMsg = Extract<ClientMessageInput, { type: "mode.set" }>;
type InitiativeRollMsg = Extract<ClientMessageInput, { type: "initiative.roll" }>;

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

export class GameTableDO extends DurableObject<Env> {
  private db: ReturnType<typeof createDb> | null = null;
  private campaignId: string = "";
  private liveState: LiveState | null = null;
  private npcIds: Set<string> = new Set();
  private npcIdsLoaded = false;
  private cachedSettings: TableSettings | null = null;
  private journalReady = false;
  private journalImported = false;
  private tokenPersistDirty = false;
  private tokenPersistTimer: ReturnType<typeof setTimeout> | null = null;
  /** Fenêtre glissante par utilisateur (audit S1) — remise à zéro naturelle :
   *  les timestamps hors fenêtre sont purgés à chaque appel. Deux budgets
   *  séparés : le déplacement continu ne doit pas consommer le budget des
   *  messages normaux (sinon un simple drag bloque le chat). */
  private rateLimitHits: Map<string, number[]> = new Map();
  private rateLimitMoveHits: Map<string, number[]> = new Map();

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

  /**
   * RPC appelé par PATCH /api/campaigns/:id/settings (audit B1) : le cache
   * `cachedSettings` n'était jamais invalidé, les joueurs déjà connectés
   * gardaient l'ancien réglage (ex : PV des PNJ) jusqu'à reconnexion.
   */
  async notifySettingsUpdated(): Promise<void> {
    this.cachedSettings = null;
    if (this.ctx.getWebSockets().length === 0) return;
    await this.ensureCampaignId();
    const settings = await this.ensureSettings();
    this.broadcastAll({ type: "delta", patch: { settings: settings ?? DEFAULT_SETTINGS } });
  }

  /** Les PV des PNJ ne quittent JAMAIS le serveur quand pnjPvVisible=false (§5.3). */
  private hidePnjPvFor(role: "mj" | "player"): boolean {
    return role === "player" && !(this.cachedSettings?.pnjPvVisible ?? false);
  }

  /**
   * B5 : un PNJ est visible par les joueurs s'il a un pion sur la carte
   * active ET que ce pion est révélé (hors brouillard, ou brouillard éteint).
   * Un PJ est toujours visible. Synchrone (liveState + npcIds préchargés).
   */
  private isCharVisibleToPlayers(charId: string, state: LiveState): boolean {
    if (!this.npcIds.has(charId)) return true;
    const token = this.tokensOf(state)[charId];
    if (!token) return false;
    const fog = state.mapId ? state.fog[state.mapId] : undefined;
    return this.isRevealed(token.x, token.y, fog);
  }

  /** Visibilité à donner à une entrée de journal qui nomme charId (B5) :
   *  « mj » si c'est un PNJ actuellement non révélé, « all » sinon. */
  private journalVisibilityFor(charId: string): "all" | "mj" {
    const state = this.liveState;
    if (!state) return "all";
    return this.isCharVisibleToPlayers(charId, state) ? "all" : "mj";
  }

  private filterCharactersForPlayers(
    characters: Record<string, Partial<CharacterCard> | null>,
  ): Record<string, Partial<CharacterCard> | null> {
    const hidePv = this.hidePnjPvFor("player");
    const state = this.liveState;
    const out: Record<string, Partial<CharacterCard> | null> = {};
    for (const [id, val] of Object.entries(characters)) {
      if (!val) {
        out[id] = null;
        continue;
      }
      const isPnj = val.kind === "pnj" || (!val.kind && this.npcIds.has(id));
      // B5 : un PNJ non révélé est entièrement omis (pas juste ses PV masqués).
      if (isPnj && state && !this.isCharVisibleToPlayers(id, state)) {
        out[id] = null;
        continue;
      }
      out[id] = isPnj && hidePv ? { ...val, pv: null, pvMax: null } : val;
    }
    return out;
  }

  /** B5 : mêmes filtres que filterCharactersForPlayers, appliqués à l'état de
   *  combat — participants/order/scores/rollIndex ne fuient pas un PNJ caché.
   *  Le tour actif est reprojeté sur le nouvel ordre filtré (même geste que
   *  removeParticipant : au pire l'actif caché laisse la mise en avant au
   *  premier participant visible). */
  private filterCombatForPlayers(combat: CombatState | null, state: LiveState): CombatState | null {
    if (!combat) return combat;
    const visible = (id: string) => this.isCharVisibleToPlayers(id, state);
    const participants = combat.participants.filter(visible);
    const scores = Object.fromEntries(Object.entries(combat.scores).filter(([id]) => visible(id)));
    const rollIndex = Object.fromEntries(
      Object.entries(combat.rollIndex).filter(([id]) => visible(id)),
    );
    if (!combat.order) return { ...combat, participants, scores, rollIndex };
    const activeId = combat.order[combat.turn];
    const order = combat.order.filter(visible);
    const turn = activeId && visible(activeId) ? Math.max(0, order.indexOf(activeId)) : 0;
    return { ...combat, participants, scores, rollIndex, order, turn };
  }

  /** Recharge les CharacterCard de la BDD pour les ids donnés. */
  private async loadCharacterCards(ids: string[]): Promise<Record<string, CharacterCard>> {
    if (ids.length === 0) return {};
    const db = this.getDb();
    const rows = await db
      .select()
      .from(schema.characters)
      .where(
        and(inArray(schema.characters.id, ids), eq(schema.characters.campaignId, this.campaignId)),
      );
    const out: Record<string, CharacterCard> = {};
    for (const ch of rows) {
      out[ch.id] = {
        id: ch.id,
        kind: ch.kind,
        ownerId: ch.ownerId,
        name: ch.name,
        color: ch.color,
        active: ch.active,
        portrait: ch.sheet.portrait ?? null,
        ca: ch.sheet.ca,
        sub: "",
        initiativeBonus: ch.sheet.initiativeBonus,
        pv: ch.pv,
        pvMax: ch.pvMax,
        pvTemp: ch.pvTemp,
        conditions: ch.conditions,
      };
    }
    return out;
  }

  /**
   * B5 : pousse aux joueurs le changement de visibilité d'un ou plusieurs PNJ
   * (fog, déplacement de pion, changement de carte…) — recalcule et renvoie la
   * carte complète (arbitrage §7 : coût réseau négligeable à cette échelle,
   * bien plus simple que des deltas de visibilité). `ids` par défaut = tous
   * les PNJ connus (fog/carte affectent potentiellement tout le monde).
   */
  private async broadcastPnjVisibility(ids?: string[]): Promise<void> {
    const targets = ids ?? [...this.npcIds];
    if (targets.length === 0) return;
    const cards = await this.loadCharacterCards(targets);
    const patch: Record<string, CharacterCard | null> = {};
    for (const id of targets) patch[id] = cards[id] ?? null;
    this.broadcastRoleAware({ characters: patch });
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

  /** Variante de patchState qui débounce l'écriture storage (audit P2) —
   *  réservée à token.move : la diffusion reste immédiate, seule la
   *  persistance est différée (un pion mal persisté après un crash est sans
   *  gravité ; une écriture DO par frame ne l'est pas). */
  private patchStateInMemory(patch: Partial<LiveState>): LiveState {
    const state = this.liveState ?? defaultLiveState();
    this.liveState = { ...state, ...patch };
    this.tokenPersistDirty = true;
    if (!this.tokenPersistTimer) {
      this.tokenPersistTimer = setTimeout(() => {
        this.tokenPersistTimer = null;
        void this.flushTokenPersist();
      }, TOKEN_PERSIST_DEBOUNCE_MS);
    }
    return this.liveState;
  }

  private async flushTokenPersist(): Promise<void> {
    if (this.tokenPersistTimer) {
      clearTimeout(this.tokenPersistTimer);
      this.tokenPersistTimer = null;
    }
    if (!this.tokenPersistDirty || !this.liveState) return;
    this.tokenPersistDirty = false;
    await this.ctx.storage.put("liveState", this.liveState);
  }

  /** Compteur à fenêtre glissante par utilisateur (audit S1). `isMove` selects
   *  le budget déplacement, plus large mais toujours borné. */
  private isRateLimited(userId: string, isMove = false): boolean {
    const now = Date.now();
    const store = isMove ? this.rateLimitMoveHits : this.rateLimitHits;
    const max = isMove ? RATE_LIMIT_MAX_MOVES : RATE_LIMIT_MAX_MESSAGES;
    const hits = (store.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    hits.push(now);
    store.set(userId, hits);
    return hits.length > max;
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

    // Plafond de sockets par utilisateur (audit S1) : borne le coût d'un
    // membre qui ouvrirait autant de connexions qu'il veut sur la même table.
    if (userId) {
      const existing = this.ctx.getWebSockets().filter((ws) => {
        const att = ws.deserializeAttachment() as WsAttachment | null;
        return att?.userId === userId;
      }).length;
      if (existing >= MAX_SOCKETS_PER_USER) {
        return new Response("Trop de connexions simultanées", { status: 429 });
      }
    }

    this.campaignId = campaignId;
    await this.ctx.storage.put("campaignId", campaignId);

    const pair = new WebSocketPair();
    const client = pair[0] as WebSocket;
    const server = pair[1] as WebSocket;

    this.ctx.acceptWebSocket(server);

    const attachment: WsAttachment = { userId, name, role, charId, color };
    server.serializeAttachment(attachment);

    // L'upgrade (101) part IMMÉDIATEMENT. Le snapshot (plusieurs lectures D1)
    // est construit après : un handshake lent pendant un cold start multi-connect
    // faisait échouer la connexion (interruption au chargement de la page).
    void this.afterUpgrade(server, attachment).catch(() => {
      /* le client se reconnecte ; le prochain snapshot passera */
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Snapshot envoyé juste après l'upgrade (non bloquant pour le 101). */
  private async afterUpgrade(ws: WebSocket, att: WsAttachment): Promise<void> {
    const snapshot = await this.buildSnapshot(att.role, att.charId);
    try {
      ws.send(JSON.stringify({ type: "snapshot", ...snapshot }));
    } catch {
      /* socket fermée entre-temps */
    }
    this.broadcastPresence();
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
    // S2 : borne la taille BRUTE avant tout parse — un message de plusieurs
    // Mo ne doit pas être décodé/parsé en mémoire dans le DO.
    const rawLength = typeof message === "string" ? message.length : message.byteLength;
    if (rawLength > MAX_RAW_MESSAGE_BYTES) return;

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
    await this.ensureLegacyJournalImport();

    // A3 : tout payload est revalidé par le schéma partagé (bornes, types,
    // defaults) avant traitement — plus aucun cast manuel dans les handlers.
    const parsed = clientMessageSchema.safeParse(msg);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join(".") ?? "";
      ws.send(
        JSON.stringify({
          type: "error",
          code: "INVALID",
          msg: `${path ? `${path} : ` : ""}${issue?.message ?? "Message invalide"}`,
        }),
      );
      return;
    }

    // S1 : compteur à fenêtre glissante par utilisateur — un membre qui boucle
    // sur chat.say ne doit pas pouvoir saturer D1/le broadcast. Le déplacement
    // (drag de pion) a son propre budget, sinon un usage normal le fait tomber.
    const rawType = msg.type;
    const isMoveMsg =
      rawType === "token.move" || rawType === "marker.move" || rawType === "fog.reveal";
    if (this.isRateLimited(attachment.userId, isMoveMsg)) {
      ws.send(
        JSON.stringify({ type: "error", code: "RATE_LIMITED", msg: "Trop de messages, ralentis" }),
      );
      return;
    }

    try {
      const m = parsed.data;
      switch (m.type) {
        case "chat.say":
          await this.handleChatSay(ws, attachment, m.text);
          break;
        case "dice.roll":
          await this.handleDiceRoll(ws, attachment, m);
          break;
        case "char.hp":
          await this.handleCharHp(ws, attachment, m);
          break;
        case "char.condition":
          await this.handleCharCondition(ws, attachment, m);
          break;
        case "token.move":
          await this.handleTokenMove(ws, attachment, m);
          break;
        case "token.put":
          await this.handleTokenPut(ws, attachment, m);
          break;
        case "token.remove":
          await this.handleTokenRemove(ws, attachment, m);
          break;
        case "npc.duplicate":
          await this.handleNpcDuplicate(ws, attachment, m);
          break;
        case "npc.addFromTemplate":
          await this.handleNpcAddFromTemplate(ws, attachment, m);
          break;
        case "npc.saveAsTemplate":
          await this.handleNpcSaveAsTemplate(ws, attachment, m);
          break;
        case "npc.add":
          await this.handleNpcAdd(ws, attachment, m);
          break;
        case "npc.remove":
          await this.handleNpcRemove(ws, attachment, m);
          break;
        case "map.select":
          await this.handleMapSelect(ws, attachment, m);
          break;
        case "marker.set":
          await this.handleMarkerSet(ws, attachment, m);
          break;
        case "marker.move":
          await this.handleMarkerMove(ws, attachment, m);
          break;
        case "marker.remove":
          await this.handleMarkerRemove(ws, attachment, m);
          break;
        case "marker.clear":
          await this.handleMarkerClear(ws, attachment);
          break;
        case "fog.enable":
          await this.handleFogEnable(ws, attachment);
          break;
        case "fog.reveal":
          await this.handleFogReveal(ws, attachment, m);
          break;
        case "fog.cover":
          await this.handleFogCover(ws, attachment);
          break;
        case "fog.disable":
          await this.handleFogDisable(ws, attachment);
          break;
        case "inv.add":
          await this.handleInvAdd(ws, attachment, m);
          break;
        case "inv.drop":
          await this.handleInvDrop(ws, attachment, m);
          break;
        case "inv.give":
          await this.handleInvGive(ws, attachment, m);
          break;
        case "ping":
          this.handlePing(attachment, m);
          break;
        case "mode.set":
          await this.handleModeSet(ws, attachment, m);
          break;
        case "initiative.roll":
          await this.handleInitiativeRoll(ws, attachment, m);
          break;
        case "combat.next":
          await this.handleCombatNext(ws, attachment);
          break;
        default:
          // inv.* (phase 7) : validés mais non câblés — même réponse qu'avant.
          ws.send(
            JSON.stringify({
              type: "error",
              code: "NOT_IMPLEMENTED",
              msg: "Bientôt disponible",
            }),
          );
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
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // Le socket est déjà fermé ici : rappeler close() avec un code réservé
    // (1005/1006, fermetures navigateur) lève une InvalidAccessError.
    // Flush immédiat de la persistance débouncée (audit P2) : ne pas perdre
    // la dernière position d'un pion si plus personne ne bouge après ça.
    await this.flushTokenPersist();
    this.broadcastPresence();
  }

  override async webSocketError(_ws: WebSocket): Promise<void> {
    // Best practice hibernation : un socket en erreur part sans webSocketClose ;
    // on rafraîchit la présence pour que la liste ne garde pas un fantôme.
    this.broadcastPresence();
  }

  /**
   * RPC REST : le MJ partage une fiche du compendium au journal de la table.
   * Enregistre la fiche dans compendium_shares (les joueurs pourront
   * l'ouvrir malgré visibility:"mj") + une entrée de journal « share ».
   */
  async shareCompendium(input: {
    category: string;
    slug: string;
    title: string;
    sharedBy: string;
  }): Promise<void> {
    await this.ensureCampaignId();
    if (!this.campaignId) return;
    const db = this.getDb();
    await db
      .insert(schema.compendiumShares)
      .values({
        campaignId: this.campaignId,
        category: input.category,
        slug: input.slug,
      })
      .onConflictDoNothing();
    const entry = this.makeJournalEntry("share", input.sharedBy, null, input.title);
    entry.ref = {
      type: "compendium",
      category: input.category,
      slug: input.slug,
      title: input.title,
    };
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
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

    // La carte part NON masquée : broadcastRoleAware masque les PV des PNJ
    // pour les joueurs (filterCharactersForPlayers) — sinon le MJ recevrait
    // aussi pv:null (double masquage, testé en intégration).
    const card: CharacterCard = {
      id: ch.id,
      kind: ch.kind,
      ownerId: ch.ownerId,
      name: ch.name,
      color: ch.color,
      active: ch.active,
      portrait: ch.sheet.portrait ?? null,
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
    };
    this.broadcastRoleAware({ characters: { [charId]: card } });
    // Le sac a pu changer en REST (fiche, etc.) : on le repousse filtré.
    await this.broadcastInventories();
  }

  /**
   * RPC appelé par DELETE /api/maps/:id (audit B7) : purge les pions, repères
   * et le brouillard de la carte supprimée. Si c'était la carte active, la
   * table repasse sur « aucune carte » (le client remplace sa vue, mapId
   * présent dans le patch).
   */
  async cleanupMap(mapId: string): Promise<void> {
    await this.ensureCampaignId();
    const state = await this.getState();
    const key = this.mapKey(mapId);
    if (!state.tokensByMap[key] && !state.markersByMap[key] && !state.fog[key]) {
      if (state.mapId !== mapId) return; // rien à nettoyer
    }
    const tokensByMap = { ...state.tokensByMap };
    const markersByMap = { ...state.markersByMap };
    const fog = { ...state.fog };
    delete tokensByMap[key];
    delete markersByMap[key];
    delete fog[key];
    const mapIdActive = state.mapId === mapId ? null : state.mapId;
    await this.patchState({ mapId: mapIdActive, tokensByMap, markersByMap, fog });
    if (mapIdActive === null && this.ctx.getWebSockets().length > 0) {
      this.broadcastRoleAware({ mapId: null, tokens: {}, markers: [] });
    }
  }

  // ── Handlers : chat & dés ─────────────────────────────────────

  private async handleChatSay(ws: WebSocket, att: WsAttachment, text: string) {
    if (!text?.trim()) return;
    const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);

    if (isScoresCommand(trimmed)) {
      await this.handleScoresRoll(att);
      return;
    }

    const diceParsed = parseDiceCommand(trimmed);
    if (diceParsed) {
      await this.executeDiceRoll(
        ws,
        att,
        diceParsed.n,
        diceParsed.sides,
        diceParsed.mod,
        trimmed,
        diceParsed.drop,
      );
      return;
    }

    const entry = this.makeJournalEntry("say", att.name ?? null, att.color, trimmed);
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
  }

  private async handleDiceRoll(ws: WebSocket, att: WsAttachment, msg: DiceRollMsg) {
    const { n, sides, mod, drop } = msg;
    const label = msg.label || undefined;
    const expr = label ?? formatExpression({ n, sides, mod, drop });
    await this.executeDiceRoll(ws, att, n, sides, mod, expr, drop);
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

  /** 6 × (4d6 biffer le plus bas), en une seule ligne de journal — jets de création. */
  private async handleScoresRoll(att: WsAttachment) {
    const rng = this.makeRng();
    const scores: number[] = [];
    for (let i = 0; i < 6; i++) {
      scores.push(rollDice(4, 6, 0, rng, 1).total);
    }
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `✦ ${att.name} lance ses caracs (4d6, dé le plus bas retiré) : ${formatScoresSummary(scores)}.`,
    );
    await this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
  }

  private async executeDiceRoll(
    ws: WebSocket,
    att: WsAttachment,
    n: number,
    sides: number,
    mod: number,
    expr: string,
    drop = 0,
  ) {
    const roll = rollDice(n, sides, mod, this.makeRng(), drop);
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

  private async handleCharHp(ws: WebSocket, att: WsAttachment, msg: CharHpMsg) {
    const { charId, delta } = msg;
    if (delta === 0) return;

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

    // Les PV temporaires absorbent les dégâts avant les PV réels (audit B3).
    const { pv: newPv, pvTemp: newPvTemp } = applyDamage(char.pv, char.pvTemp, char.pvMax, delta);

    await db
      .update(schema.characters)
      .set({ pv: newPv, pvTemp: newPvTemp, updatedAt: new Date() })
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      );

    if (newPv === 0 && char.pv > 0) {
      // B5 : ne pas nommer un PNJ non révélé dans le journal des joueurs.
      const visibility = this.journalVisibilityFor(charId);
      const entry = this.makeJournalEntry("system", null, null, `✦ ${char.name} tombe à 0 PV !`);
      this.appendJournal(entry, visibility);
      this.broadcastJournal(entry, visibility);
    }

    this.broadcastRoleAware({
      characters: { [charId]: { pv: newPv, pvMax: char.pvMax, pvTemp: newPvTemp } },
    });
  }

  private async handleCharCondition(ws: WebSocket, att: WsAttachment, msg: CharConditionMsg) {
    if (att.role !== "mj") return;
    const { charId, cond, on } = msg;

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

    const visibility = this.journalVisibilityFor(charId);
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `✦ ${char.name} ${on ? "gagne" : "perd"} l'état ${cond}.`,
    );
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
    this.broadcastRoleAware({ characters: { [charId]: { conditions } } });
  }

  private async handleNpcAdd(ws: WebSocket, att: WsAttachment, msg: NpcAddMsg) {
    if (att.role !== "mj") return;
    const name = (msg.name.trim() || "PNJ").slice(0, 80);
    const { pv, ca, init, saveAsTemplate } = msg;
    const x = msg.x ?? null;
    const y = msg.y ?? null;

    await this.ensureNpcIds();
    const db = this.getDb();
    const id = crypto.randomUUID();
    const sheet = createSheet({ identite: { nom: name }, pvMax: pv, ca, initiativeBonus: init });

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
    if (saveAsTemplate) {
      await db.insert(schema.npcTemplates).values({
        id: crypto.randomUUID(),
        campaignId: this.campaignId,
        name,
        ca,
        pvMax: pv,
        initBonus: init,
        color: "#C0392B",
        conditions: [],
        notes: "",
        source: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const card: CharacterCard = {
      id,
      kind: "pnj",
      ownerId: null,
      name,
      color: "#C0392B",
      active: true,
      portrait: null,
      ca,
      sub: "",
      initiativeBonus: init,
      pv,
      pvMax: pv,
      pvTemp: 0,
      conditions: [],
    };

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

    // B5 : le journal ne nomme le PNJ que s'il est (ou devient) visible.
    const visibility = this.journalVisibilityFor(id);
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `✦ Le MJ ajoute ${name} sur la carte.`,
    );
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
    this.broadcastRoleAware(patch);
  }

  /** Pose n instances d'un modèle de la bibliothèque MJ sur la carte active. */
  private async handleNpcAddFromTemplate(
    _ws: WebSocket,
    att: WsAttachment,
    msg: NpcAddFromTemplateMsg,
  ) {
    if (att.role !== "mj") return;
    const { templateId, x, y, count } = msg;

    const state = await this.getState();
    if (!state.mapId) return;

    const db = this.getDb();
    const [tpl] = await db
      .select()
      .from(schema.npcTemplates)
      .where(
        and(
          eq(schema.npcTemplates.id, templateId),
          eq(schema.npcTemplates.campaignId, this.campaignId),
        ),
      )
      .limit(1);
    if (!tpl) return;

    await this.ensureNpcIds();
    const tokens = { ...this.tokensOf(state) };
    const charactersPatch: Record<string, CharacterCard> = {};
    const ids: string[] = [];

    for (let i = 0; i < count; i++) {
      const name = count > 1 ? `${tpl.name} ${String.fromCharCode(65 + i)}` : tpl.name;
      const id = crypto.randomUUID();
      const sheet = createSheet({
        identite: { nom: name },
        pvMax: tpl.pvMax,
        ca: tpl.ca,
        initiativeBonus: tpl.initBonus,
      });

      await db.insert(schema.characters).values({
        id,
        campaignId: this.campaignId,
        ownerId: null,
        kind: "pnj",
        name,
        color: tpl.color,
        active: true,
        sheet,
        pv: tpl.pvMax,
        pvMax: tpl.pvMax,
        pvTemp: 0,
        conditions: [...tpl.conditions],
      });
      this.npcIds.add(id);
      ids.push(id);
      tokens[id] = { charId: id, x: this.clamp(x + i * 4), y: this.clamp(y + i * 3) };
      charactersPatch[id] = {
        id,
        kind: "pnj",
        ownerId: null,
        name,
        color: tpl.color,
        active: true,
        portrait: null,
        ca: tpl.ca,
        sub: "",
        initiativeBonus: tpl.initBonus,
        pv: tpl.pvMax,
        pvMax: tpl.pvMax,
        pvTemp: 0,
        conditions: [...tpl.conditions],
      };
    }

    await this.patchState(this.patchTokens(state, tokens));

    // B5 : « all » si au moins une des instances posées est visible, sinon « mj ».
    const visibility = ids.some((id) => this.journalVisibilityFor(id) === "all") ? "all" : "mj";
    const label = count > 1 ? `${tpl.name} ×${count}` : tpl.name;
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `\u2726 Le MJ pose ${label}.`,
    );
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
    this.broadcastRoleAware({ characters: charactersPatch, tokens });

    for (const id of ids) {
      if (state.mode === "combat" && state.combat && tpl.pvMax > 0) {
        await this.addLateParticipant(id, tpl.initBonus);
      }
    }
  }

  /** Enregistre un PNJ posé (état courant : PV, états…) comme modèle. */
  private async handleNpcSaveAsTemplate(
    _ws: WebSocket,
    att: WsAttachment,
    msg: NpcSaveAsTemplateMsg,
  ) {
    if (att.role !== "mj") return;
    const charId = msg.charId;

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

    const [existing] = await db
      .select({ id: schema.npcTemplates.id })
      .from(schema.npcTemplates)
      .where(
        and(
          eq(schema.npcTemplates.campaignId, this.campaignId),
          eq(schema.npcTemplates.name, char.name),
        ),
      )
      .limit(1);
    if (existing) {
      _ws.send(
        JSON.stringify({
          type: "error",
          code: "EXISTS",
          msg: `Un modèle « ${char.name} » existe déjà.`,
        }),
      );
      return;
    }

    const now = new Date();
    await db.insert(schema.npcTemplates).values({
      id: crypto.randomUUID(),
      campaignId: this.campaignId,
      name: char.name,
      ca: char.sheet.ca,
      pvMax: char.pvMax,
      initBonus: char.sheet.initiativeBonus,
      color: char.color,
      conditions: [...char.conditions],
      notes: "",
      source: null,
      createdAt: now,
      updatedAt: now,
    });
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
        [charId]: this.nextRollIndex(state.combat.rollIndex),
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
    this.broadcastRoleAware({ combat });
  }

  /** Index de jet suivant : 1 + max (jamais de collision après un retrait). */
  private nextRollIndex(rollIndex: Record<string, number>): number {
    const values = Object.values(rollIndex);
    return values.length > 0 ? Math.max(...values) + 1 : 0;
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

  private async handleNpcRemove(ws: WebSocket, att: WsAttachment, msg: NpcRemoveMsg) {
    if (att.role !== "mj") return;
    const charId = msg.charId;

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

    // B5 : visibilité calculée AVANT suppression (npcIds/tokens encore intacts).
    await this.getState();
    const visibility = this.journalVisibilityFor(charId);

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
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
    this.broadcastRoleAware({
      characters: { [charId]: null },
      tokens: { [charId]: null },
      ...(combatPatch !== undefined ? { combat: combatPatch } : {}),
    });
  }

  // ── Handlers : carte, pions ─────────────────────────────────────

  private clamp(v: number): number {
    if (!Number.isFinite(v)) return 50;
    return Math.max(2, Math.min(98, v));
  }

  private async handleTokenMove(_ws: WebSocket, att: WsAttachment, msg: TokenMoveMsg) {
    const { tokenId, x, y } = msg;
    if (att.role !== "mj" && tokenId !== att.charId) return;

    const cx = this.clamp(x);
    const cy = this.clamp(y);

    const state = await this.getState();
    const current = this.tokensOf(state);
    if (!current[tokenId]) return;
    // B5/perf : la carte d'un PNJ n'est ré-poussée que si sa VISIBILITÉ change
    // réellement. Bouger un pion dans le même état de brouillard ne change rien
    // pour les joueurs — et surtout, cela évitait un SELECT D1 par message
    // (soit ~30-60 requêtes par seconde pour un simple glisser).
    const wasVisible = this.isCharVisibleToPlayers(tokenId, state);
    const tokens = { ...current, [tokenId]: { charId: tokenId, x: cx, y: cy } };
    // P2 : la diffusion reste immédiate, la persistance est débouncée (60-120
    // messages/s en drag ne doivent pas écrire le storage à chaque frame).
    const after = this.patchStateInMemory(this.patchTokens(state, tokens));
    this.broadcastRoleAware({ tokens: { [tokenId]: tokens[tokenId]! } });
    if (this.npcIds.has(tokenId) && this.isCharVisibleToPlayers(tokenId, after) !== wasVisible) {
      await this.broadcastPnjVisibility([tokenId]);
    }
  }

  /** Le MJ place un personnage (PJ ou PNJ) sur la carte active. */
  private async handleTokenPut(_ws: WebSocket, att: WsAttachment, msg: TokenPutMsg) {
    if (att.role !== "mj") return;
    const { charId, x, y } = msg;

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
    if (this.npcIds.has(charId)) await this.broadcastPnjVisibility([charId]);
  }

  /** Retire le pion de la carte active sans supprimer le personnage. */
  private async handleTokenRemove(_ws: WebSocket, att: WsAttachment, msg: TokenRemoveMsg) {
    if (att.role !== "mj") return;
    const charId = msg.charId;

    const state = await this.getState();
    const current = this.tokensOf(state);
    if (!current[charId]) return;

    const { [charId]: _drop, ...rest } = current;
    await this.patchState(this.patchTokens(state, rest));
    this.broadcastRoleAware({ tokens: { [charId]: null } });
    if (this.npcIds.has(charId)) await this.broadcastPnjVisibility([charId]);
  }

  /** Nom de la copie suivante : Gobelin → Gobelin B → Gobelin C… */
  private nextCopyName(name: string): string {
    const m = /^(.*\s)([A-Z])$/.exec(name);
    if (m && m[2]! < "Z") {
      return m[1]! + String.fromCharCode(m[2]!.charCodeAt(0) + 1);
    }
    return name + " B";
  }

  private async handleNpcDuplicate(_ws: WebSocket, att: WsAttachment, msg: NpcDuplicateMsg) {
    if (att.role !== "mj") return;
    const charId = msg.charId;

    const state = await this.getState();
    const source = this.tokensOf(state)[charId];

    const db = this.getDb();
    const [src] = await db
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
    if (!src) return;

    const newName = this.nextCopyName(src.name);
    const id = crypto.randomUUID();
    const sheet = { ...src.sheet, identite: { ...src.sheet.identite, nom: newName } };

    await db.insert(schema.characters).values({
      id,
      campaignId: this.campaignId,
      ownerId: null,
      kind: "pnj",
      name: newName,
      color: src.color,
      active: true,
      sheet,
      pv: src.pv,
      pvMax: src.pvMax,
      pvTemp: src.pvTemp,
      conditions: [...src.conditions],
    });
    this.npcIds.add(id);

    const card: CharacterCard = {
      id,
      kind: "pnj",
      ownerId: null,
      name: newName,
      color: src.color,
      active: true,
      portrait: src.sheet.portrait ?? null,
      ca: src.sheet.ca,
      sub: "",
      initiativeBonus: src.sheet.initiativeBonus,
      pv: src.pv,
      pvMax: src.pvMax,
      pvTemp: src.pvTemp,
      conditions: [...src.conditions],
    };

    const patch: Record<string, unknown> = { characters: { [id]: card } };
    if (source && state.mapId) {
      const tokens = {
        ...this.tokensOf(state),
        [id]: { charId: id, x: this.clamp(source.x + 5), y: this.clamp(source.y + 5) },
      };
      await this.patchState(this.patchTokens(state, tokens));
      patch.tokens = { [id]: tokens[id] };

      if (state.mode === "combat" && state.combat && src.pv > 0) {
        await this.addLateParticipant(id, src.sheet.initiativeBonus);
      }
    }

    // B5 : visibilité de la SOURCE (c'est son nom qui est révélé).
    const visibility = this.journalVisibilityFor(charId);
    const entry = this.makeJournalEntry(
      "system",
      att.name ?? null,
      att.color,
      `✦ Le MJ duplique ${src.name}.`,
    );
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
    this.broadcastRoleAware(patch);
  }

  private async handleMapSelect(ws: WebSocket, att: WsAttachment, msg: MapSelectMsg) {
    if (att.role !== "mj") return;
    const mapId = msg.mapId;

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
    // B5 : changer de carte change tout le jeu de PNJ visibles/masqués.
    await this.broadcastPnjVisibility();
  }

  private async handleMarkerSet(ws: WebSocket, att: WsAttachment, msg: MarkerSetMsg) {
    if (att.role !== "mj") return;
    const { x, y } = msg;
    const text = (msg.text.trim() || "repère").slice(0, 200);

    const state = await this.getState();
    const id = msg.id || crypto.randomUUID();
    const marker: Marker = { id, x: this.clamp(x), y: this.clamp(y), text };
    const markers = [...this.markersOf(state), marker];
    await this.patchState(this.patchMarkers(state, markers));
    this.broadcastAll({ type: "delta", patch: { markers } });
  }

  private async handleMarkerMove(ws: WebSocket, att: WsAttachment, msg: MarkerMoveMsg) {
    if (att.role !== "mj") return;
    const { id, x, y } = msg;

    const state = await this.getState();
    const markers = this.markersOf(state).map((m) =>
      m.id === id ? { ...m, x: this.clamp(x), y: this.clamp(y) } : m,
    );
    // Comme les pions : persistance débouncée (c'était un storage.put complet
    // par message de drag), diffusion immédiate.
    this.patchStateInMemory(this.patchMarkers(state, markers));
    this.broadcastAll({ type: "delta", patch: { markers } });
  }

  private async handleMarkerRemove(ws: WebSocket, att: WsAttachment, msg: MarkerRemoveMsg) {
    if (att.role !== "mj") return;
    const id = msg.id;

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
    await this.broadcastPnjVisibility(); // B5 : (re)masque les PNJ de la carte active
  }

  private async handleFogReveal(ws: WebSocket, att: WsAttachment, msg: FogRevealMsg) {
    if (att.role !== "mj") return;
    const state = await this.getState();
    if (!state.mapId) return;
    const current = state.fog[state.mapId];
    if (!current || !current.on) return;
    const x = this.clamp(msg.x);
    const y = this.clamp(msg.y);

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
    await this.broadcastPnjVisibility(); // B5 : ce point a pu révéler un PNJ
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
    this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastRoleAware({ fog });
    await this.broadcastPnjVisibility(); // B5 : recouvrir masque tous les PNJ de la carte
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
    this.appendJournal(entry);
    this.broadcastAll({ type: "journal", entry });
    this.broadcastRoleAware({ fog });
    await this.broadcastPnjVisibility(); // B5 : plus de brouillard = tous les PNJ visibles
  }

  // ── Inventaire & échanges (R9) ───────────────────────────────
  // Les sacs sont PRIVÉS (R9.1) : un joueur ne reçoit que le sien, le MJ tous.
  // Ils ne voyagent donc jamais dans CharacterCard (diffusé à tous) mais dans un
  // message « inv » filtré socket par socket.
  //
  // Atomicité (R9.5) : handleWsMessage sérialise toutes les mutations via
  // mutationChain, donc le cycle lecture→calcul→écriture de deux sacs ne peut
  // pas être entrelacé par un autre message : pas de duplication ni de perte.

  private async loadInv(
    charId: string,
  ): Promise<{ inv: Inventory; name: string; kind: string } | null> {
    const db = this.getDb();
    const [ch] = await db
      .select({
        name: schema.characters.name,
        kind: schema.characters.kind,
        inv: schema.characters.inventory,
      })
      .from(schema.characters)
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      )
      .limit(1);
    if (!ch) return null;
    return { inv: normalizeInventory(ch.inv), name: ch.name, kind: ch.kind };
  }

  private async saveInv(charId: string, inv: Inventory): Promise<void> {
    await this.getDb()
      .update(schema.characters)
      .set({ inventory: inv, updatedAt: new Date() })
      .where(
        and(eq(schema.characters.id, charId), eq(schema.characters.campaignId, this.campaignId)),
      );
  }

  /** Pousse les sacs visibles à chaque socket (MJ : tous, joueur : le sien). */
  private async broadcastInventories(): Promise<void> {
    const rows = await this.getDb()
      .select({ id: schema.characters.id, inv: schema.characters.inventory })
      .from(schema.characters)
      .where(eq(schema.characters.campaignId, this.campaignId));
    const all: Record<string, Inventory> = {};
    for (const r of rows) all[r.id] = normalizeInventory(r.inv);

    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (!att) continue;
      const inventories: Record<string, Inventory> = {};
      if (att.role === "mj") {
        Object.assign(inventories, all);
      } else if (att.charId && all[att.charId]) {
        inventories[att.charId] = all[att.charId]!;
      }
      try {
        ws.send(JSON.stringify({ type: "inv", inventories }));
      } catch {
        /* socket fermée */
      }
    }
  }

  /** Un mouvement est public seulement si TOUS les personnages nommés sont
   *  visibles aux joueurs (B5) : sinon l'entrée reste « mj ». */
  private invVisibility(charIds: string[]): "all" | "mj" {
    return charIds.every((id) => this.journalVisibilityFor(id) === "all") ? "all" : "mj";
  }

  private async journalInv(charIds: string[], text: string, att: WsAttachment): Promise<void> {
    const visibility = this.invVisibility(charIds);
    const entry = this.makeJournalEntry("system", att.name ?? null, att.color, text);
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
  }

  /** MJ uniquement : conjure / dépose N × un objet dans un sac. */
  private async handleInvAdd(ws: WebSocket, att: WsAttachment, msg: InvAddMsg) {
    if (att.role !== "mj") return;
    const target = await this.loadInv(msg.charId);
    if (!target) return;
    const inv = addItem(target.inv, msg.item.trim(), msg.qty);
    await this.saveInv(msg.charId, inv);
    await this.journalInv(
      [msg.charId],
      `✦ Le MJ ajoute ${msg.qty > 1 ? `${msg.qty} × ` : ""}${msg.item.trim()} à ${target.name}.`,
      att,
    );
    await this.broadcastInventories();
  }

  /** MJ ou propriétaire : jette ×1 un objet de son sac. */
  private async handleInvDrop(ws: WebSocket, att: WsAttachment, msg: InvDropMsg) {
    if (att.role !== "mj" && msg.charId !== att.charId) return;
    const target = await this.loadInv(msg.charId);
    if (!target) return;
    // Le nom canonique sert au journal : « potion de soin » et « Potion de
    // soin » désignent le même objet, le journal doit donc écrire pareil.
    const stored = target.inv.items.find((i) => i.name.toLowerCase() === msg.item.toLowerCase());
    if (!stored) return;
    let inv: Inventory;
    try {
      inv = removeItem(target.inv, msg.item);
    } catch {
      return;
    }
    await this.saveInv(msg.charId, inv);
    await this.journalInv([msg.charId], `✦ ${target.name} jette ${stored.name}.`, att);
    await this.broadcastInventories();
  }

  /** MJ, ou propriétaire de `from` : donne de l'argent ou ×1 objet à un autre PJ. */
  private async handleInvGive(ws: WebSocket, att: WsAttachment, msg: InvGiveMsg) {
    if (att.role !== "mj" && msg.from !== att.charId) return;
    if (msg.from === msg.to) return;
    const [from, to] = await Promise.all([this.loadInv(msg.from), this.loadInv(msg.to)]);
    if (!from || !to) return;

    let nextFrom: Inventory;
    let nextTo: Inventory;
    let text: string;
    try {
      if (msg.kind === "money" && msg.money) {
        const [mFrom, mTo] = transferMoney(from.inv.money, to.inv.money, msg.money);
        nextFrom = { ...from.inv, money: mFrom };
        nextTo = { ...to.inv, money: mTo };
        text = `✦ ${from.name} donne ${formatMoney(msg.money)} à ${to.name}.`;
      } else if (msg.item) {
        const stored = from.inv.items.find((i) => i.name.toLowerCase() === msg.item!.toLowerCase());
        if (!stored) return;
        [nextFrom, nextTo] = transferItem(from.inv, to.inv, msg.item);
        text = `✦ ${from.name} donne ${stored.name} à ${to.name}.`;
      } else {
        return;
      }
    } catch {
      return;
    }

    await this.saveInv(msg.from, nextFrom);
    await this.saveInv(msg.to, nextTo);
    await this.journalInv([msg.from, msg.to], text, att);
    await this.broadcastInventories();
  }

  private handlePing(att: WsAttachment, msg: PingMsg) {
    const x = this.clamp(msg.x);
    const y = this.clamp(msg.y);
    this.broadcastAll({ type: "ping", x, y });
  }

  private async handleModeSet(ws: WebSocket, att: WsAttachment, msg: ModeSetMsg) {
    if (att.role !== "mj") return;
    const mode = msg.mode;
    if (mode === "combat") {
      const state = await this.getState();
      const db = this.getDb();
      const charRows = await db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.campaignId, this.campaignId));

      // R8.1 : participants = actif, pion sur la carte active ET pv > 0 (audit
      // B6 : un PJ désactivé qui garde un pion n'entrait pas dans le filtre).
      const participants = charRows
        .filter((c) => c.active && c.pv > 0 && !!this.tokensOf(state)[c.id])
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
      this.broadcastRoleAware({ mode: "combat", combat });
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
      this.broadcastRoleAware({ mode: "exploration", combat: null });
    }
  }

  private async handleInitiativeRoll(ws: WebSocket, att: WsAttachment, msg: InitiativeRollMsg) {
    const charId = msg.charId;

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

    const visibility = this.journalVisibilityFor(charId);
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
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
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
      rollIndex: { ...combat.rollIndex, [charId]: this.nextRollIndex(combat.rollIndex) },
    };

    if (newCombat.participants.every((id) => newCombat.scores[id] !== undefined)) {
      newCombat = await this.finalizeInitiative(newCombat);
    }

    await this.patchState({ combat: newCombat });
    this.broadcastRoleAware({ combat: newCombat });
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
    // B5 : si un des participants nommés est un PNJ non révélé, l'annonce
    // complète (qui donne l'ordre ET les scores de tous) reste réservée au MJ.
    const visibility = order.every((e) => this.journalVisibilityFor(e.id) === "all") ? "all" : "mj";
    const entry = this.makeJournalEntry(
      "system",
      null,
      null,
      `✦ Initiative complète : ${summary}. C'est à ${order[0]?.name ?? "?"} !`,
    );
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
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
    const visibility = this.journalVisibilityFor(activeId);
    const entry = this.makeJournalEntry(
      "system",
      null,
      null,
      `✦ C'est au tour de ${activeChar?.name ?? "?"}${turn === 0 ? ` — round ${round}` : ""}.`,
    );
    this.appendJournal(entry, visibility);
    this.broadcastJournal(entry, visibility);
    this.broadcastRoleAware({ combat: newCombat });
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
    // B5 : combat filtré côté joueurs (participants/order/scores/rollIndex).
    const hasCombat = patch.combat !== undefined;
    const playerCombat =
      hasCombat && this.liveState
        ? this.filterCombatForPlayers(patch.combat as CombatState | null, this.liveState)
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
          ...(hasCombat ? { combat: playerCombat ?? null } : {}),
        };
      }
      try {
        ws.send(JSON.stringify({ type: "delta", patch: outPatch }));
      } catch {
        /* socket might be closed */
      }
    }
  }

  /** Diffuse une entrée de journal — « mj » ne part qu'aux sockets MJ (B5). */
  private broadcastJournal(entry: JournalEntry, visibility: "all" | "mj" = "all"): void {
    if (visibility === "all") {
      this.broadcastAll({ type: "journal", entry });
      return;
    }
    const data = JSON.stringify({ type: "journal", entry });
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (att?.role !== "mj") continue;
      try {
        ws.send(data);
      } catch {
        /* socket might be closed */
      }
    }
  }

  private async buildSnapshot(
    role: "mj" | "player",
    charId: string | null,
  ): Promise<{
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
    inventories: Record<string, Inventory>;
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
    // B5 : un joueur ne reçoit même pas la carte d'un PNJ non révélé, dès le
    // snapshot initial (sinon un simple rechargement de page rendait tous les
    // PNJ posés connus, révélés ou non).
    const characters: CharacterCard[] = charRows
      .filter((ch) => role === "mj" || this.isCharVisibleToPlayers(ch.id, state))
      .map((ch) => ({
        id: ch.id,
        kind: ch.kind,
        ownerId: ch.ownerId,
        name: ch.name,
        color: ch.color,
        active: ch.active,
        portrait: ch.sheet.portrait ?? null,
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
    const combat = role === "mj" ? state.combat : this.filterCombatForPlayers(state.combat, state);

    await this.ensureLegacyJournalImport();
    const journalTail = await this.getJournalTail(50, role);
    const presence = this.getPresence();

    // R9.1 : les sacs sont privés. Le MJ voit tous, un joueur seulement le sien.
    const inventories: Record<string, Inventory> = {};
    for (const ch of charRows) {
      if (role === "mj") inventories[ch.id] = normalizeInventory(ch.inventory);
      else if (charId && ch.id === charId) inventories[ch.id] = normalizeInventory(ch.inventory);
    }

    return {
      state: {
        mode: state.mode,
        mapId: state.mapId,
        tokens,
        markers: this.markersOf(state),
        fog: state.fog,
        combat,
      },
      characters,
      settings: campaign?.settings ?? DEFAULT_SETTINGS,
      journalTail,
      presence,
      inventories,
    };
  }

  // ── Journal (audit P3) ────────────────────────────────────────
  // Le journal vit dans le SQLite LOCAL du Durable Object (ctx.storage.sql) :
  // le DO est déjà sharding par campagne, donc pas besoin de campaign_id ici.
  // Latence quasi nulle, pas de facturation par ligne D1, et le filtre de
  // visibilité (B5) devient une clause WHERE locale au lieu d'un filtre après
  // lecture D1. L'ancienne table D1 `journal` est importée une fois (lazy,
  // voir ensureLegacyJournalImport) pour ne pas perdre l'historique existant.

  private ensureJournalTable(): void {
    if (this.journalReady) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        who TEXT,
        who_color TEXT,
        text TEXT NOT NULL,
        roll TEXT,
        ref TEXT,
        visibility TEXT NOT NULL DEFAULT 'all'
      )
    `);
    this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS journal_id_idx ON journal (id DESC)`);
    this.journalReady = true;
  }

  /** Importe une seule fois les lignes D1 existantes de cette campagne (si
   *  la table venait de l'ancienne version) — idempotent via un flag posé
   *  dans le storage du DO, persistant entre réveils. */
  private async ensureLegacyJournalImport(): Promise<void> {
    this.ensureJournalTable();
    if (this.journalImported) return;
    const imported = await this.ctx.storage.get<boolean>("journalImported");
    if (imported) {
      this.journalImported = true;
      return;
    }
    if (this.campaignId) {
      const db = this.getDb();
      const legacyRows = await db
        .select()
        .from(schema.journal)
        .where(eq(schema.journal.campaignId, this.campaignId))
        .orderBy(asc(schema.journal.id));
      for (const r of legacyRows) {
        this.ctx.storage.sql.exec(
          `INSERT INTO journal (ts, kind, who, who_color, text, roll, ref, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, 'all')`,
          r.ts,
          r.kind,
          r.who,
          r.whoColor,
          r.text,
          r.roll ? JSON.stringify(r.roll) : null,
          r.ref ? JSON.stringify(r.ref) : null,
        );
      }
    }
    await this.ctx.storage.put("journalImported", true);
    this.journalImported = true;
  }

  private rowToJournalEntry(r: Record<string, unknown>): JournalEntry {
    return {
      id: r.id as number,
      ts: r.ts as number,
      kind: r.kind as JournalEntry["kind"],
      who: r.who as string | null,
      whoColor: r.who_color as string | null,
      text: r.text as string,
      roll: r.roll ? (JSON.parse(r.roll as string) as JournalEntry["roll"]) : undefined,
      ref: r.ref ? (JSON.parse(r.ref as string) as JournalEntry["ref"]) : undefined,
    };
  }

  /** Fenêtre glissante (audit P3) : au-delà de JOURNAL_RETENTION_MAX lignes,
   *  les plus anciennes sont purgées. Vérifié à chaque écriture — table locale
   *  bornée, coût négligeable (scan d'index sur la clé primaire). */
  private trimJournal(): void {
    const row = this.ctx.storage.sql
      .exec<{ n: number }>(`SELECT COUNT(*) as n FROM journal`)
      .toArray()[0];
    const n = row?.n ?? 0;
    if (n > JOURNAL_RETENTION_MAX) {
      this.ctx.storage.sql.exec(
        `DELETE FROM journal WHERE id <= (SELECT id FROM journal ORDER BY id DESC LIMIT 1 OFFSET ?)`,
        JOURNAL_RETENTION_MAX - 1,
      );
    }
  }

  private getJournalTail(limit = 50, role: "mj" | "player" = "mj"): JournalEntry[] {
    this.ensureJournalTable();
    const rows =
      role === "mj"
        ? this.ctx.storage.sql
            .exec(`SELECT * FROM journal ORDER BY id DESC LIMIT ?`, limit)
            .toArray()
        : this.ctx.storage.sql
            .exec(`SELECT * FROM journal WHERE visibility != 'mj' ORDER BY id DESC LIMIT ?`, limit)
            .toArray();
    // Les N DERNIÈRES entrées, rendues en ordre chronologique.
    return rows.reverse().map((r) => this.rowToJournalEntry(r));
  }

  /** RPC : journal paginé pour GET /api/campaigns/:id/journal (B5 : visibility
   *  filtrée pour un joueur, des deux côtés — live ET reload). */
  async getJournalPage(opts: {
    role: "mj" | "player";
    limit?: number;
    before?: number;
  }): Promise<JournalPage> {
    await this.ensureCampaignId();
    await this.ensureLegacyJournalImport();
    const limit = opts.limit ?? 50;
    const visClause = opts.role === "mj" ? "" : "AND visibility != 'mj'";
    const rows =
      opts.before !== undefined
        ? this.ctx.storage.sql
            .exec(
              `SELECT * FROM journal WHERE id < ? ${visClause} ORDER BY id DESC LIMIT ?`,
              opts.before,
              limit + 1,
            )
            .toArray()
        : this.ctx.storage.sql
            .exec(
              `SELECT * FROM journal WHERE 1=1 ${visClause} ORDER BY id DESC LIMIT ?`,
              limit + 1,
            )
            .toArray();
    const hasMore = rows.length > limit;
    const entries = rows
      .slice(0, limit)
      .reverse()
      .map((r) => this.rowToJournalEntry(r));
    return { entries, hasMore };
  }

  /** RPC : purge complète (audit S5, suppression de campagne) — vide le
   *  storage du DO (liveState ET journal SQLite) et ferme les sockets. */
  async purgeAll(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.liveState = null;
    this.npcIds = new Set();
    this.npcIdsLoaded = false;
    this.cachedSettings = null;
    this.journalReady = false;
    this.journalImported = false;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "Campagne supprimée");
      } catch {
        /* déjà fermée */
      }
    }
  }

  private appendJournal(entry: JournalEntry, visibility: "all" | "mj" = "all"): void {
    this.ensureJournalTable();
    const row = this.ctx.storage.sql
      .exec<{ id: number }>(
        `INSERT INTO journal (ts, kind, who, who_color, text, roll, ref, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        entry.ts,
        entry.kind,
        entry.who,
        entry.whoColor,
        entry.text,
        entry.roll ? JSON.stringify(entry.roll) : null,
        entry.ref ? JSON.stringify(entry.ref) : null,
        visibility,
      )
      .one();
    entry.id = row.id;
    if (entry.id % 25 === 0) this.trimJournal();
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
