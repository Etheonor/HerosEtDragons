<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { api, type CompendiumEntryDto } from '$lib/api';
  import { renderEntryBody, inlineHtml, diceCol } from '$lib/markdown-lite';
  import { monsterAveragePv, monsterCa, caracMod, type MonsterMeta, type SpellMeta } from '@rollwith/shared/compendium';

  const campaign = page.url.searchParams.get('campaign') ?? '';

  let categories = $state<{ category: string; count: number; locked: boolean }[]>([]);
  let isMj = $state(false);
  let activeCategory = $state('bestiaire');
  let search = $state('');
  let entries = $state<CompendiumEntryDto[]>([]);
  let total = $state(0);
  let selected = $state<CompendiumEntryDto | null>(null);
  let listError = $state('');
  let addedToLibrary = $state(false);
  let loadingEntry = $state(false);

  const LABELS: Record<string, string> = {
    bestiaire: 'Bestiaire',
    grimoire: 'Grimoire',
    races: 'Races',
    classes: 'Classes',
    historiques: 'Historiques',
    dons: 'Dons',
    equipement: 'Équipement',
    'objets-magiques': 'Objets magiques',
    etats: 'États',
    regles: 'Règles',
  };

  onMount(async () => {
    if (!campaign) return;
    try {
      const res = await api.compendium.categories(campaign);
      categories = res.categories;
      isMj = res.isMj;
      if (!categories.find((c) => c.category === activeCategory)) {
        activeCategory = categories[0]?.category ?? '';
      }
      await loadEntries();
    } catch (e) {
      listError = e instanceof Error ? e.message : 'Compendium indisponible';
    }
  });

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    void search;
    if (!campaign) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadEntries(), 250);
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  async function loadEntries() {
    if (!campaign) return;
    listError = '';
    try {
      const res = await api.compendium.entries(campaign, {
        q: search.trim() || undefined,
        category: search.trim() ? undefined : activeCategory || undefined,
        limit: 200,
      });
      entries = res.entries;
      total = res.total;
    } catch (e) {
      listError = e instanceof Error ? e.message : 'Recherche impossible';
    }
  }

  function selectCategory(cat: string) {
    if (activeCategory === cat && !search) return;
    activeCategory = cat;
    search = '';
    void loadEntries();
    selected = null;
    addedToLibrary = false;
  }

  async function openEntry(e: CompendiumEntryDto) {
    if (!campaign) return;
    loadingEntry = true;
    addedToLibrary = false;
    try {
      selected = await api.compendium.entry(campaign, e.category, e.slug);
    } catch (err) {
      listError = err instanceof Error ? err.message : 'Fiche inaccessible';
      selected = null;
    }
    loadingEntry = false;
  }

  function summary(e: CompendiumEntryDto): string {
    const m = (e.meta ?? {}) as Record<string, any>;
    switch (e.category) {
      case 'bestiaire':
        return `FP ${m.fp ?? '—'} · ${m.type ?? ''}${m.subtype ? ` (${m.subtype})` : ''}`;
      case 'grimoire':
        return `Niveau ${m.level ?? 0} — ${m.school ?? ''}${m.ritual ? ' · rituel' : ''}${m.concentration ? ' · concentration' : ''}`;
      case 'objets-magiques':
        return [m.type, m.rarity, m.attunement ? 'harmonisation' : ''].filter(Boolean).join(' · ');
      case 'equipement':
        return [m.kind, m.category, m.price].filter(Boolean).join(' · ');
      case 'etats':
        return m.group === 'special' ? 'état spécial' : m.group === 'temporaire' ? 'état temporaire' : '';
      default:
        return '';
    }
  }

  const sections = $derived(selected ? renderEntryBody(selected.body) : []);

  async function addToLibrary() {
    if (!selected || !isMj || addedToLibrary) return;
    const m = (selected.meta ?? {}) as Partial<MonsterMeta>;
    try {
      await api.npcTemplates.create(campaign, {
        name: selected.title,
        ca: Math.max(1, Math.min(30, monsterCa(m))),
        pvMax: Math.max(1, Math.min(999, monsterAveragePv(m))),
        initBonus: Math.max(-10, Math.min(20, caracMod(m.caracs?.dex ?? 10))),
        color: "#C0392B",
        conditions: [],
        notes: `Importé du compendium (${selected.source}${selected.sourcePage ? ` p.${selected.sourcePage}` : ""})`,
      });
      addedToLibrary = true;
    } catch (e) {
      listError = e instanceof Error ? e.message : 'Ajout impossible';
    }
  }
