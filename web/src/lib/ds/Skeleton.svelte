<script lang="ts">
  let {
    w = '100%',
    h = 14,
    radius = 'var(--radius-sm)',
    class: className = '',
  }: {
    w?: string;
    h?: number;
    radius?: string;
    class?: string;
  } = $props();
</script>

<span
  class="skeleton {className}"
  style="width: {w}; height: {h}px; border-radius: {radius};"
  aria-hidden="true"
></span>

<style>
  .skeleton {
    display: block;
    background: linear-gradient(
      90deg,
      var(--surface-raised) 25%,
      color-mix(in oklab, var(--surface-raised), var(--heading) 7%) 50%,
      var(--surface-raised) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-wave 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-wave {
    from {
      background-position: 150% 0;
    }
    to {
      background-position: -50% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
