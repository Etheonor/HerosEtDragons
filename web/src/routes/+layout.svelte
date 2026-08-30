<script lang="ts">
  import { onMount } from 'svelte';
  import '../lib/ds/tokens.css';
  import '../lib/ds/app.css';
  import { applyEncre, getEncre } from '$lib/encre';

  let { children } = $props();

  onMount(() => {
    applyEncre(getEncre());
  });
</script>

{@render children()}
