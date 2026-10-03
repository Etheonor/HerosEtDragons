<script lang="ts">
  import { onMount } from 'svelte';
  import type { TutorialStep } from './tutorial-steps';

  let {
    open,
    steps,
    onClose,
  }: {
    open: boolean;
    steps: TutorialStep[];
    onClose: () => void;
  } = $props();

  let index = $state(0);
  let rect = $state<{ x: number; y: number; w: number; h: number } | null>(null);

  const step = $derived(steps[index] ?? null);

  function measure() {
    if (!open || !step) return;
    const el = document.querySelector<HTMLElement>(step.target);
    if (!el) {
      rect = null;
      return;
    }
    const r = el.getBoundingClientRect();
    rect = { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  $effect(() => {
    void open;
    void index;
    requestAnimationFrame(measure);
  });

  onMount(() => {
    const onResize = () => measure();
    globalThis.addEventListener('resize', onResize);
    globalThis.addEventListener('scroll', onResize, true);
    return () => {
      globalThis.removeEventListener('resize', onResize);
      globalThis.removeEventListener('scroll', onResize, true);
    };
  });

  function next() {
    if (index >= steps.length - 1) onClose();
    else index += 1;
  }

  const bubble = $derived.by(() => {
    if (!rect) return { left: 0, top: 0, centered: true };
    const BUBBLE_H = 190;
    const top =
      rect.y + rect.h + 16 + BUBBLE_H > innerHeight
        ? Math.max(12, rect.y - BUBBLE_H - 16)
        : rect.y + rect.h + 16;
    const left = Math.min(Math.max(12, rect.x), innerWidth - 316);
    return { left, top, centered: false };
  });
</script>

{#if open && step}
  <div class="tut" role="dialog" aria-modal="true" aria-label="Tutoriel">
    {#if rect}
      <div
        class="tut-spot"
        style="left: {rect.x - 6}px; top: {rect.y - 6}px; width: {rect.w + 12}px; height: {rect.h + 12}px;"
      ></div>
    {:else}
      <div class="tut-scrim"></div>
    {/if}

    <div class="tut-bubble" class:centered={bubble.centered} style="left: {bubble.left}px; top: {bubble.top}px;">
      <div class="tut-count">Étape {index + 1} / {steps.length}</div>
      <div class="tut-title">{step.title}</div>
      <p class="tut-text">{step.text}</p>
      <div class="tut-actions">
        <button class="tut-btn" type="button" onclick={onClose}>Passer</button>
        <button class="tut-btn primary" type="button" onclick={next}>
          {index === steps.length - 1 ? 'Terminer' : 'Suivant'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tut {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
  }
  .tut-scrim {
    position: absolute;
    inset: 0;
    background: rgba(15, 13, 10, 0.72);
  }
  .tut-spot {
    position: fixed;
    border-radius: var(--radius-md);
    box-shadow:
      0 0 0 9999px rgba(15, 13, 10, 0.72),
      0 0 0 2px var(--accent);
    pointer-events: none;
    transition:
      left 200ms var(--ease-out),
      top 200ms var(--ease-out),
      width 200ms var(--ease-out),
      height 200ms var(--ease-out);
  }
  .tut-bubble {
    position: fixed;
    width: 304px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--surface-overlay);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-overlay);
  }
  .tut-bubble.centered {
    left: 50% !important;
    top: 50% !important;
    transform: translate(-50%, -50%);
  }
  .tut-count {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--accent-text);
  }
  .tut-title {
    font-family: var(--font-title);
    font-size: 19px;
    color: var(--heading);
  }
  .tut-text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text);
  }
  .tut-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .tut-btn {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    color: var(--text-2);
    background: transparent;
    border: 2px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .tut-btn:hover {
    color: var(--heading);
    border-color: var(--border);
  }
  .tut-btn.primary {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .tut-btn.primary:hover {
    background: var(--accent-hover);
    color: var(--accent-fg);
  }
</style>
