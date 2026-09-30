<script lang="ts">
  import { Command, Dialog } from 'bits-ui';
  import { surfaceClass } from '$lib/ds/surface';
  import type { PaletteCommand } from './commands.svelte';

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    commands: PaletteCommand[];
  }

  const { open, onOpenChange, commands }: Props = $props();

  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open) {
      // Le DOM portalé n'existe pas encore quand `open` bascule : on attend
      // qu'il soit posé avant de focaliser (piège C du spike).
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  const groups = $derived.by(() => {
    const map = new Map<string, PaletteCommand[]>();
    for (const cmd of commands) {
      const list = map.get(cmd.group) ?? [];
      list.push(cmd);
      map.set(cmd.group, list);
    }
    return [...map.entries()];
  });

  function pick(cmd: PaletteCommand) {
    cmd.run();
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="palette-scrim" />
    <Dialog.Content class="{surfaceClass('overlay', 'palette')} surface-lg" aria-label="Command palette">
      <Command.Root label="Command palette" loop>
        <Command.Input
          bind:ref={inputEl}
          class="palette-input"
          placeholder="Rechercher une action, un réglage…"
        />
        <Command.List class="palette-list">
          <Command.Empty class="palette-empty">Aucun résultat.</Command.Empty>
          {#each groups as [group, items] (group)}
            <Command.Group value={group} class="palette-group">
              <Command.GroupHeading class="palette-group-title">{group}</Command.GroupHeading>
              <Command.GroupItems>
                {#each items as cmd (cmd.id)}
                  <Command.Item
                    value={cmd.label}
                    keywords={cmd.keywords}
                    class="palette-item"
                    data-active={cmd.active ? 'true' : undefined}
                    onSelect={() => pick(cmd)}
                  >
                    <span class="pi-label">{cmd.label}</span>
                    {#if cmd.badge}
                      <span class="pi-badge">{cmd.badge}</span>
                    {/if}
                    {#if cmd.shortcut}
                      <kbd>{cmd.shortcut}</kbd>
                    {/if}
                  </Command.Item>
                {/each}
              </Command.GroupItems>
            </Command.Group>
          {/each}
        </Command.List>
      </Command.Root>
      <div class="palette-foot">↑↓ naviguer · ⏎ exécuter · Échap fermer</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.palette-scrim) {
    position: fixed;
    inset: 0;
    background: var(--overlay);
  }
  :global(.palette) {
    position: fixed;
    left: 50%;
    bottom: 84px;
    transform: translateX(-50%);
    width: min(640px, calc(100vw - 48px));
    max-height: min(60vh, 520px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: palette-in var(--dur-in) var(--ease-out);
  }
  @keyframes palette-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  :global(.palette-input) {
    flex: none;
    margin: 10px 10px 0;
    height: var(--control-h-lg);
    padding: 0 12px;
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--text);
    background: var(--bg);
    border: 1.5px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    outline: none;
  }
  :global(.palette-list) {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    min-height: 0;
  }
  :global(.palette-group-title) {
    display: block;
    padding: 8px 8px 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-3);
  }
  :global(.palette-item) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    font-family: var(--font-body);
    font-size: 13.5px;
    color: var(--text);
    text-align: left;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  :global(.palette-item[data-selected]) {
    background: var(--selected);
    color: var(--heading);
  }
  :global(.palette-item[data-active='true']) {
    color: var(--accent-text);
  }
  :global(.pi-label) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.pi-badge) {
    flex: none;
    font-size: 12px;
    color: var(--text-2);
  }
  :global(.palette-item kbd) {
    flex: none;
    min-width: 20px;
    padding: 1px 6px;
    font-family: var(--font-body);
    font-size: 11.5px;
    font-weight: 700;
    text-align: center;
    color: var(--text-2);
    background: var(--bg);
    border: 1.5px solid var(--border-subtle);
    border-radius: var(--radius-xs);
  }
  :global(.palette-empty) {
    padding: 16px;
    font-size: 13px;
    color: var(--text-2);
    text-align: center;
  }
  :global(.palette-foot) {
    flex: none;
    padding: 8px 12px;
    border-top: 1.5px solid var(--border-subtle);
    font-size: 11.5px;
    color: var(--text-3);
  }
</style>
