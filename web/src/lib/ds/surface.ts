/**
 * Garde-fou des surfaces flottantes bits-ui.
 *
 * Piège vérifié dans le code publié de bits-ui 2.19.3 : la valeur réelle de
 * `strategy` est `absolute` (et non `fixed` comme l'annonce la doc). Dans une
 * carte portant `transform`, un contenu ancré en `absolute` reste prisonnier
 * du containing block et se fait mettre à l'échelle avec elle.
 *
 * Règle : tout contenu **ancré** (Popover, DropdownMenu, ContextMenu,
 * Tooltip…) passe par `surfaceProps()` — qui force `strategy: 'fixed'` et les
 * classes de surface — et s'enveloppe dans son `<X.Portal>`.
 * Un **modal centré** (Dialog) n'accepte pas `strategy` : il prend
 * `surfaceClass()` et son `<X.Portal>`.
 *
 * Référence : docs/atlas-benchmark/05-architecture-svelte.md §1.
 */
export type SurfaceLevel = "raised" | "overlay";

export function surfaceClass(level: SurfaceLevel = "overlay", className = ""): string {
  return `surface-${level}${className ? ` ${className}` : ""}`;
}

export function surfaceProps(
  level: SurfaceLevel = "overlay",
  className = "",
): { strategy: "fixed"; class: string } {
  return { strategy: "fixed", class: surfaceClass(level, className) };
}
