<script lang="ts">
  let {
    variant = 'primary',
    onclick,
    disabled = false,
    type = 'button',
    children,
    class: className = '',
  }: {
    variant?: 'primary' | 'neutral' | 'dashed';
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
    children: import('svelte').Snippet;
    class?: string;
  } = $props();
</script>

<button class="btn btn-{variant} {className}" {type} {onclick} {disabled}>
  {@render children()}
</button>

<style>
  .btn {
    font-family: var(--font-body);
    font-size: 14px;
    padding: 9px 20px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Primaire : accent */
  .btn-primary {
    font-weight: 700;
    background: var(--accent);
    color: var(--accent-fg);
    border: 2px solid var(--accent-border);
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  /* Neutre :Tour suivant, Partager… */
  .btn-neutral {
    background: var(--selected);
    color: var(--heading);
    border: 2px solid var(--border);
    border-radius: 15px 230px 15px 225px / 225px 15px 255px 15px;
  }
  .btn-neutral:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent-border);
  }

  /* Zone d'action secondaire (créer, ajouter) */
  .btn-dashed {
    background: transparent;
    color: var(--text-2);
    border: 2px dashed var(--border);
    border-radius: 12px;
  }
  .btn-dashed:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text);
  }
</style>
