<script lang="ts">
  import type { CharacterCard } from '@rollwith/shared/protocol';
  import { portraitUrl } from '$lib/portraits';

  let {
    card,
    isMj,
    canHeal,
    presentColor = null,
    isActive = false,
    hasToken = false,
    down = false,
    onActivate,
    onFocusOrPlace,
    onContextMenu,
    onHpDelta,
    onRemoveCondition,
  }: {
    card: CharacterCard;
    isMj: boolean;
    canHeal: boolean;
    presentColor?: string | null;
    isActive?: boolean;
    hasToken?: boolean;
    down?: boolean;
    onActivate: () => void;
    onFocusOrPlace: () => void;
    onContextMenu: (e: MouseEvent) => void;
    onHpDelta: (delta: number) => void;
    onRemoveCondition: (cond: string) => void;
  } = $props();

  const hp = $derived(
    card.pv !== null && card.pvMax !== null && card.pvMax > 0
      ? Math.max(0, Math.min(100, (card.pv / card.pvMax) * 100))
      : null,
  );
  const hpState = $derived(hp === null ? null : down ? 'down' : hp >= 70 ? 'ok' : hp >= 30 ? 'mid' : 'low');
  const shown = $derived(card.conditions.slice(0, 3));

  /* Le clic simple (cibler) attend un court délai : un double-clic l'annule,
   * sinon chaque recentrage/placement laisserait une cible derrière lui. */
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function handleClick() {
    if (clickTimer) return;
    clickTimer = setTimeout(() => {
      clickTimer = null;
      onActivate();
    }, 220);
  }

  function handleDblClick() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    onFocusOrPlace();
  }
</script>

<div
  class="gf"
  class:active={isActive}
  class:down
  class:unplaced={!hasToken}
  role="button"
  tabindex="0"
  aria-label={card.name}
  title={isMj ? 'Clic : cibler · Double-clic : recentrer ou placer · Clic droit : actions' : 'Double-clic : recentrer'}
  onclick={handleClick}
  ondblclick={handleDblClick}
  oncontextmenu={onContextMenu}
  onkeydown={(e) => {
    if (e.key === 'Enter') onActivate();
  }}
