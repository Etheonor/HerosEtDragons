// ═══════════════════════════════════════════════════════════
// RollWith H&D — Validation de la feuille de personnage (audit §5.2)
// Implémentation : schémas Zod canoniques de sheet.ts.
// API publique conservée : retourne un message d'erreur lisible,
// ou null si la valeur est valide.
// ═══════════════════════════════════════════════════════════

import { characterSheetSchema, npcTemplateSchema } from "./sheet";
import type { z } from "zod";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstIssue(raw: unknown, schema: z.ZodType<unknown>, invalid: string): string | null {
  if (!isObj(raw)) return invalid;
  const res = schema.safeParse(raw);
  if (res.success) return null;
  return res.error.issues[0]?.message ?? invalid;
}

export function validateCharacterSheet(raw: unknown): string | null {
  return firstIssue(raw, characterSheetSchema, "Feuille invalide");
}

export function validateNpcTemplate(raw: unknown): string | null {
  return firstIssue(raw, npcTemplateSchema, "Modèle invalide");
}

// EOF validation.ts
