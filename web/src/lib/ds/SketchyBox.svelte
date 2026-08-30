<script lang="ts">
  let {
    seed = 0,
    dashed = false,
    children,
    class: className = '',
    padding = '12px 16px',
  }: {
    seed?: number;
    dashed?: boolean;
    children: import('svelte').Snippet;
    class?: string;
    padding?: string;
  } = $props();

  const radii = [
    '255px 15px 225px 15px/15px 225px 15px 255px',
    '15px 225px 15px 255px/225px 15px 255px 15px',
    '225px 12px 220px 12px/12px 200px 12px 255px',
    '12px 235px 14px 245px/235px 12px 255px 14px',
    '240px 13px 215px 14px/13px 240px 14px 230px',
    '225px 12px 240px 14px/12px 235px 13px 225px',
    '14px 240px 12px 220px/230px 14px 210px 12px',
    '230px 14px 210px 12px/14px 240px 12px 220px',
  ];

  const radius = $derived(radii[seed % radii.length] ?? radii[0]!);
</script>

<div
  class="panel-box {className}"
  class:dashed
  style="border-radius: {radius}; padding: {padding};"
>
  {@render children()}
</div>

<style>
  .panel-box {
    background: var(--panel);
    border: 2px solid var(--border);
  }
  .panel-box.dashed {
    border-style: dashed;
  }
</style>
