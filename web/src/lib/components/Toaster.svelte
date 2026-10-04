<script lang="ts">
  import { dismissToast, toasts } from '$lib/toast.svelte';
</script>

{#if toasts.length > 0}
  <div class="toaster" aria-live="polite">
    {#each toasts as t (t.id)}
      <div class="toast toast-{t.kind}" role="status">
        <span class="toast-msg">{t.message}</span>
        <button class="toast-x" aria-label="Fermer le message" onclick={() => dismissToast(t.id)}
          >✕</button
        >
      </div>
    {/each}
  </div>
{/if}

<style>
  .toaster {
    position: fixed;
    left: 50%;
    bottom: 96px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: var(--z-toast);
    pointer-events: none;
    max-width: min(560px, calc(100vw - 40px));
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 18px;
    color: var(--text);
    background: var(--panel);
    border: 2px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: 13.5px;
    font-weight: 500;
    box-shadow: 0 8px 22px var(--shadow-2);
    animation: toast-in 220ms var(--ease-out);
  }
  .toast-error {
    border-color: var(--accent-border);
  }
  .toast-success {
    border-color: var(--hp-ok);
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .toast-x {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    color: var(--text-2);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 11px;
  }
  .toast-x:hover {
    color: var(--heading);
    background: var(--selected);
  }
</style>
