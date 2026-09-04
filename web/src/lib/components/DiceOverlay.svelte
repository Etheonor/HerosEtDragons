<script lang="ts">
  import type { DiceAnim } from '$lib/ws';

  let {
    anim,
    duration = 3200,
  }: { anim: DiceAnim | null; duration?: number } = $props();

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
  let borderRadius = $derived(anim && anim.sides === 6 ? '18px 6px 16px 6px/6px 16px 6px 18px' : '0px');
  let diceColor = $derived(anim && anim.n === 1 && anim.sides === 20 && anim.faces[0] === 1 ? '#9C947F' : '#B03427');
  let label = $derived(anim ? `${anim.n}d${anim.sides}${anim.mod > 0 ? '+' + anim.mod : anim.mod < 0 ? '' + anim.mod : ''}` : '');

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

    const dur = Math.max(800, duration);

    stopTimer = setTimeout(() => {
      if (tick) clearInterval(tick);
      tick = null;
      rotating = false;
      rotation = -2;
      currentFace = a.n > 1 ? a.total : a.faces[0] ?? a.total;
    }, dur);

    hideTimer = setTimeout(() => {
      visible = false;
    }, dur + 1700);
  }

  function formatDetail(d: DiceAnim): string {
    const parts = [...d.faces];
    if (d.mod > 0) parts.push(d.mod);
    if (d.mod < 0) parts.push(-d.mod);
    return `= ${d.faces.join(' + ')}${d.mod > 0 ? ' + ' + d.mod : d.mod < 0 ? ' − ' + Math.abs(d.mod) : ''}`;
  }
</script>

{#if visible && anim}
  <div class="dice-overlay">
    <div class="dice-column">
      <div
        class="dice-shape"
        style="transform: rotate({rotation}deg); filter: drop-shadow(3px 4px 0 rgba(0,0,0,.35));"
      >
        <div class="dice-outer" style="clip-path: {clipPath}; border-radius: {borderRadius};"></div>
        <div class="dice-inner" style="clip-path: {clipPath}; border-radius: {borderRadius};"></div>
        <div class="dice-face" style="color: {rotating ? '#8A8375' : diceColor}; padding-top: {anim.sides === 4 ? '30px' : '2px'};">
          {currentFace}
        </div>
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
    z-index: 40;
  }
  .dice-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .dice-shape {
    position: relative;
    width: 118px;
    height: 118px;
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
  .dice-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: #8a8375;
  }
  .dice-total {
    font-family: var(--font-title);
    font-size: 20px;
    color: #b03427;
    line-height: 1.1;
  }
</style>