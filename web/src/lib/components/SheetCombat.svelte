<script lang="ts">
  import {
    getMod,
    getInitiativeBonus,
    getShowSpells,
    getSpellSaveDc,
    getSpellAttackBonus,
    formatMod,
    suggestedCa,
    caBreakdown,
  } from '$lib/char-utils';
  import { ARMOR_KINDS, ARMOR_KIND_LABELS, type ArmorKind, type SheetArmor, type CharacterSheet } from '$lib/api';
  import { findClass } from '@rollwith/shared/hd';
  import { api } from '$lib/api';
  import BlockLabel from '$lib/ds/BlockLabel.svelte';
  import Editable from '$lib/ds/Editable.svelte';

  let {
    sheet,
    readonly,
    touch,
    onRoll,
    onPvDelta,
    charId,
    campaignId,
    pv,
    pvTemp,
    setPvTemp,
    caAutoOn,
    setCaAuto,
    pvAutoOn,
    pvSuggested,
    setPvAuto,
    pvPct,
  }: {
    sheet: CharacterSheet;
    readonly: boolean;
    touch: () => void;
    onRoll?: (mod: number, label: string) => void;
    onPvDelta?: (delta: number) => void;
    charId: string;
    campaignId: string;
    pv: number;
    pvTemp: number;
    setPvTemp: (v: number) => void;
    caAutoOn: boolean;
    setCaAuto: (on: boolean) => void;
    pvAutoOn: boolean;
    pvSuggested: number | null;
    setPvAuto: (on: boolean) => void;
    pvPct: number;
  } = $props();

  const armures = $derived(sheet.armures ?? []);

  function num(v: unknown, min: number, max: number, fb: number): number {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fb;
  }
  function txt(v: unknown, max: number, fb = ''): string {
    return v === undefined || v === null ? fb : String(v).slice(0, max);
  }

  function onInitClick() {
    if (onRoll) onRoll(getInitiativeBonus(sheet) ?? 0, 'Initiative');
  }
  function onAttackClick(atkId: string) {
    const atk = sheet.attaques.find((a) => a.id === atkId);
    if (atk && onRoll) onRoll(Number(atk.bonus) || 0, `Attaque — ${atk.name}`);
  }
  function adjustPv(delta: number) {
    if (readonly || !onPvDelta) return;
    onPvDelta(delta);
  }

  async function commitPvTemp() {
    setPvTemp(num(pvTemp, 0, 1000, 0));
    try {
      const res = await api.characters.updatePvTemp(charId, pvTemp);
      setPvTemp(res.pvTemp);
    } catch {
      /* la valeur brute reste affichée, resynchronisée au prochain chargement */
    }
  }

  function setDeath(key: 'successes' | 'failures', i: number) {
    if (readonly) return;
    const cur = sheet.deathSaves[key];
    sheet.deathSaves = { ...sheet.deathSaves, [key]: i < cur ? i : i + 1 };
    touch();
  }
  function setUsed(row: { level: number; max: number; used: number }, i: number) {
    if (readonly) return;
    row.used = i < row.used ? i : i + 1;
    touch();
  }
  function addLevelRow() {
    if (readonly) return;
    const next = sheet.sorts.emplacements.reduce((m, e) => Math.max(m, e.level), 0) + 1;
    if (next > 9) return;
    sheet.sorts = {
      ...sheet.sorts,
      emplacements: [...sheet.sorts.emplacements, { level: next, max: 4, used: 0 }],
    };
    touch();
  }
  function removeLevelRow(level: number) {
    if (readonly) return;
    sheet.sorts = {
      ...sheet.sorts,
      emplacements: sheet.sorts.emplacements.filter((e) => e.level !== level),
      connus: sheet.sorts.connus.filter((sp) => sp.level !== level),
    };
    touch();
  }
  function addSpell(level: number) {
    if (readonly) return;
    sheet.sorts = {
      ...sheet.sorts,
      connus: [...sheet.sorts.connus, { slug: `nouveau-sort-${level}`, level, name: 'Nouveau sort' }],
    };
    touch();
  }
  function removeSpell(slug: string, level: number) {
    if (readonly) return;
    sheet.sorts = {
      ...sheet.sorts,
      connus: sheet.sorts.connus.filter((sp) => !(sp.slug === slug && sp.level === level)),
    };
    touch();
  }
  function commitSpellName(sp: { slug: string; name?: string }) {
    sp.name = txt(sp.name, 100) || txt(sp.slug, 100).replace(/-/g, ' ');
    touch();
  }

  function addAttack() {
    if (readonly) return;
    sheet.attaques = [
      ...sheet.attaques,
      { id: crypto.randomUUID(), name: 'Nouvelle arme', bonus: 0, damage: '1d8' },
    ];
    touch();
  }
  function removeAttack(id: string) {
    if (readonly) return;
    sheet.attaques = sheet.attaques.filter((a) => a.id !== id);
    touch();
  }
  function addArmure() {
    if (readonly) return;
    sheet.armures = [
      ...(sheet.armures ?? []),
      { id: crypto.randomUUID(), name: 'Nouvelle armure', ca: 10, kind: 'legere', equipee: false },
    ];
    touch();
  }
  function removeArmure(id: string) {
    if (readonly) return;
    const next = (sheet.armures ?? []).filter((a) => a.id !== id);
    sheet.armures = next;
    if (!next.some((a) => a.equipee) && sheet.caAuto !== false) {
      sheet.ca = 10 + getMod(sheet, 'dex');
    }
    touch();
  }
  function toggleArmureEquip(id: string) {
    if (readonly) return;
    const cur = sheet.armures ?? [];
    const arm = cur.find((a) => a.id === id);
    if (!arm) return;
    const turningOn = !arm.equipee;
    // Exclusif par catégorie : une armure + un bouclier max (règle DRS).
    const next = cur.map((a) => {
      if (a.id === id) return { ...a, equipee: turningOn };
      if (turningOn && a.kind === 'bouclier' && arm.kind === 'bouclier') {
        return { ...a, equipee: false };
      }
      if (turningOn && a.kind !== 'bouclier' && arm.kind !== 'bouclier') {
        return { ...a, equipee: false };
      }
      return a;
    });
    sheet.armures = next;
    if (!next.some((a) => a.equipee) && sheet.caAuto !== false) {
      sheet.ca = 10 + getMod(sheet, 'dex');
    }
    touch();
  }
  function onArmorKindChange(arm: SheetArmor, kind: ArmorKind) {
    if (kind === 'bouclier' && arm.ca === 10) arm.ca = 2; // DRS : bouclier = +2
    arm.kind = kind;
    touch();
  }

  const spellsSorted = $derived([...sheet.sorts.emplacements].sort((a, b) => a.level - b.level));
  function spellLabel(sp: { slug: string; name?: string }): string {
    return sp.name ?? sp.slug.replace(/-/g, ' ');
  }

  // ── Sorts : quota « connus » depuis la fiche de classe (compendium) ──
  const classInfo = $derived(findClass(sheet.identite?.classe));
  let knownLimit = $state<number | null>(null);
  $effect(() => {
    if (!campaignId || !classInfo) {
      knownLimit = null;
      return;
    }
    void api.compendium
      .entry(campaignId, 'classes', classInfo.key)
      .then((e) => {
        const ev = (e.meta as { evolution?: { level: number; extras?: Record<string, string> }[] } | undefined)
          ?.evolution;
        const extras = ev?.find((r) => r.level === sheet.identite.niveau)?.extras;
        const v = extras?.['Sorts connus'];
        knownLimit = v ? (Number(v) || null) : null;
      })
      .catch(() => {
        knownLimit = null;
      });
  });

  // ── Popup « Ajouter un sort » : grimoire filtré par classe et niveau ──
  let spellPickerOpen = $state(false);
  let spellLoading = $state(false);
  let spellCache: { level: number; slug: string; title: string; school: string }[] = [];

  async function openSpellPicker() {
    spellPickerOpen = true;
    if (spellCache.length > 0 || spellLoading) return;
    spellLoading = true;
    try {
      const cls = classInfo?.label; // label canonique (meta.classes du grimoire)
      const maxSpellLevel = Math.max(0, ...sheet.sorts.emplacements.map((e) => e.level));
      const all: { level: number; slug: string; title: string; school: string }[] = [];
      let offset = 0;
      for (;;) {
        const res = await api.compendium.entries(campaignId, {
          category: 'grimoire',
          limit: 200,
          offset,
        });
        for (const e of res.entries) {
          const m = (e.meta ?? {}) as {
            classes?: string[];
            level?: number;
            school?: string;
          };
          if (cls && m.classes?.includes(cls) && (m.level ?? 0) >= 1 && (m.level ?? 0) <= maxSpellLevel) {
            all.push({ level: m.level ?? 1, slug: e.slug, title: e.title, school: m.school ?? '' });
          }
        }
        if (offset + res.entries.length >= res.total) break;
        offset += res.entries.length;
      }
      spellCache = all.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
    } catch {
      spellCache = [];
    }
    spellLoading = false;
  }

  const spellGroups = $derived.by(() => {
    const byLevel = new Map<number, typeof spellCache>();
    for (const sp of spellCache) {
      const arr = byLevel.get(sp.level) ?? [];
      arr.push(sp);
      byLevel.set(sp.level, arr);
    }
    return [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
  });

  function pickSpell(sp: { level: number; slug: string; title: string }) {
    const exists = sheet.sorts.connus.some((c) => c.slug === sp.slug);
    if (exists) return;
    sheet.sorts = {
      ...sheet.sorts,
      connus: [...sheet.sorts.connus, { slug: sp.slug, level: sp.level, name: sp.title }],
    };
    spellPickerOpen = false;
    touch();
  }
</script>

<div class="col col-combat">
  <div class="combat-stats">
    <div class="stat-card" style="border-radius: var(--sketchy-3);" title={caBreakdown(sheet)}>
      <div class="mini-label">CA</div>
      <div class="stat-value big">
        <Editable
          {readonly}
          type="number"
          min={0}
          max={40}
          align="center"
          w={48}
          className="ed-big"
          value={sheet.ca}
          onchange={(v) => (sheet.ca = Number(v))}
          oncommit={() => { sheet.ca = num(sheet.ca, 0, 40, 10); if (caAutoOn && sheet.ca !== suggestedCa(sheet)) sheet.caAuto = false; touch(); }}
          ontype={touch}
        />
      </div>
      {#if !readonly && (caAutoOn || sheet.caAuto === false)}
        {#if caAutoOn}
          <button class="ca-auto-chip" title="Calculée : {caBreakdown(sheet)} — cliquez pour forcer la valeur" onclick={() => setCaAuto(false)}>auto</button>
        {:else}
          <button class="ca-manual-chip" title="Repasser en calcul automatique" onclick={() => setCaAuto(true)}>manuel · auto ?</button>
        {/if}
      {/if}
    </div>
    <div class="stat-card clickable" style="border-radius: var(--sketchy-6);" onclick={onInitClick} title="Cliquez pour lancer l'initiative">
      <div class="mini-label">INITIATIVE</div>
      <div class="stat-value big accent">
        <Editable
          {readonly}
          type="number"
          min={-5}
          max={20}
          align="center"
          w={44}
          className="ed-big ed-accent"
          value={sheet.initiativeBonus}
          onchange={(v) => (sheet.initiativeBonus = Number(v))}
          oncommit={() => { sheet.initiativeBonus = num(sheet.initiativeBonus, -5, 20, 0); touch(); }}
          ontype={touch}
        />
      </div>
    </div>
    <div class="stat-card" style="border-radius: var(--sketchy-8);">
      <div class="mini-label">VITESSE</div>
      <div class="stat-value big">
        <Editable
          {readonly}
          align="center"
          w={72}
          className="ed-big"
          value={sheet.vitesse}
          onchange={(v) => (sheet.vitesse = String(v))}
          oncommit={touch}
          ontype={touch}
        />
      </div>
    </div>
  </div>

  <div class="pv-block">
    <BlockLabel text="Points de vie" />
    <div class="pv-bar-row">
      <div class="pv-bar-bg">
        <div class="pv-bar-fill" style="width: {pvPct}%;"></div>
      </div>
      {#if !readonly}
        <button class="pv-btn minus" onclick={() => adjustPv(-1)} disabled={!onPvDelta}>−</button>
        <button class="pv-btn plus" onclick={() => adjustPv(1)} disabled={!onPvDelta}>+</button>
      {/if}
    </div>
    <div class="pv-extras">
      <span>PV {pv} /
        {#if readonly}
          {sheet.pvMax}
        {:else}
          <Editable
            type="number"
            min={0}
            max={1000}
            align="center"
            w={44}
            value={sheet.pvMax}
            onchange={(v) => (sheet.pvMax = Number(v))}
            oncommit={() => { if (pvAutoOn && pvSuggested !== null && sheet.pvMax !== pvSuggested) sheet.pvAuto = false; sheet.pvMax = num(sheet.pvMax, 0, 1000, 0); touch(); }}
            ontype={touch}
          />
          {#if pvSuggested !== null}
            {#if pvAutoOn}
              <button class="pv-auto-chip" title="Recalculé depuis DV, niveau et CON — clique pour forcer la valeur" onclick={() => setPvAuto(false)}>auto</button>
            {:else}
              <button class="pv-manual-chip" title="Repasser en calcul automatique" onclick={() => setPvAuto(true)}>manuel · auto ?</button>
            {/if}
          {/if}
        {/if}
      </span>
      <span>PV temporaires :
        {#if readonly}
          {pvTemp}
        {:else}
          <Editable type="number" min={0} max={1000} align="center" w={40} value={pvTemp} onchange={(v) => setPvTemp(Number(v))} oncommit={commitPvTemp} />
        {/if}
      </span>
      <span>
        Dés de vie :
        {#if readonly}
          {sheet.desDeVie.restants}/{sheet.desDeVie.total} × d{sheet.desDeVie.faces}
        {:else}
          <Editable
            type="number"
            min={0}
            w={30}
            align="center"
            value={sheet.desDeVie.restants}
            onchange={(v) => (sheet.desDeVie.restants = Number(v))}
            oncommit={() => { sheet.desDeVie.restants = num(sheet.desDeVie.restants, 0, sheet.desDeVie.total, 0); touch(); }}
            ontype={touch}
          />
          /<span title="Déterminé par le niveau">{sheet.identite.niveau}</span> × d
          <Editable
            type="number"
            min={4}
            max={12}
            w={34}
            align="center"
            value={sheet.desDeVie.faces}
            onchange={(v) => (sheet.desDeVie.faces = Number(v))}
            oncommit={() => { sheet.desDeVie.faces = num(sheet.desDeVie.faces, 4, 12, 8); touch(); }}
            ontype={touch}
          />
        {/if}
      </span>
    </div>
    <div class="death-saves">
      <span class="ds-title">Jets contre la mort</span>
      <span class="ds-sub">réussites</span>
      {#each [0, 1, 2] as i (i)}
        <button class="ds-pip ok" class:filled={i < sheet.deathSaves.successes} disabled={readonly} onclick={() => setDeath('successes', i)}>{i < sheet.deathSaves.successes ? '⦿' : '○'}</button>
      {/each}
      <span class="ds-sub ko-margin">échecs</span>
      {#each [0, 1, 2] as i (i)}
        <button class="ds-pip ko" class:filled={i < sheet.deathSaves.failures} disabled={readonly} onclick={() => setDeath('failures', i)}>{i < sheet.deathSaves.failures ? '⦿' : '○'}</button>
      {/each}
    </div>
  </div>

  <div class="block attacks-block">
    <BlockLabel text="Attaques" />
    <div class="attacks-header">
      <span>Arme</span>
      <span title="Bonus d'attaque ajouté au d20 : mod de caractéristique + maîtrise (si maîtrisé)">Att.</span>
      <span>Dégâts</span>
      <span></span>
    </div>
    {#each sheet.attaques as atk (atk.id)}
      <div class="attack-row" onclick={() => onAttackClick(atk.id)} title="Cliquez pour lancer l'attaque">
        <span class="atk-name"><Editable {readonly} w={130} value={atk.name} onchange={(v) => (atk.name = String(v))} oncommit={touch} ontype={touch} /></span>
        <span class="atk-bonus"><Editable {readonly} type="number" min={-5} max={30} align="center" w={38} className="ed-accent" value={atk.bonus} onchange={(v) => (atk.bonus = Number(v))} oncommit={() => { atk.bonus = num(atk.bonus, -5, 30, 0); touch(); }} ontype={touch} /></span>
        <span class="atk-dmg"><Editable {readonly} w={90} value={atk.damage} onchange={(v) => (atk.damage = String(v))} oncommit={touch} ontype={touch} /></span>
        {#if !readonly}
          <button class="row-x" title="Retirer cette attaque" onclick={(e) => { e.stopPropagation(); removeAttack(atk.id); }}>✕</button>
        {/if}
      </div>
    {/each}
    {#if !readonly}
      <button class="add-row" onclick={addAttack}>+ attaque</button>
    {/if}
  </div>

  <div class="block armors-block">
    <BlockLabel text="Armures" />
    <div class="armors-header">
      <span title="Équipée : une armure + un bouclier max, exclusif par catégorie"></span>
      <span>Armure</span>
      <span title="CA de base de l'armure — elle REMPLACE le 10 de base (11 à 18 au DRS ; +2 pour un bouclier)">CA</span>
      <span>Type</span>
      <span></span>
    </div>
    {#each armures as arm (arm.id)}
      <div class="armor-row" title={arm.equipee ? 'Équipée — compte dans la CA' : 'Non équipée'}>
        <button class="dot" class:prof={arm.equipee} disabled={readonly} title={readonly ? undefined : 'Équipée : cliquez pour basculer'} onclick={() => toggleArmureEquip(arm.id)}>{arm.equipee ? '●' : '○'}</button>
        <span class="armor-name"><Editable {readonly} w={140} value={arm.name} onchange={(v) => (arm.name = String(v))} oncommit={touch} ontype={touch} /></span>
        <span class="armor-ca"><Editable {readonly} type="number" min={0} max={40} align="center" w={38} value={arm.ca} onchange={(v) => (arm.ca = Number(v))} oncommit={() => { arm.ca = num(arm.ca, 0, 40, 10); touch(); }} ontype={touch} /></span>
        <span class="armor-kind">
          {#if readonly}
            {ARMOR_KIND_LABELS[arm.kind] ?? arm.kind}
          {:else}
            <select class="armor-select" value={arm.kind} onchange={(e) => onArmorKindChange(arm, (e.target as HTMLSelectElement).value as ArmorKind)}>
              {#each ARMOR_KINDS as k (k)}
                <option value={k}>{ARMOR_KIND_LABELS[k]}</option>
              {/each}
            </select>
          {/if}
        </span>
        {#if !readonly}
          <button class="row-x" title="Retirer cette armure" onclick={() => removeArmure(arm.id)}>✕</button>
        {/if}
      </div>
    {/each}
    {#if !readonly}
      <button class="add-row" onclick={addArmure}>+ armure</button>
    {/if}
  </div>

  {#if getShowSpells(sheet)}
    <div class="block spells-block">
      <BlockLabel text={`Sorts de ${(sheet.identite.classe || '…').toLowerCase()}`} />
      <div class="spell-stats">
        <span>DD sauvegarde <strong title="8 + maîtrise + modificateur de la caractéristique d'incantation">{getSpellSaveDc(sheet)}</strong></span>
        <span>Att. de sort <strong class="accent" title="Maîtrise + modificateur de la caractéristique d'incantation">{formatMod(getSpellAttackBonus(sheet) ?? 0)}</strong></span>
        <span>Carac.
          {#if readonly}
            <strong>{sheet.sorts.caracIncantation?.toUpperCase() ?? '—'}</strong>
          {:else}
            <select
              class="carac-select"
              bind:value={sheet.sorts.caracIncantation}
              onchange={touch}
              title="Caractéristique d'incantation de la classe"
            >
              <option value={null}>—</option>
              <option value="for">FOR</option>
              <option value="dex">DEX</option>
              <option value="con">CON</option>
              <option value="int">INT</option>
              <option value="sag">SAG</option>
              <option value="cha">CHA</option>
            </select>
          {/if}
        </span>
      </div>
      {#if knownLimit !== null}
        <div class="sl-caption known-quota" title="Nombre de sorts connus autorisé par le DRS à ce niveau">
          sorts connus : <strong>{sheet.sorts.connus.length}</strong> / {knownLimit}
          {#if sheet.sorts.connus.length > knownLimit}<span class="quota-over">(au-delà du maximum — retirez-en)</span>{/if}
        </div>
      {/if}
      {#each spellsSorted as lv (lv.level)}
        <div class="spell-level">
          <div class="sl-header">
            <span class="sl-level">niveau {lv.level}</span>
            <span class="sl-caption">{lv.max} emplacement{lv.max > 1 ? 's' : ''} :</span>
            {#each Array(lv.max) as _, i (i)}
              <button class="slot-pip" class:used={i < lv.used} disabled={readonly} title={readonly ? undefined : 'Emplacement dépensé : cliquez pour cocher / libérer'} onclick={() => setUsed(lv, i)}>{i < lv.used ? '⦿' : '○'}</button>
            {/each}
          </div>
          <div class="sl-spells">
            {#each sheet.sorts.connus.filter((s) => s.level === lv.level) as sp (sp.slug)}
              <span class="spell-chip" title="Sort connu — cliquez pour retirer">
                <span class="chip-name"><Editable {readonly} w={Math.max(60, spellLabel(sp).length * 7 + 8)} value={spellLabel(sp)} onchange={(v) => (sp.name = String(v))} oncommit={() => commitSpellName(sp)} ontype={touch} /></span>
                {#if !readonly}
                  <button class="chip-x" title="Retirer ce sort" onclick={() => removeSpell(sp.slug, lv.level)}>✕</button>
                {/if}
              </span>
            {/each}
            {#if !readonly}
              <button class="add-spell" onclick={openSpellPicker}>+ sort du grimoire</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if spellPickerOpen}
    <div class="spell-picker-overlay" role="presentation" onclick={() => (spellPickerOpen = false)}>
      <div class="spell-picker" role="dialog" aria-modal="true" aria-label="Choisir un sort" onclick={(e) => e.stopPropagation()}>
        <div class="sp-picker-head">
          <span class="sp-picker-title">Sorts du grimoire — {sheet.identite.classe}</span>
          <button class="picker-close" onclick={() => (spellPickerOpen = false)}>✕</button>
        </div>
        {#if spellLoading}
          <p class="sp-picker-empty">Chargement du grimoire…</p>
        {:else if spellCache.length === 0}
          <p class="sp-picker-empty">Aucun sort disponible pour cette classe à vos niveaux d'emplacements.</p>
        {:else}
          <div class="sp-picker-body">
            {#each spellGroups as [level, spells] (level)}
              <div class="sp-group-title">niveau {level}</div>
              <div class="sp-grid">
                {#each spells as sp (sp.slug)}
                  <button
                    class="sp-card"
                    class:known={sheet.sorts.connus.some((c) => c.slug === sp.slug)}
                    disabled={sheet.sorts.connus.some((c) => c.slug === sp.slug)}
                    onclick={() => pickSpell(sp)}
                  >
                    <span class="sp-title">{sp.title}</span>
                    {#if sp.school}<span class="sp-school">{sp.school}</span>{/if}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .combat-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 9px;
  }
  .stat-card {
    border: 2px solid var(--border);
    background: var(--panel);
    padding: 9px 4px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .stat-card.clickable {
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .stat-card.clickable:hover {
    border-color: var(--accent-border);
    background: var(--bg);
  }
  .stat-value { color: var(--heading); }
  .stat-value.big { font-family: var(--font-title); font-size: 23px; line-height: 1.2; }
  .stat-value.accent { color: var(--accent-text); }
  .ca-auto-chip {
    font-family: var(--font-body); font-size: 9.5px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; color: var(--accent-text); border: 1.5px solid var(--accent-border);
    border-radius: 8px 3px 8px 3px; background: transparent; padding: 0 6px; cursor: pointer;
    line-height: 1.6; margin-top: 3px;
  }
  .ca-auto-chip:hover { background: var(--bg); }
  .ca-manual-chip {
    font-family: var(--font-body); font-size: 9.5px; font-weight: 700;
    color: var(--text-3); border: 1.5px dashed var(--border); border-radius: 8px 3px 8px 3px;
    background: transparent; padding: 0 6px; cursor: pointer; line-height: 1.6; margin-top: 3px;
  }
  .ca-manual-chip:hover { color: var(--accent-text); border-color: var(--accent-border); }

  .pv-block {
    border: 2px solid var(--border);
    border-radius: var(--sketchy-1);
    background: var(--panel);
    padding: 11px 14px;
    position: relative;
  }
  .pv-bar-row { display: flex; align-items: center; gap: 8px; }
  .pv-bar-bg {
    flex: 1;
    height: 11px;
    border: 2px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--panel);
  }
  .pv-bar-fill {
    height: 100%;
    background: repeating-linear-gradient(-55deg, var(--accent) 0, var(--accent) 4px, var(--accent-hover) 4px, var(--accent-hover) 8px);
  }
  .pv-btn {
    font-family: var(--font-body); font-size: 13px; width: 24px; height: 24px; padding: 0;
    background: var(--panel); border: 2px solid var(--border); color: var(--text-2);
    cursor: pointer; line-height: 1;
  }
  .pv-btn.minus { border-radius: 8px 3px 8px 3px; }
  .pv-btn.minus:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .pv-btn.plus { border-radius: 3px 8px 3px 8px; }
  .pv-btn.plus:hover { border-color: var(--text-2); color: var(--text); }
  .pv-extras {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--text-2);
    margin-top: 5px;
    flex-wrap: wrap;
    align-items: baseline;
  }
  .pv-extras span { display: inline-flex; align-items: baseline; gap: 3px; }

  .death-saves {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
    border-top: 1px dashed var(--border-soft);
    padding-top: 7px;
    flex-wrap: wrap;
  }
  .ds-title { font-size: 13px; font-weight: 500; color: var(--text-2); margin-right: 5px; }
  .ds-sub { font-size: 11.5px; color: var(--text-2); }
  .ko-margin { margin-left: 6px; }
  .ds-pip {
    font-size: 14px;
    color: var(--border);
    background: none;
    border: none;
    padding: 0 1px;
    cursor: pointer;
    user-select: none;
    line-height: 1;
  }
  .ds-pip:disabled { cursor: default; }
  .ds-pip.ok.filled { color: #8ab58d; }
  .ds-pip.ko.filled { color: var(--accent-text); }

  .attacks-block { border-radius: 12px 235px 14px 245px / 235px 12px 255px 14px; }
  .attacks-header {
    display: grid;
    grid-template-columns: 1fr 58px 1fr 20px;
    gap: 4px 8px;
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--border-soft);
  }
  .attack-row {
    display: grid;
    grid-template-columns: 1fr 58px 1fr 20px;
    gap: 4px 8px;
    padding: 3px 0;
    border-bottom: 1px dashed var(--border-soft);
    font-size: 12.5px;
    cursor: pointer;
    align-items: center;
  }
  .atk-name { font-weight: 600; min-width: 0; }
  .atk-bonus { font-size: 12.5px; color: var(--accent-text); }
  .atk-dmg { font-size: 12px; color: var(--text); }

  .armors-block { border-radius: var(--sketchy-5); }
  .armors-header {
    display: grid;
    grid-template-columns: 16px 1fr 44px 1fr 20px;
    gap: 4px 8px;
    font-weight: 700;
    font-size: 10.5px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--border-soft);
  }
  .armor-row {
    display: grid;
    grid-template-columns: 16px 1fr 44px 1fr 20px;
    gap: 4px 8px;
    padding: 3px 0;
    border-bottom: 1px dashed var(--border-soft);
    font-size: 12.5px;
    align-items: center;
  }
  .armor-name { font-weight: 600; min-width: 0; }
  .armor-ca { font-size: 12.5px; color: var(--accent-text); }
  .armor-kind { font-size: 11.5px; color: var(--text-2); }
  .armor-select {
    font-family: var(--font-body);
    font-size: 11.5px;
    background: var(--bg);
    color: var(--heading);
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    padding: 1px 3px;
    outline: none;
    max-width: 100%;
  }

  .spells-block { border-radius: var(--sketchy-5); }
  .spell-stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-2);
    border-bottom: 1px solid var(--border-soft);
    padding-bottom: 6px;
    flex-wrap: wrap;
    align-items: baseline;
  }
  .spell-stats strong { color: var(--text); }
  .spell-stats strong.accent { color: var(--accent-text); }
  .carac-select {
    font-family: var(--font-body);
    font-size: 12px;
    background: var(--bg);
    color: var(--heading);
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    padding: 1px 4px;
    outline: none;
  }
  .spell-level { margin-top: 7px; }
  .sl-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sl-level { font-size: 13.5px; font-weight: 500; color: var(--text-2); }
  .sl-caption { font-size: 12px; color: var(--text-3); }
  .slot-pip {
    font-size: 14px;
    color: var(--border);
    background: none;
    border: none;
    padding: 0 1px;
    cursor: pointer;
    user-select: none;
    line-height: 1;
  }
  .slot-pip:disabled { cursor: default; }
  .slot-pip.used { color: var(--accent-text); }
  .sl-spells { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; align-items: center; }
  .spell-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    padding: 1px 4px 1px 8px;
    border: 2px solid var(--accent-border);
    border-radius: 10px 3px 12px 3px;
    color: var(--accent-text);
    background: var(--bg);
  }
  .chip-x {
    font-family: var(--font-body); font-weight: 700; font-size: 9px;
    background: none; border: none; color: var(--text-3); cursor: pointer; padding: 0 2px;
  }
  .chip-x:hover { color: var(--accent-text); }
  .add-spell {
    font-family: var(--font-body); font-size: 11.5px;
    background: transparent; border: 1.5px dashed var(--border); border-radius: 10px 3px 12px 3px;
    color: var(--text-2); cursor: pointer; padding: 2px 9px;
  }
  .add-spell:hover { border-color: var(--accent); color: var(--accent-text); }

  .known-quota {
    margin-top: 6px;
    padding: 3px 8px;
    border: 1px dashed var(--border);
    border-radius: 8px 3px 8px 3px;
  }
  .known-quota strong { color: var(--heading); }
  .quota-over { color: var(--accent-text); }

  .spell-picker-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    padding: 24px;
  }
  .spell-picker {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 15px 255px 15px 225px / 225px 15px 255px 15px;
    width: min(680px, 100%);
    max-height: min(80vh, 760px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 50px var(--shadow-2);
  }
  .sp-picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px 12px;
    flex: none;
  }
  .sp-picker-title {
    font-family: var(--font-title);
    font-size: 20px;
    color: var(--heading);
  }
  .picker-close {
    font-size: 13px;
    background: none;
    border: 1.5px dashed var(--border);
    border-radius: 8px;
    color: var(--text-2);
    cursor: pointer;
    padding: 2px 8px;
  }
  .picker-close:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .sp-picker-empty {
    color: var(--text-2);
    font-style: italic;
    font-size: 13px;
    padding: 10px 22px 20px;
  }
  .sp-picker-body {
    overflow-y: auto;
    padding: 0 22px 20px;
    min-height: 0;
  }
  .sp-group-title {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-3);
    margin: 12px 0 6px;
  }
  .sp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
  }
  .sp-card {
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-start;
    text-align: left;
    padding: 7px 10px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 10px 3px 12px 4px;
    color: var(--text);
    cursor: pointer;
  }
  .sp-card:hover:not(:disabled) { border-color: var(--accent); }
  .sp-card:disabled { opacity: 0.45; cursor: default; }
  .sp-title { font-size: 12.5px; font-weight: 600; }
  .sp-school { font-size: 10.5px; color: var(--text-3); }
</style>