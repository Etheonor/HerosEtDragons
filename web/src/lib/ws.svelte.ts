// ═══════════════════════════════════════════════════════════
// RollWith H&D — Client WebSocket en store runes (Svelte 5)
// tableStore est un $state partagé : chaque composant qui le lit
// est réactif — plus aucun listener manuel (audit E).
// ═══════════════════════════════════════════════════════════

import type {
  JournalEntry,
  Marker,
  FogState,
  CombatState,
  CharacterCard,
  TableSettings,
} from "@rollwith/shared/protocol";
import { DEFAULT_SETTINGS } from "@rollwith/shared/protocol";

export interface TableState {
  mode: "exploration" | "combat";
  mapId: string | null;
  tokens: Record<string, { charId: string; x: number; y: number }>;
  markers: Marker[];
  fog: Record<string, FogState>;
  combat: CombatState | null;
}

export interface PresenceUser {
  userId: string;
  name: string;
  role: string;
  charId: string | null;
  color: string;
}

export interface DiceAnim {
  sides: number;
  faces: number[];
  total: number;
  detail: string;
  n: number;
  mod: number;
}

export interface Ping {
  id: number;
  x: number;
  y: number;
}

export interface TableStore {
  connected: boolean;
  state: TableState;
  characters: CharacterCard[];
  settings: TableSettings;
  journal: JournalEntry[];
  presence: PresenceUser[];
  pings: Ping[];
  diceAnim: DiceAnim | null;
  error: string | null;
}

let pingSeq = 0;

/** État partagé de la table — les mutations ci-dessous sont réactives partout. */
export const tableStore = $state<TableStore>({
  connected: false,
  state: { mode: "exploration", mapId: null, tokens: {}, markers: [], fog: {}, combat: null },
  characters: [],
  settings: DEFAULT_SETTINGS,
  journal: [],
  presence: [],
  pings: [],
  diceAnim: null,
  error: null,
});

let ws: WebSocket | null = null;
let url = "";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let disposed = true;
let wasConnected = false;
let attempts = 0;

export function connectWs(campaignId: string) {
  disposed = false;
  url = `${window.location.origin.replace("http", "ws")}/api/tables/${campaignId}/ws`;
  doConnect();
}

function doConnect() {
  if (disposed) return;
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }

  wasConnected = false;
  ws = new WebSocket(url);

  ws.onopen = () => {
    attempts = 0;
    wasConnected = true;
    tableStore.connected = true;
    tableStore.error = null;
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as Record<string, unknown>;
      handleMessage(msg);
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    if (disposed) return;
    tableStore.connected = false;
    scheduleReconnect();
  };

  ws.onerror = () => {
    // Toast uniquement si on perd une connexion établie — pas pendant les
    // tentatives de handshake (cold start / rechargement) qui sont gérées
    // silencieusement par le reconnect.
    if (wasConnected) {
      tableStore.error = "Connexion perdue";
    }
  };
}

function scheduleReconnect() {
  if (disposed) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  attempts += 1;
  // Backoff exponentiel + jitter (évite la rafale si 5 joueurs retombent ensemble)
  const base = Math.min(8000, 1000 * 2 ** (attempts - 1));
  const jitter = Math.random() * 800;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    doConnect();
  }, base + jitter);
}

function handleMessage(msg: Record<string, unknown>) {
  const type = msg.type as string;

  switch (type) {
    case "snapshot":
      tableStore.state = (msg.state as TableStore["state"]) ?? tableStore.state;
      tableStore.characters = (msg.characters as CharacterCard[]) ?? [];
      tableStore.settings = (msg.settings as TableSettings) ?? DEFAULT_SETTINGS;
      tableStore.journal = (msg.journalTail as JournalEntry[]) ?? [];
      tableStore.presence = (msg.presence as PresenceUser[]) ?? [];
      break;

    case "delta": {
      const patch = msg.patch as Record<string, unknown>;
      if (patch.mode) tableStore.state.mode = patch.mode as "exploration" | "combat";
      if (patch.combat !== undefined)
        tableStore.state.combat = patch.combat as TableStore["state"]["combat"];
      if (patch.tokens) {
        // Un patch contenant mapId est un CHANGEMENT DE CARTE : on remplace la
        // vue par celle de la nouvelle carte (le serveur envoie le dict complet).
        const switched = patch.mapId !== undefined;
        const tokens = switched ? {} : { ...tableStore.state.tokens };
        for (const [id, val] of Object.entries(
          patch.tokens as Record<string, { charId: string; x: number; y: number } | null>,
        )) {
          if (val === null) delete tokens[id];
          else tokens[id] = val;
        }
        tableStore.state.tokens = tokens;
      }
      if (patch.markers) tableStore.state.markers = patch.markers as Marker[];
      if (patch.fog)
        tableStore.state.fog = {
          ...tableStore.state.fog,
          ...(patch.fog as Record<string, FogState>),
        };
      if (patch.mapId !== undefined) tableStore.state.mapId = patch.mapId as string | null;
      if (patch.characters) {
        const byId = new Map(tableStore.characters.map((c) => [c.id, c]));
        for (const [id, val] of Object.entries(
          patch.characters as Record<string, Partial<CharacterCard> | null>,
        )) {
          if (val === null) {
            byId.delete(id);
          } else {
            const existing = byId.get(id);
            byId.set(id, existing ? { ...existing, ...val } : (val as CharacterCard));
          }
        }
        tableStore.characters = Array.from(byId.values());
      }
      break;
    }

    case "journal": {
      const entry = msg.entry as JournalEntry;
      // garde anti-doublon (reconnexion / broadcast dupliqué)
      const dup = tableStore.journal.some(
        (e) => e.id === entry.id && e.ts === entry.ts && e.text === entry.text,
      );
      if (!dup) {
        tableStore.journal = [...tableStore.journal, entry];
      }
      break;
    }

    case "dice.result": {
      tableStore.diceAnim = msg.anim as DiceAnim;
      setTimeout(() => {
        tableStore.diceAnim = null;
      }, 1700);
      break;
    }

    case "presence": {
      const seen = new Set<string>();
      tableStore.presence = ((msg.users as PresenceUser[]) ?? []).filter((u) => {
        if (!u.userId || seen.has(u.userId)) return false;
        seen.add(u.userId);
        return true;
      });
      break;
    }

    case "ping": {
      const id = ++pingSeq;
      tableStore.pings = [...tableStore.pings, { id, x: msg.x as number, y: msg.y as number }];
      setTimeout(() => {
        tableStore.pings = tableStore.pings.filter((p) => p.id !== id);
      }, 1900);
      break;
    }

    case "error":
      tableStore.error = (msg.msg as string) ?? "Erreur";
      break;
  }
}

export function clearWsError() {
  tableStore.error = null;
}

export function sendWs(msg: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function disconnectWs() {
  disposed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    // Ne pas reconnecter après un arrêt volontaire (le onclose relaierait
    // sinon un fantôme de connexion pendant le chargement de la page suivante).
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  tableStore.connected = false;
}
