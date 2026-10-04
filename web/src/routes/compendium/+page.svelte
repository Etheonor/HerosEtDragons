<script lang="ts">
  import { page } from '$app/state';
  import CompendiumView from '$lib/components/CompendiumView.svelte';

  const campaign = page.url.searchParams.get('campaign') ?? '';
  const cat = page.url.searchParams.get('cat');
  const slug = page.url.searchParams.get('slug');
  const deep = cat && slug ? { category: cat, slug } : null;
</script>

<svelte:head>
  <title>Compendium — RollWith H&amp;D</title>
</svelte:head>

<CompendiumView {campaign} {deep} />
