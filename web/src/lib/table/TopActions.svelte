<script lang="ts">
  import { ICONS } from '$lib/ds/icons';
  import Tooltip from '$lib/ds/Tooltip.svelte';

  let {
    isMj,
    onCommands,
    onCompendium,
    onDashboard,
    onHelp,
  }: {
    isMj: boolean;
    onCommands: () => void;
    onCompendium: () => void;
    onDashboard: () => void;
    onHelp: () => void;
  } = $props();
</script>

<div class="top-actions" role="toolbar" aria-label="Actions rapides">
  <Tooltip label="Commandes" kbd="Espace">
    {#snippet children({ props })}
      <button
        {...props}
        type="button"
        class="ta-btn"
        aria-label="Command palette (Espace)"
        onclick={onCommands}
      >
        <ICONS.commands size={22} strokeWidth={1.8} />
      </button>
    {/snippet}
  </Tooltip>
  <Tooltip label="Compendium">
    {#snippet children({ props })}
      <button {...props} type="button" class="ta-btn" aria-label="Compendium" onclick={onCompendium}>
        <ICONS.compendium size={22} strokeWidth={1.8} />
      </button>
    {/snippet}
  </Tooltip>
  {#if isMj}
    <Tooltip label="Tableau de bord MJ">
      {#snippet children({ props })}
        <button
          {...props}
          type="button"
          class="ta-btn"
          aria-label="Tableau de bord"
          onclick={onDashboard}
        >
          <ICONS.dashboard size={22} strokeWidth={1.8} />
        </button>
      {/snippet}
    </Tooltip>
  {/if}
  <Tooltip label="Aide clavier" kbd="?">
    {#snippet children({ props })}
      <button {...props} type="button" class="ta-btn" aria-label="Aide clavier" onclick={onHelp}>
        <ICONS.help size={22} strokeWidth={1.8} />
      </button>
    {/snippet}
  </Tooltip>
</div>

<style>
  .top-actions {
    position: fixed;
    top: 54px;
    right: 12px;
    display: flex;
    gap: 6px;
    z-index: var(--z-chrome);
    pointer-events: auto;
  }
  .ta-btn {
    width: 46px;
    height: 46px;
    padding: 0;
    display: grid;
    place-items: center;
    color: #d8d0bc;
    background: var(--surface-canvas);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .ta-btn:hover {
    color: var(--heading);
    border-color: var(--border-strong-2);
    background: var(--surface-raised);
  }
</style>
