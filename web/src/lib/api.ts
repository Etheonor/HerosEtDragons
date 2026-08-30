export interface CampaignSummary {
  id: string;
  name: string;
  role: "mj" | "player";
  isOwner: boolean;
  settings: {
    pnjPvVisible: boolean;
    sheetsLocked: boolean;
    diceDuration: number;
    tokenSize: number;
  };
  createdAt: string;
}

export interface CampaignDetail extends CampaignSummary {
  members: {
    userId: string;
    role: "mj" | "player";
    name: string;
    image: string | null;
  }[];
}

export interface JoinResult {
  campaignId: string;
  role: "mj" | "player";
  alreadyMember?: boolean;
}

export interface InvitationResult {
  token: string;
  usesLeft: number;
  expiresAt: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Erreur");
  }
  return res.json() as Promise<T>;
}

async function fetchForm<T>(url: string, form: FormData, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, body: form, credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Erreur");
  }
  return res.json() as Promise<T>;
}

export interface MapSummary {
  id: string;
  name: string;
  hasImage: boolean;
}

export interface CharacterSummary {
  id: string;
  name: string;
  kind: "pj" | "pnj";
  ownerId: string | null;
  color: string;
  active: boolean;
  ca: number;
  sub: string;
  initiativeBonus: number;
  pv: number;
  pvMax: number;
  pvTemp: number;
  conditions: string[];
}

export interface CharacterSheet {
  identite: {
    nom: string;
    race: string;
    classe: string;
    niveau: number;
    historique: string;
    alignement: string;
    xp: number;
    citation?: string;
  };
  caracs: { for: number; dex: number; con: number; int: number; sag: number; cha: number };
  saveProficiencies: {
    for: boolean;
    dex: boolean;
    con: boolean;
    int: boolean;
    sag: boolean;
    cha: boolean;
  };
  skillProficiencies: Record<string, boolean>;
  ca: number;
  vitesse: string;
  initiativeBonus: number;
  pvMax: number;
  desDeVie: { faces: number; total: number; restants: number };
  deathSaves: { successes: number; failures: number };
  inspiration: boolean;
  attaques: { id: string; name: string; bonus: number; damage: string }[];
  sorts: {
    caracIncantation: "for" | "dex" | "con" | "int" | "sag" | "cha" | null;
    connus: { slug: string; level: number }[];
    emplacements: { level: number; max: number; used: number }[];
  };
  capacites: { id: string; name: string; description: string }[];
  personnalite: { traits?: string; ideaux?: string; liens?: string; defauts?: string };
  languesEtMaitrises: string;
  equipement: {
    bourse: { po: number; pa: number; pc: number };
    objets: { name: string; qty: number }[];
  };
  couleurPion: string;
}

export interface CharacterDetail {
  id: string;
  campaignId: string;
  ownerId: string | null;
  kind: "pj" | "pnj";
  name: string;
  color: string;
  active: boolean;
  sheet: CharacterSheet;
  pv: number;
  pvMax: number;
  pvTemp: number;
  conditions: string[];
  canEdit: boolean;
  role: "mj" | "player";
}

