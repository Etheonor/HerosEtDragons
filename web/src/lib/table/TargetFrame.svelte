<script lang="ts">
  import type { CharacterCard } from '@rollwith/shared/protocol';
  import { portraitUrl } from '$lib/portraits';
  import CloseButton from '$lib/ds/CloseButton.svelte';

  let {
    card,
    canClose,
    onClose,
  }: {
    card: CharacterCard;
    canClose: boolean;
    onClose: () => void;
  } = $props();

  const hp = $derived(
    card.pv !== null && card.pvMax !== null && card.pvMax > 0
      ? Math.max(0, Math.min(100, (card.pv / card.pvMax) * 100))
      : null,
  );
</script>

<div class="target surface-raised" role="status" aria-label="Cible : {card.name}">
  {#if portraitUrl(card.portrait)}
    <img class="t-portrait" src={portraitUrl(card.portrait)} alt="" draggable="false" />
  {:else}
    <span class="t-initial" style="--token-color: {card.color};">
      {card.name.slice(0, 1).toUpperCase()}
    </span>
  {/if}

  <span class="t-id">
    <span class="t-name">{card.name}</span>
    <span class="t-sub">{card.kind === 'pnj' ? 'PNJ' : 'PJ'} · CA {card.ca}</span>
  </span>

  {#if hp !== null}
    <span class="t-hp">
      <span
        class="t-hp-fill {hp >= 70 ? 'ok' : hp >= 30 ? 'mid' : 'low'}"
        style="width: {hp}%;"
      ></span>
    </span>
    <span class="t-pv">{card.pv} / {card.pvMax}</span>
  {/if}

  {#if card.conditions.length > 0}
    <span class="t-conds">
      {#each card.conditions.slice(0, 3) as cond (cond)}<span class="t-cond">{cond}</span>{/each}
      {#if card.conditions.length > 3}<span class="t-cond">+{card.conditions.length - 3}</span>{/if}
    </span>
  {/if}

  {#if canClose}
    <CloseButton label="Retirer la cible" onclick={onClose} />
  {/if}
</div>

<style>
  .target {
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-chrome);
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 440px;
    max-width: min(760px, calc(100vw - 40px));
    padding: 10px 10px 10px 14px;
    border: 2px solid var(--accent-border);
    border-radius: 15px;
    background: var(--surface-canvas);
  }
  .t-portrait {
    width: 48px;
    height: 48px;
    flex: none;
    object-fit: cover;
    border: 3px solid var(--surface-canvas);
    border-radius: 50%;
    background: var(--bg);
  }
  .t-initial {
    width: 48px;
    height: 48px;
    flex: none;
    display: grid;
    place-items: center;
    font-family: var(--font-title);
    font-size: 24px;
    color: #1b1917;
    background: var(--token-color, var(--accent));
    border: 3px solid var(--surface-canvas);
    border-radius: 50%;
  }
  .t-id {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 0 1 auto;
  }
  .t-name {
    font-family: var(--font-ui);
    font-size: 20px;
    font-weight: 700;
    color: var(--heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t-sub {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    color: var(--text-2);
    white-space: nowrap;
  }
  .t-hp {
    flex: 1 1 160px;
    min-width: 120px;
    max-width: 240px;
    height: 14px;
    background: #2b2822;
    border: 1.5px solid #3a352d;
    border-radius: 7px;
    overflow: hidden;
  }
  .t-hp-fill {
    display: block;
    height: 100%;
    border-radius: 5.5px;
    background: var(--hp-ok);
    transition: width 200ms var(--ease-out);
  }
  .t-hp-fill.mid { background: var(--hp-mid); }
  .t-hp-fill.low { background: var(--hp-low); }
  .t-pv {
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    color: var(--parchemin);
    white-space: nowrap;
  }
  .t-conds {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .t-cond {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    color: var(--accent-text);
    border: 1.5px solid var(--accent-border);
    border-radius: var(--radius-full);
    white-space: nowrap;
  }
</style>
