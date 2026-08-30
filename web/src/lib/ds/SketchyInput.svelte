<script lang="ts">
  let {
    value = $bindable(''),
    placeholder = '',
    onkeydown,
    class: className = '',
  }: {
    value?: string;
    placeholder?: string;
    onkeydown?: (e: KeyboardEvent) => void;
    class?: string;
  } = $props();
</script>

<input
  class="night-input {className}"
  type="text"
  bind:value
  {placeholder}
  {onkeydown}
/>

<style>
  .night-input {
    font-family: var(--font-body);
    font-size: 14px;
    padding: 9px 12px;
    border: 2px solid var(--border);
    border-radius: 220px 12px 225px 12px / 12px 225px 12px 220px;
    background: var(--bg);
    color: var(--text);
    outline: none;
    transition: border-color 0.15s;
  }
  .night-input:focus {
    border-color: var(--accent);
  }
  .night-input::placeholder {
    color: var(--text-3);
  }
</style>
