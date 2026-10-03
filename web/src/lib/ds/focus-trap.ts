/**
 * Piège de focus pour les modales maison (les Dialog bits-ui le font déjà).
 *
 * - focus le premier élément focusable à l'ouverture ;
 * - `Tab` / `Shift+Tab` bouclent dans la modale ;
 * - `Escape` déclenche `onEscape` ;
 * - restaure le focus précédent à la destruction.
 */
export function focusTrap(node: HTMLElement, options: { onEscape?: () => void } = {}) {
  const previous = document.activeElement as HTMLElement | null;
  const SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusables(): HTMLElement[] {
    return [...node.querySelectorAll<HTMLElement>(SELECTOR)].filter(
      (el) => el.offsetParent !== null,
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      options.onEscape?.();
      return;
    }
    if (e.key !== "Tab") return;
    const els = focusables();
    if (els.length === 0) {
      e.preventDefault();
      return;
    }
    const first = els[0]!;
    const last = els[els.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener("keydown", onKeydown);
  requestAnimationFrame(() => focusables()[0]?.focus());

  return {
    destroy() {
      node.removeEventListener("keydown", onKeydown);
      previous?.focus?.();
    },
  };
}
