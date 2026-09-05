<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import {
    CLASSES,
    RACES,
    caracMod,
    freeChoiceCandidates,
    level1Pv,
    racialBonus,
    type Carac,
    type ClassInfo,
    type RaceInfo,
  } from '@rollwith/shared/hd';
  import { SKILLS } from '$lib/char-utils';

  let {
    campaignId,
    campaignName = '',
    onClose,
  }: {
    campaignId: string;
    campaignName?: string;
    onClose: () => void;
  } = $props();

  type Step = 0 | 1 | 2 | 3 | 4 | 5;
  const STEPS = ['Identité', 'Race', 'Classe', 'Historique', 'Caractéristiques', 'Résumé'];

  let step = $state<Step>(0);
  let maxVisited: Step = $state(0);

  // ── Identité ─────────────────────────────────────────────────
  let nom = $state('');
  let alignement = $state('');

  // ── Race ─────────────────────────────────────────────────────
  let race = $state<RaceInfo | null>(null);
  let freeChosen = $state<Carac[]>([]);
  const freeCandidates = $derived(race ? freeChoiceCandidates(race) : []);
  const freeNeeded = $derived(race?.bonus.free?.count ?? 0);
  const racial = $derived(race ? racialBonus(race, freeChosen) : {});

  function pickRace(r: RaceInfo) {
    race = r;
    freeChosen = [];
  }
  function toggleFree(c: Carac) {
    if (freeChosen.includes(c)) {
      freeChosen = freeChosen.filter((x) => x !== c);
    } else if (freeChosen.length < freeNeeded) {
      freeChosen = [...freeChosen, c];
    }
  }

  // ── Classe ──────────────────────────────────────────────────
  let classe = $state<ClassInfo | null>(null);

  // ── Historique (depuis le compendium, repli : texte libre) ──
  interface BackgroundOpt {
    title: string;
    skills: string[];
    tools: string[];
    equipement: string;
  }
  let backgrounds = $state<BackgroundOpt[]>([]);
  let background = $state<BackgroundOpt | null>(null);
  let bgLoading = $state(false);

  async function loadBackgrounds() {
    if (bgLoading || backgrounds.length) return;
    bgLoading = true;
    try {
      const res = await api.compendium.entries(campaignId, { category: 'historiques', limit: 50 });
      backgrounds = res.entries.map((e) => {
        const m = (e.meta ?? {}) as Record<string, unknown>;
        return {
          title: e.title,
          skills: Array.isArray(m.skills) ? (m.skills as string[]) : [],
          tools: Array.isArray(m.tools) ? (m.tools as string[]) : [],
          equipement: typeof m.equipement === 'string' ? m.equipement : '',
        };
      });
    } catch {
      backgrounds = [];
    }
    bgLoading = false;
  }

  // ── Caractéristiques ─────────────────────────────────────────
  type CaracKey = Carac;
  const CARAC_SLOTS: { k: CaracKey; label: string }[] = [
    { k: 'for', label: 'Force' },
    { k: 'dex', label: 'Dextérité' },
    { k: 'con', label: 'Constitution' },
    { k: 'int', label: 'Intelligence' },
    { k: 'sag', label: 'Sagesse' },
    { k: 'cha', label: 'Charisme' },
  ];
  const STANDARD = [15, 14, 13, 12, 10, 8];

  let method = $state<'standard' | 'roll' | 'free'>('standard');
  let vals = $state<number[]>([...STANDARD]);
  let diceDetail = $state<{ all: number[]; kept: number }[] | null>(null);
  let assign = $state<Record<CaracKey, number | null>>({
    for: null, dex: null, con: null, int: null, sag: null, cha: null,
  });
  let sel = $state<number | null>(null);
  let freeBase = $state<Record<CaracKey, number>>({
    for: 8, dex: 8, con: 8, int: 8, sag: 8, cha: 8,
  });

  const usedIdx = $derived(new Set(Object.values(assign).filter((v): v is number => v !== null)));
  const allAssigned = $derived(Object.values(assign).every((v) => v !== null));
  const pool = $derived(vals.map((v, i) => ({ v, i, used: usedIdx.has(i) })));

  function setMethod(m: 'standard' | 'roll' | 'free') {
    if (method === m) return;
    method = m;
    assign = { for: null, dex: null, con: null, int: null, sag: null, cha: null };
    sel = null;
    if (m === 'standard') {
      vals = [...STANDARD];
      diceDetail = null;
    } else if (m === 'roll') {
      rollScores();
    }
  }

  function rollScores() {
    assign = { for: null, dex: null, con: null, int: null, sag: null, cha: null };
    sel = null;
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
    if (assign[k] !== null) assign = { ...assign, [k]: null };
  }
  function baseOf(k: CaracKey): number | null {
    if (method === 'free') return freeBase[k] ?? null;
    const i = assign[k];
    return i === null || i === undefined ? null : vals[i] ?? null;
  }
  function finalOf(k: CaracKey): number {
    return Math.min(20, (baseOf(k) ?? 8) + (racial[k] ?? 0));
  }
  function totalRacial(k: CaracKey): number {
    return racial[k] ?? 0;
  }

  // ── Résumé ──────────────────────────────────────────────────
  const caracsFinaux = $derived.by(() => {
    const out = {} as Record<CaracKey, number>;
    for (const { k } of CARAC_SLOTS) out[k] = finalOf(k);
    return out;
  });
  const conMod = $derived(caracMod(caracsFinaux.con));
  const dexMod = $derived(caracMod(caracsFinaux.dex));
  const pvSuggere = $derived(classe ? level1Pv(classe.hitDie, conMod) : 8);
  let pvMax = $state(0);
  let pvEdited = $state(false);
  let vitesse = $state('9 m');
  let ca = $state(12);

  const COLORS = ['#E0705F', '#8AB58D', '#7FA3B8', '#B58AA8', '#D4A73C', '#9C947F'];
  let couleur = $state(COLORS[0]!);

  $effect(() => {
    if (!pvEdited) pvMax = pvSuggere;
  });

  // ── Navigation ───────────────────────────────────────────────
  const raceReady = $derived(!!race && freeChosen.length >= freeNeeded);
  const stepOk = $derived.by(() => {
    switch (step) {
      case 0: return nom.trim() !== '';
      case 1: return raceReady;
      case 2: return !!classe;
      case 3: return true;
      case 4: return method === 'free' || allAssigned;
      default: return true;
    }
  });

  function next() {
    if (!stepOk) return;
    if (step === 2) void loadBackgrounds();
    step = Math.min(5, step + 1) as Step;
    maxVisited = Math.max(maxVisited, step) as Step;
  }
  function prev() {
    step = Math.max(0, step - 1) as Step;
  }
  function goTo(s: Step) {
    if (s <= maxVisited) step = s;
  }

  // ── Soumission ───────────────────────────────────────────────
  let saving = $state(false);
  let error = $state('');

  function bonusRacialText(r: RaceInfo): string {
    const b = r.bonus;
    const parts: string[] = [];
    const labels: Record<Carac, string> = {
      for: 'Force', dex: 'Dex', con: 'Const', int: 'Int', sag: 'Sag', cha: 'Charism',
    };
    if (b.all) parts.push(`+${b.all} partout`);
    for (const [k, v] of Object.entries(b.fixed ?? {})) parts.push(`${labels[k as Carac]} +${v}`);
    if (b.free) parts.push(`+${b.free.value} ×${b.free.count} au choix`);
    return parts.join(' · ');
  }

  function parseBackgroundEquip(text: string): { po: number; objets: { name: string; qty: number }[] } {
    const poMatch = /(\d+)\s*po/.exec(text);
    const po = poMatch ? Number(poMatch[1]) : 0;
    const objets = text
      .split(/,\s*(?![^()]*\))/)
      .map((s) => s.replace(/bourse contenant[^.]*$/i, '').trim())
      .filter((s) => s.length > 2 && !/^\d+\s*po/.test(s))
      .slice(0, 20)
      .map((name) => ({ name: name.replace(/[.;]$/, ''), qty: 1 }))
      .filter((o) => o.name !== '');
    return { po, objets };
  }

  async function submit() {
    if (saving || !race || !classe) return;
    saving = true;
    error = '';
    const skillProf: Record<string, boolean> = {};
    if (background) {
      const valid = new Set<string>(SKILLS);
      for (const s of background.skills) {
        const norm = s.trim();
        if (valid.has(norm as never)) skillProf[norm] = true;
      }
    }
    const saves = { for: false, dex: false, con: false, int: false, sag: false, cha: false };
    for (const s of classe.saves) saves[s] = true;
    const { po, objets } = background?.equipement
      ? parseBackgroundEquip(background.equipement)
      : { po: 0, objets: [] };

    try {
      const res = await api.characters.create({
        campaignId,
        name: nom.trim(),
        sheet: {
          identite: {
            nom: nom.trim(),
            race: race.label,
            classe: classe.label,
            niveau: 1,
            historique: background?.title ?? '',
            alignement: alignement.trim(),
            xp: 0,
          },
          caracs: caracsFinaux,
          racial,
          saveProficiencies: saves,
          skillProficiencies: skillProf,
          ca: Math.max(0, Math.min(40, Math.trunc(ca) || 10)),
          vitesse: vitesse.trim() || '9 m',
          initiativeBonus: dexMod,
          pvMax: Math.max(1, Math.min(100, Math.trunc(pvMax) || pvSuggere)),
          desDeVie: { faces: classe.hitDie, total: 1, restants: 1 },
          sorts: { caracIncantation: classe.casting, connus: [], emplacements: [] },
          couleurPion: couleur,
          equipement: { bourse: { po, pa: 0, pc: 0 }, objets },
        },
      });
      await goto(`/characters/${res.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Création impossible';
      saving = false;
    }
  }

  function compendiumLink(key: string, cat: string): string {
    return `/compendium?campaign=${encodeURIComponent(campaignId)}&cat=${cat}&slug=${key}`;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onClose();
  }}
/>

<div class="overlay" role="presentation" onclick={onClose}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Créer un personnage" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <div>
        <div class="title">Nouveau personnage</div>
        <div class="sub">{campaignName ? `Campagne · ${campaignName}` : 'Héros & Dragons · création guidée'}</div>
      </div>
    </div>

    <!-- Fil de progression -->
    <div class="stepper">
      {#each STEPS as label, i}
        <button class="stepper-item" class:done={i < step} class:current={i === step} class:locked={i > maxVisited} onclick={() => goTo(i as Step)}>
          <span class="dot-step">{i < step ? '✓' : i + 1}</span>
          <span class="stepper-label">{label}</span>
        </button>
      {/each}
    </div>

    {#if step === 0}
      <div class="id-grid">
        <label class="field wide">
          <span class="lbl">Nom *</span>
          <input class="inp" placeholder="ex. Sylve Noctembrelle" maxlength="100" bind:value={nom} />
        </label>
        <label class="field wide">
          <span class="lbl">Alignement</span>
          <input class="inp" placeholder="ex. Chaotique bon" maxlength="60" bind:value={alignement} />
        </label>
      </div>
    {:else if step === 1}
      <p class="step-hint">Choisis ta race — ses bonus seront appliqués aux caractéristiques à l'étape suivante.</p>
      <div class="cards">
        {#each RACES as r (r.key)}
          <button class="card-choice" class:on={race?.key === r.key} onclick={() => pickRace(r)}>
            <span class="choice-title">{r.label}</span>
            <span class="choice-sub">{bonusRacialText(r)}</span>
            <a class="choice-link" href={compendiumLink(r.key, 'races')} target="_blank" rel="noopener" onclick={(e) => e.stopPropagation()}>fiche →</a>
          </button>
        {/each}
      </div>
      {#if race && freeNeeded > 0}
        <div class="free-choice">
          <span class="lbl">Bonus libres (+1 ×{freeNeeded}) — choisis {freeNeeded - freeChosen.length} carac{freeNeeded - freeChosen.length > 1 ? 's' : ''}</span>
          <div class="pool">
            {#each freeCandidates as c (c)}
              <button class="chip-val" class:used={freeChosen.includes(c)} onclick={() => toggleFree(c)}>
                {CARAC_SLOTS.find((s) => s.k === c)?.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {:else if step === 2}
      <p class="step-hint">La classe détermine ton dé de vie, tes sauvegardes et ta force d'incantation.</p>
      <div class="cards">
        {#each CLASSES as c (c.key)}
          <button class="card-choice" class:on={classe?.key === c.key} onclick={() => (classe = c)}>
            <span class="choice-title">{c.label}</span>
            <span class="choice-sub">
              DV d{c.hitDie} · sauvegardes {c.saves.map((x) => x.toUpperCase()).join(', ')}
              {#if c.casting}· incantation {c.casting.toUpperCase()}{/if}
            </span>
            <a class="choice-link" href={compendiumLink(c.key, 'classes')} target="_blank" rel="noopener" onclick={(e) => e.stopPropagation()}>fiche →</a>
          </button>
        {/each}
      </div>
    {:else if step === 3}
      <p class="step-hint">
        L'historique apporte ses compétences et son équipement de départ — tu pourras tout ajuster sur la feuille.
      </p>
      {#if backgrounds.length === 0 && !bgLoading}
        <div class="cards">
          <button class="card-choice" class:on={background === null} onclick={() => (background = null)}>
            <span class="choice-title">Sans historique</span>
            <span class="choice-sub">tu choisiras tes maîtrises à la main</span>
          </button>
        </div>
        <p class="step-note">Les historiques du compendium n'étaient pas accessibles.</p>
      {:else}
        <div class="cards">
          <button class="card-choice" class:on={background === null} onclick={() => (background = null)}>
            <span class="choice-title">Sans historique</span>
          </button>
          {#each backgrounds as b (b.title)}
            <button class="card-choice" class:on={background?.title === b.title} onclick={() => (background = b)}>
              <span class="choice-title">{b.title}</span>
              {#if b.skills.length}
                <span class="choice-sub">compétences : {b.skills.join(', ')}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {:else if step === 4}
      <div class="sec-head">
        <span class="sec-title">Valeurs de base</span>
        <div class="seg">
          <button class="seg-btn" class:on={method === 'standard'} onclick={() => setMethod('standard')}>Tableau standard</button>
          <button class="seg-btn" class:on={method === 'roll'} onclick={() => setMethod('roll')}>Lancer</button>
          <button class="seg-btn" class:on={method === 'free'} onclick={() => setMethod('free')}>À la main</button>
        </div>
      </div>
      {#if method !== 'free'}
        <div class="pool">
          {#each pool as p (p.i)}
            <button class="chip-val" class:used={p.used} class:sel={sel === p.i} onclick={() => pickVal(p.i)} title={method === 'roll' ? (diceDetail?.[p.i]?.all.join(' · ') ?? undefined) : undefined}>
              {p.v}
            </button>
          {/each}
          {#if method === 'roll'}
            <button class="chip-val reroll" onclick={rollScores}>↻ Relancer</button>
          {/if}
        </div>
      {/if}
      <div class="carac-grid">
        {#each CARAC_SLOTS as slot (slot.k)}
          <div class="carac-final">
            <span class="c-label">{slot.label}</span>
            {#if method === 'free'}
              <input class="c-input" type="number" min="3" max="20" bind:value={freeBase[slot.k]} />
            {:else}
              <button class="carac-slot" class:filled={assign[slot.k] !== null} class:targeted={sel !== null && assign[slot.k] === null} onclick={() => clickCarac(slot.k)}>
                <span class="c-base">{baseOf(slot.k) ?? '—'}</span>
              </button>
            {/if}
            <span class="c-final">
              {#if totalRacial(slot.k) > 0}
                {baseOf(slot.k) ?? '·'} <b class="c-bonus">+{totalRacial(slot.k)}</b> = {finalOf(slot.k)}
              {:else}
                {finalOf(slot.k)}
              {/if}
            </span>
            <span class="c-mod">{dexMod !== null && caracMod(finalOf(slot.k)) >= 0 ? '+' : ''}{caracMod(finalOf(slot.k))}</span>
          </div>
        {/each}
      </div>
      {#if race}
        <p class="step-note">Bonus raciaux ({race.label}) appliqués automatiquement — la valeur <b>=</b> est celle enregistrée.</p>
      {/if}
    {:else}
      <div class="summary">
        <div class="sum-line"><span class="lbl">Nom</span><span>{nom}</span></div>
        <div class="sum-line"><span class="lbl">Race</span><span>{race?.label} — {race ? bonusRacialText(race) : ''}</span></div>
        <div class="sum-line"><span class="lbl">Classe</span><span>{classe?.label} — DV d{classe?.hitDie}, sauvegardes {classe?.saves.map((s) => s.toUpperCase()).join(', ')}</span></div>
        <div class="sum-line"><span class="lbl">Historique</span><span>{background?.title ?? '—'}</span></div>
        <div class="sum-cards">
          {#each CARAC_SLOTS as slot (slot.k)}
            <div class="carac"><span class="carac-lbl">{slot.label}</span><span class="carac-val">{finalOf(slot.k)}</span><span class="carac-sub">{caracMod(finalOf(slot.k)) >= 0 ? '+' : ''}{caracMod(finalOf(slot.k))}</span></div>
          {/each}
        </div>
        <div class="row2">
          <label class="field">
            <span class="lbl">Points de vie <small>(d{classe?.hitDie} max + CON {conMod >= 0 ? '+' : ''}{conMod})</small></span>
            <input class="inp narrow" type="number" min="1" max="100" bind:value={pvMax} oninput={() => (pvEdited = true)} />
          </label>
          <label class="field">
            <span class="lbl">Classe d'armure <small>(à ajuster selon l'armure)</small></span>
            <input class="inp narrow" type="number" min="0" max="40" bind:value={ca} />
          </label>
          <label class="field">
            <span class="lbl">Vitesse</span>
            <input class="inp narrow" maxlength="40" bind:value={vitesse} />
          </label>
        </div>
        <div class="field">
          <span class="lbl">Couleur du pion</span>
          <div class="swatches">
            {#each COLORS as c (c)}
              <button class="swatch" class:on={couleur === c} style="background: {c};" aria-label="couleur {c}" onclick={() => (couleur = c)}></button>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="err">{error}</div>
    {/if}

    <div class="foot">
      {#if step > 0}
        <button class="nav-btn" onclick={prev}>← Précédent</button>
      {:else}
        <button class="cancel" onclick={onClose}>Annuler</button>
      {/if}
      <div class="grow"></div>
      {#if step < 5}
        <button class="go" disabled={!stepOk} onclick={next}>Continuer</button>
      {:else}
        <button class="go" disabled={!stepOk || saving || !race || !classe} onclick={submit}>
          {saving ? '…' : 'Créer et ouvrir la feuille'}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: var(--overlay); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px; }
  .modal {
    background: var(--panel); border: 2px solid var(--border);
    border-radius: 15px 255px 15px 225px / 225px 15px 255px 15px;
    width: min(720px, 100%); max-height: min(92vh, 940px); overflow-y: auto;
    padding: 24px 28px 20px; display: flex; flex-direction: column; gap: 16px;
    box-shadow: 0 16px 50px var(--shadow-2);
  }
  .head .title { font-family: var(--font-title); font-size: 24px; color: var(--heading); }
  .head .sub { font-size: 13px; color: var(--text-2); margin-top: 2px; }
  .grow { flex: 1; }

  .stepper { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--border-soft); padding-bottom: 12px; }
  .stepper-item {
    font-family: var(--font-body); display: inline-flex; align-items: center; gap: 6px;
    font-size: 11.5px; padding: 4px 9px; border-radius: 10px 3px 12px 3px;
    border: 2px solid transparent; background: transparent; color: var(--text-3); cursor: pointer;
  }
  .stepper-item.current { border-color: var(--border); color: var(--heading); background: var(--bg); font-weight: 700; }
  .stepper-item.done { color: var(--accent-text); }
  .stepper-item.locked { cursor: default; opacity: .55; }
  .dot-step { font-size: 10.5px; font-weight: 700; }
  @media (max-width: 640px) { .stepper-label { display: none; } }

  .step-hint { font-size: 13px; color: var(--text-2); }
  .step-note { font-size: 12px; color: var(--text-3); }
  .step-note b { color: var(--accent-text); }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  .card-choice {
    font-family: var(--font-body); position: relative; display: flex; flex-direction: column; gap: 3px;
    align-items: flex-start; text-align: left; padding: 10px 12px; background: var(--bg);
    border: 2px solid var(--border); border-radius: 12px 3px 14px 4px; color: var(--text); cursor: pointer;
    transition: border-color .12s, background .12s;
  }
  .card-choice:hover { border-color: var(--text-2); }
  .card-choice.on { border-color: var(--accent); background: var(--panel); box-shadow: 0 0 0 1px var(--accent-border); }
  .choice-title { font-family: var(--font-title); font-size: 15px; color: var(--heading); }
  .choice-sub { font-size: 11.5px; color: var(--text-2); line-height: 1.4; }
  .choice-link { font-size: 11px; font-weight: 700; color: var(--accent-text); text-decoration: none; margin-top: 2px; }
  .choice-link:hover { color: var(--accent-link-hover); text-decoration: underline; }

  .free-choice { display: flex; flex-direction: column; gap: 8px; border: 2px dashed var(--border); border-radius: 12px; padding: 10px 12px; }

  .lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--text-3); }
  .lbl small { text-transform: none; letter-spacing: 0; font-weight: 400; }

  .id-grid { display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .field.wide { width: 100%; }
  .inp {
    font-family: var(--font-body); font-size: 14px; padding: 8px 11px; background: var(--bg);
    border: 2px solid var(--border); border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px;
    color: var(--text); outline: none;
  }
  .inp:focus { border-color: var(--accent); }
  .inp.narrow { width: 90px; text-align: center; border-radius: 10px 3px 10px 3px; }

  .sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .sec-title { font-weight: 700; font-size: 14px; color: var(--heading); }
  .seg { display: flex; }
  .seg-btn {
    font-family: var(--font-body); font-size: 12px; font-weight: 500; padding: 5px 12px;
    background: var(--panel); border: 2px solid var(--border); color: var(--text-2); cursor: pointer;
  }
  .seg-btn:first-child { border-right-width: 1px; border-radius: 225px 0 0 12px / 12px 0 0 255px; }
  .seg-btn:last-child { border-left-width: 1px; border-radius: 0 12px 225px 0 / 0 255px 12px 0; }
  .seg-btn.on { background: var(--selected); color: var(--heading); }

  .pool { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip-val {
    font-family: var(--font-body); font-size: 13px; font-weight: 700; min-width: 46px; padding: 6px 10px;
    background: var(--bg); border: 2px solid var(--border); border-radius: 225px 12px 220px 12px / 12px 200px 12px 255px;
    color: var(--text); cursor: pointer;
  }
  .chip-val:hover { border-color: var(--text-2); }
  .chip-val.sel { border-color: var(--accent); color: var(--accent-text); box-shadow: 0 0 0 1px var(--accent-border); }
  .chip-val.used { opacity: .35; cursor: default; }
  .chip-val.reroll { font-size: 12px; font-weight: 500; border-style: dashed; color: var(--text-2); min-width: 0; }
  .chip-val.reroll:hover { border-color: var(--accent); color: var(--accent-text); }

  .carac-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
  .carac-final {
    display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px;
    background: var(--bg); border: 2px dashed var(--border); border-radius: 12px;
  }
  .c-label { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-3); }
  .carac-slot {
    font-family: var(--font-body); width: 46px; height: 34px; background: var(--panel);
    border: 2px solid var(--border); border-radius: 10px 3px 10px 3px; color: var(--text);
    cursor: pointer; font-size: 15px; font-weight: 700;
  }
  .carac-slot.filled { border-color: var(--text-2); }
  .carac-slot.targeted { border-color: var(--accent); }
  .c-input {
    font-family: var(--font-body); font-size: 13px; width: 46px; text-align: center; padding: 4px;
    background: var(--panel); border: 2px solid var(--border); border-radius: 8px; color: var(--text); outline: none;
  }
  .c-final { font-size: 11.5px; color: var(--text-2); white-space: nowrap; }
  .c-final b { color: var(--accent-text); }
  .c-mod { font-family: var(--font-title); font-size: 16px; color: var(--accent-text); line-height: 1; }

  .summary { display: flex; flex-direction: column; gap: 10px; }
  .sum-line { display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; }
  .sum-line .lbl { flex: none; width: 90px; }
  .sum-cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 4px 0; }
  .carac { border: 2px solid var(--border); background: var(--bg); border-radius: 10px; text-align: center; padding: 5px 2px; }
  .carac-lbl { display: block; font-size: 9.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-3); }
  .carac-val { display: block; font-family: var(--font-title); font-size: 18px; color: var(--text); }
  .carac-sub { display: block; font-size: 11px; color: var(--accent-text); }
  .row2 { display: flex; gap: 18px; flex-wrap: wrap; align-items: flex-start; }
  .swatches { display: flex; gap: 7px; }
  .swatch { width: 24px; height: 24px; border-radius: 50% 46% 52% 48% / 48% 52% 46% 50%; border: 2px solid var(--border); cursor: pointer; padding: 0; }
  .swatch.on { border-color: var(--heading); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); }

  .err { font-size: 13px; color: var(--accent-text); }
  .foot { display: flex; align-items: center; gap: 16px; border-top: 1px solid var(--border-soft); padding-top: 14px; }
  .nav-btn, .cancel {
    font-family: var(--font-body); font-size: 14px; background: none; border: none; cursor: pointer; color: var(--text-2);
  }
  .nav-btn:hover, .cancel:hover { color: var(--text); }
  .go {
    font-family: var(--font-body); font-size: 15px; font-weight: 700; padding: 10px 24px;
    background: var(--accent); color: var(--accent-fg); border: 2px solid var(--accent-border);
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px; cursor: pointer; transition: background .15s, opacity .15s;
  }
  .go:hover:not(:disabled) { background: var(--accent-hover); }
  .go:disabled { opacity: .45; cursor: not-allowed; }
</style>
