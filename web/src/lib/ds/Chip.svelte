<script lang="ts">
  let {
    variant = 'default',
    onclick,
    children,
    class: className = '',
  }: {
    variant?: 'active' | 'default' | 'muted';
    onclick?: (e: MouseEvent) => void;
    children: import('svelte').Snippet;
    class?: string;
  } = $props();
</script>

{#if onclick}
  <span
    class="chip chip-{variant} {className}"
    role="button"
    tabindex="0"
    {onclick}
    onkeydown={(e) => e.key === 'Enter' && onclick(e as unknown as MouseEvent)}
  >
    {@render children()}
  </span>
{:else}
  <span class="chip chip-{variant} {className}">
    {@render children()}
  </span>
{/if}

<style>
  .chip {
    display: inline-block;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    cursor: default;
    border: 2px solid var(--border);
    border-radius: 10px 3px 12px 3px;
  }

  .chip-active {
    background: var(--selected);
    color: var(--heading);
  }

  .chip-default {
    background: var(--panel);
    color: var(--text);
  }

  .chip-muted {
    color: var(--text-2);
    border-radius: 3px 12px 3px 10px;
  }

  .chip[onclick] {
    cursor: pointer;
  }
</style>
