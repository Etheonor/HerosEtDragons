<script lang="ts">
  import { onMount } from 'svelte';
  import { ENCRE_KEYS, ENCRE_PALETTES, getEncre, setEncre, type EncreKey } from '$lib/encre';

  let open = $state(false);
  let current = $state<EncreKey>('carmin');

  onMount(() => {
    current = getEncre();
  });

  function pick(key: EncreKey) {
    setEncre(key);
    current = key;
    open = false;
  }
</script>

<div class="encre-wrap">
  <button
    class="encre-btn"
    title="Couleur d'encre"
    onclick={() => (open = !open)}
  >
    <span class="dot" style="background: {ENCRE_PALETTES[current].base}; border-color: {ENCRE_PALETTES[current].border};"></span>
    Encre
  </button>
  {#if open}
    <div class="encre-menu">
      {#each ENCRE_KEYS as key (key)}
        {@const p = ENCRE_PALETTES[key]}
        <button class="encre-option" class:selected={key === current} onclick={() => pick(key)}>
          <span class="dot" style="background: {p.base}; border-color: {p.border};"></span>
          {p.label}
        </button>
      {/each}
      <div class="encre-hint">Ton choix, visible par toi seul.</div>
    </div>
  {/if}
</div>

<style>
  .encre-wrap {
    position: relative;
    display: flex;
  }
  .encre-btn {
    font-family: var(--font-body);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: transparent;
    border: 2px solid var(--border);
    border-radius: 12px 4px 14px 4px;
    cursor: pointer;
    color: var(--text-2);
    font-size: 13.5px;
    font-weight: 500;
  }
  .encre-btn:hover {
    border-color: var(--text-2);
    color: var(--text);
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid;
    display: inline-block;
    flex: none;
  }
  .encre-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 14px 4px 16px 5px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 8px 30px var(--shadow-2);
    z-index: 70;
    min-width: 150px;
  }
  .encre-option {
    font-family: var(--font-body);
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 10px;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 10px 3px 12px 4px;
    cursor: pointer;
    color: var(--text-2);
    font-size: 13.5px;
    font-weight: 500;
    text-align: left;
  }
  .encre-option:hover {
    border-color: var(--text-2);
  }
  .encre-option.selected {
    background: var(--bg);
    border-color: var(--accent-border);
    color: var(--heading);
  }
  .encre-hint {
    font-size: 11.5px;
    color: var(--text-3);
    padding: 2px 10px 4px;
    line-height: 1.35;
  }
</style>
