// ═══════════════════════════════════════════════════════════
// RollWith H&D — Montée de niveau (9c)
// Logique pure et testable : le composant applique le résultat
// et ajoute les aptitudes du compendium (côté UI, async).
// Les PV suivent le calcul automatique (suggestedPvMax/pvAuto),
// cette fonction ne touche pas pvMax.
// ═══════════════════════════════════════════════════════════

import type { CharacterSheet } from "./sheet";
import { findClass, spellSlotsFor } from "./hd";

/**
 * Applique la montée au niveau `newLevel` (borné 1-20) :
 * - identite.niveau
 * - dés de vie : total = niveau, restants +1 (borné au total)
 * - emplacements de sorts reconstruits selon la table officielle du nouveau
 *   niveau : paliers disparus retirés, `used` conservé et borné au nouveau max.
 * Les classes sans table (ou homebrew non reconnues) perdent leurs paliers.
 */
export function applyLevelUp(sheet: CharacterSheet, newLevel: number): CharacterSheet {
  const level = Math.max(1, Math.min(20, Math.trunc(newLevel)));
  const classKey = findClass(sheet.identite?.classe)?.key ?? "";
  const slots = spellSlotsFor(classKey, level);

  const emplacements = slots
    .map((max, i) => ({ level: i + 1, max, used: 0 }))
    .filter((s) => s.max > 0)
    .map((s) => {
      const old = sheet.sorts.emplacements.find((e) => e.level === s.level);
      return old ? { ...s, used: Math.min(old.used, s.max) } : s;
    });

  return {
    ...sheet,
    identite: { ...sheet.identite, niveau: level },
    desDeVie: {
      ...sheet.desDeVie,
      total: level,
      restants: Math.min(sheet.desDeVie.restants + 1, level),
    },
    sorts: { ...sheet.sorts, emplacements },
  };
}

// EOF level-up.ts