>
  <span class="gf-portrait">
    {#if portraitUrl(card.portrait)}
      <img src={portraitUrl(card.portrait)} alt="" draggable="false" />
    {:else}
      <span class="gf-initial" style="--token-color: {card.color};">
        {card.name.slice(0, 1).toUpperCase()}
      </span>
    {/if}
    {#if presentColor}
      <span class="gf-presence-ring"><span class="gf-presence" style="background: {presentColor};"></span></span>
    {/if}
  </span>

  <span class="gf-body">
    <span class="gf-top">
      <span class="gf-name">{card.name}</span>
      {#if down}
        <span class="gf-chip">à terre</span>
      {:else}
        <span class="gf-sub">{card.kind === 'pnj' ? `CA ${card.ca}` : card.sub}</span>
      {/if}
    </span>

    <span class="gf-hp-wrap">
      {#if canHeal && !down}
        <button
          type="button"
          class="gf-hp-btn"
          aria-label="Retirer 1 PV à {card.name}"
          onclick={(e) => {
            e.stopPropagation();
            onHpDelta(-1);
          }}
          ondblclick={(e) => e.stopPropagation()}>−</button
        >
      {/if}
      <span class="gf-hp">
        <span class="gf-hp-fill {hpState}" style="width: {hp ?? 0}%;"></span>
        <span class="gf-pv">{hp === null ? '— / —' : `${card.pv} / ${card.pvMax}`}</span>
      </span>
      {#if canHeal && !down}
        <button
          type="button"
          class="gf-hp-btn"
          aria-label="Rendre 1 PV à {card.name}"
          onclick={(e) => {
            e.stopPropagation();
            onHpDelta(1);
          }}
          ondblclick={(e) => e.stopPropagation()}>+</button
        >
      {/if}
    </span>
  </span>

  {#if card.conditions.length > 0}
    <span class="gf-conds">
      {#each shown as cond (cond)}
        <button
          type="button"
          class="gf-cond"
          title={isMj ? `Retirer « ${cond} »` : cond}
          onclick={(e) => {
            e.stopPropagation();
            onRemoveCondition(cond);
          }}
          ondblclick={(e) => e.stopPropagation()}>{cond}</button
        >
      {/each}
      {#if card.conditions.length > 3}
        <span class="gf-cond more">+{card.conditions.length - 3}</span>
      {/if}
    </span>
  {/if}
</div>

<style>
  .gf {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 68px;
    padding: 7px 12px 7px 9px;
    background: var(--sunken);
    border: 1px solid rgba(245, 241, 230, 0.14);
    border-radius: 34px;
    cursor: pointer;
    user-select: none;
  }
  .gf:hover { border-color: rgba(245, 241, 230, 0.28); }
  .gf.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-border);
  }
  .gf.down { opacity: 0.85; }
  .gf.unplaced .gf-portrait { filter: grayscale(0.5); }

  .gf-portrait {
    position: relative;
    width: 54px;
    height: 54px;
    flex: none;
  }
  .gf-portrait img,
  .gf-initial {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    object-fit: cover;
    border: 3px solid var(--sunken);
    border-radius: 50%;
    background: var(--bg);
  }
  .gf-initial {
    font-family: var(--font-title);
    font-size: 24px;
    color: #1b1917;
    background: var(--token-color, var(--accent));
  }
  .gf.down .gf-initial { background: #3a352d; color: #6e6759; }
  .gf-presence-ring {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
    background: var(--sunken);
    border-radius: 50%;
  }
  .gf-presence {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .gf-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .gf-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
  .gf-name {
    font-family: var(--font-ui);
    font-size: 18px;
    font-weight: 700;
    color: var(--heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gf.down .gf-name { color: #8a8172; }
  .gf-sub {
    flex: none;
    max-width: 140px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gf-chip {
    flex: none;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    color: #c9bfaa;
    background: var(--surface-raised);
    border: 1.5px solid var(--border-strong);
    border-radius: var(--radius-full);
    padding: 0 10px;
    line-height: 1.8;
  }
  .gf-hp-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .gf-hp {
    position: relative;
    flex: 1;
    min-width: 60px;
    height: 22px;
    box-sizing: border-box;
    background: #241f1a;
    border: 1.5px solid #3a352d;
    border-radius: 11px;
    overflow: hidden;
  }
  .gf-hp-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 8px;
    background: var(--hp-ok);
    transition: width 200ms var(--ease-out);
  }
  .gf-hp-fill.mid { background: var(--hp-mid); }
  .gf-hp-fill.low { background: var(--hp-low); }
  .gf-hp-fill.down { background: #6e6759; }
  .gf-pv {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    color: var(--parchemin);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    white-space: nowrap;
    pointer-events: none;
  }
  .gf.down .gf-pv { color: var(--text-3); text-shadow: none; }
  .gf-hp-btn {
    flex: none;
    width: 22px;
    height: 22px;
    padding: 0;
    display: grid;
    place-items: center;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    background: var(--surface-raised);
    border: 1.5px solid var(--border-strong);
    border-radius: var(--radius-sm);
    cursor: pointer;
    line-height: 1;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms;
  }
  .gf-hp-wrap:hover .gf-hp-btn { opacity: 1; pointer-events: auto; }
  .gf-hp-btn:hover { color: var(--accent-text); border-color: var(--accent-border); }

  .gf-conds {
    position: absolute;
    left: 74px;
    bottom: -9px;
    display: flex;
    gap: 4px;
    max-width: calc(100% - 86px);
    overflow: hidden;
  }
  .gf-cond {
    font-family: var(--font-body);
    font-size: 10.5px;
    font-weight: 600;
    padding: 0 8px;
    color: var(--accent-text);
    background: var(--sunken);
    border: 1.5px solid var(--accent-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    line-height: 1.7;
  }
  .gf-cond.more { cursor: default; color: var(--text-2); border-color: var(--border); }
</style>
