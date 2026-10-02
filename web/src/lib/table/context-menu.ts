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
