<script lang="ts">
  /**
   * Shell de panneau flottant (lot 5).
   *
   * - drag par l'en-tête, redimensionnement par 8 poignées ;
   * - z-order : le panneau cliqué passe au-dessus des autres ;
   * - snap aux bords du viewport (12 px) ;
   * - persistance localStorage **en fraction du viewport** (un layout sauvé sur
   *   un grand écran reste utilisable sur un petit), avec version de schéma ;
   * - la fermeture reste gérée par la page (`onClose`), qui possède aussi
   *   l'état ouvert/fermé (`panelsOpen`).
   */
  import { onMount, type Snippet } from 'svelte';
  import CloseButton from '$lib/ds/CloseButton.svelte';
  import { bringToFront, panelZ } from './panelStack.svelte';

  interface Props {
    id: string;
    title: string;
    campaignId: string;
    onClose?: () => void;
    /** Libellé accessible du bouton de fermeture (« Fermer la compagnie »). */
    closeLabel?: string;
    /** Rect initial en px, converti en fractions du viewport au premier montage. */
    initial: { x: number; y: number; w: number; h: number };
    minW?: number;
    minH?: number;
    class?: string;
    children: Snippet;
  }

  const {
    id,
    title,
    campaignId,
    onClose,
    closeLabel,
    initial,
    minW = 240,
    minH = 160,
    class: className = '',
    children,
  }: Props = $props();

  const SCHEMA = 1;
  const SNAP = 12;
  const EDGE = 4;

  type Rect = { x: number; y: number; w: number; h: number };
  type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

  let z = $derived(panelZ(id));

  function storeKey(): string {
    return `hd-panel:${campaignId}:${id}`;
  }

  let vw = $state(1280);
  let vh = $state(800);
  let frac = $state<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  let rect = $derived<Rect>({ x: frac.x * vw, y: frac.y * vh, w: frac.w * vw, h: frac.h * vh });

  let drag: { dx: number; dy: number } | null = null;
  let resize: { handle: Handle; sx: number; sy: number; start: Rect } | null = null;

  function clampToViewport(r: Rect): Rect {
    const w = Math.min(Math.max(r.w, minW), vw - EDGE);
    const h = Math.min(Math.max(r.h, minH), vh - EDGE);
    const x = Math.min(Math.max(r.x, EDGE - w + 40), vw - 40);
    const y = Math.min(Math.max(r.y, 0), vh - 32);
    return { x, y, w, h };
  }

  function toFractions(r: Rect): Rect {
    return { x: r.x / vw, y: r.y / vh, w: r.w / vw, h: r.h / vh };
  }

  function save() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify({ v: SCHEMA, ...toFractions(rect) }));
    } catch {
      /* stockage refusé : le panneau reste utilisable en mémoire */
    }
  }

  function load(): Rect | null {
    try {
      const raw = localStorage.getItem(storeKey());
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<Rect> & { v?: number };
      if (p.v !== SCHEMA) return null;
      if (
        typeof p.x !== 'number' ||
        typeof p.y !== 'number' ||
        typeof p.w !== 'number' ||
        typeof p.h !== 'number'
      ) {
        return null;
      }
      return { x: p.x, y: p.y, w: p.w, h: p.h };
    } catch {
      return null;
    }
  }

  function measure() {
    vw = globalThis.innerWidth || vw;
    vh = globalThis.innerHeight || vh;
  }

  onMount(() => {
    measure();
    bringToFront(id);
    const stored = load();
    frac = stored ?? toFractions(clampToViewport(initial));
    const onResize = () => {
      measure();
      frac = toFractions(clampToViewport(rect));
    };
    globalThis.addEventListener('resize', onResize);
    return () => globalThis.removeEventListener('resize', onResize);
  });

  function focusPanel() {
    bringToFront(id);
  }

  function onHeaderPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    focusPanel();
    drag = { dx: e.clientX - rect.x, dy: e.clientY - rect.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onHeaderPointerMove(e: PointerEvent) {
    if (!drag) return;
    let x = e.clientX - drag.dx;
    let y = e.clientY - drag.dy;
    if (Math.abs(x - EDGE) < SNAP) x = EDGE;
    if (Math.abs(y) < SNAP) y = 0;
    if (Math.abs(x + rect.w - vw) < SNAP) x = vw - rect.w - EDGE;
    frac = toFractions(clampToViewport({ ...rect, x, y }));
  }

  function onHeaderPointerUp() {
    if (!drag) return;
    drag = null;
    save();
  }

  function onHandlePointerDown(e: PointerEvent, handle: Handle) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    focusPanel();
    resize = { handle, sx: e.clientX, sy: e.clientY, start: { ...rect } };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!resize) return;
    const { handle, sx, sy, start } = resize;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    let { x, y, w, h } = start;
    if (handle.includes('e')) w = start.w + dx;
    if (handle.includes('s')) h = start.h + dy;
    if (handle.includes('w')) {
      w = start.w - dx;
      x = start.x + dx;
    }
    if (handle.includes('n')) {
      h = start.h - dy;
      y = start.y + dy;
    }
    if (w < minW) {
      if (handle.includes('w')) x -= minW - w;
      w = minW;
    }
    if (h < minH) {
      if (handle.includes('n')) y -= minH - h;
      h = minH;
    }
    frac = toFractions(clampToViewport({ x, y, w, h }));
  }

  function onHandlePointerUp() {
    if (!resize) return;
    resize = null;
    save();
  }
</script>

<div
  class="panel-surface surface-raised {className}"
  role="region"
  aria-label={title}
  style="left: {rect.x}px; top: {rect.y}px; width: {rect.w}px; height: {rect.h}px; z-index: {z};"
  onpointerdown={focusPanel}
>
  <div
    class="panel-head"
    role="presentation"
    onpointerdown={onHeaderPointerDown}
    onpointermove={onHeaderPointerMove}
    onpointerup={onHeaderPointerUp}
    onpointercancel={onHeaderPointerUp}
  >
    <span class="panel-title">{title}</span>
    {#if onClose}
      <CloseButton label={closeLabel ?? `Fermer ${title.toLowerCase()}`} onclick={onClose} />
    {/if}
  </div>

  <div class="panel-content">
    {@render children()}
  </div>

  {#each ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as handle (handle)}
    <div
      class="panel-handle handle-{handle}"
      role="presentation"
      onpointerdown={(e) => onHandlePointerDown(e, handle as Handle)}
      onpointermove={onHandlePointerMove}
      onpointerup={onHandlePointerUp}
      onpointercancel={onHandlePointerUp}
    ></div>
  {/each}
</div>

<style>
  .panel-surface {
    position: fixed;
    /* Le CSS scopé de la page (`.layer-chrome > *`) ne touche pas un composant :
       la surface s'autorise elle-même à recevoir les événements. */
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 6px 6px 12px;
    border-bottom: 2px solid var(--border);
    flex: none;
    cursor: grab;
    user-select: none;
  }
  .panel-head:active { cursor: grabbing; }
  .panel-title {
    font-family: var(--font-title);
    font-size: 15px;
    color: var(--heading);
    white-space: nowrap;
  }
  .panel-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .panel-handle {
    position: absolute;
    touch-action: none;
  }
  .handle-n { top: -3px; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
  .handle-s { bottom: -3px; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
  .handle-e { right: -3px; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
  .handle-w { left: -3px; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
  .handle-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
  .handle-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
  .handle-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
  .handle-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
</style>
