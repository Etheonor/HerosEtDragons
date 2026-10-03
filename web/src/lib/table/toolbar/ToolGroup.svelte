<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Popover, Tooltip } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import { ICONS, type IconKey } from '$lib/ds/icons';

  interface Props {
    label: string;
    /** Clé d'icône Lucide — voir `$lib/ds/icons`. */
    icon: IconKey;
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

  const Icon = $derived(ICONS[icon]);
</script>

<Tooltip.Provider delayDuration={300}>
  <div class="tool-group {active ? 'is-active' : ''} {className}">
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="tg-main"
            class:active
            {disabled}
            aria-pressed={active}
            aria-label={label}
            onclick={onselect}
          >
            <span class="tg-icon" aria-hidden="true"><Icon size={17} strokeWidth={2} /></span>
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          {...surfaceProps('overlay', 'tooltip')}
          side="top"
          align="center"
          sideOffset={6}
        >
          <span class="tip-label">{label}</span>
          {#if hotkeyLabel}<kbd class="tip-kbd">{hotkeyLabel}</kbd>{/if}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
    {#if options}
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button {...props} type="button" class="tg-more" aria-label="Options — {label}"
              >▾</button
            >
          {/snippet}
        </Popover.Trigger>
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
</Tooltip.Provider>

<style>
  .tool-group {
    position: relative;
    display: inline-flex;
    align-items: stretch;
    height: 44px;
    background: var(--panel);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
    flex: none;
  }
  .tool-group.is-active {
    border-color: var(--accent-border);
    background: var(--accent);
  }
  .tg-main {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    padding: 0;
    color: var(--text-2);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .tg-main:hover:not(:disabled) {
    color: var(--heading);
  }
  .tg-main.active {
    color: var(--accent-fg);
  }
  .tg-main:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .tg-icon {
    display: inline-flex;
    align-items: center;
    line-height: 1;
  }
  .tg-more {
    position: absolute;
    right: 2px;
    bottom: 1px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 14px;
    padding: 0;
    font-size: 9px;
    line-height: 1;
    color: var(--text-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-xs);
    cursor: pointer;
  }
  .tg-more:hover {
    color: var(--heading);
    background: color-mix(in oklab, var(--panel), var(--heading) 12%);
  }
  .tool-group.is-active .tg-more { color: var(--accent-fg); }
  .tool-group.is-active .tg-more:hover {
    background: color-mix(in oklab, var(--accent), #000 18%);
  }
  :global(.tooltip) {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 9px;
    font-size: 12.5px;
    color: var(--text);
  }
  .tip-label {
    white-space: nowrap;
  }
  .tip-kbd {
    font-family: var(--font-body);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--text-2);
    background: var(--bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xs);
    padding: 0 4px;
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
