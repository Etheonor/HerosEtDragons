<script lang="ts">
  import { goto } from '$app/navigation';

  let { params } = $props();

  let status: 'checking' | 'error' = $state('checking');
  let message = $state('');
  let campaignName = $state('');

  $effect(() => {
    const token = params.token;
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
          credentials: 'include',
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          joined?: boolean;
          campaignName?: string;
          error?: string;
        } | null;
        if (cancelled) return;
        if (res.ok && data?.ok) {
          campaignName = data.campaignName ?? '';
          await goto(data.joined ? '/' : '/login');
        } else {
          message = data?.error ?? 'Invitation invalide ou expirée.';
          status = 'error';
        }
      } catch {
        if (!cancelled) {
          message = 'Serveur injoignable. Réessayez depuis le lien reçu.';
          status = 'error';
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="center">
  {#if status === 'checking'}
    <p class="muted">Vérification de l'invitation…</p>
  {:else}
    <div class="card">
      <div class="title">Invitation</div>
      <p class="error-msg">{message}</p>
      <a href="/login" class="cta">Aller à la connexion</a>
    </div>
  {/if}
</div>

<style>
  .center {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .muted {
    color: var(--text-2);
  }
  .card {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: var(--sketchy-1);
    padding: 40px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
    max-width: 420px;
    box-shadow: 0 12px 40px var(--shadow-1);
  }
  .title {
    font-family: var(--font-title);
    font-size: 28px;
    color: var(--heading);
  }
  .error-msg {
    color: var(--accent-text);
    font-size: 14.5px;
  }
  .cta {
    font-size: 14.5px;
    font-weight: 700;
    padding: 9px 20px;
    background: var(--accent);
    color: var(--accent-fg);
    border: 2px solid var(--accent-border);
    border-radius: var(--sketchy-3);
    text-decoration: none;
  }
  .cta:hover {
    background: var(--accent-hover);
    color: var(--accent-fg);
  }
</style>
