<script lang="ts">
  import { CARAC_LABELS, getMod, getProficiency, formatMod, type CaracKey } from '$lib/char-utils';
  import { effectiveCarac, racialBreakdown } from '$lib/char-utils';
  import { findRace } from '@rollwith/shared/hd';
  import type { CharacterSheet } from '$lib/api';
  import Editable from '$lib/ds/Editable.svelte';
  import { api } from '$lib/api';

  let {
    sheet,
    readonly,
    touch,
    onRoll,
    charId,
    saveState,
  }: {
    sheet: CharacterSheet;
    readonly: boolean;
    touch: () => void;
    onRoll?: (mod: number, label: string) => void;
    charId: string;
    saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  } = $props();

  const caracs: CaracKey[] = ['for', 'dex', 'con', 'int', 'sag', 'cha'];
  const racialShown = $derived(racialBreakdown(sheet));
  const raceInfo = $derived(findRace(sheet.identite?.race));

  function num(v: unknown, min: number, max: number, fb: number): number {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fb;
  }

  function onCaracClick(carac: CaracKey) {
    if (onRoll) onRoll(getMod(sheet, carac), `Test de ${CARAC_LABELS[carac].toLowerCase()}`);
  }

  async function toggleInspiration() {
    if (readonly || saveState === 'saving') return;
    try {
      const res = await api.characters.toggleInspiration(charId);
      sheet.inspiration = res.inspiration;
    } catch {
      /* ignore */
    }
  }
</script>

<div class="col col-caracs">
  {#each caracs as c, i (c)}
    <div
      class="carac-card"
      style="border-radius: var({['--sketchy-1', '--sketchy-2', '--sketchy-3', '--sketchy-4', '--sketchy-5', '--sketchy-6'][i % 6]});"
      onclick={() => onCaracClick(c)}
      title="Cliquez pour lancer un test"
    >
      <div class="carac-label">{CARAC_LABELS[c]}</div>
      <div class="carac-mod" title="Modificateur calculé">{formatMod(getMod(sheet, c))}</div>
      <div class="carac-value">
        <Editable
          {readonly}
          type="number"
          min={1}
          max={30}
          align="center"
          w={42}
          value={sheet.caracs[c]}
          onchange={(v) => (sheet.caracs[c] = Number(v))}
          oncommit={() => {
            sheet.caracs[c] = num(sheet.caracs[c], 1, 30, 10);
            touch();
          }}
          ontype={touch}
        />
        {#if racialShown[c]}
          <span class="racial-badge" title="+{racialShown[c]} racial ({raceInfo?.label ?? 'course'}) — appliqué automatiquement">+{racialShown[c]}<b class="eff">={effectiveCarac(sheet, c)}</b></span>
        {/if}
      </div>
    </div>
  {/each}

  <div
    class="inspi-card"
    class:on={sheet.inspiration}
    onclick={toggleInspiration}
    title={readonly ? undefined : 'Basculer l’inspiration'}
  >
    <div class="mini-label">INSPIRATION</div>
    <div class="inspi-value">{sheet.inspiration ? 'Oui' : '—'}</div>
  </div>

  <div class="mastery-card">
    <div class="mini-label">MAÎTRISE</div>
    <div class="mastery-value" title="Calculée selon le niveau">{formatMod(getProficiency(sheet))}</div>
  </div>
</div>

<style>
  .carac-card {
    border: 2px solid var(--border);
    background: var(--panel);
    padding: 9px 8px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .carac-card:hover {
    border-color: var(--accent-border);
    background: var(--bg);
  }
  .carac-label {
    font-size: 11.5px;
    color: var(--text-2);
    letter-spacing: 0.08em;
  }
  .carac-mod {
    font-family: var(--font-title);
    font-size: 26px;
    color: var(--accent-text);
    line-height: 1.2;
  }
  .carac-value {
    color: var(--text-2);
    font-size: 12px;
    line-height: 1.1;
    display: flex;
    align-items: baseline;
    justify-content: center;
  }
  .racial-badge {
    font-family: var(--font-body); font-size: 10.5px; font-weight: 700;
    color: var(--accent-text); vertical-align: super; margin-left: 3px; white-space: nowrap;
  }
  .racial-badge .eff { color: var(--text-2); font-weight: 500; margin-left: 2px; }

  .inspi-card {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 8px;
    text-align: center;
    cursor: pointer;
  }
  .inspi-card.on {
    background: var(--bg);
  }
  .inspi-value {
    font-family: var(--font-title);
    font-size: 17px;
    line-height: 1.1;
    color: var(--text-3);
  }
  .inspi-card.on .inspi-value {
    color: var(--accent-text);
  }

  .mastery-card {
    border: 2px solid var(--border);
    border-radius: 12px 235px 14px 245px / 235px 12px 255px 14px;
    background: var(--panel);
    padding: 8px;
    text-align: center;
  }
  .mastery-value {
    font-family: var(--font-title);
    font-size: 20px;
    color: var(--text);
    line-height: 1.1;
  }
</style>