</script>

<svelte:head>
  <title>Compendium — RollWith H&amp;D</title>
</svelte:head>

{#if !campaign}
  <div class="center-page">
    <div class="need-card">
      <div class="need-title">Compendium</div>
      <p class="need-text">Le compendium s’ouvre depuis une campagne, pour adapter les droits à ton rôle.</p>
      <a href="/" class="need-cta">Aller à l’accueil</a>
    </div>
  </div>
{:else}
  <div class="comp">
    <header class="comp-header">
      <a href="/campaigns/{campaign}/table" class="back-btn">← retour à la table</a>
      <div class="comp-title">Compendium</div>
      {#if isMj}<span class="mj-chip">vue MJ</span>{/if}
      <div class="grow"></div>
      <input class="search" placeholder="Rechercher dans tout le compendium…" bind:value={search} />
      <span class="hdr-meta">Héros & Dragons · DRS</span>
    </header>

    {#if listError && entries.length === 0}
      <div class="page-error">{listError}</div>
    {:else}
      <div class="comp-body">
        <!-- Rail catégories -->
        <nav class="rail">
          {#each categories as cat (cat.category)}
            <button class="rail-item" class:on={activeCategory === cat.category && !search} onclick={() => selectCategory(cat.category)}>
              <span class="rail-name">{LABELS[cat.category] ?? cat.category}</span>
              <span class="rail-count">{cat.count}</span>
              {#if cat.locked}<span class="rail-lock" title="Réservé au MJ">✒</span>{/if}
            </button>
          {/each}
        </nav>

        <!-- Liste -->
        <section class="list-col">
          <div class="list-head">
            {#if search.trim()}
              <span>« {search.trim()} » — {total} résultat{total > 1 ? 's' : ''}</span>
            {:else}
              <span>{LABELS[activeCategory] ?? ''}</span>
            {/if}
          </div>
          <div class="list">
            {#each entries as e (e.category + '/' + e.slug)}
              <button
                class="row"
                class:on={selected?.slug === e.slug && selected?.category === e.category}
                onclick={() => openEntry(e)}
              >
                <span class="row-title">{e.title}</span>
                {#if search.trim()}<span class="row-cat">{LABELS[e.category] ?? e.category}</span>{/if}
                {#if summary(e)}<span class="row-sub">{summary(e)}</span>{/if}
              </button>
            {:else}
              <p class="list-empty">Aucun résultat.</p>
            {/each}
          </div>
        </section>

        <!-- Fiche -->
        <article class="entry-col">
          {#if loadingEntry}
            <p class="entry-empty">Chargement…</p>
          {:else if selected}
            {@const m = (selected.meta ?? {}) as Record<string, any>}
            <div class="entry-head">
              <h2>{selected.title}</h2>
              <p class="entry-source">{selected.source}{selected.sourcePage ? ` · p. ${selected.sourcePage}` : ''}</p>
            </div>

            {#if selected.category === 'bestiaire'}
              <div class="stat-strip">
                <span><b>CA</b> {monsterCa(m as Partial<MonsterMeta>)}</span>
                <span><b>PV</b> {monsterAveragePv(m as Partial<MonsterMeta>)} (est.)</span>
                <span><b>Init</b> {caracMod(m.caracs?.dex ?? 10) >= 0 ? '+' : ''}{caracMod(m.caracs?.dex ?? 10)}</span>
                {#if m.movement?.walk}<span><b>Vitesse</b> {m.movement.walk} m</span>{/if}
                {#if m.fp !== undefined}<span><b>FP</b> {m.fp}</span>{/if}
              </div>
              {#if m.caracs}
                <div class="caracs">
                  {#each [['FOR','for'],['DEX','dex'],['CON','con'],['INT','int'],['SAG','sag'],['CHA','cha']] as [lbl, key] (lbl)}
                    <div class="carac"><span class="carac-lbl">{lbl}</span><span class="carac-val">{m.caracs?.[key as 'for']}</span></div>
                  {/each}
                </div>
              {/if}
              {#if m.environments?.length}
                <p class="entry-tags">{m.environments.join(' · ')}</p>
              {/if}
              {#if isMj}
                <div class="entry-actions">
                  {#if addedToLibrary}
                    <span class="added">ajoutée à la bibliothèque ✓</span>
                  {:else}
                    <button class="action" onclick={addToLibrary}>+ Ajouter à ma bibliothèque de PNJ</button>
                  {/if}
                </div>
              {/if}
            {:else if selected.category === 'grimoire'}
              <div class="stat-strip">
                {#if m.level !== undefined}<span><b>Niveau</b> {m.level}</span>{/if}
                {#if m.school}<span><b>{m.school}</b></span>{/if}
                {#if m.duration}<span><b>Durée</b> {m.duration}</span>{/if}
                {#if m.range}<span><b>Portée</b> {m.range}</span>{/if}
                {#if m.castingTime}<span><b>{m.castingTime}</b></span>{/if}
              </div>
              {#if m.components?.material && m.components?.materials}
                <p class="entry-tags">composants : {m.components.materials}</p>
              {/if}
            {:else if selected.category === 'equipement'}
              <div class="stat-strip">
                <span class="strip-kind">{m.kind ?? 'objet'}</span>
                {#if m.category}<span>{m.category}</span>{/if}
                {#if m.price}<span><b>{m.price}</b></span>{/if}
                {#if m.damage}<span><b>{m.damage}</b></span>{/if}
                {#if m.ac}<span><b>CA {m.ac}</b></span>{/if}
                {#if m.weight}<span>{m.weight}</span>{/if}
                {#if m.properties}<span>{m.properties}</span>{/if}
                {#if m.stealth && m.stealth !== '-'}<span>{m.stealth}</span>{/if}
              </div>
            {:else if selected.category === 'objets-magiques'}
              <div class="stat-strip">
                {#if m.type}<span class="strip-kind">{m.type}</span>{/if}
                {#if m.rarity}<span><b>{m.rarity}</b></span>{/if}
                {#if m.attunement}<span>{m.attunement}</span>{/if}
              </div>
            {/if}

            {#if listError}<div class="page-error">{listError}</div>{/if}

            <div class="entry-body">
              {#each sections as sec}
                {#if sec.heading}<h3>{sec.heading}</h3>{/if}
                {#each sec.blocks as block}
                  {#if block.type === 'para'}
                    {@html `<p>${inlineHtml(block.text)}</p>`}
                  {:else if block.type === 'heading'}
                    {#if block.level === 4}<h4>{@html inlineHtml(block.text)}</h4>
                    {:else if block.level === 5}<h5>{@html inlineHtml(block.text)}</h5>
                    {:else}<h6>{@html inlineHtml(block.text)}</h6>{/if}
                  {:else if block.type === 'list'}
                    <ul>{#each block.items as it}{@html `<li>${inlineHtml(it)}</li>`}{/each}</ul>
                  {:else if block.type === 'table'}
                    <div class="md-table-wrap">
                      <table class="md-table">
                        <thead>
                          <tr>
                            {#each block.headers as h}
                              <th>
                                {#if diceCol(h) !== null}
                                  <span class="th-dice"><svg width="1em" height="1em" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M56 32h144a40 40 0 0 1 40 40v112a40 40 0 0 1-40 40H56a40 40 0 0 1-40-40V72a40 40 0 0 1 40-40Zm0 16a24 24 0 0 0-24 24v112a24 24 0 0 0 24 24h144a24 24 0 0 0 24-24V72a24 24 0 0 0-24-24Zm40 32a16 16 0 1 1-16 16a16 16 0 0 1 16-16Zm0 64a16 16 0 1 1-16 16a16 16 0 0 1 16-16Zm68-64a16 16 0 1 1-16 16a16 16 0 0 1 16-16Zm0 64a16 16 0 1 1-16 16a16 16 0 0 1 16-16Zm68-64a16 16 0 1 1-16 16a16 16 0 0 1 16-16Zm0 64a16 16 0 1 1-16 16a16 16 0 0 1 16-16Z"/></svg>{diceCol(h)}</span>
                                {:else}
                                  {@html inlineHtml(h)}
                                {/if}
                              </th>
                            {/each}
                          </tr>
                        </thead>
                        <tbody>
                          {#each block.rows as row}
                            {#if row[0]?.startsWith('__group__')}
                              <tr class="grp"><td colspan={block.headers.length}>{row[0].slice('__group__'.length)}</td></tr>
                            {:else}
                              <tr>
                                {#each row as cell}
                                  <td>{@html inlineHtml(cell)}</td>
                                {/each}
                              </tr>
                            {/if}
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {/if}
                {/each}
              {/each}
            </div>
          {:else}
            <p class="entry-empty">Choisis une entrée pour consulter sa fiche.</p>
          {/if}
        </article>
      </div>
    {/if}
  </div>
{/if}

<style>
  .center-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .need-card {
    background: var(--panel); border: 2px solid var(--border); border-radius: var(--sketchy-1);
    padding: 44px 52px; text-align: center; display: flex; flex-direction: column; gap: 14px; align-items: center;
  }
  .need-title { font-family: var(--font-title); font-size: 28px; color: var(--heading); }
  .need-text { color: var(--text-2); font-size: 14px; }
  .need-cta {
    font-weight: 700; padding: 9px 20px; background: var(--accent); color: var(--accent-fg);
    border: 2px solid var(--accent-border); border-radius: var(--sketchy-3); text-decoration: none;
  }

  .comp { height: 100vh; display: flex; flex-direction: column; background: var(--bg); }
  .comp-header {
    display: flex; align-items: center; gap: 14px; padding: 10px 20px;
    border-bottom: 2px solid var(--border); flex: none;
  }
  .grow { flex: 1; }
  .back-btn {
    font-size: 13px; text-decoration: none; border: 2px solid var(--border);
    border-radius: 225px 12px 220px 12px / 12px 200px 12px 255px;
    padding: 5px 13px; color: var(--text); background: var(--panel);
  }
  .back-btn:hover { background: var(--selected); color: var(--heading); }
  .comp-title { font-family: var(--font-title); font-size: 20px; color: var(--heading); }
  .mj-chip {
    font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
    color: var(--accent-text); border: 1.5px solid var(--accent-border); border-radius: var(--sketchy-badge);
    padding: 2px 8px;
  }
  .search {
    font-family: var(--font-body); font-size: 13px; padding: 7px 12px; width: 300px;
    background: var(--bg); border: 2px solid var(--border); color: var(--text); outline: none;
    border-radius: 220px 12px 225px 12px / 12px 225px 12px 220px;
  }
  .search:focus { border-color: var(--accent); }
  .hdr-meta { font-size: 12px; color: var(--text-3); }
  .page-error { padding: 10px 20px; color: var(--accent-text); font-size: 13px; }

  .comp-body {
    flex: 1; min-height: 0;
    display: grid; grid-template-columns: 190px 280px 1fr;
  }

  .rail { border-right: 1px solid var(--border-soft); padding: 10px 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .rail-item {
    font-family: var(--font-body); display: flex; align-items: center; gap: 6px;
    padding: 7px 10px; background: transparent; border: 2px solid transparent;
    border-radius: 10px 3px 12px 3px; color: var(--text-2); cursor: pointer; font-size: 13px; text-align: left;
  }
  .rail-item:hover { color: var(--text); background: var(--panel); }
  .rail-item.on { background: var(--selected); color: var(--heading); }
  .rail-name { flex: 1; }
  .rail-count { font-size: 11px; color: var(--text-3); }
  .rail-item.on .rail-count { color: var(--text-2); }
  .rail-lock { font-size: 11px; color: var(--accent-text); }

  .list-col { border-right: 1px solid var(--border-soft); display: flex; flex-direction: column; min-height: 0; }
  .list-head { padding: 10px 14px 6px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-3); flex: none; }
  .list { overflow-y: auto; padding: 0 8px 12px; display: flex; flex-direction: column; gap: 2px; min-height: 0; }
  .row {
    font-family: var(--font-body); display: flex; flex-direction: column; gap: 1px; align-items: flex-start;
    width: 100%; padding: 7px 10px; background: transparent; border: none; border-radius: 10px 3px 12px 3px;
    cursor: pointer; text-align: left; color: var(--text);
  }
  .row:hover { background: var(--panel); }
  .row.on { background: var(--selected); color: var(--heading); }
  .row-title { font-size: 13.5px; font-weight: 600; }
  .row-cat { font-size: 10.5px; color: var(--accent-text); text-transform: uppercase; letter-spacing: .04em; }
  .row-sub { font-size: 11.5px; color: var(--text-2); }
  .row.on .row-sub { color: var(--text-2); }
  .list-empty { padding: 12px; color: var(--text-3); font-style: italic; font-size: 13px; }

  .entry-col { overflow-y: auto; padding: 18px 26px 60px; min-height: 0; }
  .entry-empty { color: var(--text-3); font-style: italic; }
  .entry-head h2 { font-family: var(--font-title); font-size: 26px; color: var(--heading); line-height: 1.1; }
  .entry-source { font-size: 12px; color: var(--text-3); margin-top: 2px; }
  .stat-strip {
    display: flex; gap: 14px; flex-wrap: wrap; margin: 12px 0;
    border: 2px solid var(--border); border-radius: var(--sketchy-6);
    background: var(--panel); padding: 8px 14px; font-size: 13px;
  }
  .stat-strip b { color: var(--accent-text); font-weight: 700; margin-right: 3px; }
  .strip-kind {
    font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
    color: var(--accent-text); border: 1.5px solid var(--accent-border);
    border-radius: var(--sketchy-badge); padding: 1px 8px;
  }
  .caracs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 10px 0; }
  .carac {
    border: 2px solid var(--border); background: var(--panel); border-radius: 12px;
    text-align: center; padding: 5px 2px;
  }
  .carac-lbl { display: block; font-size: 10px; font-weight: 700; letter-spacing: .06em; color: var(--text-3); }
  .carac-val { display: block; font-family: var(--font-title); font-size: 17px; color: var(--text); }
  .entry-tags { font-size: 12px; color: var(--text-2); margin: 4px 0; }
  .entry-actions { margin: 10px 0; }
  .action {
    font-family: var(--font-body); font-size: 13px; font-weight: 500;
    padding: 6px 14px; background: transparent; border: 2px dashed var(--border);
    border-radius: 10px; color: var(--text-2); cursor: pointer;
  }
  .action:hover { border-color: var(--accent); color: var(--accent-text); }
  .added { font-size: 13px; font-weight: 700; color: var(--accent-text); }

  .entry-body :global(h3) {
    font-family: var(--font-title); font-size: 17px; color: var(--heading);
    margin: 16px 0 4px; border-bottom: 2px solid var(--accent); padding-bottom: 2px;
  }
  .entry-body :global(p) { font-size: 13.5px; line-height: 1.6; margin: 6px 0; color: var(--text); }
  .entry-body :global(ul) { margin: 6px 0 6px 18px; font-size: 13.5px; line-height: 1.55; }
  .entry-body :global(h4) {
    font-family: var(--font-body); font-weight: 700; font-size: 14px; color: var(--heading);
    margin: 14px 0 3px;
  }
  .entry-body :global(h5), .entry-body :global(h6) {
    font-weight: 700; font-size: 13px; color: var(--accent-text); margin: 10px 0 2px;
  }
  .entry-body :global(strong) { color: var(--heading); }
  .md-table-wrap { overflow-x: auto; margin: 10px 0; }
  .md-table {
    border-collapse: collapse; width: 100%; font-size: 13px;
    border: 2px solid var(--border); border-radius: 8px;
  }
  .md-table th {
    background: var(--panel); color: var(--accent-text); text-align: left;
    padding: 6px 10px; border: 1px solid var(--border-soft); font-weight: 700; white-space: nowrap;
  }
  .md-table td { padding: 5px 10px; border: 1px solid var(--border-soft); vertical-align: top; }
  .md-table tbody tr:nth-child(even) td { background: rgba(0,0,0,.12); }
  .md-table tr.grp td {
    background: var(--selected); color: var(--heading); font-weight: 700;
    font-family: var(--font-title);
  }
  .th-dice { display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; }
  .entry-body :global(.linkish) { color: var(--accent-text); border-bottom: 1px dotted var(--text-3); }
</style>
