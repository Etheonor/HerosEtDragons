<script lang="ts">
  import { api, type MapSummary } from '$lib/api';

  let {
    campaignId,
    maps,
    activeMapId,
    onPick,
    onChanged,
  }: {
    campaignId: string;
    maps: MapSummary[];
    activeMapId: string | null;
    onPick: (id: string) => void;
    onChanged: () => void | Promise<void>;
  } = $props();

  let open = $state(false);
  let panelEl = $state<HTMLDivElement | null>(null);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let pendingDeleteId = $state<string | null>(null);
  let error = $state('');
  let dragOver = $state(false);
  let replaceFileInput = $state<HTMLInputElement | null>(null);
  let replaceTargetId = $state<string | null>(null);
  let importFileInput = $state<HTMLInputElement | null>(null);

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
      renamingId = null;
      pendingDeleteId = null;
    }
  }

  function close() {
    open = false;
    renamingId = null;
    pendingDeleteId = null;
    dragOver = false;
  }

  function pick(id: string) {
    onPick(id);
    close();
  }

  function startRename(m: MapSummary) {
    renamingId = m.id;
    renameValue = m.name;
    pendingDeleteId = null;
  }

  async function commitRename() {
    const id = renamingId;
    const name = renameValue.trim();
    if (!id || !name) {
      renamingId = null;
      return;
    }
    if (name !== maps.find((m) => m.id === id)?.name) {
      try {
        await api.maps.update(id, { name });
        await onChanged();
      } catch (e) {
        error = e instanceof Error ? e.message : 'Renommage impossible';
      }
    }
    renamingId = null;
  }

  function armDelete(id: string) {
    pendingDeleteId = pendingDeleteId === id ? null : id;
  }

  async function confirmDelete(id: string) {
    try {
      await api.maps.remove(id);
      const rest = maps.filter((m) => m.id !== id);
      if (activeMapId === id && rest[0]) onPick(rest[0].id);
      await onChanged();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Suppression impossible';
    }
    pendingDeleteId = null;
  }

  async function createGrid() {
    try {
      const created = await api.maps.create(campaignId, `Carte ${maps.length + 1}`);
      await onChanged();
      onPick(created.id);
      renamingId = created.id;
      renameValue = created.name;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Création impossible';
    }
  }

  function triggerImport() {
    importFileInput?.click();
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    try {
      const created = await api.maps.create(campaignId, name, file);
      await onChanged();
      onPick(created.id);
      renamingId = created.id;
      renameValue = created.name;
    } catch (e) {
      error = e instanceof Error ? e.message : "Import impossible";
    }
  }

  function onImportChange(e: Event) {
    const input = e.target as HTMLInputElement;
    void importFile(input.files?.[0]);
    input.value = '';
  }

  function triggerReplace(id: string) {
    replaceTargetId = id;
    replaceFileInput?.click();
  }

  async function onReplaceChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = replaceTargetId;
    if (file && id) {
      try {
        await api.maps.update(id, { image: file });
        await onChanged();
      } catch (err) {
        error = err instanceof Error ? err.message : "Remplacement impossible";
      }
    }
    input.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    void importFile(e.dataTransfer?.files?.[0]);
  }
</script>

