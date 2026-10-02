/**
 * Asset manager (lot 5.4) : overlay à trois onglets — Cartes, PNJ, Personnages.
 *
 * - grille de vignettes + recherche texte simple ;
 * - **double-clic = poser** (carte : l'afficher ; PNJ : armer la pose ×N ;
 *   personnage : le poser sur la carte active) ;
 * - badge `− ×N +` sur les modèles PNJ ;
 * - **clic droit délégué au menu unique de la page** : ce composant ne rend
 *   jamais de menu, il décrit la cible.
 *
 * Les `MapManager` / `NpcLibrary` restent dans la barre d'outils en secours
 * le temps de valider cette surface.
 */
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import CloseButton from '$lib/ds/CloseButton.svelte';
  import { ICONS } from '$lib/ds/icons';
  import { api, type MapSummary, type NpcTemplate } from '$lib/api';
  import type { CharacterCard } from '@rollwith/shared/protocol';
  import { portraitUrl } from '$lib/portraits';
  import type { AssetTarget } from './context-menu';

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    campaignId: string;
    maps: MapSummary[];
    activeMapId: string | null;
    characters: CharacterCard[];
    isMj: boolean;
    /** Incrémenté par la page après suppression d'un modèle → rechargement. */
    templatesRevision: number;
    onPickMap: (id: string) => void;
    onPlaceTemplate: (tpl: NpcTemplate, count: number) => void;
    onPlaceChar: (charId: string) => void;
    onContextMenu: (e: MouseEvent, target: AssetTarget) => void;
  }

  const {
    open,
    onOpenChange,
    campaignId,
    maps,
    activeMapId,
    characters,
    isMj,
    templatesRevision,
    onPickMap,
    onPlaceTemplate,
    onPlaceChar,
    onContextMenu,
  }: Props = $props();

  type Tab = 'maps' | 'npcs' | 'chars';

  let tab = $state<Tab>('maps');
  let search = $state('');
  let templates = $state<NpcTemplate[]>([]);
  let counts = $state<Record<string, number>>({});

  $effect(() => {
    if (!open || !isMj) return;
    // `templatesRevision` dans les dépendances : une suppression recharge.
    void templatesRevision;
    void loadTemplates();
  });

  async function loadTemplates() {
    try {
      const res = await api.npcTemplates.list(campaignId);
      templates = res.templates;
    } catch {
      /* la bibliothèque reste vide ; l'onglet Cartes fonctionne */
    }
  }

  function countOf(id: string): number {
    return counts[id] ?? 1;
  }

  function bump(id: string, delta: number) {
    const next = Math.max(1, Math.min(20, countOf(id) + delta));
    counts = { ...counts, [id]: next };
  }

  function matches(name: string): boolean {
    const q = search.trim().toLowerCase();
    return q === '' || name.toLowerCase().includes(q);
  }

  const filteredMaps = $derived(maps.filter((m) => matches(m.name)));
  const filteredTemplates = $derived(templates.filter((t) => matches(t.name)));
  const filteredChars = $derived(characters.filter((c) => matches(c.name)));

  function placeChar(charId: string) {
    onPlaceChar(charId);
    onOpenChange(false);
  }

  const filteredCount = $derived(
    tab === 'maps'
      ? filteredMaps.length
      : tab === 'npcs'
        ? filteredTemplates.length
        : filteredChars.length,
  );
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="asset-scrim" />
    <Dialog.Content
      {...surfaceProps('overlay', 'asset-manager')}
      aria-label="Bibliothèque de la campagne"
    >
      <div class="asset-head">
        <span class="asset-title">Bibliothèque</span>
        <input
          class="asset-search"
          type="search"
          placeholder="Rechercher…"
          bind:value={search}
          aria-label="Rechercher dans la bibliothèque"
        />
        <CloseButton label="Fermer la bibliothèque" onclick={() => onOpenChange(false)} />
      </div>

      <div class="asset-tabs" role="tablist" aria-label="Catégories">
        <button
          class="asset-tab"
          class:active={tab === 'maps'}
          role="tab"
          aria-selected={tab === 'maps'}
          onclick={() => (tab = 'maps')}>Cartes <span class="asset-count">{maps.length}</span></button
        >
        <button
          class="asset-tab"
          class:active={tab === 'npcs'}
          role="tab"
          aria-selected={tab === 'npcs'}
          onclick={() => (tab = 'npcs')}
          disabled={!isMj}>PNJ <span class="asset-count">{templates.length}</span></button
        >
        <button
          class="asset-tab"
          class:active={tab === 'chars'}
          role="tab"
          aria-selected={tab === 'chars'}
          onclick={() => (tab = 'chars')}
          >Personnages <span class="asset-count">{characters.length}</span></button
        >
      </div>

      <div class="asset-body scroll-area">
        {#if tab === 'maps'}
          {#if filteredMaps.length === 0}
            <p class="asset-empty">Aucune carte.</p>
          {:else}
            <div class="asset-grid">
              {#each filteredMaps as m (m.id)}
                <div
                  class="asset-card"
                  class:on-map={m.id === activeMapId}
                  role="button"
                  tabindex="0"
                  title="Double-clic : afficher cette carte"
                  ondblclick={() => {
                    onPickMap(m.id);
                    onOpenChange(false);
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      onPickMap(m.id);
                      onOpenChange(false);
                    }
                  }}
                  oncontextmenu={(e) => onContextMenu(e, { kind: 'asset-map', mapId: m.id })}
                >
                  <span class="asset-thumb">
                    {#if m.hasImage}
                      <img src={api.maps.imageUrl(m.id)} alt="" draggable="false" />
                    {:else}
                      <span class="asset-grid-thumb"></span>
                    {/if}
                  </span>
                  <span class="asset-name">{m.name}</span>
                  {#if m.id === activeMapId}<span class="asset-badge">à l'écran</span>{/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else if tab === 'npcs'}
          {#if filteredTemplates.length === 0}
            <p class="asset-empty">Aucun modèle — « Enregistrer comme modèle » dans la Compagnie.</p>
          {:else}
            <div class="asset-grid">
              {#each filteredTemplates as t (t.id)}
                <div
                  class="asset-card"
                  role="button"
                  tabindex="0"
                  title="Double-clic : armer la pose de {countOf(t.id)} × {t.name}"
                  ondblclick={() => {
                    onPlaceTemplate(t, countOf(t.id));
                    onOpenChange(false);
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      onPlaceTemplate(t, countOf(t.id));
                      onOpenChange(false);
                    }
                  }}
                  oncontextmenu={(e) =>
                    onContextMenu(e, {
                      kind: 'asset-template',
                      templateId: t.id,
                      name: t.name,
                      count: countOf(t.id),
                    })}
                >
                  <span class="asset-thumb">
                    <span
                      class="asset-initial"
                      style="--token-color: {t.color};">{t.name.slice(0, 1).toUpperCase()}</span
                    >
                  </span>
                  <span class="asset-name">{t.name}</span>
                  <span class="asset-stats">CA {t.ca} · PV {t.pvMax}</span>
                  <span class="asset-qty" aria-label="Quantité à poser">
                    <button
                      type="button"
                      aria-label="Moins"
                      onclick={(e) => {
                        e.stopPropagation();
                        bump(t.id, -1);
                      }}>−</button
                    >
                    <span class="asset-qty-n">×{countOf(t.id)}</span>
                    <button
                      type="button"
                      aria-label="Plus"
                      onclick={(e) => {
                        e.stopPropagation();
                        bump(t.id, 1);
                      }}>+</button
                    >
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        {:else if filteredChars.length === 0}
          <p class="asset-empty">Aucun personnage.</p>
        {:else}
          <div class="asset-grid">
            {#each filteredChars as c (c.id)}
              <div
                class="asset-card"
                role="button"
                tabindex="0"
                title={isMj ? 'Double-clic : poser sur la carte' : c.name}
                ondblclick={() => {
                  if (isMj) placeChar(c.id);
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter' && isMj) placeChar(c.id);
                }}
                oncontextmenu={(e) => onContextMenu(e, { kind: 'asset-char', charId: c.id })}
              >
                <span class="asset-thumb">
                  {#if portraitUrl(c.portrait)}
                    <img src={portraitUrl(c.portrait)} alt="" draggable="false" />
                  {:else}
                    <span class="asset-initial" style="--token-color: {c.color};">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                  {/if}
                </span>
                <span class="asset-name">{c.name}</span>
                <span class="asset-stats">
                  {c.kind === 'pj' ? 'PJ' : 'PNJ'} · CA {c.ca}
                  {#if c.pv !== null && c.pvMax !== null}· PV {c.pv}/{c.pvMax}{/if}
                </span>
                {#if c.sub}<span class="asset-sub">{c.sub}</span>{/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="asset-foot">
        <ICONS.library size={13} strokeWidth={2} aria-hidden="true" />
        Double-clic : poser · clic droit : actions · {filteredCount}
        {search.trim() ? `résultat(s) pour « ${search.trim()} »` : 'éléments'}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.asset-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.asset-manager) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(1120px, 94vw);
    height: min(720px, 86vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .asset-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 8px 8px 16px;
    border-bottom: 2px solid var(--border);
    flex: none;
  }
  .asset-title {
    font-family: var(--font-title);
    font-size: 18px;
    color: var(--heading);
    flex: none;
  }
  .asset-search {
    font-family: var(--font-body);
    font-size: 13.5px;
    padding: 6px 10px;
    flex: 1;
    max-width: 320px;
    margin-left: auto;
    background: var(--bg);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text);
    outline: none;
  }
  .asset-search:focus { border-color: var(--accent-border); }
  .asset-tabs {
    display: flex;
    border-bottom: 1.5px solid var(--border-soft);
    flex: none;
  }
  .asset-tab {
    font-family: var(--font-body);
    font-size: 13.5px;
    font-weight: 700;
    padding: 8px 18px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--text-2);
    cursor: pointer;
  }
  .asset-tab:hover:not(:disabled) { color: var(--heading); }
  .asset-tab.active { color: var(--heading); border-bottom-color: var(--accent); }
  .asset-tab:disabled { opacity: 0.4; cursor: default; }
  .asset-count {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--accent-text);
    background: var(--bg);
    border-radius: var(--radius-full);
    padding: 1px 7px;
    margin-left: 4px;
  }
  .asset-body { flex: 1; overflow-y: auto; padding: 14px 16px; }
  .asset-empty { color: var(--text-3); font-style: italic; font-size: 13px; margin: 8px 0; }
  .asset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 12px;
  }
  .asset-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 10px 8px 8px;
    background: var(--panel);
    border: 1.5px solid var(--border-soft);
    border-radius: var(--radius-md);
    cursor: pointer;
    user-select: none;
  }
  .asset-card:hover { background: var(--surface-raised-hover); border-color: var(--border); }
  .asset-card.on-map { border-color: var(--accent-border); }
  .asset-thumb {
    width: 84px;
    height: 84px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--map-bg);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .asset-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .asset-grid-thumb {
    width: 100%;
    height: 100%;
    background-image:
      linear-gradient(var(--map-grid-line, var(--map-line)) 1px, transparent 1px),
      linear-gradient(90deg, var(--map-grid-line, var(--map-line)) 1px, transparent 1px);
    background-size: 12px 12px;
    background-color: var(--map-bg);
  }
  .asset-initial {
    width: 62px;
    height: 62px;
    display: grid;
    place-items: center;
    font-family: var(--font-title);
    font-size: 30px;
    color: var(--map-token-fg);
    background: var(--map-token-bg);
    border: 3px solid var(--token-color, var(--accent));
    border-radius: 50%;
  }
  .asset-name {
    font-family: var(--font-title);
    font-size: 13.5px;
    color: var(--heading);
    text-align: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-stats { font-size: 11px; color: var(--text-2); }
  .asset-sub { font-size: 10.5px; color: var(--text-3); font-style: italic; }
  .asset-badge {
    position: absolute;
    top: 6px;
    left: 6px;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--accent-fg);
    background: var(--accent);
    border-radius: var(--radius-full);
    padding: 1px 7px;
  }
  .asset-qty {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
  }
  .asset-qty button {
    width: 18px;
    height: 18px;
    padding: 0;
    font-size: 12px;
    line-height: 1;
    background: transparent;
    border: 1.5px solid var(--border);
    border-radius: 5px;
    color: var(--text-2);
    cursor: pointer;
  }
  .asset-qty button:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .asset-qty-n { font-size: 12px; font-weight: 700; color: var(--text); min-width: 22px; text-align: center; }
  .asset-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-top: 1.5px solid var(--border-soft);
    font-size: 11.5px;
    color: var(--text-3);
    flex: none;
  }
</style>
