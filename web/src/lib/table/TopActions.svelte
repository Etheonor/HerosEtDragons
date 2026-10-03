<script lang="ts">
  import { ICONS } from '$lib/ds/icons';

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
  <button
    type="button"
    class="ta-btn"
    aria-label="Command palette (Espace)"
    title="Commandes (Espace)"
    onclick={onCommands}
  >
    <ICONS.commands size={22} strokeWidth={1.8} />
  </button>
  <button
    type="button"
    class="ta-btn"
    aria-label="Compendium"
    title="Compendium — fenêtre par-dessus la table"
    onclick={onCompendium}
  >
    <ICONS.compendium size={22} strokeWidth={1.8} />
  </button>
  {#if isMj}
    <button
      type="button"
      class="ta-btn"
      aria-label="Tableau de bord"
      title="Tableau de bord MJ"
      onclick={onDashboard}
    >
      <ICONS.dashboard size={22} strokeWidth={1.8} />
    </button>
  {/if}
  <button
    type="button"
    class="ta-btn"
    aria-label="Aide clavier"
    title="Aide clavier (?)"
    onclick={onHelp}
  >
    <ICONS.help size={22} strokeWidth={1.8} />
  </button>
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
