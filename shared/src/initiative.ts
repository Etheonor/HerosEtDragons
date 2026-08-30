// ═══════════════════════════════════════════════════════════
// RollWith H&D — Initiative (R8)
// Tri décroissant + départage stable (R8.7) :
// 1. score le plus haut
// 2. bonus d'init le plus haut
// 3. PJ avant PNJ
// 4. ordre de jet (rollIndex croissant = premier arrivé)
// ═══════════════════════════════════════════════════════════

export interface InitiativeEntry {
  id: string;
  name: string;
  score: number;
  initBonus: number;
  kind: "pj" | "pnj";
  rollIndex: number;
}

export function sortInitiative(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.initBonus !== a.initBonus) return b.initBonus - a.initBonus;
    if (a.kind !== b.kind) return a.kind === "pj" ? -1 : 1;
    return a.rollIndex - b.rollIndex;
  });
}