export const api = {
  campaigns: {
    list: () => fetchJson<{ campaigns: CampaignSummary[] }>("/api/campaigns"),
    create: (name: string) =>
      fetchJson<{ id: string; name: string; role: string }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    detail: (id: string) => fetchJson<CampaignDetail>(`/api/campaigns/${id}`),
    updateSettings: (id: string, settings: Partial<CampaignSummary["settings"]>) =>
      fetchJson<{ settings: CampaignSummary["settings"] }>(`/api/campaigns/${id}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings),
      }),
    createInvitation: (id: string, usesLeft = 1) =>
      fetchJson<InvitationResult>(`/api/campaigns/${id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ usesLeft }),
      }),
    join: (token: string) =>
      fetchJson<JoinResult>(`/api/campaigns/join/${token}`, { method: "POST" }),
    journalPage: (campaignId: string, before?: number, limit = 50) => {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (before !== undefined) qs.set("before", String(before));
      return fetchJson<{
        entries: import("@rollwith/shared/protocol").JournalEntry[];
        hasMore: boolean;
      }>(`/api/campaigns/${campaignId}/journal?${qs.toString()}`);
    },
  },
  characters: {
    list: (campaignId: string) =>
      fetchJson<{ characters: CharacterSummary[] }>(`/api/characters/campaigns/${campaignId}`),
    detail: (id: string) => fetchJson<CharacterDetail>(`/api/characters/${id}`),
    seed: (campaignId: string) =>
      fetchJson<{ id: string; name: string; alreadyExists?: boolean }>(
        `/api/characters/seed/${campaignId}`,
        { method: "POST" },
      ),
    updatePv: (id: string, delta: number) =>
      fetchJson<{ pv: number; pvMax: number }>(`/api/characters/${id}/pv`, {
        method: "PATCH",
        body: JSON.stringify({ delta }),
      }),
    updatePvTemp: (id: string, value: number) =>
      fetchJson<{ pvTemp: number }>(`/api/characters/${id}/pv-temp`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      }),
    toggleInspiration: (id: string) =>
      fetchJson<{ inspiration: boolean }>(`/api/characters/${id}/inspiration`, {
        method: "PATCH",
      }),
  },
  maps: {
    list: (campaignId: string) =>
      fetchJson<{ maps: MapSummary[] }>(`/api/maps/campaigns/${campaignId}`),
    create: (campaignId: string, name: string, image?: File) => {
      const form = new FormData();
      form.set("name", name);
      if (image) form.set("image", image);
      return fetchForm<MapSummary>(`/api/maps/campaigns/${campaignId}`, form);
    },
    update: (mapId: string, fields: { name?: string; image?: File }) => {
      const form = new FormData();
      if (fields.name !== undefined) form.set("name", fields.name);
      if (fields.image) form.set("image", fields.image);
      return fetchForm<MapSummary>(`/api/maps/${mapId}`, form, "PATCH");
    },
    remove: (mapId: string) => fetchJson<{ ok: true }>(`/api/maps/${mapId}`, { method: "DELETE" }),
    imageUrl: (mapId: string) => `/api/maps/${mapId}/image`,
  },
  npcTemplates: {
    list: (campaignId: string) =>
      fetchJson<{ templates: NpcTemplate[] }>(`/api/npc-templates/campaigns/${campaignId}`),
    create: (campaignId: string, tpl: NpcTemplateInput) =>
      fetchJson<NpcTemplate>(`/api/npc-templates/campaigns/${campaignId}`, {
        method: "POST",
        body: JSON.stringify(tpl),
      }),
    update: (templateId: string, tpl: NpcTemplateInput) =>
      fetchJson<NpcTemplate>(`/api/npc-templates/${templateId}`, {
        method: "PUT",
        body: JSON.stringify(tpl),
      }),
    remove: (templateId: string) =>
      fetchJson<{ ok: true }>(`/api/npc-templates/${templateId}`, { method: "DELETE" }),
  },
  notes: {
    list: (campaignId: string) =>
      fetchJson<{
        notes: {
          targetType: "map" | "campaign";
          targetId: string;
          content: string;
          updatedAt: number;
        }[];
      }>(`/api/notes/campaigns/${campaignId}`),
    set: (campaignId: string, targetType: "map" | "campaign", targetId: string, content: string) =>
      fetchJson<{ ok: true }>(
        `/api/notes/campaigns/${campaignId}/${targetType}/${encodeURIComponent(targetId)}`,
        { method: "PUT", body: JSON.stringify({ content }) },
      ),
  },
};

export interface NpcTemplateInput {
  name: string;
  ca: number;
  pvMax: number;
  initBonus: number;
  color: string;
  conditions: string[];
  notes: string;
}

export interface NpcTemplate extends NpcTemplateInput {
  id: string;
  source: { category: string; slug: string } | null;
  updatedAt: number;
}
