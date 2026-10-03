<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';

  let {
    open,
    title,
    message,
    confirmLabel = 'Confirmer',
    danger = false,
    onOpenChange,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  } = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="confirm-scrim" />
    <Dialog.Content {...surfaceProps('overlay', 'confirm-dialog')} aria-label={title}>
      <h3 class="confirm-title">{title}</h3>
      <p class="confirm-message">{message}</p>
      <div class="confirm-actions">
        <button class="confirm-btn" type="button" onclick={() => onOpenChange(false)}>Annuler</button>
        <button
          class="confirm-btn {danger ? 'danger' : 'primary'}"
          type="button"
          onclick={() => {
            onConfirm();
            onOpenChange(false);
          }}>{confirmLabel}</button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.confirm-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.confirm-dialog) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(420px, calc(100vw - 48px));
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .confirm-title {
    margin: 0;
    font-family: var(--font-title);
    font-size: 18px;
    color: var(--heading);
  }
  .confirm-message {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--text-2);
  }
  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .confirm-btn {
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
  .confirm-btn:hover { color: var(--heading); border-color: var(--border); }
  .confirm-btn.primary {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .confirm-btn.primary:hover { background: var(--accent-hover); color: var(--accent-fg); }
  .confirm-btn.danger {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .confirm-btn.danger:hover { background: var(--accent-hover); }
</style>
