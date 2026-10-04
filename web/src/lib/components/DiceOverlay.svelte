<script lang="ts">
  import { fade } from 'svelte/transition';
  import { DICE_REVEAL_MS, DICE_ROTATE_MS, type DiceAnim } from '$lib/ws.svelte';

  let { anim }: { anim: DiceAnim | null } = $props();

  let currentFace = $state<number | string>('?');
  let rotating = $state(false);
  let rotation = $state(0);
  let tick: ReturnType<typeof setInterval> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let visible = $state(false);

  const CLIPS: Record<number, string> = {
    4: 'polygon(50% 5%, 95% 95%, 5% 95%)',
    8: 'polygon(50% 5%, 95% 50%, 50% 95%, 5% 50%)',
    10: 'polygon(50% 2%, 98% 38%, 82% 95%, 18% 95%, 2% 38%)',
    12: 'polygon(50% 2%, 98% 38%, 82% 95%, 18% 95%, 2% 38%)',
    20: 'polygon(50% 2%, 98% 25%, 98% 75%, 50% 98%, 2% 75%, 2% 25%)',
  };

  let clipPath = $derived(anim ? (CLIPS[anim.sides] ?? 'none') : 'none');
  let borderRadius = $derived(
    anim && anim.sides === 6 ? '18px 6px 16px 6px/6px 16px 6px 18px' : '0px',
  );
  let crit = $derived(!!anim && anim.n === 1 && anim.sides === 20 && anim.faces[0] === 20);
  let fumble = $derived(!!anim && anim.n === 1 && anim.sides === 20 && anim.faces[0] === 1);
  let diceColor = $derived(fumble ? '#9C947F' : '#B03427');
  let label = $derived(
    anim
      ? `${anim.n}d${anim.sides}${anim.mod > 0 ? '+' + anim.mod : anim.mod < 0 ? '' + anim.mod : ''}`
      : '',
  );

  $effect(() => {
    if (anim) {
      startAnimation(anim);
    } else {
      cleanup();
      visible = false;
    }
    return () => cleanup();
  });

  function cleanup() {
    if (tick) clearInterval(tick);
    if (stopTimer) clearTimeout(stopTimer);
    if (hideTimer) clearTimeout(hideTimer);
    tick = null;
    stopTimer = null;
    hideTimer = null;
  }

  function startAnimation(a: DiceAnim) {
    cleanup();
    visible = true;
    rotating = true;
    currentFace = '?';
    rotation = 0;

    tick = setInterval(() => {
      currentFace = 1 + Math.floor(Math.random() * a.sides);
      rotation = Math.random() * 10 - 5;
    }, 75);

    stopTimer = setTimeout(() => {
      if (tick) clearInterval(tick);
      tick = null;
      rotating = false;
      rotation = -2;
      currentFace = a.n > 1 ? a.total : (a.faces[0] ?? a.total);
    }, DICE_ROTATE_MS);

    hideTimer = setTimeout(() => {
      visible = false;
    }, DICE_ROTATE_MS + DICE_REVEAL_MS);
  }
</script>

{#if visible && anim}
  <div class="dice-overlay" transition:fade={{ duration: 180 }}>
    <div class="dice-column" class:revealed={!rotating} class:crit class:fumble>
      <div class="dice-stage" class:spin={rotating} style="transform: rotate({rotation}deg);">
        <span class="dice-glow"></span>
        <span class="dice-shape">
          <span class="dice-outer" style="clip-path: {clipPath}; border-radius: {borderRadius};"
          ></span>
          <span class="dice-inner" style="clip-path: {clipPath}; border-radius: {borderRadius};"
          ></span>
          <span
            class="dice-face"
            style="color: {rotating ? '#8A8375' : diceColor}; padding-top: {anim.sides === 4
              ? '30px'
              : '2px'};"
          >
            {currentFace}
          </span>
        </span>
      </div>
      <div class="dice-cartouche">
        <div class="dice-label">{label}</div>
        <div class="dice-total">{rotating ? '…' : anim.total}</div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dice-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: var(--z-overlay);
  }
  .dice-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .dice-stage {
    position: relative;
    width: 118px;
    height: 118px;
  }
  .dice-stage.spin { animation: dice-float 240ms ease-in-out infinite; }
  @keyframes dice-float {
    0%,
    100% { margin-top: 0; }
    50% { margin-top: -5px; }
  }

  .dice-glow {
    position: absolute;
    inset: -26px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(192, 57, 43, 0.35), transparent 65%);
    opacity: 0;
  }
  .dice-column.revealed .dice-glow {
    animation: dice-glow 900ms var(--ease-out) both;
  }
  @keyframes dice-glow {
    0% { opacity: 0.9; transform: scale(0.7); }
    100% { opacity: 0; transform: scale(1.5); }
  }

  .dice-shape {
    position: absolute;
    inset: 0;
    animation: dice-pop 480ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
  }
  @keyframes dice-pop {
    0% { transform: scale(0.72); }
    60% { transform: scale(1.14); }
    100% { transform: scale(1); }
  }
  .dice-outer {
    position: absolute;
    inset: 0;
    background: #4a443b;
  }
  .dice-inner {
    position: absolute;
    inset: 5px;
    background: var(--map-token-bg);
  }
  .dice-face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-body);
    font-size: 34px;
    font-weight: 500;
  }

  .dice-cartouche {
    background: var(--map-token-bg);
    border: 2px solid #4a443b;
    border-radius: 14px 5px 16px 5px;
    padding: 5px 16px;
    text-align: center;
  }
  .dice-column.revealed .dice-cartouche {
    animation: cartouche-in 380ms 100ms var(--ease-out) both;
  }
  @keyframes cartouche-in {
    from { opacity: 0; transform: translateY(10px) scale(0.92); }
    to { opacity: 1; transform: none; }
  }
  .dice-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: #8a8375;
  }
  .dice-total {
    font-family: var(--font-title);
    font-size: 22px;
    color: #b03427;
    line-height: 1.1;
  }
  .dice-column.crit .dice-total {
    color: var(--or);
    text-shadow: 0 0 14px rgba(212, 167, 60, 0.6);
  }
  .dice-column.fumble .dice-total { color: var(--text-3); }
  .dice-column.crit .dice-inner {
    box-shadow: 0 0 0 3px rgba(212, 167, 60, 0.65);
  }
  .dice-column.fumble .dice-inner {
    box-shadow: 0 0 0 3px rgba(156, 148, 127, 0.5);
  }

  @media (prefers-reduced-motion: reduce) {
    .dice-stage.spin { animation: none; }
    .dice-shape { animation: none; }
    .dice-column.revealed .dice-glow { animation: none; }
    .dice-column.revealed .dice-cartouche { animation: none; }
  }
</style>
