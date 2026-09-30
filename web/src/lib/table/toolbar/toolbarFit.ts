/**
 * Sortie d'outils par priorité : quand la barre manque de place, on retire les
 * éléments de plus faible priorité (à égalité, les derniers de la liste), en
 * gardant toujours les éléments « épinglés » (outil actif, menu ouvert).
 *
 * Fonction pure : testée unitairement, sans DOM (docs/atlas-benchmark/07 §2b.2).
 */

export interface ToolbarItem {
  id: string;
  /** Largeur estimée en px (l'ordre de grandeur suffit : c'est une sortie par priorité). */
  width: number;
  /** Plus la valeur est haute, plus l'outil résiste à la sortie. */
  priority: number;
  /** Un élément épinglé ne sort jamais (outil actif, panneau ouvert). */
  pinned?: boolean;
}

export interface ToolbarFitResult {
  visible: ToolbarItem[];
  overflow: ToolbarItem[];
}

export const TOOLBAR_GAP = 6;

function totalWidth(items: ToolbarItem[], gap: number): number {
  if (items.length === 0) return 0;
  return items.reduce((sum, i) => sum + i.width, 0) + (items.length - 1) * gap;
}

export function fitToolbar(
  items: readonly ToolbarItem[],
  available: number,
  gap = TOOLBAR_GAP,
): ToolbarFitResult {
  const visible = [...items];
  const overflow: ToolbarItem[] = [];

  // Sécurité : une largeur non mesurée (0) ne doit pas provoquer une boucle.
  const budget = Number.isFinite(available) ? available : Number.POSITIVE_INFINITY;

  while (totalWidth(visible, gap) > budget) {
    let candidate = -1;
    for (let i = 0; i < visible.length; i += 1) {
      const item = visible[i]!;
      if (item.pinned) continue;
      if (candidate === -1) {
        candidate = i;
        continue;
      }
      const current = visible[candidate]!;
      // Priorité la plus faible ; à égalité, le plus à droite (dernier d'abord).
      if (item.priority <= current.priority) {
        candidate = i;
      }
    }
    if (candidate === -1) break;
    const [removed] = visible.splice(candidate, 1);
    if (removed) overflow.push(removed);
  }

  const order = new Map(items.map((item, index) => [item.id, index]));
  overflow.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { visible, overflow };
}
