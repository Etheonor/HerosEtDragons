// ═══════════════════════════════════════════════════════════
// RollWith H&D — Armures : constantes et types (sans zod, pour
// être importé par le client web sans gonfler le bundle).
// Le schéma de validation vit dans sheet.ts (zod).
// ═══════════════════════════════════════════════════════════

export const ARMOR_KINDS = ["legere", "intermediaire", "lourde", "bouclier"] as const;
export type ArmorKind = (typeof ARMOR_KINDS)[number];

export const ARMOR_KIND_LABELS: Record<ArmorKind, string> = {
  legere: "légère",
  intermediaire: "intermédiaire",
  lourde: "lourde",
  bouclier: "bouclier",
};

export interface Armor {
  id: string;
  name: string;
  /** CA de base (ou bonus pour un bouclier) */
  ca: number;
  kind: ArmorKind;
  /** portée : une armure + un bouclier max (pas d'empilement) */
  equipee: boolean;
}

// EOF armor.ts
