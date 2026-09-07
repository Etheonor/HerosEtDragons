// ═══════════════════════════════════════════════════════════
// RollWith H&D — Feuille de personnage : schéma canonique (Zod)
// Source unique du type CharacterSheet : API, web et validation.
// Tout consommateur importe le TYPE depuis @rollwith/shared/sheet ;
// la validation runtime (REST + WS) passe par characterSheetSchema.
// ═══════════════════════════════════════════════════════════

import { z } from "zod";
import { CARACS } from "./rules";
import { ARMOR_KINDS } from "./armor";

export { ARMOR_KINDS, ARMOR_KIND_LABELS } from "./armor";
export type { ArmorKind, Armor } from "./armor";

// ── Bornes (source unique — audit N1) ───────────────────────────
// Le schéma Zod ET le clamp client (normalizeSheet) lisent ces mêmes
// valeurs : plus de bornes dupliquées à la main côté client.
export const SHEET_BOUNDS = {
  niveau: [1, 20] as const,
  xp: [0, 5_000_000] as const,
  carac: [1, 30] as const,
  ca: [0, 40] as const,
  initiativeBonus: [-5, 20] as const,
  pvMax: [0, 1000] as const,
  dvFaces: [4, 12] as const,
  dvTotal: [0, 21] as const,
  deathSave: [0, 3] as const,
  attaqueBonus: [-5, 30] as const,
  armureCa: [0, 40] as const,
  sortNiveau: [0, 9] as const,
  emplacementCount: [0, 16] as const,
  bourse: [0, 1_000_000] as const,
  objetQty: [0, 9999] as const,
} as const;

export const SHEET_STR_MAX = {
  nom: 100,
  historique: 100,
  alignement: 60,
  citation: 4000,
  vitesse: 40,
  attaqueNom: 100,
  attaqueDamage: 40,
  armureNom: 100,
  sortSlug: 100,
  sortNom: 100,
  capaciteNom: 100,
  capaciteDesc: 4000,
  personnalite: 4000,
  languesEtMaitrises: 4000,
  portrait: 80,
  couleurPion: 20,
  objetNom: 200,
} as const;

// ── Helpers de messages (messages lisibles, style DRS) ─────────

function intField(min: number, max: number, label: string): z.ZodNumber {
  const msg = `${label} : entier attendu entre ${min} et ${max}`;
  return z.number({ error: msg }).int(msg).min(min, msg).max(max, msg);
}

function strField(max: number, label: string): z.ZodString {
  return z
    .string({ error: `${label} : texte attendu` })
    .max(max, `${label} : trop long (max ${max})`);
}

function strArray(
  maxItems: number,
  maxLen: number,
  label: string,
  itemLabel: string,
): z.ZodArray<z.ZodString> {
  return z
    .array(
      z
        .string({ error: `${itemLabel} : texte attendu` })
        .max(maxLen, `${itemLabel} : trop long (max ${maxLen})`),
    )
    .max(maxItems, `${label} : liste invalide`);
}

// ── Armures ────────────────────────────────────────────────────

export const armorSchema = z.object({
  id: strField(60, "armure id"),
  name: strField(100, "armure nom"),
  ca: intField(0, 40, "armure CA"),
  kind: z.enum(ARMOR_KINDS, { error: "armure catégorie" }),
  equipee: z.boolean({ error: "armure équipée" }),
});
export type SheetArmor = z.infer<typeof armorSchema>;

// ── Feuille complète ───────────────────────────────────────────

