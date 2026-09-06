<script lang="ts">
  import type { CharacterSheet } from '$lib/api';
  import BlockLabel from '$lib/ds/BlockLabel.svelte';
  import Editable from '$lib/ds/Editable.svelte';

  let {
    sheet,
    readonly,
    touch,
  }: {
    sheet: CharacterSheet;
    readonly: boolean;
    touch: () => void;
  } = $props();

  function num(v: unknown, min: number, max: number, fb: number): number {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fb;
  }
  function txt(v: unknown, max: number, fb = ''): string {
    return v === undefined || v === null ? fb : String(v).slice(0, max);
  }

  function addCapacite() {
    if (readonly) return;
    sheet.capacites = [
      ...sheet.capacites,
      { id: crypto.randomUUID(), name: 'Nouvelle capacité', description: '' },
    ];
    touch();
  }
  function removeCapacite(id: string) {
    if (readonly) return;
    sheet.capacites = sheet.capacites.filter((c) => c.id !== id);
    touch();
  }
  function addObjet() {
    if (readonly) return;
    sheet.equipement = {
      ...sheet.equipement,
      objets: [...sheet.equipement.objets, { name: 'Nouvel objet', qty: 1 }],
    };
    touch();
  }
  function removeObjet(idx: number) {
    if (readonly) return;
    sheet.equipement = {
      ...sheet.equipement,
      objets: sheet.equipement.objets.filter((_, i) => i !== idx),
    };
    touch();
  }
</script>

<div class="col col-traits">
  <div class="block traits-block">
    <BlockLabel text="Capacités & traits" />
    {#each sheet.capacites as trait (trait.id)}
      <div class="trait-item">
        <div class="trait-name-row">
          <span class="trait-name"><Editable {readonly} w={180} value={trait.name} onchange={(v) => (trait.name = String(v))} oncommit={touch} ontype={touch} /></span>
          {#if !readonly}
            <button class="row-x" title="Retirer" onclick={() => removeCapacite(trait.id)}>✕</button>
          {/if}
        </div>
        <div class="trait-desc"><Editable {readonly} type="area" value={trait.description} onchange={(v) => (trait.description = String(v))} placeholder="description…" oncommit={touch} ontype={touch} /></div>
      </div>
    {/each}
    {#if !readonly}
      <button class="add-row" onclick={addCapacite}>+ capacité</button>
    {/if}
  </div>

  <div class="block persona-block">
    <BlockLabel text="Personnalité" />
    <div class="persona-item"><span class="persona-key">traits — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.traits ?? ''} onchange={(v) => (sheet.personnalite.traits = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
    <div class="persona-item"><span class="persona-key">idéal — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.ideaux ?? ''} onchange={(v) => (sheet.personnalite.ideaux = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
    <div class="persona-item"><span class="persona-key">lien — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.liens ?? ''} onchange={(v) => (sheet.personnalite.liens = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
    <div class="persona-item"><span class="persona-key">défaut — </span><Editable {readonly} className="ed-persona" value={sheet.personnalite.defauts ?? ''} onchange={(v) => (sheet.personnalite.defauts = String(v))} placeholder="…" oncommit={touch} ontype={touch} /></div>
  </div>

  <div class="block equip-block">
    <BlockLabel text="Équipement" />
    <div class="bourse">
      <span>{#if readonly}{sheet.equipement.bourse.po}{:else}<Editable type="number" min={0} w={52} align="center" value={sheet.equipement.bourse.po} onchange={(v) => (sheet.equipement.bourse.po = Number(v))} oncommit={() => { sheet.equipement.bourse.po = num(sheet.equipement.bourse.po, 0, 1e6, 0); touch(); }} ontype={touch} />{/if} <span class="coin po">po</span></span>
      <span>{#if readonly}{sheet.equipement.bourse.pa}{:else}<Editable type="number" min={0} w={52} align="center" value={sheet.equipement.bourse.pa} onchange={(v) => (sheet.equipement.bourse.pa = Number(v))} oncommit={() => { sheet.equipement.bourse.pa = num(sheet.equipement.bourse.pa, 0, 1e6, 0); touch(); }} ontype={touch} />{/if} <span class="coin pa">pa</span></span>
      <span>{#if readonly}{sheet.equipement.bourse.pc}{:else}<Editable type="number" min={0} w={52} align="center" value={sheet.equipement.bourse.pc} onchange={(v) => (sheet.equipement.bourse.pc = Number(v))} oncommit={() => { sheet.equipement.bourse.pc = num(sheet.equipement.bourse.pc, 0, 1e6, 0); touch(); }} ontype={touch} />{/if} <span class="coin pc">pc</span></span>
    </div>
    <div class="equip-list">
      {#each sheet.equipement.objets as item, idx (item.name + idx)}
        <div class="equip-row">
          <span class="equip-name"><Editable {readonly} w={190} value={item.name} onchange={(v) => (item.name = String(v))} oncommit={touch} ontype={touch} /></span>
          <span class="equip-qty">×<Editable {readonly} type="number" min={0} max={9999} w={40} align="center" value={item.qty} onchange={(v) => (item.qty = Number(v))} oncommit={() => { item.qty = num(item.qty, 0, 9999, 1); touch(); }} ontype={touch} /></span>
          {#if !readonly}
            <button class="row-x" title="Jeter cet objet" onclick={() => removeObjet(idx)}>✕</button>
          {/if}
        </div>
      {/each}
    </div>
    {#if !readonly}
      <button class="add-row" onclick={addObjet}>+ objet</button>
    {/if}
  </div>
</div>

<style>
  .traits-block { border-radius: var(--sketchy-3); }
  .trait-item { padding: 5px 0; border-bottom: 1px dashed var(--border-soft); }
  .trait-name-row { display: flex; align-items: center; gap: 4px; }
  .trait-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; min-width: 0; }
  .trait-desc { font-size: 12px; color: var(--text-2); line-height: 1.45; margin-top: 2px; }

  .persona-block { border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px; }
  .persona-item {
    padding: 3px 0;
    border-bottom: 1px dashed var(--border-soft);
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
  }
  .persona-key { font-size: 13px; font-weight: 500; color: var(--accent-text); flex: none; }

  .equip-block { border-radius: var(--sketchy-5); }
  .bourse {
    display: flex;
    gap: 14px;
    font-size: 13.5px;
    color: var(--text);
    border-bottom: 1px solid var(--border-soft);
    padding-bottom: 6px;
  }
  .bourse span { display: inline-flex; align-items: baseline; gap: 3px; }
  .coin { font-size: 10.5px; }
  .coin.po { color: var(--coin-po); }
  .coin.pa { color: var(--coin-pa); }
  .coin.pc { color: var(--coin-pc); }
  .equip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    padding: 2px 0;
    border-bottom: 1px dashed var(--border-soft);
  }
  .equip-name { flex: 1; min-width: 0; }
  .equip-qty { font-size: 12px; color: var(--text-2); display: inline-flex; align-items: center; gap: 2px; }
</style>