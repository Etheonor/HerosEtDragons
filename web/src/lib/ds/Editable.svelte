<script lang="ts">
  let {
    value = '',
    type = 'text',
    min,
    max,
    w,
    align = 'left',
    placeholder = '',
    readonly = false,
    title = '',
    oncommit,
    ontype,
    onchange,
    className = '',
    options,
    autosize = false,
    bare = false,
  }: {
    value?: string | number;
    type?: 'text' | 'number' | 'area';
    min?: number;
    max?: number;
    w?: number;
    align?: 'left' | 'center';
    placeholder?: string;
    readonly?: boolean;
    title?: string;
    oncommit?: () => void;
    ontype?: () => void;
    onchange?: (v: string | number) => void;
    className?: string;
    /** suggestions (datalist natif) — la saisie libre reste autorisée */
    options?: string[];
    /** textarea qui grandit avec son contenu (hauteur auto, pas de scroll) */
    autosize?: boolean;
    /** textarea sans bordure (nom, citation dans l'en-tête) */
    bare?: boolean;
  } = $props();

  const uid = $props.id();

  // Tampon texte : l'input manipule une string ; la valeur remontée au parent
  // est typée selon `type` (number parsé) à chaque frappe.
  let buf = $state(String(value ?? ''));
  let focused = $state(false);

  let areaEl = $state<HTMLTextAreaElement | undefined>();

  $effect(() => {
    if (!focused) buf = String(value ?? '');
  });

  $effect(() => {
    if (type !== 'area' || !autosize) return;
    const el = areaEl;
    if (!el) return;
    void buf;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });

  function sync() {
    if (!readonly) {
      onchange?.(type === 'number' ? Math.trunc(Number(buf) || 0) : buf);
    }
    ontype?.();
  }

  function commit() {
    sync();
    oncommit?.();
  }
</script>

{#if type === 'area'}
  <textarea
    bind:this={areaEl}
    class="ed area {bare ? 'bare' : ''} {autosize ? 'autosize' : ''} {className}"
    class:ro={readonly}
    {placeholder}
    {title}
    bind:value={buf}
    readonly={readonly}
    onfocus={() => (focused = true)}
    onblur={() => {
      focused = false;
      commit();
    }}
    oninput={sync}
    onkeydown={(e) => e.key === 'Escape' && (e.target as HTMLTextAreaElement).blur()}
    onpointerdown={(e) => e.stopPropagation()}
    onclick={(e) => e.stopPropagation()}
  ></textarea>
{:else}
  <input
    class="ed {className}"
    class:ro={readonly}
    class:center={align === 'center'}
    {type}
    {min}
    {max}
    {placeholder}
    {title}
    list={options ? `${uid}-list` : undefined}
    bind:value={buf}
    readonly={readonly}
    style={w ? `width: ${w}px;` : undefined}
    onfocus={() => (focused = true)}
    onblur={() => {
      focused = false;
      commit();
    }}
    oninput={sync}
    onkeydown={(e) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    }}
    onpointerdown={(e) => e.stopPropagation()}
    onclick={(e) => e.stopPropagation()}
  />
  {#if options}
    <datalist id="{uid}-list">
      {#each options as opt (opt)}
        <option value={opt}></option>
      {/each}
    </datalist>
  {/if}
{/if}

<style>
  .ed {
    font: inherit;
    color: inherit;
    background: transparent;
    border: none;
    border-bottom: 2px dotted transparent;
    border-radius: 6px 2px 6px 2px;
    padding: 0 2px;
    outline: none;
    transition: border-color 0.12s, background 0.12s;
    min-width: 2ch;
  }
  .ed:not(.ro):hover {
    border-bottom-color: var(--text-3);
  }
  .ed:not(.ro):focus {
    border-bottom-color: var(--accent);
    background: var(--bg);
  }
  .ed.ro {
    cursor: default;
  }
  .center {
    text-align: center;
  }
  input[type='number'].ed {
    appearance: textfield;
    -moz-appearance: textfield;
  }
  input[type='number'].ed::-webkit-outer-spin-button,
  input[type='number'].ed::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .area {
    display: block;
    width: 100%;
    border: 2px dashed var(--border);
    padding: 6px 9px;
    resize: vertical;
    line-height: 1.5;
  }
  .area.autosize {
    resize: none;
    overflow: hidden;
  }
  .area.bare {
    border: none;
    background: transparent;
    padding: 0;
    line-height: 1.25;
  }
  .area.bare:not(.ro):hover {
    border-bottom: 2px dotted var(--text-3);
  }
  .area.bare:not(.ro):focus {
    border-bottom: 2px dotted var(--accent);
    background: var(--bg);
    border-radius: 4px 1px 4px 1px;
  }
  .area:not(.ro):hover {
    border-color: var(--text-2);
  }
  .area:not(.ro):focus {
    border-style: solid;
    border-color: var(--accent);
  }
</style>
