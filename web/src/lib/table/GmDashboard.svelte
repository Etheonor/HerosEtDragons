<script lang="ts">
  /**
   * Tableau de bord MJ (lot 5.5) : ce que le MJ doit avoir sous les yeux pendant
   * une scène — les PNJ présents sur la carte active (PV, CA, états, accès à la
   * fiche) et les notes épinglées de la carte.
   *
   * Rendu dans un panneau flottant par la page ; MJ uniquement. Les notes vivent
   * en REST (`api.notes`, targetType « map ») et sont enregistrées à la demande.
   */
  import { api, type MapSummary } from '$lib/api';
  import type { CharacterCard } from '@rollwith/shared/protocol';
  import { portraitUrl } from '$lib/portraits';

  interface Props {
    campaignId: string;
    characters: CharacterCard[];
    tokenCharIds: string[];
    activeMap: MapSummary | null;
    onFocus: (charId: string) => void;
  }

  const { campaignId, characters, tokenCharIds, activeMap, onFocus }: Props = $props();

  const sceneNpcs = $derived(
    characters.filter((c) => c.kind === 'pnj' && tokenCharIds.includes(c.id)),
  );

  let noteDraft = $state('');
  let noteSaved = $state(true);
  let noteLoadedFor = $state<string | null>(null);

  $effect(() => {
    const mapId = activeMap?.id ?? null;
    if (!mapId || mapId === noteLoadedFor) return;
    noteLoadedFor = mapId;
    noteDraft = '';
    noteSaved = true;
    void loadNote(mapId);
  });

  async function loadNote(mapId: string) {
    try {
      const res = await api.notes.list(campaignId);
      const note = res.notes.find((n) => n.targetType === 'map' && n.targetId === mapId);
      if (noteLoadedFor !== mapId) return;
      noteDraft = note?.content ?? '';
      noteSaved = true;
    } catch {
      /* la note reste vide ; le reste du dashboard fonctionne */
    }
  }

  async function saveNote() {
    const mapId = activeMap?.id;
    if (!mapId) return;
    try {
      await api.notes.set(campaignId, 'map', mapId, noteDraft.trim());
      noteSaved = true;
    } catch {
      /* le bouton reste actif : le MJ peut réessayer */
    }
  }

  function hpPct(c: CharacterCard): number | null {
    if (c.pv === null || c.pvMax === null || c.pvMax <= 0) return null;
    return Math.max(0, Math.min(100, (c.pv / c.pvMax) * 100));
  }
</script>

