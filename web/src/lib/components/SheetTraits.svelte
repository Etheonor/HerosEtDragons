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

</style>