<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { surfaceProps } from '$lib/ds/surface';
  import { api, type NpcTemplate } from '$lib/api';
  import { showToast } from '$lib/toast.svelte';

  let {
    open,
    template,
    onOpenChange,
    onSaved,
  }: {
    open: boolean;
    template: NpcTemplate | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
  } = $props();

  let name = $state('');
  let pvMax = $state(7);
  let ca = $state(10);
  let initBonus = $state(0);
  let saving = $state(false);

  $effect(() => {
    if (!open || !template) return;
    name = template.name;
    pvMax = template.pvMax;
    ca = template.ca;
    initBonus = template.initBonus;
    saving = false;
  });

  async function save() {
    if (!template || !name.trim() || saving) return;
    saving = true;
    try {
      await api.npcTemplates.update(template.id, {
        name: name.trim(),
        ca,
        pvMax,
        initBonus,
        color: template.color,
        conditions: template.conditions,
        notes: template.notes,
        tokenScale: template.tokenScale,
      });
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Enregistrement impossible', 'error');
      saving = false;
    }
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="npc-scrim" />
    <Dialog.Content {...surfaceProps('overlay', 'npc-dialog')} aria-label="Modifier le modèle">
      <h3 class="npc-title">Modifier le modèle</h3>
      <label class="npc-field">
        Nom
        <input class="npc-input" bind:value={name} maxlength="80" />
      </label>
      <div class="npc-row">
        <label class="npc-field">
          PV max
          <input class="npc-input" type="number" min="1" max="999" bind:value={pvMax} />
        </label>
        <label class="npc-field">
          CA
          <input class="npc-input" type="number" min="1" max="30" bind:value={ca} />
        </label>
        <label class="npc-field">
          Init
          <input class="npc-input" type="number" min="-10" max="20" bind:value={initBonus} />
        </label>
      </div>
      <div class="npc-actions">
        <button class="npc-btn" type="button" onclick={() => onOpenChange(false)}>Annuler</button>
        <button
          class="npc-btn primary"
          type="button"
          disabled={!name.trim() || saving}
          onclick={save}>Enregistrer</button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.npc-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.npc-dialog) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, calc(100vw - 48px));
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .npc-title {
    margin: 0;
    font-family: var(--font-title);
    font-size: 18px;
    color: var(--heading);
  }
  .npc-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .npc-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12.5px;
    color: var(--text-2);
  }
  .npc-input {
    font-family: var(--font-body);
    font-size: 14px;
    padding: 7px 10px;
    color: var(--text);
    background: var(--sunken);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  .npc-input:focus {
    border-color: var(--accent-border);
  }
  .npc-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .npc-btn {
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
  .npc-btn:hover {
    color: var(--heading);
    border-color: var(--border);
  }
  .npc-btn.primary {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .npc-btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
    color: var(--accent-fg);
  }
  .npc-btn.primary:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
