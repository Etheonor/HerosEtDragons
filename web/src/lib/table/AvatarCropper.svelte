<script lang="ts">
  /**
   * Cadrage d'avatar : l'image choisie s'affiche dans un carré, un cercle
   * indique le rendu final ; on déplace l'image au pointeur, la molette zoome
   * (minimum « cover », ×4 max), et « Valider » produit un carré 512² WebP
   * (repli JPEG) — seuls ~100 Ko partent au serveur.
   *
   * Décodage via createImageBitmap(imageOrientation:"from-image") : l'EXIF des
   * photos est appliqué (sinon une photo portrait sortirait couchée).
   */
  import { Dialog } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import { showToast } from '$lib/toast.svelte';
  import {
    centeredOffset,
    clampOffset,
    clampZoom,
    coverScale,
    cropRect,
    zoomAt,
    CROP_MAX_ZOOM,
  } from '@rollwith/shared/avatar-crop';

  interface Props {
    /** Fichier à cadrer ; null = boîte fermée. */
    file: File | null;
    title?: string;
    onCancel: () => void;
    onConfirm: (file: File) => void;
  }

  const { file, title = "Cadrer l'avatar", onCancel, onConfirm }: Props = $props();

  const VIEW = 320;
  const OUT = 512;

  let canvasEl: HTMLCanvasElement | null = null;
  let bitmap = $state<CanvasImageSource | null>(null);
  let iw = $state(0);
  let ih = $state(0);
  let zoom = $state(1);
  let offset = $state({ ox: 0, oy: 0 });
  let busy = $state(false);
  let objectUrl: string | null = null;
  let drag = $state<{ x: number; y: number } | null>(null);

  const baseScale = $derived(coverScale(iw, ih, VIEW));
  const scale = $derived(baseScale * zoom);
  const dw = $derived(iw * scale);
  const dh = $derived(ih * scale);

  function resetView() {
    zoom = 1;
    offset = centeredOffset(iw * baseScale, ih * baseScale, VIEW);
  }

  $effect(() => {
    const f = file;
    if (!f) return;
    let alive = true;
    void (async () => {
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
        if (!alive) {
          bmp.close();
          return;
        }
        bitmap = bmp;
        iw = bmp.width;
        ih = bmp.height;
        resetView();
      } catch {
        // Repli sans orientation explicite (vieux Safari) : <img> + objectURL.
        try {
          const url = URL.createObjectURL(f);
          const img = new Image();
          img.src = url;
          await img.decode();
          if (!alive) return;
          objectUrl = url;
          bitmap = img;
          iw = img.naturalWidth;
          ih = img.naturalHeight;
          resetView();
        } catch {
          showToast('Image illisible', 'error');
          onCancel();
        }
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };
  });

  // Redessine l'aperçu à chaque mutation du cadrage (bitmap inclus).
  $effect(() => {
    const bmp = bitmap;
    const ox = offset.ox;
    const oy = offset.oy;
    const s = scale;
    if (!canvasEl || !bmp || !s) return;
    const dpr = globalThis.devicePixelRatio || 1;
    canvasEl.width = Math.round(VIEW * dpr);
    canvasEl.height = Math.round(VIEW * dpr);
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, ox, oy, iw * s, ih * s);
  });

  function clampAll() {
    offset = clampOffset(offset.ox, offset.oy, dw, dh, VIEW);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    offset = clampOffset(offset.ox + (e.clientX - drag.x), offset.oy + (e.clientY - drag.y), dw, dh, VIEW);
    drag = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp() {
    drag = null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const z2 = clampZoom(zoom * Math.exp(-e.deltaY * 0.0015));
    if (z2 === zoom) return;
    const next = zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      offset.ox,
      offset.oy,
      baseScale * zoom,
      baseScale * z2,
    );
    zoom = z2;
    offset = clampOffset(next.ox, next.oy, iw * baseScale * z2, ih * baseScale * z2, VIEW);
  }

  function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          // Vieux Safari : pas d'encodeur WebP → repli JPEG.
          else canvas.toBlob((b2) => resolve(b2), 'image/jpeg', 0.9);
        },
        'image/webp',
        0.85,
      );
    });
  }

  async function confirm() {
    const bmp = bitmap;
    if (!bmp || busy) return;
    busy = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      const { sx, sy, size } = cropRect(offset.ox, offset.oy, scale, VIEW);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, sx, sy, size, size, 0, 0, OUT, OUT);
      const blob = await toBlob(canvas);
      if (!blob) throw new Error('blob');
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      onConfirm(new File([blob], `avatar.${ext}`, { type: blob.type }));
    } catch {
      showToast("Export de l'avatar impossible", 'error');
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root open={file !== null} onOpenChange={(o) => !o && onCancel()}>
  <Dialog.Portal>
    <Dialog.Overlay class="crop-scrim" />
    <Dialog.Content {...surfaceProps('overlay', 'crop-dialog')} aria-label={title}>
      <h3 class="crop-title">{title}</h3>
      <div
        class="crop-view"
        class:dragging={!!drag}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onwheel={onWheel}
        role="presentation"
      >
        <canvas bind:this={canvasEl} class="crop-canvas"></canvas>
        <div class="crop-ring" aria-hidden="true"></div>
      </div>
      <p class="crop-hint">
        Le cercle indique le rendu de l'avatar — déplacez l'image, molette pour zoomer.
      </p>
      <div class="crop-actions">
        <button type="button" class="crop-btn" onclick={resetView}>Recentrer</button>
        <span class="crop-grow"></span>
        <button type="button" class="crop-btn" onclick={onCancel}>Annuler</button>
        <button
          type="button"
          class="crop-btn primary"
          class:busy
          disabled={busy || !bitmap}
          onclick={() => void confirm()}
        >
          Valider
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.crop-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.crop-dialog) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 372px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .crop-title {
    margin: 0;
    font-family: var(--font-title);
    font-size: 17px;
    font-weight: 400;
    color: var(--heading);
  }
  .crop-view {
    position: relative;
    width: 320px;
    height: 320px;
    overflow: hidden;
    align-self: center;
    background: var(--sunken);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: grab;
    touch-action: none;
  }
  .crop-view.dragging {
    cursor: grabbing;
  }
  .crop-canvas {
    position: absolute;
    inset: 0;
    width: 320px;
    height: 320px;
    pointer-events: none;
  }
  /* Le cercle = rendu de l'avatar ; le reste du carré est assombri. */
  .crop-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1.5px rgba(255, 255, 255, 0.85),
      inset 0 0 0 2.5px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .crop-hint {
    margin: 0;
    font-size: 12.5px;
    font-style: italic;
    color: var(--text-2);
    text-align: center;
  }
  .crop-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .crop-grow {
    flex: 1;
  }
  .crop-btn {
    font: inherit;
    font-size: 13px;
    padding: 6px 12px;
    color: var(--text-2);
    background: var(--panel);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .crop-btn:hover:not(:disabled) {
    color: var(--heading);
    border-color: var(--border-strong);
  }
  .crop-btn.primary {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .crop-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
