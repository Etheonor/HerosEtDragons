<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type CharacterDetail } from '$lib/api';
  import { tableStore, connectWs, disconnectWs, sendWs, type TableStore } from '$lib/ws.svelte';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';
  import DiceOverlay from '$lib/components/DiceOverlay.svelte';
  import Skeleton from '$lib/ds/Skeleton.svelte';

  let char = $state<CharacterDetail | null>(null);
  let error = $state('');
  let loading = $state(true);

  let store = $state<TableStore>(tableStore);

  let { params } = $props();
  let charId = params.id;


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
      connectWs(char.campaignId);
    }
  });

  onDestroy(() => {
    disconnectWs();
  });

  // Sync temps réel du PV / des états (deltas WS de la table).
  // Ne recréer `char` qu'en cas de VRAI changement de valeur : réassigner un
  // nouvel objet à chaque notification du store re-déclenche cet effet
  // (effect_update_depth_exceeded).
  $effect(() => {
    const c0 = char;
    if (!store || !c0) return;
    const card = store.characters.find((c) => c.id === c0.id);
    if (!card) return;
    const pv = typeof card.pv === 'number' ? card.pv : c0.pv;
    const pvMax = typeof card.pvMax === 'number' ? card.pvMax : c0.pvMax;
    const condChanged = card.conditions !== c0.conditions;
    if (pv !== c0.pv || pvMax !== c0.pvMax || condChanged) {
      char = { ...c0, pv, pvMax, conditions: card.conditions };
    }
  });

  function onRoll(mod: number, label: string) {
    sendWs({ type: 'dice.roll', sides: 20, n: 1, mod, label });
  }

  function onPvDelta(delta: number) {
    if (!char) return;
    sendWs({ type: 'char.hp', charId: char.id, delta });
  }
</script>

<svelte:head>
  <title>{char?.name ?? 'Personnage'} — RollWith H&D</title>
</svelte:head>

{#if loading}
  <div class="sheet-skeleton" aria-busy="true" aria-label="Chargement de la fiche">
    <Skeleton w="100%" h={46} />
    <Skeleton w="100%" h={110} radius="var(--radius-md)" />
    <div class="sk-cols">
      <Skeleton h={260} radius="var(--radius-md)" />
      <Skeleton h={260} radius="var(--radius-md)" />
      <Skeleton h={260} radius="var(--radius-md)" />
      <Skeleton h={260} radius="var(--radius-md)" />
    </div>
  </div>
{:else if error}
  <div class="center"><p class="error">{error}</p></div>
{:else if char}
  <CharacterSheet {char} {onRoll} {onPvDelta} />
  <DiceOverlay anim={store?.diceAnim ?? null} />
{/if}

<style>
  .center { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .error { color: var(--accent-text); }
  .sheet-skeleton {
    min-height: 100vh;
    max-width: 1290px;
    margin: 0 auto;
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .sk-cols {
    display: grid;
    grid-template-columns: 178px 242px 1fr 1fr;
    gap: 14px;
  }
</style>