export const characterSheetSchema = z.object({
  identite: z.object({
    nom: strField(SHEET_STR_MAX.nom, "nom"),
    race: strField(SHEET_STR_MAX.nom, "race"),
    classe: strField(SHEET_STR_MAX.nom, "classe"),
    niveau: intField(...SHEET_BOUNDS.niveau, "niveau"),
    historique: strField(SHEET_STR_MAX.historique, "historique"),
    alignement: strField(SHEET_STR_MAX.alignement, "alignement"),
    xp: intField(...SHEET_BOUNDS.xp, "xp"),
    citation: strField(SHEET_STR_MAX.citation, "citation").optional(),
  }),
  caracs: z.object({
    for: intField(...SHEET_BOUNDS.carac, "carac for"),
    dex: intField(...SHEET_BOUNDS.carac, "carac dex"),
    con: intField(...SHEET_BOUNDS.carac, "carac con"),
    int: intField(...SHEET_BOUNDS.carac, "carac int"),
    sag: intField(...SHEET_BOUNDS.carac, "carac sag"),
    cha: intField(...SHEET_BOUNDS.carac, "carac cha"),
  }),
  saveProficiencies: z.object({
    for: z.boolean({ error: "save for" }),
    dex: z.boolean({ error: "save dex" }),
    con: z.boolean({ error: "save con" }),
    int: z.boolean({ error: "save int" }),
    sag: z.boolean({ error: "save sag" }),
    cha: z.boolean({ error: "save cha" }),
  }),
  skillProficiencies: z
    .record(z.string(), z.boolean({ error: "maitrise de compétence" }))
    .refine((v) => Object.keys(v).length <= 40, "skillProficiencies trop volumineux"),
  ca: intField(...SHEET_BOUNDS.ca, "CA"),
  vitesse: strField(SHEET_STR_MAX.vitesse, "vitesse"),
  initiativeBonus: intField(...SHEET_BOUNDS.initiativeBonus, "bonus d'initiative"),
  pvMax: intField(...SHEET_BOUNDS.pvMax, "pvMax"),
  desDeVie: z.object({
    faces: intField(...SHEET_BOUNDS.dvFaces, "dés de vie (faces)"),
    total: intField(...SHEET_BOUNDS.dvTotal, "dés de vie (total)"),
    restants: intField(...SHEET_BOUNDS.dvTotal, "dés de vie (restants)"),
  }),
  deathSaves: z.object({
    successes: intField(...SHEET_BOUNDS.deathSave, "jets contre la mort (réussites)"),
    failures: intField(...SHEET_BOUNDS.deathSave, "jets contre la mort (échecs)"),
  }),
  inspiration: z.boolean({ error: "inspiration" }),
  attaques: z
    .array(
      z.object({
        id: strField(60, "attaque id"),
        name: strField(SHEET_STR_MAX.attaqueNom, "attaque nom"),
        bonus: intField(...SHEET_BOUNDS.attaqueBonus, "attaque bonus"),
        damage: strField(SHEET_STR_MAX.attaqueDamage, "attaque dégâts"),
      }),
    )
    .max(30, "attaques invalide"),
  armures: z.array(armorSchema).max(30, "armures invalide").optional(),
  sorts: z.object({
    caracIncantation: z.enum(CARACS, { error: "caractéristique d'incantation" }).nullable(),
    connus: z
      .array(
        z.object({
          slug: strField(SHEET_STR_MAX.sortSlug, "sort slug"),
          level: intField(...SHEET_BOUNDS.sortNiveau, "sort niveau"),
          name: strField(SHEET_STR_MAX.sortNom, "sort nom").optional(),
        }),
      )
      .max(200, "sorts connus invalide"),
    emplacements: z
      .array(
        z.object({
          level: intField(...SHEET_BOUNDS.sortNiveau, "niveau d'emplacement"),
          max: intField(...SHEET_BOUNDS.emplacementCount, "emplacements max"),
          used: intField(...SHEET_BOUNDS.emplacementCount, "emplacements utilisés"),
        }),
      )
      .max(10, "emplacements de sorts invalides"),
  }),
  capacites: z
    .array(
      z.object({
        id: strField(60, "capacité id"),
        name: strField(SHEET_STR_MAX.capaciteNom, "capacité nom"),
        description: strField(SHEET_STR_MAX.capaciteDesc, "capacité description"),
      }),
    )
    .max(60, "capacites invalide"),
  personnalite: z.object({
    traits: strField(SHEET_STR_MAX.personnalite, "personnalité traits").optional(),
    ideaux: strField(SHEET_STR_MAX.personnalite, "personnalité ideaux").optional(),
    liens: strField(SHEET_STR_MAX.personnalite, "personnalité liens").optional(),
    defauts: strField(SHEET_STR_MAX.personnalite, "personnalité defauts").optional(),
  }),
  languesEtMaitrises: strField(SHEET_STR_MAX.languesEtMaitrises, "langues & maîtrises"),
  portrait: strField(SHEET_STR_MAX.portrait, "portrait").optional().nullable(),
  racial: z
    .object({
      for: intField(0, 4, "racial for"),
      dex: intField(0, 4, "racial dex"),
      con: intField(0, 4, "racial con"),
      int: intField(0, 4, "racial int"),
      sag: intField(0, 4, "racial sag"),
      cha: intField(0, 4, "racial cha"),
    })
    .partial()
    .strict()
    .optional()
    .nullable(),
  pvAuto: z.boolean({ error: "pvAuto" }).optional().nullable(),
  caAuto: z.boolean({ error: "caAuto" }).optional().nullable(),
  equipement: z.object({
    bourse: z.object({
      po: intField(...SHEET_BOUNDS.bourse, "po"),
      pa: intField(...SHEET_BOUNDS.bourse, "pa"),
      pc: intField(...SHEET_BOUNDS.bourse, "pc"),
    }),
    objets: z
      .array(
        z.object({
          name: strField(SHEET_STR_MAX.objetNom, "objet nom"),
          qty: intField(...SHEET_BOUNDS.objetQty, "objet quantité"),
        }),
      )
      .max(200, "objets invalide"),
  }),
  couleurPion: strField(SHEET_STR_MAX.couleurPion, "couleur du pion"),
});

