<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Popover } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';

  interface Props {
    label: string;
    icon: string;
    active?: boolean;
    /** Raccourci affiché dans le bouton (déjà formaté : « V », « B »…). */
    hotkeyLabel?: string;
    disabled?: boolean;
    onselect: () => void;
    /** Options de l'outil, dans un popover ancré et portalé. */
    options?: Snippet;
    class?: string;
  }

  const {
    label,
    icon,
    active = false,
    hotkeyLabel,
    disabled = false,
    onselect,
    options,
    class: className = '',
  }: Props = $props();
</script>

<div class="tool-group {active ? 'is-active' : ''} {className}">
  <button
    type="button"
    class="tg-main"
    class:active
    {disabled}
    aria-pressed={active}
    aria-label={label}
    onclick={onselect}
  >
    <span class="tg-icon" aria-hidden="true">{icon}</span>
    <span class="tg-label">{label}</span>
    {#if hotkeyLabel}<kbd class="tg-kbd">{hotkeyLabel}</kbd>{/if}
  </button>
  {#if options}
    <Popover.Root>
      <Popover.Trigger class="tg-more" aria-label="Options — {label}">▾</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...surfaceProps('overlay', 'tool-options')}
          side="top"
          align="center"
          sideOffset={8}
        >
          {@render options()}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  {/if}
</div>

<style>
  .tool-group {
    display: inline-flex;
    align-items: stretch;
    height: var(--control-h);
    background: var(--panel);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    overflow: hidden;
    flex: none;
  }
  .tool-group.is-active {
    border-color: var(--accent-border);
    background: var(--selected);
  }
  .tg-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    font-family: var(--font-body);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-2);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .tg-main:hover:not(:disabled) {
    color: var(--heading);
  }
  .tg-main.active {
    color: var(--heading);
  }
  .tg-main:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .tg-icon {
    font-size: 14px;
    line-height: 1;
  }
  .tg-kbd {
    font-family: var(--font-body);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--text-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xs);
    padding: 0 4px;
  }
  .tg-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    padding: 0;
    font-size: 10px;
    color: var(--text-3);
    background: transparent;
    border: none;
    border-left: 1.5px solid var(--border-subtle);
    cursor: pointer;
  }
  .tg-more:hover {
    color: var(--heading);
    background: var(--selected);
  }
  :global(.tool-options) {
    width: 260px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }
  :global(.tool-options label) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  :global(.tool-options .opt-title) {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--text-3);
  }
  :global(.tool-options .opt-row) {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  :global(.tool-options .opt-hint) {
    color: var(--text-2);
    font-size: 12px;
    font-style: italic;
  }
</style>
