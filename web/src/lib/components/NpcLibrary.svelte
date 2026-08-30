<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type NpcTemplate } from '$lib/api';

  let {
    campaignId,
    onPlace,
  }: {
    campaignId: string;
    onPlace: (tpl: NpcTemplate, count: number) => void;
  } = $props();

  let open = $state(false);
  let panelEl = $state<HTMLDivElement | null>(null);
  let templates = $state<NpcTemplate[]>([]);
  let search = $state('');
  let error = $state('');
  let creating = $state(false);
  let editingId = $state<string | null>(null);
  let pendingDeleteId = $state<string | null>(null);
  let qty = $state<Record<string, number>>({});

  let form = $state({ name: '', ca: 10, pvMax: 1, initBonus: 0, color: '#C0392B', notes: '' });
  let saving = $state(false);

  const filtered = $derived(
    templates.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase())),
  );

  onMount(refresh);

  async function refresh() {
    try {
      const res = await api.npcTemplates.list(campaignId);
      templates = res.templates;
    } catch {
      /* panneau vide plutôt qu'erreur bloquante */
    }
  }

  $effect(() => {
    if (!open) return;
    function onDocDown(e: PointerEvent) {
      if (panelEl && !panelEl.contains(e.target as Node)) close();
    }
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  });

  function toggle() {
    open = !open;
    if (open) {
      error = '';
      void refresh();
    } else {
      close();
    }
  }

  function close() {
    open = false;
    creating = false;
    editingId = null;
    pendingDeleteId = null;
    search = '';
  }

  function startCreate() {
    creating = true;
    editingId = null;
    form = { name: '', ca: 10, pvMax: 1, initBonus: 0, color: '#C0392B', notes: '' };
  }

  function startEdit(t: NpcTemplate) {
    editingId = t.id;
    creating = false;
    form = { name: t.name, ca: t.ca, pvMax: t.pvMax, initBonus: t.initBonus, color: t.color, notes: t.notes };
  }

  async function createTpl() {
    if (saving) return;
    saving = true;
    error = '';
    try {
      await api.npcTemplates.create(campaignId, { ...form, conditions: [] });
      creating = false;
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Création impossible';
    }
    saving = false;
  }

  async function saveEdit(id: string) {
    if (saving) return;
    saving = true;
    error = '';
    try {
      await api.npcTemplates.update(id, { ...form, conditions: templates.find((t) => t.id === id)?.conditions ?? [] });
      editingId = null;
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Modification impossible';
    }
    saving = false;
  }

  async function removeTpl(id: string) {
    try {
      await api.npcTemplates.remove(id);
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Suppression impossible';
    }
    pendingDeleteId = null;
  }

  function place(t: NpcTemplate) {
    const n = qty[t.id] ?? 1;
    onPlace(t, Math.max(1, Math.min(20, n)));
    close();
  }

  function getQty(id: string): number {
    return qty[id] ?? 1;
  }
  function setQty(id: string, v: number) {
    qty = { ...qty, [id]: Math.max(1, Math.min(20, Math.trunc(v || 1))) };
  }
</script>

