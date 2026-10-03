<script lang="ts">
  import { api, type CharacterDetail } from '$lib/api';
  import { tableStore, sendWs } from '$lib/ws.svelte';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';
  import Skeleton from '$lib/ds/Skeleton.svelte';

  let {
    charId,
    onPvDelta,
  }: {
    charId: string;
    onPvDelta: (delta: number) => void;
  } = $props();

  const store = tableStore;

  let char = $state<CharacterDetail | null>(null);
  let error = $state('');
  let loading = $state(true);

  $effect(() => {
    const id = charId;
    if (!id) return;
    let cancelled = false;
    loading = true;
    error = '';
    char = null;
    api.characters
      .detail(id)
      .then((c) => {
        if (!cancelled) char = c;
      })
      .catch((e) => {
        if (!cancelled) error = e instanceof Error ? e.message : 'Fiche inaccessible';
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const c0 = char;
    if (!c0) return;
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
</script>

{#if loading}
  <div class="sheet-loading" aria-busy="true" aria-label="Chargement de la fiche">
    <Skeleton w="100%" h={40} />
    <Skeleton w="100%" h={88} radius="var(--radius-md)" />
    <Skeleton w="100%" h={190} radius="var(--radius-md)" />
  </div>
{:else if error}
  <div class="sheet-state"><p class="error">{error}</p></div>
{:else if char}
  <CharacterSheet {char} {onRoll} {onPvDelta} embedded />
{/if}

<style>
  .sheet-loading {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sheet-state {
    flex: 1;
    display: grid;
    place-items: center;
  }
  .sheet-state p {
    color: var(--text-2);
  }
  .error {
    color: var(--accent-text);
  }
</style>
