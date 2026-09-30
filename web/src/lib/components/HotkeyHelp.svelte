<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { surfaceClass } from '$lib/ds/surface';
  import CloseButton from '$lib/ds/CloseButton.svelte';
  import { hotkeysForRole } from '$lib/hotkeys';

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isMj: boolean;
  }

  const { open, onOpenChange, isMj }: Props = $props();

  const groups = $derived(hotkeysForRole(isMj));

  function displayKey(key: string): string {
    return key === ' ' ? 'Espace' : key === '?' ? '?' : key.toUpperCase();
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="help-scrim" />
    <Dialog.Content class="{surfaceClass('overlay', 'help')} surface-lg" aria-label="Aide clavier">
      <div class="help-head">
        <span class="help-title">Aide clavier</span>
        <CloseButton label="Fermer l'aide" onclick={() => onOpenChange(false)} />
      </div>
      <div class="help-body">
        {#each groups as group (group.group)}
          <section class="help-group">
            <h3>{group.group}</h3>
            <dl>
              {#each group.items as h (h.id)}
                <div class="help-row">
                  <dt>{h.label}</dt>
                  <dd><kbd>{displayKey(h.key)}</kbd></dd>
                </div>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
      <div class="help-foot">Les raccourcis sont désactivés dans les champs de saisie.</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.help-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.help) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 48px));
    max-height: min(80vh, 620px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 8px 16px;
    border-bottom: 1.5px solid var(--border-subtle);
  }
  .help-title {
    font-family: var(--font-title);
    font-size: 17px;
    color: var(--heading);
  }
  .help-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
    padding: 12px 16px;
    overflow-y: auto;
  }
  .help-group h3 {
    margin: 8px 0 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .help-group dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .help-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .help-row dt {
    font-size: 13px;
    color: var(--text);
  }
  .help-row dd {
    margin: 0;
    flex: none;
  }
  .help-row kbd {
    display: inline-block;
    min-width: 24px;
    padding: 1px 7px;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: var(--text-2);
    background: var(--bg);
    border: 1.5px solid var(--border-subtle);
    border-radius: var(--radius-xs);
  }
  .help-foot {
    padding: 8px 16px;
    border-top: 1.5px solid var(--border-subtle);
    font-size: 11.5px;
    color: var(--text-3);
  }
</style>
