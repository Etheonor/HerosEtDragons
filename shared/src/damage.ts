// ═══════════════════════════════════════════════════════════
// RollWith H&D — Dégâts & PV temporaires (audit B3)
// Règle H&D/5E : les dégâts entament les PV temporaires d'abord,
// le reste (s'il y en a) entame les PV réels. Le soin ne touche
// jamais les PV temporaires (ils ne se cumulent pas avec un soin).
// ═══════════════════════════════════════════════════════════

export interface DamageResult {
  pv: number;
  pvTemp: number;
}

export function applyDamage(
  pv: number,
  pvTemp: number,
  pvMax: number,
  delta: number,
): DamageResult {
  if (delta >= 0) {
    return { pv: Math.min(pvMax, pv + delta), pvTemp };
  }
  let remaining = -delta;
  const absorbed = Math.min(pvTemp, remaining);
  remaining -= absorbed;
  return { pv: Math.max(0, pv - remaining), pvTemp: pvTemp - absorbed };
}

// EOF damage.ts