<div class="map-manager" bind:this={panelEl}>
  <button class="maps-btn" class:open onclick={toggle}>
    Cartes<span class="count">{maps.length}</span>
  </button>

  {#if open}
    <div
      class="maps-panel"
      role="group"
      aria-label="Cartes de la campagne"
      class:drag={dragOver}
      ondragover={(e) => {
        e.preventDefault();
        dragOver = true;
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={onDrop}
    >
      {#if maps.length === 0}
        <div class="empty">Aucune carte — créez-en une ou déposez une image ici.</div>
      {:else}
        <div class="rows">
          {#each maps as m (m.id)}
            <div class="row" class:active={m.id === activeMapId}>
              <button class="row-main" onclick={() => pick(m.id)} title="Afficher cette carte">
                {#if m.hasImage}
                  <img class="thumb" src={api.maps.imageUrl(m.id)} alt="" draggable="false" />
                {:else}
                  <span class="thumb grid-thumb"></span>
                {/if}
                {#if renamingId === m.id}
                  <input
                    class="rename-input"
                    bind:value={renameValue}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') renamingId = null;
                    }}
                    onchange={commitRename}
                    onclick={(e) => e.stopPropagation()}
                  />
                {:else}
                  <span class="row-name">{m.name}</span>
                  {#if m.id === activeMapId}
                    <span class="on-map">à l'écran</span>
                  {/if}
                {/if}
              </button>
              {#if renamingId !== m.id}
                <span class="row-actions">
                  <button class="mini" title="Renommer" onclick={() => startRename(m)}>✎</button>
                  <button class="mini" title="Remplacer l'image" onclick={() => triggerReplace(m.id)}>↺</button>
                  <button class="mini del" class:armed={pendingDeleteId === m.id} title="Supprimer" onclick={() => armDelete(m.id)}>✕</button>
                </span>
              {/if}
              {#if pendingDeleteId === m.id}
                <span class="del-confirm">
                  Supprimer ?
                  <button class="confirm-yes" onclick={() => confirmDelete(m.id)}>Oui</button>
                  <button class="confirm-no" onclick={() => (pendingDeleteId = null)}>Annuler</button>
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if error}
        <div class="panel-error">{error}</div>
      {/if}

      <div class="panel-foot">
        <button class="foot-btn" onclick={createGrid}>+ Quadrillée</button>
        <button class="foot-btn" onclick={triggerImport}>Importer une image</button>
      </div>
      <div class="drop-hint">ou glissez-déposez une image ici</div>
    </div>
  {/if}
</div>

<input
  type="file"
  accept="image/png,image/jpeg,image/webp"
  onchange={onImportChange}
  bind:this={importFileInput}
  style="display:none"
/>
<input
  type="file"
  accept="image/png,image/jpeg,image/webp"
  onchange={onReplaceChange}
  bind:this={replaceFileInput}
  style="display:none"
/>

<style>
  .map-manager {
    position: relative;
    display: inline-flex;
  }
  .maps-btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 4px 11px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 225px 8px 220px 8px / 8px 200px 8px 255px;
    color: var(--text-2);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .maps-btn:hover,
  .maps-btn.open {
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

  .maps-panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 300px;
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
  .maps-panel.drag {
    border-color: var(--accent);
  }

  .empty {
    font-size: 12.5px;
    color: var(--text-2);
    font-style: italic;
    padding: 6px 4px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 10px 3px 12px 3px;
  }
  .row.active {
    background: var(--selected);
  }
  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    font-family: var(--font-body);
    font-size: 13px;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 5px 7px;
    cursor: pointer;
    text-align: left;
  }
  .row.active .row-main {
    color: var(--heading);
  }
  .thumb {
    width: 44px;
    height: 30px;
    flex: none;
    object-fit: cover;
    border: 1.5px solid var(--border);
    border-radius: 6px 2px 7px 3px;
    background: var(--bg);
  }
  .grid-thumb {
    background-image: linear-gradient(var(--map-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--map-line) 1px, transparent 1px);
    background-size: 8px 8px;
    background-color: var(--map-bg);
  }
  .row-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .on-map {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
    color: var(--accent-text);
    white-space: nowrap;
  }
  .rename-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-body);
    font-size: 13px;
    padding: 3px 7px;
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }

  .row-actions {
    display: flex;
    gap: 2px;
    flex: none;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .row:hover .row-actions,
  .row.active .row-actions {
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
    flex: none;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--text-2);
    padding-right: 4px;
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
  .confirm-yes:hover {
    background: var(--accent-hover);
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
  .confirm-no:hover {
    color: var(--text);
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
  .drop-hint {
    font-size: 11px;
    color: var(--text-3);
    text-align: center;
  }
</style>
