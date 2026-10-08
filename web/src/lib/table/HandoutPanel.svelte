<script lang="ts">
  /**
   * Fenêtre « Illustration » : le MJ affiche une image de la bibliothèque à
   * toute la table (une seule à la fois). Le MJ voit la fenêtre même masquée
   * (bandeau d'état) et bascule la visibilité ; les joueurs ne la voient que
   * quand elle est affichée (le serveur ne leur envoie l'id qu'à ce moment).
   */
  import Panel from './Panel.svelte';
  import { ICONS } from '$lib/ds/icons';
  import { api } from '$lib/api';
  import { sendWs, tableStore } from '$lib/ws.svelte';

  interface Props {
    campaignId: string;
    isMj: boolean;
    onClose: () => void;
    /** Ouvre la bibliothèque sur l'onglet Images (le MJ choisit/importe). */
    onPick: () => void;
  }

  const { campaignId, isMj, onClose, onPick }: Props = $props();

  const handout = $derived(tableStore.state.handout);
  const imgUrl = $derived(handout.imageId ? api.images.fileUrl(handout.imageId) : null);

  function toggleVisible() {
    sendWs({ type: 'handout.set', imageId: handout.imageId, visible: !handout.visible });
  }
</script>

<Panel
  id="handout"
  title="Illustration"
  {campaignId}
  {onClose}
  icon={ICONS.image}
  closeLabel="Fermer l'illustration"
  initial={{ x: Math.max(12, innerWidth / 2 - 280), y: 96, w: 560, h: 420 }}
  minW={320}
  minH={220}
  class="handout-panel"
>
  {#if isMj}
    <div class="hp-bar">
      <span class="hp-status" class:hp-hidden={!handout.visible}>
        {handout.visible ? 'Visible par les joueurs' : 'Masquée aux joueurs'}
      </span>
      <span class="hp-grow"></span>
      <button type="button" class="hp-btn" onclick={onPick}>Changer…</button>
      <button
        type="button"
        class="hp-btn hp-toggle"
        class:on={handout.visible}
        disabled={!handout.imageId}
        onclick={toggleVisible}
      >
        {handout.visible ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  {/if}

  {#if imgUrl}
    <img class="hp-img" src={imgUrl} alt="Illustration de la partie" draggable="false" />
  {:else}
    <div class="hp-empty">
      <p>Aucune illustration chargée.</p>
      {#if isMj}
        <button type="button" class="hp-btn" onclick={onPick}>Choisir une image…</button>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  .hp-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-soft);
    flex: none;
  }
  .hp-status {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent-text);
  }
  .hp-status.hp-hidden {
    color: var(--text-3);
  }
  .hp-grow {
    flex: 1;
  }
  .hp-btn {
    font: inherit;
    font-size: 13px;
    padding: 5px 10px;
    color: var(--text-2);
    background: var(--panel);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .hp-btn:hover:not(:disabled) {
    color: var(--heading);
    border-color: var(--border-strong);
  }
  .hp-btn.on {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .hp-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .hp-img {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: contain;
    background: var(--sunken);
  }
  .hp-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-3);
    font-style: italic;
  }
</style>
