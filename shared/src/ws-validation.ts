// ═══════════════════════════════════════════════════════════
// RollWith H&D — Validation runtime des messages WS clients
// Source de vérité côté serveur (audit A3) : le DO parse chaque
// message avec clientMessageSchema avant tout traitement — bornes,
// types et defaults appliqués ; plus aucun cast manuel.
// Les types "protocole" (protocol.ts) restent la vue client.
// ═══════════════════════════════════════════════════════════

import { z } from "zod";

const id = z.string({ error: "identifiant requis" }).min(1).max(64);
const coord = z.number({ error: "coordonnées numériques requises" });

function intField(min: number, max: number, label: string): z.ZodNumber {
  const msg = `${label} : entier attendu entre ${min} et ${max}`;
  return z.number({ error: msg }).int(msg).min(min, msg).max(max, msg);
}

export const chatSaySchema = z.object({
  type: z.literal("chat.say"),
  text: z.string({ error: "texte requis" }).min(1).max(2000),
});

export const diceRollSchema = z
  .object({
    type: z.literal("dice.roll"),
    sides: intField(2, 100, "faces du dé").default(20),
    n: intField(1, 20, "nombre de dés").default(1),
    mod: intField(-100, 100, "modificateur").default(0),
    drop: intField(0, 19, "dés biffés").default(0),
    label: z.string({ error: "label requis" }).max(120).optional(),
  })
  .refine((v) => v.drop <= v.n - 1, { message: "dés biffés : au plus n-1", path: ["drop"] });

export const charHpSchema = z.object({
  type: z.literal("char.hp"),
  charId: id,
  delta: intField(-100, 100, "delta de PV"),
});

export const charConditionSchema = z.object({
  type: z.literal("char.condition"),
  charId: id,
  cond: z.string({ error: "état requis" }).min(1).max(40),
  on: z.boolean({ error: "on attendu" }),
});

export const tokenMoveSchema = z.object({
  type: z.literal("token.move"),
  tokenId: id,
  x: coord,
  y: coord,
});

export const tokenPutSchema = z.object({
  type: z.literal("token.put"),
  charId: id,
  x: coord,
  y: coord,
});

export const tokenRemoveSchema = z.object({
  type: z.literal("token.remove"),
  charId: id,
});

export const npcDuplicateSchema = z.object({
  type: z.literal("npc.duplicate"),
  charId: id,
});

export const npcAddFromTemplateSchema = z.object({
  type: z.literal("npc.addFromTemplate"),
  templateId: id,
  x: coord,
  y: coord,
  count: intField(1, 20, "nombre de copies").default(1),
});

export const npcSaveAsTemplateSchema = z.object({
  type: z.literal("npc.saveAsTemplate"),
  charId: id,
});

export const npcAddSchema = z.object({
  type: z.literal("npc.add"),
  name: z.string({ error: "nom requis" }).max(80).default("PNJ"),
  pv: intField(1, 999, "PV").default(1),
  ca: intField(1, 30, "CA").default(10),
  init: intField(-10, 20, "initiative").default(0),
  x: coord.optional(),
  y: coord.optional(),
  saveAsTemplate: z.boolean({ error: "saveAsTemplate attendu" }).default(false),
});

export const npcRemoveSchema = z.object({
  type: z.literal("npc.remove"),
  charId: id,
});

export const mapSelectSchema = z.object({
  type: z.literal("map.select"),
  mapId: id,
});

export const markerSetSchema = z.object({
  type: z.literal("marker.set"),
  id: z.string({ error: "identifiant requis" }).max(64).optional(),
  x: coord,
  y: coord,
  text: z.string({ error: "texte requis" }).max(200),
});

export const markerMoveSchema = z.object({
  type: z.literal("marker.move"),
  id: id,
  x: coord,
  y: coord,
});

export const markerRemoveSchema = z.object({
  type: z.literal("marker.remove"),
  id: id,
});

export const markerClearSchema = z.object({ type: z.literal("marker.clear") });

export const fogEnableSchema = z.object({ type: z.literal("fog.enable") });
export const fogCoverSchema = z.object({ type: z.literal("fog.cover") });
export const fogDisableSchema = z.object({ type: z.literal("fog.disable") });

export const fogRevealSchema = z.object({
  type: z.literal("fog.reveal"),
  x: coord,
  y: coord,
});

export const pingSchema = z.object({
  type: z.literal("ping"),
  x: coord,
  y: coord,
});

export const modeSetSchema = z.object({
  type: z.literal("mode.set"),
  mode: z.enum(["exploration", "combat"], { error: "mode inconnu" }),
});

export const initiativeRollSchema = z.object({
  type: z.literal("initiative.roll"),
  charId: id,
});

export const combatNextSchema = z.object({ type: z.literal("combat.next") });

// Messages d'inventaire (R9). `inv.give` couvre l'argent ET les objets via un
// champ `kind` : le discriminant externe du union reste `type`, donc on ne peut
// pas imbriquer un second discriminatedUnion — d'où la refinement « xor ».
const money = z.object({
  po: intField(0, 1_000_000, "po"),
  pa: intField(0, 1_000_000, "pa"),
  pc: intField(0, 1_000_000, "pc"),
});

const itemName = z.string({ error: "objet requis" }).min(1).max(200);

export const invGiveSchema = z
  .object({
    type: z.literal("inv.give"),
    kind: z.enum(["money", "item"]),
    from: id,
    to: id,
    money: money.optional(),
    item: itemName.optional(),
  })
  .refine((v) => (v.kind === "money" ? !!v.money && !v.item : !!v.item && !v.money), {
    message: "don : argent ou objet, pas les deux",
    path: ["kind"],
  });

export const invAddSchema = z.object({
  type: z.literal("inv.add"),
  charId: id,
  item: itemName,
  qty: intField(1, 9999, "quantité").default(1),
});

export const invDropSchema = z.object({
  type: z.literal("inv.drop"),
  charId: id,
  item: itemName,
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  chatSaySchema,
  diceRollSchema,
  charHpSchema,
  charConditionSchema,
  tokenMoveSchema,
  tokenPutSchema,
  tokenRemoveSchema,
  npcDuplicateSchema,
  npcAddFromTemplateSchema,
  npcSaveAsTemplateSchema,
  npcAddSchema,
  npcRemoveSchema,
  mapSelectSchema,
  markerSetSchema,
  markerMoveSchema,
  markerRemoveSchema,
  markerClearSchema,
  fogEnableSchema,
  fogCoverSchema,
  fogDisableSchema,
  fogRevealSchema,
  pingSchema,
  modeSetSchema,
  initiativeRollSchema,
  combatNextSchema,
  invGiveSchema,
  invAddSchema,
  invDropSchema,
]);

export type ClientMessageInput = z.infer<typeof clientMessageSchema>;

// EOF ws-validation.ts
