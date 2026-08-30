<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { auth, type Session } from '$lib/auth-client';

  let session = $state<Session | null>(null);
  let loading = $state(true);
  let error = $state(page.url.searchParams.get('denied')
    ? "Compte non autorisé. Ouvre le lien d'invitation envoyé par ton MJ, ou demande-lui de t'ajouter."
    : '');

  onMount(async () => {
    try {
      session = await auth.getSession();
    } catch {
      /* not logged in */
    }
    loading = false;
  });

  async function discordLogin() {
    error = '';
    try {
      await auth.signInWithDiscord();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Erreur de connexion';
    }
  }
</script>

{#if loading}
  <div class="center">
    <p class="muted">…</p>
  </div>
{:else if session}
  <div class="center">
    <div class="card logged-card">
      <div class="card-title">Bonjour {session.user.name}</div>
      <p class="muted">Vous êtes connecté.</p>
      <a href="/" class="cta">← retour à l'accueil</a>
    </div>
  </div>
{:else}
  <div class="center">
    <div class="card">
      <div class="brand-col">
        <div class="brand">RollWith H&amp;D</div>
        <div class="brand-sub">Table de jeu en ligne, entre amis.</div>
      </div>
      {#if error}
        <p class="error">Compte non autorisé ou erreur de connexion : {error}</p>
      {/if}
      <button class="discord-btn" onclick={discordLogin}>
        <svg width="20" height="15" viewBox="0 0 127 96" fill="#FFF3EC" aria-hidden="true">
          <path
            d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"
          />
        </svg>
        Se connecter avec Discord
      </button>
      <div class="invite-note">
        Accès sur invitation. Si tu n'as pas encore de compte, ouvre le lien envoyé par ton MJ.
      </div>
    </div>
  </div>
{/if}

<style>
  .center {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    padding: 24px;
  }
  .card {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    padding: 52px 60px 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 26px;
    max-width: 400px;
    box-shadow: 0 12px 40px var(--shadow-1);
  }
  .logged-card {
    gap: 14px;
  }
  .brand-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
  .brand {
    font-family: var(--font-title);
    font-size: 40px;
    line-height: 1.05;
    color: var(--heading);
  }
  .brand-sub,
  .muted {
    font-size: 16px;
    color: var(--text-2);
  }
  .card-title {
    font-family: var(--font-title);
    font-size: 28px;
    color: var(--heading);
    text-align: center;
  }
  .discord-btn {
    font-family: var(--font-body);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.2px;
    padding: 14px 32px;
    background: var(--accent);
    color: var(--accent-fg);
    border: 2px solid var(--accent-border);
    border-radius: 14px 225px 14px 235px / 225px 14px 245px 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 11px;
    transition: background 0.15s;
  }
  .discord-btn:hover {
    background: var(--accent-hover);
  }
  .invite-note {
    font-size: 13.5px;
    color: var(--text-2);
    text-align: center;
    line-height: 1.45;
    max-width: 260px;
  }
  .cta {
    font-size: 14.5px;
    font-weight: 700;
    padding: 9px 20px;
    background: var(--accent);
    color: var(--accent-fg);
    border: 2px solid var(--accent-border);
    border-radius: 225px 12px 220px 12px / 12px 200px 12px 255px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .cta:hover {
    background: var(--accent-hover);
    color: var(--accent-fg);
  }
  .error {
    font-size: 13.5px;
    color: var(--accent-text);
    text-align: center;
    line-height: 1.45;
  }
</style>