<div class="dash">
  <section class="dash-section">
    <h3 class="dash-title">PNJ de la scène <span class="dash-count">{sceneNpcs.length}</span></h3>
    {#if sceneNpcs.length === 0}
      <p class="dash-empty">Aucun PNJ sur la carte active.</p>
    {:else}
      {#each sceneNpcs as c (c.id)}
        {@const pct = hpPct(c)}
        <div class="dash-row">
          <button
            class="dash-main"
            type="button"
            title="Recentrer la carte sur ce pion"
            onclick={() => onFocus(c.id)}
          >
            {#if portraitUrl(c.portrait)}
              <img class="dash-portrait" src={portraitUrl(c.portrait)} alt="" draggable="false" />
            {:else}
              <span class="dash-initial" style="--token-color: {c.color};">
                {c.name.slice(0, 1).toUpperCase()}
              </span>
            {/if}
            <span class="dash-body">
              <span class="dash-name">{c.name}</span>
              {#if pct !== null}
                <span class="dash-hp">
                  <span
                    class="dash-hp-fill {pct >= 70 ? 'ok' : pct >= 30 ? 'mid' : 'low'}"
                    style="width: {pct}%;"
                  ></span>
                </span>
              {/if}
            </span>
            <span class="dash-stats">
              <span>CA {c.ca}</span>
              {#if c.pv !== null && c.pvMax !== null}<span>PV {c.pv}/{c.pvMax}</span>{/if}
            </span>
          </button>
          <a class="dash-sheet" href={`/characters/${c.id}`} title="Ouvrir la fiche">fiche</a>
        </div>
        {#if c.conditions.length > 0}
          <div class="dash-conds">
            {#each c.conditions as cond (cond)}<span class="dash-cond">{cond}</span>{/each}
          </div>
        {/if}
      {/each}
    {/if}
  </section>

  <section class="dash-section dash-notes">
    <h3 class="dash-title">
      Notes de la carte
      {#if activeMap}<span class="dash-map-name">{activeMap.name}</span>{/if}
    </h3>
    {#if !activeMap}
      <p class="dash-empty">Aucune carte sélectionnée.</p>
    {:else}
      <textarea
        class="dash-note"
        bind:value={noteDraft}
        placeholder="Préparation, rappels, description du lieu…"
        aria-label="Notes de la carte"
        oninput={() => (noteSaved = false)}
      ></textarea>
      <div class="dash-note-actions">
        <span class="dash-note-state">{noteSaved ? 'à jour' : 'modifié'}</span>
        <button class="dash-save" type="button" disabled={noteSaved} onclick={saveNote}>
          Enregistrer
        </button>
      </div>
    {/if}
  </section>
</div>

<style>
  .dash {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .dash-section {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }
  .dash-notes {
    flex: 1;
    border-top: 2px solid var(--border);
    overflow: hidden;
  }
  .dash-title {
    margin: 0;
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-3);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dash-count {
    font-size: 10.5px;
    color: var(--accent-text);
    background: var(--bg);
    border-radius: var(--radius-full);
    padding: 0 6px;
  }
  .dash-map-name {
    text-transform: none;
    letter-spacing: 0;
    font-family: var(--font-title);
    font-size: 12.5px;
    color: var(--text-2);
  }
  .dash-empty { margin: 0; font-size: 12px; color: var(--text-2); font-style: italic; }
  .dash-row { display: flex; align-items: stretch; gap: 4px; }
  .dash-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 7px;
    background: var(--panel);
    border: 1.5px solid var(--border-soft);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
  }
  .dash-main:hover { background: var(--surface-raised-hover); border-color: var(--border); }
  .dash-portrait {
    width: 28px; height: 28px; flex: none; object-fit: cover;
    border-radius: 50%; border: 2px solid var(--border); background: var(--bg);
  }
  .dash-initial {
    width: 28px; height: 28px; flex: none;
    display: grid; place-items: center;
    font-family: var(--font-title); font-size: 14px;
    color: var(--map-token-fg); background: var(--map-token-bg);
    border: 2px solid var(--token-color, var(--accent)); border-radius: 50%;
  }
  .dash-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .dash-name {
    font-family: var(--font-title); font-size: 13px; color: var(--heading);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .dash-hp {
    display: block; height: 5px; border-radius: 3px;
    background: #2b2822; border: 1px solid #3a352d; overflow: hidden;
  }
  .dash-hp-fill { display: block; height: 100%; background: var(--hp-ok); }
  .dash-hp-fill.mid { background: var(--hp-mid); }
  .dash-hp-fill.low { background: var(--hp-low); }
  .dash-stats {
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
    font-size: 11px; color: var(--text-2); white-space: nowrap;
  }
  .dash-sheet {
    display: grid; place-items: center;
    padding: 0 7px;
    font-size: 11px; font-weight: 600; color: var(--accent-text);
    background: transparent; border: 1.5px dashed var(--border);
    border-radius: var(--radius-sm); text-decoration: none;
  }
  .dash-sheet:hover { border-style: solid; border-color: var(--accent-border); }
  .dash-conds { display: flex; flex-wrap: wrap; gap: 4px; margin: -2px 0 2px 34px; }
  .dash-cond {
    font-size: 11px; font-weight: 500; padding: 0 7px;
    border: 1.5px solid var(--accent-border); border-radius: var(--radius-full);
    color: var(--accent-text);
  }
  .dash-note {
    flex: 1;
    min-height: 120px;
    resize: none;
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.45;
    padding: 8px 9px;
    color: var(--text);
    background: var(--sunken);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    outline: none;
  }
  .dash-note:focus { border-color: var(--accent-border); }
  .dash-note-actions {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .dash-note-state { font-size: 11.5px; color: var(--text-3); font-style: italic; }
  .dash-save {
    font-family: var(--font-body); font-size: 12px; font-weight: 600;
    padding: 4px 12px;
    color: var(--accent-fg); background: var(--accent);
    border: 2px solid var(--accent-border); border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .dash-save:hover:not(:disabled) { background: var(--accent-hover); }
  .dash-save:disabled { opacity: 0.45; cursor: default; }
</style>
