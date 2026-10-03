// ═══════════════════════════════════════════════════════════
// RollWith H&D — Protocole WebSocket (design §5)
// Messages client → serveur et serveur → client + snapshot.
// Type guards testés.
// ═══════════════════════════════════════════════════════════

import type { Inventory, Money } from "./inventory";
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

/** Lien entre deux cartes (porte, escalier, portail…) — « le HTML des maps ». */
export type MapLinkKind = "door" | "stairs" | "region" | "portal";

/** Note épinglée sur une carte (préparation MJ affichée dans le monde). */
export interface MapPin {
  id: string;
  mapId: string;
  x: number;
  y: number;
  label: string;
  /** Contenu markdown-lite rendu dans le panneau non-modal. */
  text: string;
}

export interface MapLink {
  id: string;
  /** Carte qui porte le lien. */
  mapId: string;
  /** Position du pin, en % de la surface. */
  x: number;
  y: number;
  targetMapId: string;
  /** Point d'arrivée dans la carte cible (%, défaut : centre). */
  targetX?: number;
  targetY?: number;
  label: string;
  kind: MapLinkKind;
  oneWay: boolean;
  /** Passage secret : jamais diffusé aux joueurs (filtre serveur). */
  hidden: boolean;
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
  /** Liens de la carte active (le DO les stocke par carte, comme les pions). */
  links: MapLink[];
  /** Notes épinglées de la carte active. */
  pins: MapPin[];
  fog: Record<string, FogState>;
  combat: CombatState | null;
  /** Cible partagée (TargetFrame) : charId, ou null. MJ seul la pose. */
  target: string | null;
  /** Widgets de séance (horloge, compteur, minuteur), partagés MJ + joueurs. */
  widgets: TableWidgets;
}

export interface TableWidgets {
  /** Compteur 0-99. */
  counter: number;
  /** Horloge de progression : secteurs remplis, 0-12. */
  clock: number;
  /** Minuteur : `endsAt` (epoch ms) fait foi tant que `running` ; `initial`
   *  est la durée de référence du bouton ↺. */
  timer: { running: boolean; endsAt: number | null; remaining: number; initial: number };
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
  /** clé "<Race>/<CODE>" d'un portrait (voir tools/portraits), null = pas de portrait. */
  portrait: string | null;
  ca: number;
  sub: string;
  initiativeBonus: number;
  /** null = PV masqués par le serveur (PNJ quand pnjPvVisible=false, vue joueur). */
  pv: number | null;
  pvMax: number | null;
  pvTemp: number;
  conditions: string[];
  /** Taille du pion en cases (multiplicateur de gridSize), 1 = une case. */
  tokenScale: number;
}

export interface TableSettings {
  pnjPvVisible: boolean;
  sheetsLocked: boolean;
  diceDuration: number;
  tokenSize: number;
}

/** Valeurs par défaut — source unique (serveur et client pré-snapshot). */
export const DEFAULT_SETTINGS: TableSettings = {
  pnjPvVisible: false,
  sheetsLocked: false,
  diceDuration: 1200,
  tokenSize: 32,
};

export interface TableSnapshot {
  type: "snapshot";
  state: TableLiveState;
  characters: CharacterCard[];
  settings: TableSettings;
  journalTail: JournalEntry[];
  presence: PresenceUser[];
  /** Sacs visibles par CE socket : tous pour le MJ, le sien pour un joueur. */
  inventories: Record<string, Inventory>;
  /** État des piles undo/redo du DO (boutons MJ). */
  history: HistoryState;
}

/** Disponibilité de l'undo/redo — booléens seuls, jamais la pile elle-même. */
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

// ── Client → Serveur ──────────────────────────────────────────

export interface TokenMoveMsg {
  type: "token.move";
  tokenId: string;
  x: number;
  y: number;
  /** Premier message d'un drag : ouvre UN pas d'undo pour tout le geste. */
  begin?: boolean;
}

/** Le MJ pose un personnage (PJ ou PNJ) sur la carte active s'il n'y est pas. */
export interface TokenPutMsg {
  type: "token.put";
  charId: string;
  x: number;
  y: number;
}

/** Le MJ retire le pion d'un personnage de la carte active (le personnage
 *  reste dans la compagnie, il pourra être replacé plus tard). */
export interface TokenRemoveMsg {
  type: "token.remove";
  charId: string;
}

/** Le MJ duplique un PNJ (nouvelle instance, stats copiées, pion décalé). */
export interface NpcDuplicateMsg {
  type: "npc.duplicate";
  charId: string;
}

/** Le MJ pose une créature depuis un modèle de sa bibliothèque (×count possible). */
export interface NpcAddFromTemplateMsg {
  type: "npc.addFromTemplate";
  templateId: string;
  x: number;
  y: number;
  count?: number;
}

