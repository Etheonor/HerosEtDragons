<script lang="ts">
  export interface ChoiceOption {
    title: string;
    sub?: string;
    link?: string;
  }

  let {
    value,
    options,
    placeholder = '— choisir —',
    readonly = false,
    onpick,
    align = 'left',
  }: {
    value: string;
    options: ChoiceOption[];
    placeholder?: string;
    readonly?: boolean;
    onpick: (title: string) => void;
    align?: 'left' | 'center';
  } = $props();

  let open = $state(false);
  let custom = $state('');

  function choose(title: string) {
    onpick(title);
    open = false;
    custom = '';
  }

  function useCustom() {
    const t = custom.trim();
    if (t) choose(t);
  }
</script>

{#if readonly}
  <span class="static {align}">{value || '—'}</span>
{:else}
  <button class="choice-field" class:empty={!value} class:center={align === 'center'} onclick={() => (open = true)} title="Choisir dans la liste">
    {value || placeholder}
  </button>

  {#if open}
    <div class="overlay" role="presentation" onclick={() => (open = false)}>
      <div class="picker" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
        <div class="picker-head">
          <span class="picker-title">{placeholder.replace('— choisir —', 'Choisir')}</span>
          <button class="picker-close" onclick={() => (open = false)}>✕</button>
        </div>
        <div class="cards">
          {#each options as opt (opt.title)}
            <button class="card-choice" class:on={value === opt.title} onclick={() => choose(opt.title)}>
              <span class="choice-title">{opt.title}</span>
              {#if opt.sub}<span class="choice-sub">{opt.sub}</span>{/if}
              {#if opt.link}
                <a class="choice-link" href={opt.link} target="_blank" rel="noopener" onclick={(e) => e.stopPropagation()}>fiche →</a>
              {/if}
            </button>
          {/each}
        </div>
        <div class="custom">
          <span class="lbl">Personnalisé (homebrew)</span>
          <div class="custom-row">
            <input class="inp" placeholder="saisie libre…" maxlength="100" bind:value={custom} onkeydown={(e) => e.key === 'Enter' && useCustom()} />
            <button class="custom-use" disabled={!custom.trim()} onclick={useCustom}>Utiliser</button>
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .static {
    font: inherit;
    color: inherit;
  }
  .center { text-align: center; }

  .choice-field {
    font: inherit;
    color: inherit;
    background: transparent;
    border: none;
    border-bottom: 2px dotted transparent;
    border-radius: 6px 2px 6px 2px;
    padding: 0 2px;
    outline: none;
    transition: border-color 0.12s, background 0.12s;
    cursor: pointer;
    text-align: left;
    min-width: 2ch;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .choice-field:hover {
    border-bottom-color: var(--text-3);
  }
  .choice-field.empty {
    color: var(--text-3);
    font-style: italic;
    font-weight: 400;
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    padding: 24px;
  }
  .picker {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 15px 255px 15px 225px / 225px 15px 255px 15px;
    width: min(620px, 100%);
    max-height: min(80vh, 760px);
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 16px 50px var(--shadow-2);
  }
  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .picker-title {
    font-family: var(--font-title);
    font-size: 20px;
    color: var(--heading);
  }
  .picker-close {
    font-size: 13px;
    background: none;
    border: 1.5px dashed var(--border);
    border-radius: 8px;
    color: var(--text-2);
    cursor: pointer;
    padding: 2px 8px;
  }
  .picker-close:hover { border-color: var(--accent-border); color: var(--accent-text); }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .card-choice {
    font-family: var(--font-body);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3px;
    align-items: flex-start;
    text-align: left;
    padding: 10px 12px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 12px 3px 14px 4px;
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
  }
  .card-choice:hover { border-color: var(--text-2); }
  .card-choice.on {
    border-color: var(--accent);
    background: var(--panel);
    box-shadow: 0 0 0 1px var(--accent-border);
  }
  .choice-title {
    font-family: var(--font-title);
    font-size: 15px;
    color: var(--heading);
  }
  .choice-sub { font-size: 11.5px; color: var(--text-2); line-height: 1.4; }
  .choice-link {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent-text);
    text-decoration: none;
    margin-top: 2px;
  }
  .choice-link:hover { color: var(--accent-link-hover); text-decoration: underline; }

  .custom {
    border-top: 1px dashed var(--border-soft);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lbl {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .custom-row { display: flex; gap: 8px; }
  .inp {
    flex: 1;
    min-width: 0;
    font-family: var(--font-body);
    font-size: 13.5px;
    padding: 7px 11px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 10px;
    color: var(--text);
    outline: none;
  }
  .inp:focus { border-color: var(--accent); }
  .custom-use {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    padding: 6px 14px;
    background: var(--selected);
    border: 2px solid var(--border);
    border-radius: 10px 3px 12px 3px;
    color: var(--heading);
    cursor: pointer;
  }
  .custom-use:hover:not(:disabled) { background: var(--accent); border-color: var(--accent-border); }
  .custom-use:disabled { opacity: 0.45; cursor: default; }
</style>
