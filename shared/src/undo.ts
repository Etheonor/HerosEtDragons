/**
 * Opérations inversables de l'undo transactionnel (lot 4).
 *
 * Le DO garde une pile d'opérations appliquées et une pile d'opérations
 * annulées. Chaque opération embarque de quoi restaurer l'état exact dans les
 * deux sens — y compris recréer une fiche PNJ supprimée — sans relire le
 * passé. Appliquer une opération est une mutation normale : journal + broadcast
 * (filtrés B5).
 *
 * Un geste = un pas : les opérations de déplacement (`token.move`,
 * `marker.move`) et de brouillard (`fog.paint`) sont regroupées côté DO grâce au
 * drapeau `begin` envoyé par le client au premier message d'un drag/trait.
 */

import type { CombatState, FogState, Marker } from "./protocol";
import type { CharacterSheet } from "./sheet";
import type { Inventory } from "./inventory";

export interface UndoPos {
  x: number;
  y: number;
}

/** Fiche complète nécessaire pour recréer un personnage supprimé. */
export interface UndoCharacter {
  id: string;
  ownerId: string | null;
  kind: "pj" | "pnj";
  name: string;
  color: string;
  active: boolean;
  sheet: CharacterSheet;
  pv: number;
  pvMax: number;
  pvTemp: number;
  conditions: string[];
  tokenScale: number;
  inventory: Inventory;
}

/** Pion d'un personnage sur une carte (clé interne : "" = aucune carte). */
export interface UndoToken {
  mapId: string;
  pos: UndoPos;
}

export type UndoOp =
  | { kind: "token.move"; mapId: string; charId: string; before: UndoPos; after: UndoPos }
  | { kind: "token.place"; mapId: string; charId: string; pos: UndoPos }
  | { kind: "token.remove"; mapId: string; charId: string; pos: UndoPos }
  | { kind: "npc.create"; char: UndoCharacter; tokens: UndoToken[] }
  | { kind: "npc.delete"; char: UndoCharacter; tokens: UndoToken[] }
  | { kind: "combat.set"; before: CombatState | null; after: CombatState | null }
  | { kind: "marker.add"; mapId: string; marker: Marker }
  | { kind: "marker.move"; mapId: string; id: string; before: UndoPos; after: UndoPos }
  | { kind: "marker.remove"; mapId: string; marker: Marker }
  | { kind: "marker.clear"; mapId: string; markers: Marker[] }
  | { kind: "fog.paint"; mapId: string; index: number; points: UndoPos[] }
  | { kind: "fog.set"; mapId: string; before: FogState | null; after: FogState | null }
  | { kind: "batch"; label: string; ops: UndoOp[] };

export interface UndoStacks {
  undo: UndoOp[];
  redo: UndoOp[];
}

/**
 * Libellé court pour le journal. **Jamais de nom propre** : annuler le retrait
 * d'un PNJ caché ne doit pas le nommer chez les joueurs (B5).
 */
export function undoLabel(op: UndoOp): string {
  switch (op.kind) {
    case "token.move":
      return "le déplacement d'un pion";
    case "token.place":
      return "la pose d'un pion";
    case "token.remove":
      return "le retrait d'un pion";
    case "npc.create":
      return "l'ajout d'un PNJ";
    case "npc.delete":
      return "le retrait d'un PNJ";
    case "combat.set":
      return "un changement de combat";
    case "marker.add":
      return "la pose d'un repère";
    case "marker.move":
      return "le déplacement d'un repère";
    case "marker.remove":
      return "le retrait d'un repère";
    case "marker.clear":
      return "l'effacement des repères";
    case "fog.paint":
      return "une passe de brouillard";
    case "fog.set":
      return "un changement de brouillard";
    case "batch":
      return op.label;
  }
}