<div class="npc-library" bind:this={panelEl}>
  <button class="lib-btn" class:open onclick={toggle}>
    PNJ<span class="count">{templates.length}</span>
  </button>

  {#if open}
    <div class="lib-panel" role="group" aria-label="Bibliothèque de PNJ">
      {#if templates.length > 3}
        <input class="search" placeholder="Rechercher…" bind:value={search} />
      {/if}

      <div class="rows">
        {#each filtered as t (t.id)}
          <div class="row-wrap">
            <div class="row">
              <button class="row-main" title="Cliquer pour poser sur la carte" onclick={() => place(t)}>
                <span class="dot" style="background: {t.color};"></span>
                <span class="row-text">
                  <span class="row-name" title={t.notes || undefined}>{t.name}</span>
                  <span class="row-stats">CA {t.ca} · PV {t.pvMax} · Init {t.initBonus >= 0 ? '+' : ''}{t.initBonus}</span>
                </span>
                <span class="place-hint">Poser</span>
              </button>
              <input
                class="qty"
                type="number"
                min="1"
                max="20"
                value={getQty(t.id)}
                title="Quantité"
                oninput={(e) => setQty(t.id, Number((e.target as HTMLInputElement).value))}
              />
              <span class="row-actions">
                <button class="mini" title="Modifier" onclick={() => startEdit(t)}>✎</button>
                <button class="mini del" class:armed={pendingDeleteId === t.id} title="Supprimer" onclick={() => (pendingDeleteId = pendingDeleteId === t.id ? null : t.id)}>✕</button>
              </span>
            </div>
            {#if pendingDeleteId === t.id}
              <div class="del-confirm">
                Supprimer ce modèle ? Les PNJ déjà posés ne sont pas affectés.
                <button class="confirm-yes" onclick={() => removeTpl(t.id)}>Oui</button>
                <button class="confirm-no" onclick={() => (pendingDeleteId = null)}>Annuler</button>
              </div>
            {/if}
            {#if editingId === t.id}
              <div class="form">
                <input class="f-name" placeholder="nom" bind:value={form.name} />
                <div class="f-grid">
                  <label>CA <input type="number" min="1" max="30" bind:value={form.ca} /></label>
                  <label>PV <input type="number" min="1" max="999" bind:value={form.pvMax} /></label>
                  <label>Init <input type="number" min="-10" max="20" bind:value={form.initBonus} /></label>
                </div>
                <input class="f-notes" placeholder="note rapide (attaque, dégâts…)" bind:value={form.notes} />
                <div class="f-actions">
                  <button class="foot-btn small" disabled={saving} onclick={() => saveEdit(t.id)}>Enregistrer</button>
                  <button class="foot-btn small" onclick={() => (editingId = null)}>Annuler</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
        {#if filtered.length === 0 && !creating}
          <div class="empty">{templates.length === 0 ? 'Aucun modèle — créez-en un ou enregistrez un PNJ posé.' : 'Aucun résultat.'}</div>
        {/if}
      </div>

      {#if creating}
        <div class="form">
          <input class="f-name" placeholder="nom du PNJ" bind:value={form.name} />
          <div class="f-grid">
            <label>CA <input type="number" min="1" max="30" bind:value={form.ca} /></label>
            <label>PV <input type="number" min="1" max="999" bind:value={form.pvMax} /></label>
            <label>Init <input type="number" min="-10" max="20" bind:value={form.initBonus} /></label>
          </div>
          <input class="f-notes" placeholder="note rapide (attaque, dégâts…)" bind:value={form.notes} />
          <div class="f-actions">
            <button class="foot-btn small solid" disabled={saving} onclick={createTpl}>Créer</button>
            <button class="foot-btn small" onclick={() => (creating = false)}>Annuler</button>
          </div>
        </div>
      {/if}

      {#if error}
        <div class="panel-error">{error}</div>
      {/if}

      <div class="panel-foot">
        <button class="foot-btn" onclick={startCreate}>+ Nouveau PNJ</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .npc-library {
    position: relative;
    display: inline-flex;
  }
  .lib-btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 4px 11px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 8px 210px 8px 235px / 230px 8px 245px 8px;
    color: var(--text-2);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .lib-btn:hover,
  .lib-btn.open {
    background: var(--selected);
    color: var(--heading);
  }
  .count {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-text);
    background: var(--bg);
    border-radius: 8px 3px 8px 3px;
    padding: 0 5px;
    line-height: 1.5;
  }

  .lib-panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 320px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 14px 5px 16px 5px;
    box-shadow: 0 10px 34px var(--shadow-2);
    z-index: 60;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .search {
    font-family: var(--font-body);
    font-size: 13px;
    padding: 6px 9px;
    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 340px;
    overflow-y: auto;
  }
  .empty {
    font-size: 12.5px;
    color: var(--text-2);
    font-style: italic;
    padding: 6px 4px;
  }

  .row-wrap {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 10px 3px 12px 3px;
  }
  .row:hover {
    background: var(--selected);
  }
  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    font-family: var(--font-body);
    background: transparent;
    border: none;
    color: var(--text);
    padding: 5px 7px;
    cursor: pointer;
    text-align: left;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 0, 0, 0.35);
    flex: none;
  }
  .row-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .row-name {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-stats {
    font-size: 11px;
    color: var(--text-2);
  }
  .place-hint {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--accent-text);
    opacity: 0;
    flex: none;
  }
  .row:hover .place-hint {
    opacity: 1;
  }
  .qty {
    width: 36px;
    font-family: var(--font-body);
    font-size: 11.5px;
    text-align: center;
    padding: 3px 2px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    color: var(--text);
    flex: none;
  }
  .row-actions {
    display: flex;
    gap: 2px;
    flex: none;
    opacity: 0;
  }
  .row:hover .row-actions {
    opacity: 1;
  }
  .mini {
    font-family: var(--font-body);
    font-size: 11px;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    border-radius: 6px;
  }
  .mini:hover {
    color: var(--text);
    background: var(--bg);
  }
  .mini.del.armed {
    color: var(--accent-text);
    background: var(--bg);
  }

  .del-confirm {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    font-size: 11.5px;
    color: var(--text-2);
    padding: 2px 7px 6px;
  }
  .confirm-yes {
    font-family: var(--font-body);
    font-size: 11.5px;
    font-weight: 700;
    background: var(--accent);
    color: var(--accent-fg);
    border: 1.5px solid var(--accent-border);
    border-radius: 8px 3px 8px 3px;
    padding: 1px 8px;
    cursor: pointer;
  }
  .confirm-no {
    font-family: var(--font-body);
    font-size: 11.5px;
    background: transparent;
    border: 1.5px dashed var(--border);
    border-radius: 8px 3px 8px 3px;
    color: var(--text-2);
    padding: 1px 8px;
    cursor: pointer;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 8px;
    margin: 2px 0;
  }
  .form input {
    font-family: var(--font-body);
    font-size: 12.5px;
    padding: 5px 8px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    color: var(--text);
    outline: none;
  }
  .f-grid {
    display: flex;
    gap: 6px;
  }
  .f-grid label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  .f-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .panel-error {
    font-size: 12px;
    color: var(--accent-text);
    padding: 2px 4px;
  }

  .panel-foot {
    display: flex;
    gap: 6px;
    border-top: 1px dashed var(--border-soft);
    padding-top: 7px;
  }
  .foot-btn {
    flex: 1;
    font-family: var(--font-body);
    font-size: 12.5px;
    font-weight: 500;
    padding: 5px 8px;
    background: transparent;
    border: 2px dashed var(--border);
    border-radius: 10px;
    color: var(--text-2);
    cursor: pointer;
  }
  .foot-btn:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .foot-btn.small {
    flex: none;
    padding: 3px 12px;
    font-size: 12px;
    font-weight: 700;
  }
  .foot-btn.solid {
    background: var(--accent);
    border-style: solid;
    border-color: var(--accent-border);
    color: var(--accent-fg);
  }
</style>
