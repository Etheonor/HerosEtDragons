<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  let {
    campaignId,
    campaignName = '',
    onClose,
  }: {
    campaignId: string;
    campaignName?: string;
    onClose: () => void;
  } = $props();

  type CaracKey = 'for' | 'dex' | 'con' | 'int' | 'sag' | 'cha';
  const CARAC_SLOTS: { k: CaracKey; label: string }[] = [
    { k: 'for', label: 'Force' },
    { k: 'dex', label: 'Dextérité' },
    { k: 'con', label: 'Constitution' },
    { k: 'int', label: 'Intelligence' },
    { k: 'sag', label: 'Sagesse' },
    { k: 'cha', label: 'Charisme' },
  ];
  const STANDARD = [15, 14, 13, 12, 10, 8];
  const COLORS = [
    '#E0705F',
    '#8AB58D',
    '#7FA3B8',
    '#B58AA8',
    '#D4A73C',
    '#9C947F',
  ];

  let mode = $state<'standard' | 'roll' | 'free'>('standard');
  let identite = $state({
    nom: '',
    classe: '',
    race: '',
    historique: '',
    alignement: '',
  });
  let pvMax = $state(8);
  let dvFaces = $state(8);
  let couleur = $state(COLORS[0]!);

  // ── Répartition (modes standard & roll) ──────────────────────
  let vals = $state<number[]>([...STANDARD]);
  let diceDetail = $state<{ all: number[]; kept: number }[] | null>(null);
  let assign = $state<Record<CaracKey, number | null>>({
    for: null,
    dex: null,
    con: null,
    int: null,
    sag: null,
    cha: null,
  });
  let sel = $state<number | null>(null);

  // mode « à la main »
  let free = $state<Record<CaracKey, number>>({
    for: 10,
    dex: 10,
    con: 10,
    int: 10,
    sag: 10,
    cha: 10,
  });

  const usedIdx = $derived(new Set(Object.values(assign).filter((v): v is number => v !== null)));
  const allAssigned = $derived(Object.values(assign).every((v) => v !== null));
  const pool = $derived(vals.map((v, i) => ({ v, i, used: usedIdx.has(i) })));

  function switchMode(m: 'standard' | 'roll' | 'free') {
    if (mode === m) return;
    mode = m;
    resetAssign();
    if (m === 'standard') {
      vals = [...STANDARD];
      diceDetail = null;
    } else if (m === 'roll') {
      rollScores();
    }
  }

  function resetAssign() {
    assign = { for: null, dex: null, con: null, int: null, sag: null, cha: null };
    sel = null;
  }

  function rollScores() {
    resetAssign();
    diceDetail = Array.from({ length: 6 }, () => {
      const all = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6));
      const kept = [...all].sort((a, b) => b - a).slice(0, 3);
      return { all, kept: kept.reduce((a, b) => a + b, 0) };
    });
    vals = diceDetail.map((d) => d.kept);
  }

  function pickVal(i: number) {
    if (usedIdx.has(i)) return;
    sel = sel === i ? null : i;
  }

  function clickCarac(k: CaracKey) {
    if (sel !== null) {
      assign = { ...assign, [k]: sel };
      sel = null;
      return;
    }
    if (assign[k] !== null) {
      assign = { ...assign, [k]: null };
    }
  }

  function valueOf(k: CaracKey): number | null {
    const i = assign[k];
    return i === null || i === undefined ? null : vals[i] ?? null;
  }

  function mod(v: number | null): number {
    const x = v ?? 10;
    return Math.floor((x - 10) / 2);
  }
  function fmtMod(v: number | null): string {
    const m = mod(v);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  // ── Soumission ───────────────────────────────────────────────
  let saving = $state(false);
  let error = $state('');

  const caracs = $derived.by(() => {
    if (mode === 'free') return { ...free };
    return {
      for: valueOf('for') ?? 10,
      dex: valueOf('dex') ?? 10,
      con: valueOf('con') ?? 10,
      int: valueOf('int') ?? 10,
      sag: valueOf('sag') ?? 10,
      cha: valueOf('cha') ?? 10,
    };
  });

  const ready = $derived(
    identite.nom.trim() !== '' && identite.classe.trim() !== '' && (mode === 'free' || allAssigned),
  );

  async function submit() {
    if (saving || !ready) return;
    saving = true;
    error = '';
    try {
      const res = await api.characters.create({
        campaignId,
        name: identite.nom.trim(),
        sheet: {
          identite: {
            nom: identite.nom.trim(),
            classe: identite.classe.trim(),
            race: identite.race.trim(),
            historique: identite.historique.trim(),
            alignement: identite.alignement.trim(),
            niveau: 1,
            xp: 0,
          },
          caracs,
          pvMax: Math.max(1, Math.min(1000, Math.trunc(pvMax) || 1)),
          desDeVie: { faces: dvFaces, total: 1, restants: 1 },
          initiativeBonus: mod(caracs.dex),
          couleurPion: couleur,
        },
      });
      await goto(`/characters/${res.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Création impossible';
      saving = false;
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onClose();
  }}
/>

<div class="overlay" role="presentation" onclick={onClose}>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label="Créer un personnage"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="head">
      <div>
        <div class="title">Nouveau personnage</div>
        <div class="sub">
          {#if campaignName}Campagne · {campaignName}{:else}Héros &amp; Dragons · niveau 1{/if}
        </div>
      </div>
    </div>

    <!-- Identité -->
    <div class="id-grid">
      <label class="field wide">
        <span class="lbl">Nom *</span>
        <input class="inp" placeholder="ex. Sylve Noctembrelle" maxlength="100" bind:value={identite.nom} />
      </label>
      <label class="field">
        <span class="lbl">Classe *</span>
        <input class="inp" placeholder="ex. Rôdeuse" maxlength="100" bind:value={identite.classe} />
      </label>
      <label class="field">
        <span class="lbl">Race</span>
        <input class="inp" placeholder="ex. Elfe des bois" maxlength="100" bind:value={identite.race} />
      </label>
      <label class="field">
        <span class="lbl">Historique</span>
        <input class="inp" placeholder="ex. Hors-la-loi" maxlength="100" bind:value={identite.historique} />
      </label>
      <label class="field">
        <span class="lbl">Alignement</span>
        <input class="inp" placeholder="ex. Chaotique bon" maxlength="60" bind:value={identite.alignement} />
      </label>
    </div>

    <!-- Caractéristiques -->
    <div class="section">
      <div class="sec-head">
        <span class="sec-title">Caractéristiques</span>
        <div class="seg">
          <button class="seg-btn {mode === 'standard' ? 'on' : ''}" onclick={() => switchMode('standard')}>
            Tableau standard
          </button>
          <button class="seg-btn {mode === 'roll' ? 'on' : ''}" onclick={() => switchMode('roll')}>
            Lancer
          </button>
          <button class="seg-btn {mode === 'free' ? 'on' : ''}" onclick={() => switchMode('free')}>
            À la main
          </button>
        </div>
      </div>

      {#if mode !== 'free'}
        <div class="method-hint">
          {#if mode === 'standard'}
            Cliquez une valeur, puis une caractéristique pour l'assigner · re-cliquer une
            caractéristique la libère.
          {:else}
            4d6 dont on retire le dé le plus bas · « Relancer » réinitialise la répartition.
          {/if}
        </div>

        <div class="pool">
          {#each pool as p (p.i)}
            {#if mode === 'roll' && diceDetail}
              {@const detail = diceDetail[p.i]}
              <button
                class="chip-val"
                class:used={p.used}
                class:sel={sel === p.i}
                title={detail ? detail.all.join(' · ') + ' → ' + detail.kept : ''}
                onclick={() => pickVal(p.i)}
              >
                {p.v}
              </button>
            {:else}
              <button
                class="chip-val"
                class:used={p.used}
                class:sel={sel === p.i}
                onclick={() => pickVal(p.i)}
              >
                {p.v}
              </button>
            {/if}
          {/each}
          {#if mode === 'roll'}
            <button class="chip-val reroll" onclick={rollScores}>↻ Relancer</button>
          {/if}
        </div>

        <div class="carac-grid">
          {#each CARAC_SLOTS as slot (slot.k)}
            <button
              class="carac-slot"
              class:filled={assign[slot.k] !== null}
              class:targeted={sel !== null && assign[slot.k] === null}
              onclick={() => clickCarac(slot.k)}
            >
              <span class="c-label">{slot.label}</span>
              <span class="c-mod">{fmtMod(valueOf(slot.k))}</span>
              <span class="c-val">{valueOf(slot.k) ?? '—'}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="carac-grid">
          {#each CARAC_SLOTS as slot (slot.k)}
            <div class="carac-slot manual">
              <span class="c-label">{slot.label}</span>
              <span class="c-mod">{fmtMod(free[slot.k])}</span>
              <input
                class="c-input"
                type="number"
                min="3"
                max="20"
                aria-label={slot.label}
                bind:value={free[slot.k]}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Survie & pion -->
    <div class="section">
      <div class="row2">
        <label class="field">
          <span class="lbl">Points de vie</span>
          <input class="inp narrow" type="number" min="1" max="1000" bind:value={pvMax} />
        </label>
        <label class="field">
          <span class="lbl">Dé de vie</span>
          <select class="inp narrow" bind:value={dvFaces}>
            <option value={6}>d6</option>
            <option value={8}>d8</option>
            <option value={10}>d10</option>
            <option value={12}>d12</option>
          </select>
        </label>
        <div class="field">
          <span class="lbl">Couleur du pion</span>
          <div class="swatches">
            {#each COLORS as c (c)}
              <button
                class="swatch"
                class:on={couleur === c}
                style="background: {c};"
                aria-label="couleur {c}"
                onclick={() => (couleur = c)}
              ></button>
            {/each}
          </div>
        </div>
      </div>
      <p class="after-note">
        Le reste (maîtrises, sorts, équipement…) se remplit directement sur la feuille — tout est
        modifiable.
      </p>
    </div>

    {#if error}
      <div class="err">{error}</div>
    {/if}

    <div class="foot">
      <button class="cancel" onclick={onClose}>Annuler</button>
      <button class="go" disabled={!ready || saving} onclick={submit}>
        {saving ? '…' : 'Créer et ouvrir la feuille'}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 24px;
  }
  .modal {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 15px 255px 15px 225px / 225px 15px 255px 15px;
    width: min(640px, 100%);
    max-height: min(88vh, 900px);
    overflow-y: auto;
    padding: 26px 30px 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    box-shadow: 0 16px 50px var(--shadow-2);
  }
  .head .title {
    font-family: var(--font-title);
    font-size: 24px;
    color: var(--heading);
  }
  .head .sub {
    font-size: 13.5px;
    color: var(--text-2);
    margin-top: 2px;
  }

  .id-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .field.wide {
    grid-column: 1 / -1;
  }
  .lbl {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .inp {
    font-family: var(--font-body);
    font-size: 14px;
    padding: 8px 11px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px;
    color: var(--text);
    outline: none;
  }
  .inp:focus {
    border-color: var(--accent);
  }
  .inp.narrow {
    width: 92px;
    text-align: center;
    border-radius: 10px 3px 10px 3px;
  }
  select.inp.narrow {
    cursor: pointer;
  }

  .section {
    border-top: 1px solid var(--border-soft);
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .sec-title {
    font-weight: 700;
    font-size: 14px;
    color: var(--heading);
  }
  .seg {
    display: flex;
    gap: 0;
  }
  .seg-btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 5px 12px;
    background: var(--panel);
    border: 2px solid var(--border);
    color: var(--text-2);
    cursor: pointer;
  }
  .seg-btn:first-child {
    border-right-width: 1px;
    border-radius: 225px 0 0 12px / 12px 0 0 255px;
  }
  .seg-btn:last-child {
    border-left-width: 1px;
    border-radius: 0 12px 225px 0 / 0 255px 12px 0;
  }
  .seg-btn.on {
    background: var(--selected);
    color: var(--heading);
  }
  .method-hint {
    font-size: 12.5px;
    color: var(--text-2);
  }

  .pool {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip-val {
    font-family: var(--font-title);
    font-size: 17px;
    min-width: 46px;
    padding: 5px 10px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 225px 12px 220px 12px / 12px 200px 12px 255px;
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s, opacity 0.12s;
  }
  .chip-val:hover {
    border-color: var(--text-2);
  }
  .chip-val.sel {
    border-color: var(--accent);
    color: var(--accent-text);
    box-shadow: 0 0 0 1px var(--accent-border);
  }
  .chip-val.used {
    opacity: 0.3;
    cursor: default;
  }
  .chip-val.reroll {
    font-family: var(--font-body);
    font-size: 12.5px;
    border-style: dashed;
    color: var(--text-2);
    min-width: 0;
  }
  .chip-val.reroll:hover {
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .carac-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .carac-slot {
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 8px 2px;
    background: var(--bg);
    border: 2px dashed var(--border);
    border-radius: 12px;
    cursor: pointer;
    color: var(--text);
    transition: border-color 0.12s, background 0.12s;
  }
  .carac-slot:hover {
    border-color: var(--text-2);
  }
  .carac-slot.filled {
    border-style: solid;
    border-color: var(--border);
    background: var(--panel);
  }
  .carac-slot.targeted {
    border-color: var(--accent);
  }
  .c-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-3);
    white-space: nowrap;
  }
  .c-mod {
    font-family: var(--font-title);
    font-size: 20px;
    color: var(--accent-text);
    line-height: 1.15;
  }
  .c-val {
    font-size: 11.5px;
    color: var(--text-2);
  }
  .carac-slot.manual {
    cursor: default;
  }
  .c-input {
    font-family: var(--font-body);
    font-size: 12px;
    width: 46px;
    text-align: center;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    color: var(--text);
    outline: none;
  }
  .c-input::-webkit-outer-spin-button,
  .c-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .c-input {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .row2 {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .swatches {
    display: flex;
    gap: 7px;
  }
  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 50% 46% 52% 48% / 48% 52% 46% 50%;
    border: 2px solid var(--border);
    cursor: pointer;
    padding: 0;
  }
  .swatch.on {
    border-color: var(--heading);
    box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent);
  }
  .after-note {
    font-size: 12px;
    color: var(--text-3);
  }

  .err {
    font-size: 13px;
    color: var(--accent-text);
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    border-top: 1px solid var(--border-soft);
    padding-top: 14px;
  }
  .cancel {
    font-family: var(--font-body);
    font-size: 14px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-2);
  }
  .cancel:hover {
    color: var(--text);
  }
  .go {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
    padding: 10px 24px;
    background: var(--accent);
    color: var(--accent-fg);
    border: 2px solid var(--accent-border);
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
  }
  .go:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .go:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