/** Le MJ enregistre un PNJ posé (état courant) comme modèle réutilisable. */
export interface NpcSaveAsTemplateMsg {
  type: "npc.saveAsTemplate";
  charId: string;
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

export interface CharScaleMsg {
  type: "char.scale";
  charId: string;
  /** Multiplicateur de case du pion (0,25 à 4 ; presets ½/1/2/3/4). */
  scale: number;
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
  /** Premier message d'un drag : ouvre UN pas d'undo pour tout le geste. */
  begin?: boolean;
}

export interface MarkerRemoveMsg {
  type: "marker.remove";
  id: string;
}

export interface MarkerClearMsg {
  type: "marker.clear";
}

export interface LinkSetMsg {
  type: "link.set";
  id?: string;
  x: number;
  y: number;
  targetMapId: string;
  targetX?: number;
  targetY?: number;
  label?: string;
  kind?: MapLinkKind;
  oneWay?: boolean;
  hidden?: boolean;
}

export interface LinkRemoveMsg {
  type: "link.remove";
  id: string;
}

export interface LinkMoveMsg {
  type: "link.move";
  id: string;
  x: number;
  y: number;
}

/** Voyage par un lien : autorisé à tout membre (la carte active est partagée). */
export interface LinkTravelMsg {
  type: "link.travel";
  id: string;
}

export interface PinSetMsg {
  type: "pin.set";
  id?: string;
  x: number;
  y: number;
  label?: string;
  text?: string;
}

export interface PinMoveMsg {
  type: "pin.move";
  id: string;
  x: number;
  y: number;
}

export interface PinRemoveMsg {
  type: "pin.remove";
  id: string;
}

export interface TargetSetMsg {
  type: "target.set";
  charId: string | null;
}

export interface WidgetCounterMsg {
  type: "widget.counter";
  value: number;
}

export interface WidgetClockMsg {
  type: "widget.clock";
  value: number;
}

export interface WidgetTimerMsg {
  type: "widget.timer";
  action: "start" | "pause" | "reset";
  /** Durée en secondes (start/reset). */
  seconds?: number;
}

export interface FogEnableMsg {
  type: "fog.enable";
}

export interface FogRevealMsg {
  type: "fog.reveal";
  x: number;
  y: number;
  /** Premier point d'un trait : ouvre UN pas d'undo pour toute la passe. */
  begin?: boolean;
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

export interface CombatReorderMsg {
  type: "combat.reorder";
  charId: string;
  /** true = monte d'une position dans l'ordre d'initiative, false = descend. */
  up: boolean;
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
  /** dés à retirer, les plus bas d'abord (0 = aucun) */
  drop?: number;
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
  | TokenPutMsg
  | TokenRemoveMsg
  | NpcDuplicateMsg
  | NpcAddFromTemplateMsg
  | NpcSaveAsTemplateMsg
  | CharHpMsg
  | CharConditionMsg
  | CharScaleMsg
  | NpcAddMsg
  | NpcAddFromMonsterMsg
  | NpcRemoveMsg
  | MapSelectMsg
  | MarkerSetMsg
  | MarkerMoveMsg
  | MarkerRemoveMsg
  | MarkerClearMsg
  | LinkSetMsg
  | LinkRemoveMsg
  | LinkMoveMsg
  | LinkTravelMsg
  | PinSetMsg
  | PinMoveMsg
  | PinRemoveMsg
  | TargetSetMsg
  | WidgetCounterMsg
  | WidgetClockMsg
  | WidgetTimerMsg
  | FogEnableMsg
  | FogRevealMsg
  | FogCoverMsg
  | FogDisableMsg
  | PingMsg
  | ModeSetMsg
  | InitiativeRollMsg
  | CombatNextMsg
  | CombatReorderMsg
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
  /** Cible partagée (TargetFrame) — filtrée B5 côté joueurs. */
  target?: string | null;
  /** Widgets de séance (horloge, compteur, minuteur). */
  widgets?: TableWidgets;
  markers?: Marker[];
  links?: MapLink[];
  pins?: MapPin[];
  /** Point d'arrivée du dernier voyage (le client recentre sa caméra). */
  arrival?: { x: number; y: number } | null;
  tokens?: Record<string, TokenState | null>;
  fog?: Record<string, FogState>;
  characters?: Record<string, Partial<CharacterCard> | null>;
  settings?: TableSettings;
  /** Lot 4 : disponibilité de l'undo/redo (diffusée après chaque pas). */
  history?: HistoryState;
  /** Lot 2 : la liste des cartes (REST) a changé — les clients la relisent. */
  mapsUpdated?: boolean;
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

export interface PresenceMsg {
  type: "presence";
  users: PresenceUser[];
}

/** Sacs d'inventaire — filtré par rôle : le MJ reçoit tous les sacs, un
 *  joueur le sien seulement (R9.1). Ne transite JAMAIS par CharacterCard, qui
 *  est diffusé à tous. */
export interface InventoryMsg {
  type: "inv";
  inventories: Record<string, Inventory>;
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
    "token.put",
    "token.remove",
    "npc.duplicate",
    "npc.addFromTemplate",
    "npc.saveAsTemplate",
    "char.hp",
    "char.condition",
    "char.scale",
    "npc.add",
    "npc.addFromMonster",
    "npc.remove",
    "map.select",
    "marker.set",
    "marker.move",
    "marker.remove",
    "marker.clear",
    "link.set",
    "link.remove",
    "link.move",
    "link.travel",
    "pin.set",
    "pin.move",
    "pin.remove",
    "target.set",
    "widget.counter",
    "widget.clock",
    "widget.timer",
    "fog.enable",
    "fog.reveal",
    "fog.cover",
    "fog.disable",
    "ping",
    "mode.set",
    "initiative.roll",
    "combat.next",
    "combat.reorder",
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
    "presence",
    "error",
    "ping",
  ];
  return validTypes.includes(type as ServerMessage["type"]);
}

export type { InitiativeEntry };
