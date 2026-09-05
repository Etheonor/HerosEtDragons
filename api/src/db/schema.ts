import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Better Auth tables (singular names as expected by the library) ───────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ── Custom tables ────────────────────────────────────────────────────────────

export const allowedUsers = sqliteTable("allowed_users", {
  discordId: text("discord_id").primaryKey(),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const invitations = sqliteTable("invitations", {
  token: text("token").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  usesLeft: integer("uses_left").notNull().default(1),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  settings: text("settings", { mode: "json" }).$type<CampaignSettings>().notNull().default({
    pnjPvVisible: false,
    sheetsLocked: false,
    diceDuration: 1200,
    tokenSize: 32,
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const members = sqliteTable(
  "members",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["mj", "player"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.userId] })],
);

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["pj", "pnj"] }).notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#C0392B"),
  active: integer("active", { mode: "boolean" }).default(true).notNull(),
  sheet: text("sheet", { mode: "json" }).$type<CharacterSheet>().notNull(),
  pv: integer("pv").notNull().default(0),
  pvMax: integer("pv_max").notNull().default(0),
  pvTemp: integer("pv_temp").notNull().default(0),
  conditions: text("conditions", { mode: "json" }).$type<string[]>().notNull().default([]),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const maps = sqliteTable("maps", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  r2Key: text("r2_key"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const compendiumEntries = sqliteTable(
  "compendium_entries",
  {
    key: text("key").primaryKey(), // "<category>/<slug>"
    category: text("category").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    source: text("source").notNull().default("DRS"),
    sourcePage: integer("source_page"),
    meta: text("meta", { mode: "json" }),
    body: text("body", { mode: "json" }),
    visibility: text("visibility", { enum: ["public", "mj"] })
      .notNull()
      .default("public"),
    origin: text("origin", { enum: ["drs", "maison"] })
      .notNull()
      .default("drs"),
    searchText: text("search_text").notNull().default(""),
    version: integer("version").notNull().default(1),
    hash: text("hash").notNull(),
    ingestCommit: text("ingest_commit"),
    campaignId: text("campaign_id"), // homebrew rattaché à une campagne
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("compendium_category_idx").on(table.category)],
);

export const journal = sqliteTable(
  "journal",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    ts: integer("ts").notNull(),
    kind: text("kind", { enum: ["say", "system", "roll", "share"] }).notNull(),
    who: text("who"),
    whoColor: text("who_color"),
    text: text("text").notNull(),
    roll: text("roll", { mode: "json" }),
    ref: text("ref", { mode: "json" }),
  },
  (table) => [index("journal_campaign_idx").on(table.campaignId)],
);

export const npcTemplates = sqliteTable(
  "npc_templates",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ca: integer("ca").notNull().default(10),
    pvMax: integer("pv_max").notNull().default(1),
    initBonus: integer("init_bonus").notNull().default(0),
    color: text("color").notNull().default("#C0392B"),
    conditions: text("conditions", { mode: "json" }).$type<string[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    // { category, slug } vers le compendium (phase 8) — null pour un modèle maison.
    source: text("source", { mode: "json" }).$type<{ category: string; slug: string } | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("npc_templates_campaign_idx").on(table.campaignId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    // target_type/target_id : où s'accroche la note. « map » + id de carte
    // aujourd'hui ; « campaign » + "" pour la note de séance. Extensible
    // (token, character…) sans nouvelle migration.
    targetType: text("target_type", { enum: ["map", "campaign"] })
      .notNull()
      .default("map"),
    targetId: text("target_id").notNull().default(""),
    content: text("content").notNull().default(""),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("notes_campaign_idx").on(table.campaignId),
    uniqueIndex("notes_target_idx").on(table.campaignId, table.targetType, table.targetId),
  ],
);

// ── Types ────────────────────────────────────────────────────────────────────

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
    connus: { slug: string; level: number; name?: string }[];
    emplacements: { level: number; max: number; used: number }[];
  };
  capacites: { id: string; name: string; description: string }[];
  personnalite: { traits?: string; ideaux?: string; liens?: string; defauts?: string };
  languesEtMaitrises: string;
  portrait?: string | null;
  equipement: {
    bourse: { po: number; pa: number; pc: number };
    objets: { name: string; qty: number }[];
  };
  couleurPion: string;
}

export interface CampaignSettings {
  pnjPvVisible: boolean;
  sheetsLocked: boolean;
  diceDuration: number;
  tokenSize: number;
}

export const DEFAULT_SETTINGS: CampaignSettings = {
  pnjPvVisible: false,
  sheetsLocked: false,
  diceDuration: 1200,
  tokenSize: 32,
};
