// ═══════════════════════════════════════════════════════════
// RollWith H&D — Protocole WebSocket (design §5)
// Messages client → serveur et serveur → client + snapshot.
// Type guards testés.
// ═══════════════════════════════════════════════════════════

import type { Money } from "./inventory";
import type { InitiativeEntry } from "./initiative";

export type Role = "mj" | "player";

export interface PresenceUser {
  userId: string;
  name: string;
  role: Role;
  charId: string | null;
}

export interface TokenPosition {
  x: number;
  y: number;
}

export interface TokenState {
  charId: string;
  x: number;
  y: number;
}

export interface Marker {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface FogState {
  on: boolean;
  reveals: { x: number; y: number }[];
}

export interface CombatState {
  phase: "init" | "run";
  participants: string[];
  scores: Record<string, number>;
  order: string[] | null;
  turn: number;
  round: number;
  rollIndex: Record<string, number>;
}

export interface TableLiveState {
  mode: "exploration" | "combat";
  mapId: string | null;
  tokens: Record<string, TokenState>;
  markers: Marker[];
  fog: Record<string, FogState>;
  combat: CombatState | null;
}

export interface JournalEntry {
  id: number;
  ts: number;
  kind: "say" | "system" | "roll" | "share";
  who: string | null;
  whoColor: string | null;
  text: string;
  roll?: {
    expression: string;
    total: number;
    detail: string;
    faces: number[];
    sides: number;
    n: number;
    mod: number;
    crit: boolean;
    fumble: boolean;
  };
  ref?: {
    type: "compendium";
    category: string;
    slug: string;
    title: string;
    partial?: boolean;
  };
}

export interface CharacterCard {
  id: string;
  kind: "pj" | "pnj";
  ownerId: string | null;
  name: string;
  color: string;
  active: boolean;
  ca: number;
  sub: string;
  initiativeBonus: number;
  /** null = PV masqués par le serveur (PNJ quand pnjPvVisible=false, vue joueur). */
  pv: number | null;
  pvMax: number | null;
  pvTemp: number;
  conditions: string[];
}

export interface TableSettings {
  pnjPvVisible: boolean;
  sheetsLocked: boolean;
  diceDuration: number;
  tokenSize: number;
}

export interface TableSnapshot {
  type: "snapshot";
  state: TableLiveState;
  characters: CharacterCard[];
  settings: TableSettings;
  journalTail: JournalEntry[];
  presence: PresenceUser[];
}

// ── Client → Serveur ──────────────────────────────────────────

export interface TokenMoveMsg {
  type: "token.move";
  tokenId: string;
  x: number;
  y: number;
}

export interface CharHpMsg {
  type: "char.hp";
  charId: string;
  delta: number;
}

export interface CharConditionMsg {
  type: "char.condition";
  charId: string;
  cond: string;
  on: boolean;
}

export interface NpcAddMsg {
  type: "npc.add";
  name: string;
  pv: number;
  ca: number;
  init: number;
  x?: number;
  y?: number;
}

export interface NpcAddFromMonsterMsg {
  type: "npc.addFromMonster";
  slug: string;
}

export interface NpcRemoveMsg {
  type: "npc.remove";
  charId: string;
}

export interface MapSelectMsg {
  type: "map.select";
  mapId: string;
}

export interface MarkerSetMsg {
  type: "marker.set";
  id?: string;
  x: number;
  y: number;
  text: string;
}

export interface MarkerMoveMsg {
  type: "marker.move";
  id: string;
  x: number;
  y: number;
}

export interface MarkerRemoveMsg {
  type: "marker.remove";
  id: string;
}

export interface MarkerClearMsg {
  type: "marker.clear";
}

export interface FogEnableMsg {
  type: "fog.enable";
}

export interface FogRevealMsg {
  type: "fog.reveal";
  x: number;
  y: number;
}

export interface FogCoverMsg {
  type: "fog.cover";
}

export interface FogDisableMsg {
  type: "fog.disable";
}

export interface PingMsg {
  type: "ping";
  x: number;
  y: number;
}

export interface ModeSetMsg {
  type: "mode.set";
  mode: "exploration" | "combat";
}

export interface InitiativeRollMsg {
  type: "initiative.roll";
  charId: string;
}

export interface CombatNextMsg {
  type: "combat.next";
}

export interface ChatSayMsg {
  type: "chat.say";
  text: string;
}

export interface DiceRollMsg {
  type: "dice.roll";
  sides: number;
  n: number;
  mod: number;
  label?: string;
}

export interface InvGiveMoneyMsg {
  type: "inv.give";
  from: string;
  to: string;
  money: Money;
}

export interface InvGiveItemMsg {
  type: "inv.give";
  from: string;
  to: string;
  item: string;
}

export interface InvAddMsg {
  type: "inv.add";
  charId: string;
  item: string;
  qty?: number;
}

export interface InvDropMsg {
  type: "inv.drop";
  charId: string;
  item: string;
}

export type ClientMessage =
  | TokenMoveMsg
  | CharHpMsg
  | CharConditionMsg
  | NpcAddMsg
  | NpcAddFromMonsterMsg
  | NpcRemoveMsg
  | MapSelectMsg
  | MarkerSetMsg
  | MarkerMoveMsg
  | MarkerRemoveMsg
  | MarkerClearMsg
  | FogEnableMsg
  | FogRevealMsg
  | FogCoverMsg
  | FogDisableMsg
  | PingMsg
  | ModeSetMsg
  | InitiativeRollMsg
  | CombatNextMsg
  | ChatSayMsg
  | DiceRollMsg
  | InvGiveMoneyMsg
  | InvGiveItemMsg
  | InvAddMsg
  | InvDropMsg;

// ── Serveur → Client ──────────────────────────────────────────

export interface TableDeltaPatch {
  mode?: TableLiveState["mode"];
  mapId?: string | null;
  combat?: TableLiveState["combat"];
  markers?: Marker[];
  tokens?: Record<string, TokenState | null>;
  fog?: Record<string, FogState>;
  characters?: Record<string, Partial<CharacterCard> | null>;
}

export interface DeltaMsg {
  type: "delta";
  patch: TableDeltaPatch;
}

export interface PingBroadcastMsg {
  type: "ping";
  x: number;
  y: number;
}

export interface JournalMsg {
  type: "journal";
  entry: JournalEntry;
}

export interface DiceResultMsg {
  type: "dice.result";
  forUserId: string;
  anim: {
    sides: number;
    faces: number[];
    total: number;
    detail: string;
    n: number;
    mod: number;
  };
}

export interface CharUpdatedMsg {
  type: "char.updated";
  charId: string;
}

export interface PresenceMsg {
  type: "presence";
  users: PresenceUser[];
}

export interface ErrorMsg {
  type: "error";
  code: string;
  msg: string;
}

export type ServerMessage =
  | TableSnapshot
  | DeltaMsg
  | JournalMsg
  | DiceResultMsg
  | CharUpdatedMsg
  | PresenceMsg
  | ErrorMsg
  | PingBroadcastMsg;

// ── Type guards ───────────────────────────────────────────────

type MessageMap = {
  [K in ClientMessage["type"]]: Extract<ClientMessage, { type: K }>;
};

export function isClientMessage<T extends ClientMessage["type"]>(
  msg: unknown,
  type: T,
): msg is MessageMap[T] {
  return typeof msg === "object" && msg !== null && (msg as { type: string }).type === type;
}

type ServerMessageMap = {
  [K in ServerMessage["type"]]: Extract<ServerMessage, { type: K }>;
};

export function isServerMessage<T extends ServerMessage["type"]>(
  msg: unknown,
  type: T,
): msg is ServerMessageMap[T] {
  return typeof msg === "object" && msg !== null && (msg as { type: string }).type === type;
}

export function isSnapshot(msg: unknown): msg is TableSnapshot {
  return isServerMessage(msg, "snapshot");
}

export function isClientMessageValid(msg: unknown): msg is ClientMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const type = (msg as { type: string }).type;
  const validTypes: ClientMessage["type"][] = [
    "token.move",
    "char.hp",
    "char.condition",
    "npc.add",
    "npc.addFromMonster",
    "npc.remove",
    "map.select",
    "marker.set",
    "marker.move",
    "marker.remove",
    "marker.clear",
    "fog.enable",
    "fog.reveal",
    "fog.cover",
    "fog.disable",
    "ping",
    "mode.set",
    "initiative.roll",
    "combat.next",
    "chat.say",
    "dice.roll",
    "inv.give",
    "inv.add",
    "inv.drop",
  ];
  return validTypes.includes(type as ClientMessage["type"]);
}

export function isServerMessageValid(msg: unknown): msg is ServerMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const type = (msg as { type: string }).type;
  const validTypes: ServerMessage["type"][] = [
    "snapshot",
    "delta",
    "journal",
    "dice.result",
    "char.updated",
    "presence",
    "error",
    "ping",
  ];
  return validTypes.includes(type as ServerMessage["type"]);
}

export type { InitiativeEntry };
