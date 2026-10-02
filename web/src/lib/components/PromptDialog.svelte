<script lang="ts">
  /**
   * Petite boîte « demander une valeur » (renommage, etc.) — bits-ui Dialog,
   * top layer, Échap/Annuler, Entrée valide.
   */
  import { Dialog } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';

  interface Props {
    open: boolean;
    title: string;
    label: string;
    initial?: string;
    confirmLabel?: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: (value: string) => void;
  }

  const {
    open,
    title,
    label,
    initial = '',
    confirmLabel = 'Valider',
    onOpenChange,
    onConfirm,
  }: Props = $props();

  let value = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!open) return;
    value = initial;
    requestAnimationFrame(() => inputEl?.select());
  });

  function submit() {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="prompt-scrim" />
    <Dialog.Content {...surfaceProps('overlay', 'prompt-dialog')} aria-label={title}>
      <h3 class="prompt-title">{title}</h3>
      <label class="prompt-label">
        {label}
        <input
          class="prompt-input"
          bind:this={inputEl}
          bind:value
          onkeydown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </label>
      <div class="prompt-actions">
        <button class="prompt-btn" type="button" onclick={() => onOpenChange(false)}>Annuler</button
        >
        <button
          class="prompt-btn primary"
          type="button"
          disabled={value.trim() === ''}
          onclick={submit}>{confirmLabel}</button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.prompt-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.prompt-dialog) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(400px, calc(100vw - 48px));
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .prompt-title {
    margin: 0;
    font-family: var(--font-title);
    font-size: 17px;
    color: var(--heading);
  }
  .prompt-label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12.5px;
    color: var(--text-2);
  }
  .prompt-input {
    font-family: var(--font-body);
    font-size: 14px;
    padding: 7px 10px;
    color: var(--text);
    background: var(--sunken);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    outline: none;
  }
  .prompt-input:focus { border-color: var(--accent-border); }
  .prompt-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .prompt-btn {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    color: var(--text-2);
    background: transparent;
    border: 2px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .prompt-btn:hover { color: var(--heading); border-color: var(--border); }
  .prompt-btn.primary {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .prompt-btn.primary:hover:not(:disabled) { background: var(--accent-hover); color: var(--accent-fg); }
  .prompt-btn.primary:disabled { opacity: 0.45; cursor: default; }
</style>
