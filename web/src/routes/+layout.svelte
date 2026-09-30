<script lang="ts">
  import { onMount } from 'svelte';
  import { BitsConfig } from 'bits-ui';
  import '../lib/ds/tokens.css';
  import '../lib/ds/surfaces.css';
  import '../lib/ds/app.css';
  import { applyEncre, getEncre } from '$lib/encre';

  let { children } = $props();

  onMount(() => {
    applyEncre(getEncre());
  });
</script>

<!-- Un seul point de config : tout contenu portalé sort de l'arbre transformé
     de la carte et vit dans le top layer (cf. docs/atlas-benchmark/05 §1). -->
<BitsConfig defaultPortalTo="body" />

{@render children()}
