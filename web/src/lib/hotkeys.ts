/**
 * Table déclarative des raccourcis clavier de la table.
 *
 * Une seule source de vérité : l'exécution (page table) et l'aide (`?`,
 * `<HotkeyHelp>`) lisent la même table. Un raccourci qui n'y est pas n'existe
 * pas — c'est ce qui évite les conflits et les touches fantômes.
 *
 * Référence : docs/atlas-benchmark/07-parcours-implémentation.md §2a.
 */

export type HotkeyGroup = "Carte" | "Fenêtres" | "Outils" | "Combat" | "Édition";

export interface HotkeyDef {
  id: string;
  label: string;
  group: HotkeyGroup;
  /** `e.key` attendu, en minuscules (layout-aware : on lit le caractère produit). */
  key: string;
  /** Raccourci à modificateur (Ctrl/⌘) — c'est le cas de l'undo/redo. */
  mod?: boolean;
  /** Avec `mod`, exige aussi Shift (ex. Mod+Shift+Z = rétablir). */
  shift?: boolean;
  /** Rendu du raccourci dans l'aide (défaut : la touche brute). */
  display?: string;
  mjOnly?: boolean;
  /** Ne se déclenche pas tant qu'une sélection de texte est active. */
  yieldsToTextSelection?: boolean;
  keywords?: string[];
}

export const HOTKEYS: readonly HotkeyDef[] = [
  { id: "palette.open", label: "Command palette", group: "Carte", key: " " },
  { id: "map.hand", label: "Main — déplacer la carte", group: "Carte", key: "h" },
  { id: "map.reset", label: "Recadrer la carte", group: "Carte", key: "0" },
  {
    id: "camera.focus",
    label: "Recentrer sur le pion actif",
    group: "Carte",
    key: "c",
    keywords: ["caméra", "centrer", "focus", "pion"],
  },
  { id: "chat.focus", label: "Écrire dans le journal", group: "Carte", key: "/" },
  { id: "help.open", label: "Aide clavier", group: "Carte", key: "?" },

  { id: "panel.journal", label: "Journal", group: "Fenêtres", key: "j" },
  { id: "panel.dice", label: "Dés", group: "Fenêtres", key: "d" },
  { id: "panel.inventory", label: "Inventaire", group: "Fenêtres", key: "i" },

  { id: "tool.move", label: "Outil Déplacer", group: "Outils", key: "v", mjOnly: true },
  { id: "tool.pnj", label: "Outil PNJ", group: "Outils", key: "p", mjOnly: true },
  { id: "tool.marker", label: "Outil Repère", group: "Outils", key: "r", mjOnly: true },
  { id: "tool.fog", label: "Brouillard", group: "Outils", key: "b", mjOnly: true },

  { id: "dice.d4", label: "Lancer 1d4", group: "Combat", key: "1", mjOnly: true },
  { id: "dice.d6", label: "Lancer 1d6", group: "Combat", key: "2", mjOnly: true },
  { id: "dice.d8", label: "Lancer 1d8", group: "Combat", key: "3", mjOnly: true },
  { id: "dice.d10", label: "Lancer 1d10", group: "Combat", key: "4", mjOnly: true },
  { id: "dice.d12", label: "Lancer 1d12", group: "Combat", key: "5", mjOnly: true },
  { id: "dice.d20", label: "Lancer 1d20", group: "Combat", key: "6", mjOnly: true },

  {
    id: "undo",
    label: "Annuler la dernière action",
    group: "Édition",
    key: "z",
    mod: true,
    mjOnly: true,
    display: "Ctrl/⌘ Z",
    keywords: ["undo", "annuler", "retour"],
  },
  {
    id: "redo",
    label: "Rétablir",
    group: "Édition",
    key: "z",
    mod: true,
    shift: true,
    mjOnly: true,
    display: "Ctrl/⌘ ⇧ Z",
    keywords: ["redo", "rétablir", "refaire"],
  },
];

/** Groupes dans l'ordre d'affichage de l'aide. */
export const HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  "Carte",
  "Fenêtres",
  "Outils",
  "Combat",
  "Édition",
];

export interface HotkeyContext {
  isMj: boolean;
  /** Un overlay modal (palette, aide) est ouvert : les raccourcis carte sont muets. */
  overlayOpen?: boolean;
  /** Composition IME en cours. */
  composing?: boolean;
}

/**
 * Identifie le raccourci déclenché par un événement clavier, ou `null`.
 *
 * Contrat :
 * - Ctrl/Cmd n'est reconnu QUE pour les entrées `mod: true` (undo/redo) ;
 *   Alt désactive la table (réservé au navigateur) ;
 * - les champs de saisie et les overlays sont ignorés ;
 * - `e.repeat` est ignoré (maintenir une touche ne relance pas un outil).
 */
export function hotkeyIdFromEvent(e: KeyboardEvent, ctx: HotkeyContext): string | null {
  if (e.altKey) return null;
  if (ctx.composing || e.isComposing) return null;
  if (ctx.overlayOpen) return null;
  if (e.repeat) return null;

  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  ) {
    return null;
  }

  const hasMod = e.ctrlKey || e.metaKey;
  const key = e.key === " " ? " " : e.key.toLowerCase();
  const found = HOTKEYS.find(
    (h) => h.key === key && !!h.mod === hasMod && (!h.mod || !!e.shiftKey === !!h.shift),
  );
  if (!found) return null;
  if (found.mjOnly && !ctx.isMj) return null;
  if (found.yieldsToTextSelection && (globalThis.getSelection?.()?.toString() ?? "") !== "") {
    return null;
  }
  return found.id;
}

/** Raccourcis visibles par un rôle, groupés dans l'ordre canonique. */
export function hotkeysForRole(isMj: boolean): { group: HotkeyGroup; items: HotkeyDef[] }[] {
  return HOTKEY_GROUPS.map((group) => ({
    group,
    items: HOTKEYS.filter((h) => h.group === group && (!h.mjOnly || isMj)),
  })).filter((g) => g.items.length > 0);
}
