<script lang="ts">
  /**
   * Asset manager (lot 5.4) : overlay à trois onglets — Cartes, PNJ, Personnages.
   *
   * Filtrage strict : l'onglet **Personnages** ne contient que les PJ ; l'onglet
   * **PNJ** contient les PNJ de la campagne **et** les modèles réutilisables
   * (deux sections).
   *
   * - grille de vignettes + recherche texte simple ;
   * - **double-clic = poser** (carte : l'afficher ; modèle PNJ : armer la pose
   *   ×N ; personnage : le poser sur la carte active, ou le recentrer s'il y
   *   est déjà) ;
   * - badge `− ×N +` sur les modèles, badge « sur la carte » sur les personnages
   *   présents sur la carte active ;
   * - **clic droit délégué au menu unique de la page** : ce composant ne rend
   *   jamais de menu, il décrit la cible.
   *
   * Les `MapManager` / `NpcLibrary` restent dans la barre d'outils en secours
   * le temps de valider cette surface.
   */
  import { Dialog } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import CloseButton from '$lib/ds/CloseButton.svelte';
  import { ICONS } from '$lib/ds/icons';
  import { api, type MapSummary, type NpcTemplate } from '$lib/api';
  import type { CharacterCard, MapLink } from '@rollwith/shared/protocol';
  import { portraitUrl } from '$lib/portraits';
  import type { AssetTarget } from './context-menu';

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    campaignId: string;
    maps: MapSummary[];
    activeMapId: string | null;
    characters: CharacterCard[];
    /** Liens de la carte active + lien retour éventuel. */
    links: MapLink[];
    returnLink: MapLink | null;
    /** Ids des personnages ayant un pion sur la carte active. */
    tokenCharIds: string[];
    isMj: boolean;
  /** Incrémenté par la page après suppression d'un modèle → rechargement. */
  templatesRevision: number;
    onPickMap: (id: string) => void;
    /** Ouvre le sélecteur d'image pour créer une carte (la page s'en charge). */
    onNewMap: () => void;
    onPlaceTemplate: (tpl: NpcTemplate, count: number) => void;
    onPlaceChar: (charId: string) => void;
    onTravelLink: (id: string) => void;
    onRemoveLink: (id: string) => void;
    onContextMenu: (e: MouseEvent, target: AssetTarget) => void;
  }

  const {
    open,
    onOpenChange,
    campaignId,
    maps,
    activeMapId,
    characters,
    links,
    returnLink,
    tokenCharIds,
    isMj,
    templatesRevision,
    onPickMap,
    onNewMap,
    onPlaceTemplate,
    onPlaceChar,
    onTravelLink,
    onRemoveLink,
    onContextMenu,
  }: Props = $props();

  type Tab = 'maps' | 'npcs' | 'chars' | 'links';

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

  const pjChars = $derived(characters.filter((c) => c.kind === 'pj'));
  const pnjChars = $derived(characters.filter((c) => c.kind === 'pnj'));
  const allLinks = $derived(returnLink ? [...links, returnLink] : links);

  function mapName(id: string): string {
    return maps.find((m) => m.id === id)?.name ?? 'carte supprimée';
  }

  const filteredMaps = $derived(maps.filter((m) => matches(m.name)));
  const filteredTemplates = $derived(templates.filter((t) => matches(t.name)));
  const filteredPj = $derived(pjChars.filter((c) => matches(c.name)));
  const filteredPnj = $derived(pnjChars.filter((c) => matches(c.name)));

  function placeChar(charId: string) {
    onPlaceChar(charId);
    onOpenChange(false);
  }

  function armTemplate(t: NpcTemplate) {
    onPlaceTemplate(t, countOf(t.id));
    onOpenChange(false);
  }

  const pnjCount = $derived(templates.length + pnjChars.length);
  const filteredCount = $derived(
    tab === 'maps'
      ? filteredMaps.length
      : tab === 'npcs'
        ? filteredTemplates.length + filteredPnj.length
        : tab === 'chars'
          ? filteredPj.length
          : allLinks.length,
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
          disabled={!isMj}>PNJ <span class="asset-count">{pnjCount}</span></button
        >
        <button
          class="asset-tab"
          class:active={tab === 'chars'}
          role="tab"
          aria-selected={tab === 'chars'}
          onclick={() => (tab = 'chars')}
          >Personnages <span class="asset-count">{pjChars.length}</span></button
        >
        <button
          class="asset-tab"
          class:active={tab === 'links'}
          role="tab"
          aria-selected={tab === 'links'}
          onclick={() => (tab = 'links')}>Liens <span class="asset-count">{allLinks.length}</span></button
        >
      </div>

      <div class="asset-body scroll-area">
        {#snippet templateCard(t: NpcTemplate)}
          <div
            class="asset-card"
            data-kind="template"
            role="button"
            tabindex="0"
            title="Double-clic : armer la pose de {countOf(t.id)} × {t.name}"
            ondblclick={() => armTemplate(t)}
            onkeydown={(e) => {
              if (e.key === 'Enter') armTemplate(t);
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
              <span class="asset-initial" style="--token-color: {t.color};">
                {t.name.slice(0, 1).toUpperCase()}
              </span>
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
        {/snippet}

        {#snippet charCard(c: CharacterCard)}
          <div
            class="asset-card"
            data-kind={c.kind}
            class:on-map={tokenCharIds.includes(c.id)}
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
            {#if tokenCharIds.includes(c.id)}<span class="asset-badge">sur la carte</span>{/if}
          </div>
        {/snippet}

        {#if tab === 'maps'}
          {#if filteredMaps.length === 0 && search.trim() !== ''}
            <p class="asset-empty">Aucune carte pour cette recherche.</p>
          {:else}
            <div class="asset-grid">
              {#each filteredMaps as m (m.id)}
                <div
                  class="asset-card"
                  data-kind="map"
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

              <button
                class="asset-card asset-new"
                type="button"
                title="Importer une image de carte"
                onclick={onNewMap}
              >
                <span class="asset-thumb asset-new-thumb">＋</span>
                <span class="asset-name">Nouvelle carte…</span>
              </button>
            </div>
          {/if}
        {:else if tab === 'npcs'}
          {#if filteredTemplates.length === 0 && filteredPnj.length === 0}
            <p class="asset-empty">
              Aucun PNJ — créez-en sur la carte, ou « Enregistrer comme modèle » dans la Compagnie.
            </p>
          {:else}
            {#if filteredTemplates.length > 0}
              <h4 class="asset-section">
                Modèles réutilisables <span class="asset-count">{templates.length}</span>
              </h4>
              <div class="asset-grid">
                {#each filteredTemplates as t (t.id)}
                  {@render templateCard(t)}
                {/each}
              </div>
            {/if}
            {#if filteredPnj.length > 0}
              <h4 class="asset-section">
                PNJ de la campagne <span class="asset-count">{pnjChars.length}</span>
              </h4>
              <div class="asset-grid">
                {#each filteredPnj as c (c.id)}
                  {@render charCard(c)}
                {/each}
              </div>
            {/if}
          {/if}
        {:else if tab === 'chars'}
          {#if filteredPj.length === 0}
            <p class="asset-empty">Aucun personnage joueur.</p>
          {:else}
            <div class="asset-grid">
              {#each filteredPj as c (c.id)}
                {@render charCard(c)}
              {/each}
            </div>
          {/if}
        {:else if allLinks.length === 0}
          <p class="asset-empty">
            Aucun lien sur cette carte — clic droit sur la carte : « Poser un lien ici… ».
          </p>
        {:else}
          <div class="link-list">
            {#each allLinks as l (l.id)}
              <div class="link-row" class:return-link={l.id.startsWith('return:')}>
                <span class="link-kind" aria-hidden="true">→</span>
                <span class="link-body">
                  <span class="link-label">{l.label}</span>
                  <span class="link-target">
                    vers {mapName(l.targetMapId)}{l.oneWay ? ' · sens unique' : ''}
                  </span>
                </span>
                <button class="link-go" type="button" onclick={() => onTravelLink(l.id)}>aller</button
                >
                {#if isMj && !l.id.startsWith('return:')}
                  <button
                    class="link-del"
                    type="button"
                    aria-label="Supprimer le lien"
                    title="Supprimer le lien"
                    onclick={() => onRemoveLink(l.id)}>✕</button
                  >
                {/if}
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
  .asset-section {
    margin: 4px 0 10px;
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
  .asset-section + .asset-grid { margin-bottom: 18px; }
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
  .asset-new {
    justify-content: center;
    background: transparent;
    border-style: dashed;
    color: var(--text-2);
  }
  .asset-new:hover { color: var(--heading); }
  .asset-new-thumb {
    font-size: 30px;
    color: var(--text-3);
    background: transparent;
    border-style: dashed;
  }
  .asset-new:hover .asset-new-thumb { color: var(--accent-text); border-color: var(--accent-border); }
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
  .link-list { display: flex; flex-direction: column; gap: 5px; }
  .link-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    background: var(--panel);
    border: 1.5px solid var(--border-soft);
    border-radius: var(--radius-sm);
  }
  .link-row:hover { border-color: var(--border); }
  .link-row.return-link { border-style: dashed; opacity: 0.9; }
  .link-kind {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    font-size: 13px;
    color: var(--accent-fg);
    background: var(--accent);
    border-radius: var(--radius-full);
  }
  .link-row.return-link .link-kind {
    color: var(--heading);
    background: var(--panel);
    border: 1.5px solid var(--border);
  }
  .link-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .link-label {
    font-family: var(--font-title);
    font-size: 13.5px;
    color: var(--heading);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link-target { font-size: 11px; color: var(--text-2); }
  .link-go {
    font-family: var(--font-body);
    font-size: 11.5px;
    font-weight: 600;
    padding: 3px 10px;
    color: var(--text-2);
    background: transparent;
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .link-go:hover { color: var(--heading); background: var(--selected); }
  .link-del {
    width: 22px;
    height: 22px;
    padding: 0;
    font-size: 11px;
    color: var(--text-2);
    background: transparent;
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .link-del:hover { color: var(--accent-fg); background: var(--accent); border-color: var(--accent-border); }
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
