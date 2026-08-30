<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type CharacterDetail } from '$lib/api';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';

  let char = $state<CharacterDetail | null>(null);
  let error = $state('');
  let loading = $state(true);

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
  });
</script>

<svelte:head>
  <title>{char?.name ?? 'Personnage'} — RollWith H&D</title>
</svelte:head>

{#if loading}
  <div class="center"><p class="muted">…</p></div>
{:else if error}
  <div class="center"><p class="error">{error}</p></div>
{:else if char}
  <CharacterSheet {char} />
{/if}

<style>
  .center { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .muted { color: var(--text-2); }
  .error { color: var(--accent-text); }
</style>