/** Type canonique : z.input — les records (racial, skillProficiencies)
 *  restent partiels comme le code les manipule (bonus raciaux partiels). */
export type CharacterSheet = z.input<typeof characterSheetSchema>;

// ── Modèle de PNJ (bibliothèque MJ) ─────────────────────────────

export const npcTemplateSchema = z.object({
  name: strField(80, "nom").refine((v) => v.trim().length > 0, "nom : requis"),
  ca: intField(1, 30, "CA"),
  pvMax: intField(1, 999, "PV max"),
  initBonus: intField(-10, 20, "bonus d'initiative"),
  color: strField(20, "couleur"),
  conditions: strArray(10, 40, "états", "état"),
  notes: strField(4000, "notes"),
});
export type NpcTemplateInput = z.infer<typeof npcTemplateSchema>;

// ── Builder (création PJ/PNJ) — remplace blankSheet et le POST REST ──

/** Partial profond : chaque sous-objet est partiel ; les tableaux et les
 *  Records (index signature string) restent entiers. */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : string extends keyof T[K]
      ? T[K]
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
};

function def<T>(v: T | undefined, fallback: T): T {
  return v ?? fallback;
}

export function createSheet(overrides: DeepPartial<CharacterSheet> = {}): CharacterSheet {
  return {
    identite: {
      nom: def(overrides.identite?.nom, "Sans nom"),
      race: def(overrides.identite?.race, ""),
      classe: def(overrides.identite?.classe, ""),
      niveau: def(overrides.identite?.niveau, 1),
      historique: def(overrides.identite?.historique, ""),
      alignement: def(overrides.identite?.alignement, ""),
      xp: def(overrides.identite?.xp, 0),
      ...(overrides.identite?.citation !== undefined
        ? { citation: overrides.identite.citation }
        : {}),
    },
    caracs: {
      for: def(overrides.caracs?.for, 10),
      dex: def(overrides.caracs?.dex, 10),
      con: def(overrides.caracs?.con, 10),
      int: def(overrides.caracs?.int, 10),
      sag: def(overrides.caracs?.sag, 10),
      cha: def(overrides.caracs?.cha, 10),
    },
    saveProficiencies: {
      for: def(overrides.saveProficiencies?.for, false),
      dex: def(overrides.saveProficiencies?.dex, false),
      con: def(overrides.saveProficiencies?.con, false),
      int: def(overrides.saveProficiencies?.int, false),
      sag: def(overrides.saveProficiencies?.sag, false),
      cha: def(overrides.saveProficiencies?.cha, false),
    },
    skillProficiencies: def(overrides.skillProficiencies, {}),
    ca: def(overrides.ca, 10),
    vitesse: def(overrides.vitesse, "9 m"),
    initiativeBonus: def(overrides.initiativeBonus, 0),
    pvMax: def(overrides.pvMax, 0),
    desDeVie: {
      faces: def(overrides.desDeVie?.faces, 8),
      total: def(overrides.desDeVie?.total, 1),
      restants: def(overrides.desDeVie?.restants, 1),
    },
    deathSaves: {
      successes: def(overrides.deathSaves?.successes, 0),
      failures: def(overrides.deathSaves?.failures, 0),
    },
    inspiration: def(overrides.inspiration, false),
    attaques: def(overrides.attaques, []),
    armures: def(overrides.armures, []),
    sorts: {
      caracIncantation: def(overrides.sorts?.caracIncantation, null),
      connus: def(overrides.sorts?.connus, []),
      emplacements: def(overrides.sorts?.emplacements, []),
    },
    capacites: def(overrides.capacites, []),
    personnalite: {
      traits: overrides.personnalite?.traits,
      ideaux: overrides.personnalite?.ideaux,
      liens: overrides.personnalite?.liens,
      defauts: overrides.personnalite?.defauts,
    },
    languesEtMaitrises: def(overrides.languesEtMaitrises, ""),
    portrait: def(overrides.portrait, null),
    racial: def(overrides.racial, null),
    pvAuto: overrides.pvAuto,
    caAuto: overrides.caAuto,
    equipement: {
      bourse: {
        po: def(overrides.equipement?.bourse?.po, 0),
        pa: def(overrides.equipement?.bourse?.pa, 0),
        pc: def(overrides.equipement?.bourse?.pc, 0),
      },
      objets: def(overrides.equipement?.objets, []),
    },
    couleurPion: def(overrides.couleurPion, "#C0392B"),
  };
}

