<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /**
     * Plan de surface.
     * - `canvas`  : fond de page, aucun rayon
     * - `raised`  : panneau ancré dans un écran (sidebar, barre, carte)
     * - `overlay` : surface flottante au-dessus de la carte (menu, popover, modale)
     */
    level?: 'canvas' | 'raised' | 'overlay';
    children: Snippet;
    class?: string;
  }

  const { level = 'raised', children, class: className = '' }: Props = $props();
</script>

<div class="surface surface--{level} {className}" data-surface={level}>
  {@render children()}
</div>

<style>
  .surface {
    box-sizing: border-box;
  }

  .surface--canvas {
    background: var(--bg);
  }

  .surface--raised {
    background: var(--panel);
    border: 2px solid var(--border-soft);
    border-radius: 12px;
    box-shadow: 0 6px 20px var(--shadow-2);
  }

  .surface--overlay {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 12px 40px var(--shadow-2);
  }
</style>