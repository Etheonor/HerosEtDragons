/**
 * Pile d'affichage des panneaux flottants (lot 5).
 *
 * Le dernier panneau touché passe au-dessus des autres — mais TOUS restent sous
 * `--z-overlay` (400), où vivent les popovers legacy et le top layer (menus,
 * dialogs). La pile est partagée et réactive : chaque panneau relit son rang,
 * donc aucun compteur local ne peut diverger.
 */

let stack = $state<string[]>([]);

export function bringToFront(id: string): void {
  stack = [...stack.filter((x) => x !== id), id];
}

export function panelZ(id: string): number {
  const i = stack.indexOf(id);
  return 300 + Math.max(0, i);
}
