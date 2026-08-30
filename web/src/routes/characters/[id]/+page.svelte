<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type CharacterDetail } from '$lib/api';
  import { wsClient, type TableStore } from '$lib/ws';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';
  import DiceOverlay from '$lib/components/DiceOverlay.svelte';

  let char = $state<CharacterDetail | null>(null);
  let error = $state('');
  let loading = $state(true);

  let store = $state<TableStore | null>(null);

  let { params } = $props();
  let charId = params.id;

  let unsub: (() => void) | null = null;

  onMount(async () => {
    if (!charId) {
      error = 'ID manquant';
      loading = false;
      return;
    }
    try {
      char = await api.characters.detail(charId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Erreur';
    }
    loading = false;

    // Connexion à la table : les jets de la feuille partent au serveur,
    // s'animent ici et alimentent le journal de la campagne (R10.2).
    if (char) {
      wsClient.connect(char.campaignId);
      unsub = wsClient.subscribe((s) => {
        store = { ...s };
      });
    }
  });

  onDestroy(() => {
    if (unsub) unsub();
    wsClient.disconnect();
  });

  // Sync temps réel du PV / des états (deltas WS de la table).
  $effect(() => {
    if (!store || !char) return;
    const card = store.characters.find((c) => c.id === char?.id);
    if (card) {
      if (typeof card.pv === 'number') char = { ...char, pv: card.pv };
      if (typeof card.pvMax === 'number') char = { ...char, pvMax: card.pvMax };
      char = { ...char, conditions: card.conditions };
    }
  });

  function onRoll(mod: number, label: string) {
    wsClient.send({ type: 'dice.roll', sides: 20, n: 1, mod, label });
  }

  function onPvDelta(delta: number) {
    if (!char) return;
    wsClient.send({ type: 'char.hp', charId: char.id, delta });
  }
</script>

<svelte:head>
  <title>{char?.name ?? 'Personnage'} — RollWith H&D</title>
</svelte:head>

{#if loading}
  <div class="center"><p class="muted">…</p></div>
{:else if error}
  <div class="center"><p class="error">{error}</p></div>
{:else if char}
  <CharacterSheet {char} {onRoll} {onPvDelta} />
  <DiceOverlay anim={store?.diceAnim ?? null} fixed />
{/if}

<style>
  .center { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .muted { color: var(--text-2); }
  .error { color: var(--accent-text); }
</style>