// ── Normalisation (édition côté client — audit N1) ──────────────
// Une seule implémentation du clamp, lue depuis SHEET_BOUNDS/SHEET_STR_MAX :
// le client n'a plus à réencoder les bornes à la main (CharacterSheet.svelte).

function clampInt(v: unknown, [min, max]: readonly [number, number], fb: number): number {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fb;
}

function clampStr(v: unknown, max: number, fb = ""): string {
  return v === undefined || v === null ? fb : String(v).slice(0, max);
}

export function normalizeSheet(s: CharacterSheet): CharacterSheet {
  return {
    identite: {
      nom: clampStr(s.identite.nom, SHEET_STR_MAX.nom) || "Sans nom",
      race: clampStr(s.identite.race, SHEET_STR_MAX.nom),
      classe: clampStr(s.identite.classe, SHEET_STR_MAX.nom),
      niveau: clampInt(s.identite.niveau, SHEET_BOUNDS.niveau, 1),
      historique: clampStr(s.identite.historique, SHEET_STR_MAX.historique),
      alignement: clampStr(s.identite.alignement, SHEET_STR_MAX.alignement),
      xp: clampInt(s.identite.xp, SHEET_BOUNDS.xp, 0),
      citation:
        s.identite.citation === undefined
          ? undefined
          : clampStr(s.identite.citation, SHEET_STR_MAX.citation),
    },
    caracs: {
      for: clampInt(s.caracs.for, SHEET_BOUNDS.carac, 10),
      dex: clampInt(s.caracs.dex, SHEET_BOUNDS.carac, 10),
      con: clampInt(s.caracs.con, SHEET_BOUNDS.carac, 10),
      int: clampInt(s.caracs.int, SHEET_BOUNDS.carac, 10),
      sag: clampInt(s.caracs.sag, SHEET_BOUNDS.carac, 10),
      cha: clampInt(s.caracs.cha, SHEET_BOUNDS.carac, 10),
    },
    saveProficiencies: { ...s.saveProficiencies },
    skillProficiencies: { ...s.skillProficiencies },
    ca: clampInt(s.ca, SHEET_BOUNDS.ca, 10),
    vitesse: clampStr(s.vitesse, SHEET_STR_MAX.vitesse),
    initiativeBonus: clampInt(s.initiativeBonus, SHEET_BOUNDS.initiativeBonus, 0),
    pvMax: clampInt(s.pvMax, SHEET_BOUNDS.pvMax, 0),
    desDeVie: {
      faces: clampInt(s.desDeVie.faces, SHEET_BOUNDS.dvFaces, 8),
      total: clampInt(s.desDeVie.total, SHEET_BOUNDS.dvTotal, 1),
      restants: clampInt(s.desDeVie.restants, SHEET_BOUNDS.dvTotal, 1),
    },
    deathSaves: {
      successes: clampInt(s.deathSaves.successes, SHEET_BOUNDS.deathSave, 0),
      failures: clampInt(s.deathSaves.failures, SHEET_BOUNDS.deathSave, 0),
    },
    inspiration: !!s.inspiration,
    attaques: s.attaques.slice(0, 30).map((a) => ({
      id: a.id,
      name: clampStr(a.name, SHEET_STR_MAX.attaqueNom) || "Attaque",
      bonus: clampInt(a.bonus, SHEET_BOUNDS.attaqueBonus, 0),
      damage: clampStr(a.damage, SHEET_STR_MAX.attaqueDamage),
    })),
    armures: (s.armures ?? []).slice(0, 30).map((a) => ({
      id: a.id,
      name: clampStr(a.name, SHEET_STR_MAX.armureNom) || "Armure",
      ca: clampInt(a.ca, SHEET_BOUNDS.armureCa, 10),
      kind: ARMOR_KINDS.includes(a.kind as (typeof ARMOR_KINDS)[number])
        ? (a.kind as (typeof ARMOR_KINDS)[number])
        : "legere",
      equipee: !!a.equipee,
    })),
    caAuto: s.caAuto,
    pvAuto: s.pvAuto,
    sorts: {
      caracIncantation: s.sorts.caracIncantation,
      connus: s.sorts.connus.slice(0, 200).map((sp) => ({
        slug:
          clampStr(sp.slug, SHEET_STR_MAX.sortSlug).replace(/\s+/g, "-").toLowerCase() || "sort",
        level: clampInt(sp.level, SHEET_BOUNDS.sortNiveau, 0),
        name: sp.name === undefined ? undefined : clampStr(sp.name, SHEET_STR_MAX.sortNom),
      })),
      emplacements: s.sorts.emplacements
        .slice(0, 10)
        .map((e) => ({
          level: clampInt(e.level, SHEET_BOUNDS.sortNiveau, 1),
          max: clampInt(e.max, SHEET_BOUNDS.emplacementCount, 0),
          used: clampInt(e.used, SHEET_BOUNDS.emplacementCount, 0),
        }))
        .sort((a, b) => a.level - b.level),
    },
    capacites: s.capacites.slice(0, 60).map((c) => ({
      id: c.id,
      name: clampStr(c.name, SHEET_STR_MAX.capaciteNom) || "Capacité",
      description: clampStr(c.description, SHEET_STR_MAX.capaciteDesc),
    })),
    personnalite: {
      traits: s.personnalite.traits
        ? clampStr(s.personnalite.traits, SHEET_STR_MAX.personnalite)
        : undefined,
      ideaux: s.personnalite.ideaux
        ? clampStr(s.personnalite.ideaux, SHEET_STR_MAX.personnalite)
        : undefined,
      liens: s.personnalite.liens
        ? clampStr(s.personnalite.liens, SHEET_STR_MAX.personnalite)
        : undefined,
      defauts: s.personnalite.defauts
        ? clampStr(s.personnalite.defauts, SHEET_STR_MAX.personnalite)
        : undefined,
    },
    languesEtMaitrises: clampStr(s.languesEtMaitrises, SHEET_STR_MAX.languesEtMaitrises),
    portrait: s.portrait ?? null,
    racial: s.racial ?? null,
    equipement: {
      bourse: {
        po: clampInt(s.equipement.bourse.po, SHEET_BOUNDS.bourse, 0),
        pa: clampInt(s.equipement.bourse.pa, SHEET_BOUNDS.bourse, 0),
        pc: clampInt(s.equipement.bourse.pc, SHEET_BOUNDS.bourse, 0),
      },
      objets: s.equipement.objets.slice(0, 200).map((o) => ({
        name: clampStr(o.name, SHEET_STR_MAX.objetNom) || "Objet",
        qty: clampInt(o.qty, SHEET_BOUNDS.objetQty, 1),
      })),
    },
    couleurPion: clampStr(s.couleurPion, SHEET_STR_MAX.couleurPion) || "#C0392B",
  };
}

// EOF sheet.ts
