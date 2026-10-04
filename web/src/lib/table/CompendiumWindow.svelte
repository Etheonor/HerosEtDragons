<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import CompendiumView from '$lib/components/CompendiumView.svelte';

  let {
    open,
    onOpenChange,
    campaignId,
    deep,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    campaignId: string;
    deep: { category: string; slug: string } | null;
  } = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="compendium-scrim" />
    <Dialog.Content
      {...surfaceProps('overlay', 'surface-opaque compendium-window')}
      aria-label="Compendium"
    >
      <CompendiumView campaign={campaignId} {deep} onClose={() => onOpenChange(false)} />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.compendium-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.compendium-window) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(1440px, 96vw);
    height: min(900px, 92vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
