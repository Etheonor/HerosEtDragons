/**
 * Icônes de l'interface — source unique : `@lucide/svelte`.
 *
 * Règle du design system (`docs/atlas-benchmark/06-design-system.md` §3.1) :
 * **jamais de SVG recopié depuis Penpot, jamais de `<path>` écrit à la main.**
 * Une icône = un composant Lucide, importé ici sous un nom *sémantique* pour que
 * les maquettes (`03 · Design system`) et le code parlent le même langage.
 *
 * Les icônes de la planche Penpot sont des placeholders de nomenclature : elles
 * disent *quelle* icône va où, pas la géométrie. Si un nom manque, il se vérifie
 * dans `node_modules/@lucide/svelte/dist/icons/index.js`.
 */
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleQuestionMark,
  CloudFog,
  Dices,
  Flag,
  Hand,
  List,
  Map,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Settings,
  Skull,
  Sparkles,
  Swords,
  Undo2,
  X,
} from "@lucide/svelte";

export const ICONS = {
  /** Outils de la table. */
  hand: Hand,
  move: MousePointer2,
  npc: Skull,
  marker: Flag,
  fog: CloudFog,
  /** Chrome : cartes, bibliothèque, commandes, réglages, aide. */
  maps: Map,
  library: List,
  commands: Sparkles,
  settings: Settings,
  help: CircleQuestionMark,
  /** Icônes d'action et de fenêtre. */
  dice: Dices,
  attack: Swords,
  plus: Plus,
  minus: Minus,
  close: X,
  /** Historique (lot 4). */
  undo: Undo2,
  redo: Redo2,
  expand: Maximize2,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
} as const;

export type IconKey = keyof typeof ICONS;
