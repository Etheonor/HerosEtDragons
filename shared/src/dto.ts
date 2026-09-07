// ═══════════════════════════════════════════════════════════
// RollWith H&D — DTO REST partagés (audit D1/A6)
// Source unique des formes échangées entre l'API (routes) et le
// client web : plus aucune duplication de types api ↔ web.
// Les routes annotent leurs réponses avec ces types (c.json<T>),
// le client les importe directement.
// ═══════════════════════════════════════════════════════════

import type { CharacterSheet, NpcTemplateInput } from "./sheet";
import type { Armor } from "./armor";
import type { TableSettings, JournalEntry } from "./protocol";
import type { CompendiumMeta, BodySection } from "./compendium";

export type { CharacterSheet, NpcTemplateInput, Armor, TableSettings };

// ── Campagnes ─────────────────────────────────────────────────

export interface CampaignSummary {
  id: string;
  name: string;
  role: "mj" | "player";
  isOwner: boolean;
  settings: TableSettings;
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

export interface JournalPage {
  entries: JournalEntry[];
  hasMore: boolean;
}

// ── Personnages ────────────────────────────────────────────────

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
  updatedAt: string;
}

// ── Cartes ─────────────────────────────────────────────────────

export interface MapSummary {
  id: string;
  name: string;
  hasImage: boolean;
}

// ── Compendium ─────────────────────────────────────────────────

export interface CompendiumEntryDto {
  category: string;
  slug: string;
  title: string;
  source: string;
  sourcePage: number | null;
  meta: CompendiumMeta | null;
  body: BodySection[] | null;
  visibility: "public" | "mj";
  origin: "drs" | "maison";
}

/** Entrée de la liste paginée (sans le corps de la fiche). */
export interface CompendiumListEntry {
  category: string;
  slug: string;
  title: string;
  origin: string;
  meta: Record<string, unknown> | null;
}

export interface CompendiumListPage {
  entries: CompendiumListEntry[];
  total: number;
  offset: number;
  limit: number;
}

// ── Modèles de PNJ ─────────────────────────────────────────────

export interface NpcTemplate {
  id: string;
  name: string;
  ca: number;
  pvMax: number;
  initBonus: number;
  color: string;
  conditions: string[];
  notes: string;
  source: { category: string; slug: string } | null;
  updatedAt: string;
}

// ── Notes ──────────────────────────────────────────────────────

export interface NoteDto {
  targetType: "map" | "campaign";
  targetId: string;
  content: string;
  updatedAt: string;
}

// EOF dto.ts
