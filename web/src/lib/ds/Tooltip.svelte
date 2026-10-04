<script lang="ts">
  import { Tooltip as BTooltip } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import type { Snippet } from 'svelte';

  let {
    label,
    kbd,
    side = 'top',
    children,
  }: {
    label: string;
    kbd?: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
    /** L'élément déclencheur doit spreader les props du trigger. */
    children: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();
</script>

<BTooltip.Provider delayDuration={350}>
  <BTooltip.Root>
    <BTooltip.Trigger>
      {#snippet child({ props })}
        {@render children({ props })}
      {/snippet}
    </BTooltip.Trigger>
    <BTooltip.Portal>
      <BTooltip.Content {...surfaceProps('overlay', 'tooltip')} {side} sideOffset={6}>
        <span class="tip-label">{label}</span>
        {#if kbd}<kbd class="tip-kbd">{kbd}</kbd>{/if}
      </BTooltip.Content>
    </BTooltip.Portal>
  </BTooltip.Root>
</BTooltip.Provider>

<style>
  :global(.tooltip) {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 9px;
    font-size: 12.5px;
    color: var(--text);
    max-width: 320px;
  }
  .tip-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tip-kbd {
    flex: none;
    font-family: var(--font-body);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--text-2);
    background: var(--bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xs);
    padding: 0 4px;
  }
</style>
