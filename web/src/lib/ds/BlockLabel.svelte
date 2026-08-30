<script lang="ts">
  let {
    text = '',
    side = 'right',
    class: className = '',
  }: {
    text?: string;
    side?: 'right' | 'left';
    class?: string;
  } = $props();
</script>

<span class="block-label label-{side} {className}">{text}</span>

<style>
  .block-label {
    position: absolute;
    top: -10px;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.4px;
    color: var(--accent-text);
    background: var(--bg);
    padding: 0 6px;
    white-space: nowrap;
  }
  .label-right {
    right: 10px;
  }
  .label-left {
    left: 10px;
  }
</style>
