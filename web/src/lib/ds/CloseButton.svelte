<script lang="ts">
  interface Props {
    label?: string;
    onclick?: (e: MouseEvent) => void;
    class?: string;
  }

  const { label = 'Fermer', onclick, class: className = '' }: Props = $props();
</script>

<button type="button" class="close-btn {className}" aria-label={label} onclick={onclick}>✕</button>

<style>
  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-h-sm);
    height: var(--control-h-sm);
    padding: 0;
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1;
    color: var(--text-2);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    flex: none;
  }
  .close-btn:hover {
    background: var(--selected);
    color: var(--heading);
  }
</style>
