/**
 * Scrollbar à place réservée : le pouce apparaît au scroll et s'efface
 * 300 ms après, sans décaler le contenu (cf. `surfaces.css`).
 */
export function scrollArea(node: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const onScroll = () => {
    node.dataset.scrolling = "";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      delete node.dataset.scrolling;
      timer = null;
    }, 300);
  };

  node.addEventListener("scroll", onScroll, { passive: true });

  return {
    destroy() {
      node.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    },
  };
}
