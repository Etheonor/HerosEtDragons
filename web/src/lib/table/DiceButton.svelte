<script lang="ts">
  import { ICONS } from '$lib/ds/icons';
  import Tooltip from '$lib/ds/Tooltip.svelte';

  let {
    lastResult,
    onOpen,
  }: {
    lastResult: number | null;
    onOpen: () => void;
  } = $props();
</script>

<Tooltip label="Dés — lancer et historique" side="left">
  {#snippet children({ props })}
    <button {...props} class="dice-fab" type="button" aria-label="Ouvrir les dés" onclick={onOpen}>
      <ICONS.dice size={34} strokeWidth={1.8} aria-hidden="true" />
      {#if lastResult !== null}<span class="dice-badge">{lastResult}</span>{/if}
    </button>
  {/snippet}
</Tooltip>

<style>
  .dice-fab {
    position: fixed;
    right: 20px;
    bottom: 16px;
    z-index: var(--z-chrome);
    pointer-events: auto;
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    color: var(--accent-fg);
    background: var(--accent);
    border: 2px solid var(--accent-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    box-shadow: 0 6px 18px var(--shadow-2);
  }
  .dice-fab:hover { background: var(--accent-hover); }
  .dice-badge {
    position: absolute;
    top: -9px;
    right: -9px;
    min-width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    padding: 0 5px;
    font-family: var(--font-title);
    font-size: 14px;
    color: #1b1917;
    background: var(--parchemin);
    border: 2px solid var(--border-default);
    border-radius: var(--radius-full);
  }
</style>
