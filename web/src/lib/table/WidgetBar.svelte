<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { sendWs, tableStore } from '$lib/ws.svelte';
  import { ICONS } from '$lib/ds/icons';

  let { isMj }: { isMj: boolean } = $props();

  const store = tableStore;

  /* Auto-repli local (4 s d'inactivité) : préférence d'affichage par joueur,
   * la valeur des widgets reste partagée par le DO. */
  let expanded = $state(true);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function poke() {
    expanded = true;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (expanded = false), 4000);
  }

  onMount(poke);
  onDestroy(() => {
    if (idleTimer) clearTimeout(idleTimer);
    if (expiredTimer) clearTimeout(expiredTimer);
  });

  /* Minuteur : le serveur fait foi (`endsAt`) ; l'interval local ne fait
   * qu'afficher le décompte et signaler l'expiration. */
  let now = $state(Date.now());
  let expired = $state(false);
  let expiredTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!store.state.widgets.timer.running) return;
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });

  const remaining = $derived.by(() => {
    const t = store.state.widgets.timer;
    if (t.running && t.endsAt) return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
    return Math.max(0, Math.floor(Number(t.remaining) || 0));
  });

  $effect(() => {
    const t = store.state.widgets.timer;
    if (t.running && t.endsAt && t.endsAt <= now && !expired) {
      expired = true;
      if (expiredTimer) clearTimeout(expiredTimer);
      expiredTimer = setTimeout(() => (expired = false), 3000);
    }
  });

  function formatTime(sec: number | null | undefined): string {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    return `${h > 0 ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
  }

  function parseTime(raw: string): number | null {
    const v = raw.trim();
    const colon = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/.exec(v);
    if (colon) {
      const h = Number(colon[1] ?? 0);
      const m = Number(colon[2] ?? 0);
      const s = Number(colon[3] ?? 0);
      if (m > 59 || s > 59) return null;
      return h * 3600 + m * 60 + s;
    }
    if (/^\d+$/.test(v)) return Number(v);
    return null;
  }

  let editing = $state(false);
  let draft = $state('');

  function startEdit() {
    if (!isMj) return;
    poke();
    draft = formatTime(remaining);
    editing = true;
  }

  function commitEdit() {
    if (!editing) return;
    editing = false;
    const sec = parseTime(draft);
    if (sec === null || sec <= 0) return;
    sendWs({ type: 'widget.timer', action: 'reset', seconds: sec });
    poke();
  }

  function timerAction(action: 'start' | 'pause' | 'reset') {
    poke();
    // Un minuteur à zéro n'a rien à décompter : ▶ ouvre le réglage de durée.
    if (action === 'start' && remaining <= 0 && isMj) {
      startEdit();
      return;
    }
    sendWs({ type: 'widget.timer', action });
  }

  const CX = 17;
  const CY = 17;
  const R = 15;

  function pt(angle: number): [number, number] {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
  }

  function sectorPath(i: number): string {
    const [x1, y1] = pt(i * 30);
    const [x2, y2] = pt((i + 1) * 30);
    return `M ${CX} ${CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  }

  function setClock(i: number) {
    if (!isMj) return;
    poke();
    const current = store.state.widgets.clock;
    sendWs({ type: 'widget.clock', value: current === i + 1 ? i : i + 1 });
  }

  function bumpCounter(delta: number) {
    if (!isMj) return;
    poke();
    const value = Math.max(0, Math.min(99, store.state.widgets.counter + delta));
    sendWs({ type: 'widget.counter', value });
  }
</script>

<div
  class="widget-bar"
  class:collapsed={!expanded}
  class:expired
  role="group"
  aria-label="Widgets de séance"
  onpointerenter={poke}
  onfocusin={poke}
>
  <div class="widget" title="Compteur partagé">
    <span class="w-label">compteur</span>
    {#if expanded && isMj}
      <button class="w-btn" type="button" aria-label="Diminuer le compteur" onclick={() => bumpCounter(-1)}
        >−</button
      >
    {/if}
    <span class="w-value">{store.state.widgets.counter}</span>
    {#if expanded && isMj}
      <button class="w-btn" type="button" aria-label="Augmenter le compteur" onclick={() => bumpCounter(1)}
        >+</button
      >
    {/if}
  </div>

  <div
    class="widget"
    title="Menace ou objectif : cliquez un secteur pour avancer, re-cliquez le dernier pour reculer"
  >
    <span class="w-label">menace</span>
    <svg
      class="clock"
      viewBox="0 0 34 34"
      role="img"
      aria-label="Horloge de progression : {store.state.widgets.clock} sur 12"
    >
      {#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
        <path
          d={sectorPath(i)}
          class:filled={i < store.state.widgets.clock}
          class:clickable={isMj}
          role={isMj ? 'button' : undefined}
          aria-label={isMj ? `Remplir l'horloge jusqu'au secteur ${i + 1}` : undefined}
          onclick={() => setClock(i)}
          onkeydown={(e) => {
            if (e.key === 'Enter') setClock(i);
          }}
        />
      {/each}
      <circle cx={CX} cy={CY} r="2.6" class="clock-hub" />
    </svg>
    {#if expanded}<span class="w-value">{store.state.widgets.clock}/12</span>{/if}
  </div>

  <div class="widget timer" class:running={store.state.widgets.timer.running}>
    <span class="w-label">minuteur</span>
    {#if expanded && isMj}
      <button
        class="w-btn"
        type="button"
        aria-label={store.state.widgets.timer.running ? 'Mettre en pause' : 'Démarrer'}
        onclick={() => timerAction(store.state.widgets.timer.running ? 'pause' : 'start')}
      >
        {#if store.state.widgets.timer.running}
          <ICONS.pause size={14} strokeWidth={2} />
        {:else}
          <ICONS.play size={14} strokeWidth={2} />
        {/if}
      </button>
    {/if}
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="timer-input"
        bind:value={draft}
        autofocus
        aria-label="Durée du minuteur"
        onkeydown={(e) => {
          if (e.key === 'Enter') commitEdit();
          if (e.key === 'Escape') editing = false;
        }}
        onblur={commitEdit}
      />
    {:else}
      {#if isMj}
        <button
          class="timer-value"
          type="button"
          title="Double-clic : régler la durée"
          ondblclick={startEdit}
          onclick={poke}
        >
          {formatTime(remaining)}
        </button>
      {:else}
        <span class="timer-value static">{formatTime(remaining)}</span>
      {/if}
    {/if}
    {#if expanded && isMj}
      <button
        class="w-btn"
        type="button"
        aria-label="Réinitialiser le minuteur"
        onclick={() => timerAction('reset')}
      >
        ↺
      </button>
    {/if}
  </div>
</div>

<style>
  .widget-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px;
    background: var(--sunken);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-full);
    font-family: var(--font-ui);
    pointer-events: auto;
  }
  .widget {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: var(--radius-full);
  }
  .widget + .widget {
    border-left: 1.5px solid var(--border-subtle);
    padding-left: 10px;
  }
  .w-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .w-value {
    min-width: 18px;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    color: var(--heading);
  }
  .w-btn {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    color: var(--text-2);
    background: transparent;
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
  }
  .w-btn:hover {
    color: var(--heading);
    background: var(--surface-raised);
  }
  .collapsed .w-label {
    display: none;
  }
  .clock {
    width: 30px;
    height: 30px;
    flex: none;
  }
  .clock path {
    fill: var(--surface-raised);
    stroke: var(--sunken);
    stroke-width: 1.2;
  }
  .clock path.filled {
    fill: var(--accent);
  }
  .clock path.clickable {
    cursor: pointer;
  }
  .clock path.clickable:hover {
    fill: var(--accent-hover);
  }
  .clock-hub {
    fill: var(--heading);
  }
  .timer .timer-value {
    min-width: 52px;
    padding: 2px 4px;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 700;
    color: var(--heading);
    text-align: center;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .timer .timer-value.static {
    cursor: default;
  }
  .timer.running .timer-value {
    color: var(--accent-text);
  }
  .timer-input {
    width: 62px;
    padding: 2px 4px;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
    color: var(--heading);
    background: var(--surface-raised);
    border: 1.5px solid var(--accent-border);
    border-radius: var(--radius-sm);
    outline: none;
  }
  .widget-bar.expired {
    animation: widget-expired 700ms ease-in-out 3;
  }
  @keyframes widget-expired {
    0%,
    100% {
      border-color: var(--border-default);
    }
    50% {
      border-color: var(--accent);
      background: color-mix(in oklab, var(--sunken), var(--accent) 25%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .widget-bar.expired {
      animation: none;
    }
  }
</style>
