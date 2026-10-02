/**
 * Menu contextuel unique de la table (lot 5).
 *
 * Une seule instance, pilotée par la page : chaque surface (pion, repère, vide
 * de carte, et plus tard l'asset manager) l'ouvre à la position du pointeur
 * avec ses propres entrées. bits-ui gère le focus, les flèches, Échap et le
 * clic extérieur ; l'ancre est un point de 1 px posé à (x, y).
 */
<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import type { ContextMenuItem } from './context-menu';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
    onOpenChange: (open: boolean) => void;
  }

  const { open, x, y, items, onOpenChange }: Props = $props();
</script>

<DropdownMenu.Root {open} {onOpenChange}>
  <DropdownMenu.Trigger
    class="ctx-anchor"
    style="left: {x}px; top: {y}px"
    aria-label="Menu contextuel"
    tabindex={-1}
  ></DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      {...surfaceProps('overlay', 'ctx-menu')}
      side="bottom"
      align="start"
      sideOffset={2}
    >
      {#each items as item (item.id)}
        {#if item.separatorBefore}
          <DropdownMenu.Separator class="ctx-sep" />
        {/if}
        <DropdownMenu.Item
          class="ctx-item{item.danger ? ' danger' : ''}"
          disabled={item.disabled}
          onSelect={item.onSelect}
        >
          {item.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.ctx-anchor) {
    position: fixed;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    pointer-events: none;
  }
  :global(.ctx-menu) {
    /* `position` + `z-index` : bits-ui recopie le z-index calculé du contenu
       sur son wrapper flottant. Sans ça le wrapper reste en `auto` et un
       Dialog ouvert après lui (top layer applicatif, ex. la bibliothèque) le
       recouvre — le menu doit être au-dessus de tous les overlays. */
    position: relative;
    z-index: var(--z-toast);
    min-width: 210px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  :global(.ctx-menu .ctx-item) {
    font-family: var(--font-body);
    font-size: 13px;
    padding: 6px 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  :global(.ctx-menu .ctx-item[data-highlighted]) {
    background: var(--selected);
    color: var(--heading);
  }
  :global(.ctx-menu .ctx-item.danger[data-highlighted]) {
    background: var(--accent);
    color: var(--accent-fg);
  }
  :global(.ctx-menu .ctx-item[data-disabled]) {
    opacity: 0.4;
    cursor: default;
  }
  :global(.ctx-menu .ctx-sep) {
    height: 1px;
    margin: 3px 6px;
    background: var(--border-soft);
  }
</style>
