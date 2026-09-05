<script lang="ts">
  import { api, type CompendiumEntryDto } from '$lib/api';
  import { inlineHtml, toBlocks } from '$lib/markdown-lite';

  let {
    campaign,
    category,
    slug,
    children,
  }: {
    campaign: string;
    category: string;
    slug: string;
    children: import('svelte').Snippet;
  } = $props();

  const cache = new Map<string, CompendiumEntryDto | null>();

  let show = $state(false);
  let entry = $state<CompendiumEntryDto | null | undefined>(undefined);

  async function open() {
    show = true;
    if (entry !== undefined) return;
    const key = `${campaign}|${category}|${slug}`;
    if (cache.has(key)) {
      entry = cache.get(key) ?? null;
      return;
    }
    entry = await api.compendium.entry(campaign, category, slug).catch(() => null);
    cache.set(key, entry);
  }

  function excerpt(e: CompendiumEntryDto): string {
    for (const sec of e.body ?? []) {
      for (const block of toBlocks(sec.markdown)) {
        if (block.type === 'para') {
          return inlineHtml(block.text)
            .replace(/<[^>]+>/g, '')
            .slice(0, 240);
        }
        if (block.type === 'list' && block.items.length) {
          return inlineHtml(block.items[0]!).replace(/<[^>]+>/g, '').slice(0, 240);
        }
      }
    }
    return '';
  }
</script>

<span class="tip-wrap" onpointerenter={open} onpointerleave={() => (show = false)} onfocusin={open} onfocusout={() => (show = false)}>
  {@render children()}
  {#if show && entry}
    <span class="tip-card" role="tooltip">
      <span class="tip-title">{entry.title}</span>
      <span class="tip-text">{excerpt(entry)}</span>
      <a class="tip-link" href="/compendium?campaign={campaign}&cat={entry.category}&slug={entry.slug}">
        Ouvrir dans le compendium →
      </a>
    </span>
  {/if}
</span>

<style>
  .tip-wrap {
    position: relative;
    display: inline-flex;
  }
  .tip-card {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 95;
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 14px 4px 16px 5px;
    box-shadow: 0 10px 30px var(--shadow-2);
    padding: 10px 13px;
    font-family: var(--font-body);
  }
  .tip-title {
    font-family: var(--font-title);
    font-size: 15px;
    color: var(--heading);
  }
  .tip-text {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text);
  }
  .tip-link {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--accent-text);
    text-decoration: none;
  }
  .tip-link:hover {
    color: var(--accent-link-hover);
  }
</style>
