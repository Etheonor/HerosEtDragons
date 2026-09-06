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
    nom: strField(100, "nom"),
    race: strField(100, "race"),
    classe: strField(100, "classe"),
    niveau: intField(1, 20, "niveau"),
    historique: strField(100, "historique"),
    alignement: strField(60, "alignement"),
    xp: intField(0, 5_000_000, "xp"),
    citation: strField(4000, "citation").optional(),
  }),
  caracs: z.object({
    for: intField(1, 30, "carac for"),
    dex: intField(1, 30, "carac dex"),
    con: intField(1, 30, "carac con"),
    int: intField(1, 30, "carac int"),
    sag: intField(1, 30, "carac sag"),
    cha: intField(1, 30, "carac cha"),
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
  ca: intField(0, 40, "CA"),
  vitesse: strField(40, "vitesse"),
  initiativeBonus: intField(-5, 20, "bonus d'initiative"),
  pvMax: intField(0, 1000, "pvMax"),
  desDeVie: z.object({
    faces: intField(4, 12, "dés de vie (faces)"),
    total: intField(0, 21, "dés de vie (total)"),
    restants: intField(0, 21, "dés de vie (restants)"),
  }),
  deathSaves: z.object({
    successes: intField(0, 3, "jets contre la mort (réussites)"),
    failures: intField(0, 3, "jets contre la mort (échecs)"),
  }),
  inspiration: z.boolean({ error: "inspiration" }),
  attaques: z
    .array(
      z.object({
        id: strField(60, "attaque id"),
        name: strField(100, "attaque nom"),
        bonus: intField(-5, 30, "attaque bonus"),
        damage: strField(40, "attaque dégâts"),
      }),
    )
    .max(30, "attaques invalide"),
  armures: z.array(armorSchema).max(30, "armures invalide").optional(),
  sorts: z.object({
    caracIncantation: z.enum(CARACS, { error: "caractéristique d'incantation" }).nullable(),
    connus: z
      .array(
        z.object({
          slug: strField(100, "sort slug"),
          level: intField(0, 9, "sort niveau"),
          name: strField(100, "sort nom").optional(),
        }),
      )
      .max(200, "sorts connus invalide"),
    emplacements: z
      .array(
        z.object({
          level: intField(0, 9, "niveau d'emplacement"),
          max: intField(0, 16, "emplacements max"),
          used: intField(0, 16, "emplacements utilisés"),
        }),
      )
      .max(10, "emplacements de sorts invalides"),
  }),
  capacites: z
    .array(
      z.object({
        id: strField(60, "capacité id"),
        name: strField(100, "capacité nom"),
        description: strField(4000, "capacité description"),
      }),
    )
    .max(60, "capacites invalide"),
  personnalite: z.object({
    traits: strField(4000, "personnalité traits").optional(),
    ideaux: strField(4000, "personnalité ideaux").optional(),
    liens: strField(4000, "personnalité liens").optional(),
    defauts: strField(4000, "personnalité defauts").optional(),
  }),
  languesEtMaitrises: strField(4000, "langues & maîtrises"),
  portrait: strField(80, "portrait").optional().nullable(),
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
      po: intField(0, 1_000_000, "po"),
      pa: intField(0, 1_000_000, "pa"),
      pc: intField(0, 1_000_000, "pc"),
    }),
    objets: z
      .array(
        z.object({
          name: strField(200, "objet nom"),
          qty: intField(0, 9999, "objet quantité"),
        }),
      )
      .max(200, "objets invalide"),
  }),
  couleurPion: strField(20, "couleur du pion"),
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

// EOF sheet.ts
