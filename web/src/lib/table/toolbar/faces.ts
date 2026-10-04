/**
 * Familles d'outils de la table et leur « face » (icône, libellé, raccourci).
 *
 * Un outil a une seule face active à la fois ; la barre lit sa présentation ici
 * pour qu'aucun libellé ne soit dupliqué entre le bouton, l'aide et la palette.
 */

export type ToolId = "hand" | "move" | "pnj" | "marker" | "fog";

export type ToolFamily = "hand" | "move" | "token" | "marker" | "fog";

import type { IconKey } from "$lib/ds/icons";

export interface ToolFace {
  id: ToolId;
  family: ToolFamily;
  label: string;
  /** Clé d'icône — voir `$lib/ds/icons` (jamais de glyphe écrit à la main). */
  icon: IconKey;
  /** Id dans la table `HOTKEYS` (affiché en <kbd>). */
  hotkey?: string;
  /** Destination : les options de l'outil, dans un popover ancré. */
  options?: boolean;
  mjOnly?: boolean;
}

export const TOOL_FACES: Record<ToolId, ToolFace> = {
  hand: { id: "hand", family: "hand", label: "Main", icon: "hand", hotkey: "map.hand" },
  move: {
    id: "move",
    family: "move",
    label: "Déplacer",
    icon: "move",
    hotkey: "tool.move",
    mjOnly: true,
  },
  pnj: {
    id: "pnj",
    family: "token",
    label: "PNJ",
    icon: "npc",
    hotkey: "tool.pnj",
    options: true,
    mjOnly: true,
  },
  marker: {
    id: "marker",
    family: "marker",
    label: "Repère",
    icon: "marker",
    hotkey: "tool.marker",
    options: true,
    mjOnly: true,
  },
  fog: {
    id: "fog",
    family: "fog",
    label: "Brouillard",
    icon: "fog",
    hotkey: "tool.fog",
    options: true,
    mjOnly: true,
  },
};

/** Ordre visuel de la barre (les entrées MJ sont filtrées par le rôle). */
export const TOOL_ORDER: readonly ToolId[] = ["hand", "move", "pnj", "marker", "fog"];
