/** Cible d'un clic droit dans l'asset manager : le composant décrit la cible,
 *  la page construit les entrées et ouvre son menu unique (lot 5.4). */
export type AssetTarget =
  | { kind: "asset-map"; mapId: string }
  | { kind: "asset-template"; templateId: string; name: string; count: number }
  | { kind: "asset-char"; charId: string };

/** Entrée du menu contextuel unique (lot 5). */
export interface ContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  /** Affiche un séparateur au-dessus de cette entrée. */
  separatorBefore?: boolean;
  onSelect: () => void;
}
