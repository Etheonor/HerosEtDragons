/**
 * Mesure de distance sur la carte (outil « Règle »).
 *
 * La table joue en cases de 1,50 m (règle D&D 5e : 1 case = 5 pieds). La
 * conversion vit ici, pure et testée ; l'outil ne fait que projeter les
 * clics en pixels de surface.
 */

export const DEFAULT_CELL_METERS = 1.5;

/**
 * Distance en cases selon la règle D&D 5e (2024, « Playing on a Grid ») :
 * la diagonale compte comme une case, donc distance de Chebyshev
 * `max(|dx|, |dy|)` en cases — pas la distance à vol d'oiseau.
 */
export function distanceInCells(dxPx: number, dyPx: number, cellPx: number): number {
  if (!(cellPx > 0)) return 0;
  return Math.max(Math.abs(dxPx), Math.abs(dyPx)) / cellPx;
}

export function cellsToMeters(cells: number, metersPerCell = DEFAULT_CELL_METERS): number {
  return cells * metersPerCell;
}

const METERS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const CELLS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** « 4,5 m ». */
export function formatMeters(meters: number): string {
  return `${METERS.format(meters)} m`;
}

/** « 3 cases » / « 1 case » (virgule française, singulier sous 2). */
export function formatCells(cells: number): string {
  return `${CELLS.format(cells)} ${cells >= 2 ? "cases" : "case"}`;
}
