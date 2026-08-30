import type {
  JournalEntry,
  Marker,
  FogState,
  CombatState,
  CharacterCard,
  TableSettings,
} from "@rollwith/shared/protocol";

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

type Listener = (store: TableStore) => void;

const DEFAULT_SETTINGS: TableSettings = {
  pnjPvVisible: false,
  sheetsLocked: false,
  diceDuration: 1200,
  tokenSize: 44,
};

let pingSeq = 0;

class WsClient {
  private ws: WebSocket | null = null;
  private url: string = "";
  private listeners = new Set<Listener>();
  private store: TableStore = {
    connected: false,
    state: {
      mode: "exploration",
      mapId: null,
      tokens: {},
      markers: [],
      fog: {},
      combat: null,
    },
    characters: [],
    settings: DEFAULT_SETTINGS,
    journal: [],
    presence: [],
    pings: [],
    diceAnim: null,
    error: null,
  };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(campaignId: string) {
    this.url = `${window.location.origin.replace("http", "ws")}/api/tables/${campaignId}/ws`;
    this.doConnect();
  }

  private doConnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.store.connected = true;
      this.store.error = null;
      this.notify();
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.handleMessage(msg);
      } catch {
        /* ignore */
      }
    };

    this.ws.onclose = () => {
      this.store.connected = false;
      this.notify();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.store.error = "Connexion perdue";
      this.notify();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, 2000);
  }

  private handleMessage(msg: Record<string, unknown>) {
    const type = msg.type as string;

    switch (type) {
      case "snapshot":
        this.store.state = (msg.state as TableStore["state"]) ?? this.store.state;
        this.store.characters = (msg.characters as CharacterCard[]) ?? [];
        this.store.settings = (msg.settings as TableSettings) ?? DEFAULT_SETTINGS;
        this.store.journal = (msg.journalTail as JournalEntry[]) ?? [];
        this.store.presence = (msg.presence as PresenceUser[]) ?? [];
        this.notify();
        break;

      case "delta": {
        const patch = msg.patch as Record<string, unknown>;
        if (patch.mode) this.store.state.mode = patch.mode as "exploration" | "combat";
        if (patch.combat !== undefined)
          this.store.state.combat = patch.combat as TableStore["state"]["combat"];
        if (patch.tokens) {
          const tokens = { ...this.store.state.tokens };
          for (const [id, val] of Object.entries(
            patch.tokens as Record<string, { charId: string; x: number; y: number } | null>,
          )) {
            if (val === null) delete tokens[id];
            else tokens[id] = val;
          }
          this.store.state.tokens = tokens;
        }
        if (patch.markers) this.store.state.markers = patch.markers as Marker[];
        if (patch.fog)
          this.store.state.fog = {
            ...this.store.state.fog,
            ...(patch.fog as Record<string, FogState>),
          };
        if (patch.mapId !== undefined) this.store.state.mapId = patch.mapId as string | null;
        if (patch.characters) {
          const byId = new Map(this.store.characters.map((c) => [c.id, c]));
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
          this.store.characters = Array.from(byId.values());
        }
        this.notify();
        break;
      }

      case "journal": {
        const entry = msg.entry as JournalEntry;
        // garde anti-doublon (reconnexion / broadcast dupliqué)
        const dup = this.store.journal.some(
          (e) => e.id === entry.id && e.ts === entry.ts && e.text === entry.text,
        );
        if (!dup) {
          this.store.journal = [...this.store.journal, entry];
          this.notify();
        }
        break;
      }

      case "dice.result": {
        this.store.diceAnim = msg.anim as DiceAnim;
        this.notify();
        setTimeout(() => {
          this.store.diceAnim = null;
          this.notify();
        }, 1700);
        break;
      }

      case "presence": {
        const seen = new Set<string>();
        this.store.presence = ((msg.users as PresenceUser[]) ?? []).filter((u) => {
          if (!u.userId || seen.has(u.userId)) return false;
          seen.add(u.userId);
          return true;
        });
        this.notify();
        break;
      }

      case "ping": {
        const id = ++pingSeq;
        this.store.pings = [...this.store.pings, { id, x: msg.x as number, y: msg.y as number }];
        this.notify();
        setTimeout(() => {
          this.store.pings = this.store.pings.filter((p) => p.id !== id);
          this.notify();
        }, 1900);
        break;
      }

      case "error":
        this.store.error = (msg.msg as string) ?? "Erreur";
        this.notify();
        break;
    }
  }

  send(msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.store);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.store);
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.store.connected = false;
    this.notify();
  }
}

export const wsClient = new WsClient();
