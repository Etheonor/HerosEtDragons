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
    [key: string]: unknown;
  }

  const { level = 'raised', children, class: className = '', ...rest }: Props = $props();
</script>

<div class="surface--{level} {className}" data-surface={level} {...rest}>
  {@render children()}
</div>

<style>
  .surface--raised,
  .surface--overlay {
    box-sizing: border-box;
  }
</style>
