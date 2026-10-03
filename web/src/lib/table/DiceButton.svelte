<script lang="ts">
  import { ICONS } from '$lib/ds/icons';

  let {
    lastResult,
    shifted = false,
    onOpen,
  }: {
    lastResult: number | null;
    shifted?: boolean;
    onOpen: () => void;
  } = $props();
</script>

<button
  class="dice-fab"
  class:shifted
  type="button"
  aria-label="Ouvrir les dés"
  title="Dés — lancer et historique"
  onclick={onOpen}
>
  <ICONS.dice size={30} strokeWidth={1.8} aria-hidden="true" />
  {#if lastResult !== null}<span class="dice-badge">{lastResult}</span>{/if}
</button>

<style>
  .dice-fab {
    position: fixed;
    right: 190px;
    bottom: 12px;
    z-index: var(--z-chrome);
    pointer-events: auto;
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    color: var(--accent-fg);
    background: var(--accent);
    border: 2px solid var(--accent-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    box-shadow: 0 6px 18px var(--shadow-2);
  }
  .dice-fab.shifted { right: calc(var(--w-panel) + 26px + 178px); }
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
