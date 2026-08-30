<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type CampaignSummary } from '$lib/api';
  import { auth, type Session } from '$lib/auth-client';
  import Button from '$lib/ds/Button.svelte';
  import SketchyInput from '$lib/ds/SketchyInput.svelte';
  import EncreSelector from '$lib/ds/EncreSelector.svelte';

  let session = $state<Session | null>(null);
  let campaigns = $state<CampaignSummary[]>([]);
  let loading = $state(true);

  let createOpen = $state(false);
  let newCampaignName = $state('');
  let joinToken = $state('');
  let actionError = $state('');

  onMount(async () => {
    try {
      session = await auth.getSession();
      if (session) {
        const data = await api.campaigns.list();
        campaigns = data.campaigns;
      }
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Erreur';
    }
    loading = false;
  });

  async function refresh() {
    const data = await api.campaigns.list();
    campaigns = data.campaigns;
  }

  async function createCampaign() {
    if (!newCampaignName.trim()) return;
    actionError = '';
    try {
      await api.campaigns.create(newCampaignName.trim());
      newCampaignName = '';
      createOpen = false;
      await refresh();
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Erreur';
    }
  }

  async function joinCampaign() {
    if (!joinToken.trim()) return;
    actionError = '';
    try {
      await api.campaigns.join(joinToken.trim());
      joinToken = '';
      await refresh();
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Erreur';
    }
  }

  function initials(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  let inviteCampaignId = $state<string | null>(null);
  let inviteLink = $state('');
  let inviteError = $state('');
  let inviteCopied = $state(false);
  let inviteUses = $state(-1);
  let inviteExpires = $state('');

  async function openInvite(id: string) {
    if (inviteCampaignId === id) {
      inviteCampaignId = null;
      return;
    }
    inviteCampaignId = id;
    inviteLink = '';
    inviteError = '';
    inviteCopied = false;
    try {
      const res = await api.campaigns.createInvitation(id);
      inviteLink = `${location.origin}/join/${res.token}`;
      inviteUses = res.usesLeft;
      inviteExpires = res.expiresAt;
    } catch (e) {
      inviteError = e instanceof Error ? e.message : 'Invitation impossible';
    }
  }

  function inviteHint(): string {
    const uses = inviteUses === -1 ? 'Utilisations illimitées' : `${inviteUses} utilisation${inviteUses > 1 ? 's' : ''}`;
    const exp = inviteExpires
      ? new Date(inviteExpires).toLocaleDateString('fr', { day: 'numeric', month: 'long' })
      : '';
    return `${uses}${exp ? ` · expire le ${exp}` : ''}.`;
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      inviteCopied = true;
    } catch {
      /* clipboard indisponible : le lien reste sélectionnable */
    }
  }
</script>

{#if loading}
  <div class="center-page">
    <p class="muted">…</p>
  </div>
{:else if !session}
  <div class="center-page">
    <div class="hero-card">
      <div class="brand-hero">RollWith H&amp;D</div>
      <p class="muted">Connectez-vous pour accéder à vos campagnes.</p>
      <a href="/login" class="cta">Se connecter</a>
    </div>
  </div>
{:else}
  <div class="dash">
    <header class="dash-header">
      <div class="brand">RollWith H&amp;D</div>
      <div class="grow"></div>
      <EncreSelector />
      <div class="v-sep"></div>
      <div class="user-block">
        <div class="avatar">{initials(session.user.name)}</div>
        <div class="user-col">
          <span class="user-name">{session.user.name}</span>
          <button class="link-btn" onclick={() => auth.signOut()}>Déconnexion</button>
        </div>
      </div>
    </header>

    <main class="dash-main">
      <div class="dash-col">
        <div class="page-title">Mes campagnes</div>

        <div class="campaign-grid">
          {#each campaigns as c, i (c.id)}
            <div class="campaign-card" style="border-radius: {i % 2 ? 'var(--sketchy-2)' : 'var(--sketchy-1)'};">
              <div class="campaign-top">
                <div class="campaign-name-col">
                  <div class="campaign-name">{c.name}</div>
                  <div class="campaign-meta">
                    {c.role === 'mj' ? 'Vous êtes MJ' : 'Vous êtes joueur'}
                    {#if c.isOwner} · campagne créée par vous{/if}
                  </div>
                </div>
                <span class="role-badge {c.role === 'mj' ? 'role-mj' : 'role-player'}">
                  {c.role === 'mj' ? 'MJ' : 'JOUEUR'}
                </span>
              </div>
              <div class="campaign-actions">
                <a href="/campaigns/{c.id}/table" class="cta open-table">Ouvrir la table</a>
                {#if c.role === 'mj'}
                  <button class="invite-link" onclick={() => openInvite(c.id)}>
                    {inviteCampaignId === c.id ? 'Fermer' : "Inviter un joueur"}
                  </button>
                {/if}
              </div>
              {#if inviteCampaignId === c.id}
                <div class="invite-box">
                  {#if inviteError}
                    <span class="error">{inviteError}</span>
                  {:else if inviteLink}
                    <input class="invite-input" readonly value={inviteLink} onclick={(e) => (e.currentTarget as HTMLInputElement).select()} />
                    <button class="copy-btn" onclick={copyInvite}>{inviteCopied ? 'Copié' : "Copier"}</button>
                    <span class="invite-hint">{inviteHint()}</span>
                  {:else}
                    <span class="invite-hint">Création du lien…</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}

          <button class="create-tile" onclick={() => (createOpen = true)}>
            <span class="create-title">+ Créer une campagne</span>
            <span class="create-sub">tu en deviendras le MJ</span>
          </button>
        </div>

        {#if actionError}
          <p class="error">{actionError}</p>
        {/if}

        <div class="join-row">
          <span class="join-label">Rejoindre avec un lien reçu ? Collez le token d'invitation :</span>
          <SketchyInput
            bind:value={joinToken}
            placeholder="Token d'invitation"
            onkeydown={(e) => e.key === 'Enter' && joinCampaign()}
            class="join-input"
          />
          <Button variant="dashed" onclick={joinCampaign}>Rejoindre</Button>
        </div>
        <div class="foot-note">Pour rejoindre une campagne, ouvrez aussi le lien d'invitation envoyé par votre MJ.</div>
      </div>
    </main>
  </div>

  {#if createOpen}
    <div
      class="overlay"
      role="presentation"
      onclick={() => (createOpen = false)}
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (createOpen = false)}
      >
        <div class="modal-head">
          <div class="modal-title">Nouvelle campagne</div>
          <div class="modal-sub">Système : Héros &amp; Dragons</div>
        </div>
        <label class="modal-field">
          <span class="field-label">Nom de la campagne</span>
          <input
            class="field-input"
            placeholder="ex. Les Tombeaux d'Hiver"
            bind:value={newCampaignName}
            onkeydown={(e) => e.key === 'Enter' && createCampaign()}
          />
        </label>
        <div class="modal-actions">
          <button class="cancel-btn" onclick={() => (createOpen = false)}>Annuler</button>
          <Button variant="primary" onclick={createCampaign}>Créer la campagne</Button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .center-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .hero-card {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: var(--sketchy-1);
    padding: 52px 60px 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    text-align: center;
    box-shadow: 0 12px 40px var(--shadow-1);
  }
  .brand-hero {
    font-family: var(--font-title);
    font-size: 40px;
    line-height: 1.05;
    color: var(--heading);
  }
  .muted {
    font-size: 16px;
    color: var(--text-2);
  }

  .dash {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .dash-header {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 14px 28px;
    border-bottom: 2px solid var(--border-soft);
    flex: none;
  }
  .brand {
    font-family: var(--font-title);
    font-size: 20px;
    color: var(--heading);
  }
  .grow {
    flex: 1;
  }
  .v-sep {
    width: 1px;
    height: 22px;
    background: var(--border-soft);
  }
  .user-block {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    width: 32px;
    height: 32px;
    border: 2px solid var(--border);
    border-radius: 52% 48% 46% 54% / 50% 54% 46% 50%;
    background: var(--panel);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-title);
    font-size: 15px;
    color: var(--accent-text);
  }
  .user-col {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .user-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }
  .link-btn {
    font-family: var(--font-body);
    font-size: 12.5px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: var(--accent-text);
    text-decoration: none;
  }
  .link-btn:hover {
    color: var(--accent-link-hover);
  }

  .dash-main {
    flex: 1;
    padding: 44px 0 60px;
    display: flex;
    justify-content: center;
  }
  .dash-col {
    width: 860px;
    max-width: calc(100vw - 60px);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .page-title {
    font-family: var(--font-title);
    font-size: 30px;
    color: var(--heading);
  }

  .campaign-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    align-items: stretch;
  }
  .campaign-card {
    border: 2px solid var(--border);
    background: var(--panel);
    padding: 22px 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .campaign-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .campaign-name-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .campaign-name {
    font-family: var(--font-title);
    font-size: 21px;
    line-height: 1.15;
    color: var(--heading);
  }
  .campaign-meta {
    font-size: 13.5px;
    color: var(--text-2);
  }
  .role-badge {
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 3px 10px;
    border: 1.5px solid var(--border);
    border-radius: var(--sketchy-badge);
    color: var(--text-2);
    white-space: nowrap;
  }
  .role-mj {
    border-color: var(--accent-border);
    color: var(--accent-text);
  }
  .campaign-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: auto;
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
    display: inline-block;
    transition: background 0.15s;
  }
  .cta:hover {
    background: var(--accent-hover);
    color: var(--accent-fg);
  }

  .create-tile {
    font-family: var(--font-body);
    border: 2px dashed var(--border);
    border-radius: 18px 5px 20px 6px / 6px 20px 5px 18px;
    background: transparent;
    padding: 26px 22px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    cursor: pointer;
    min-height: 140px;
    color: var(--text-2);
    transition: border-color 0.15s, color 0.15s;
  }
  .create-tile:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .create-title {
    font-size: 17px;
    font-weight: 700;
  }
  .create-sub {
    font-size: 13px;
  }

  .error {
    font-size: 14px;
    color: var(--accent-text);
  }

  .invite-link {
    font-family: var(--font-body);
    font-size: 14px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--accent-text);
    text-decoration: none;
  }
  .invite-link:hover {
    color: var(--accent-link-hover);
  }
  .invite-box {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    border-top: 1px dashed var(--border-soft);
    padding-top: 10px;
  }
  .invite-input {
    flex: 1;
    min-width: 200px;
    font-family: var(--font-body);
    font-size: 12.5px;
    padding: 6px 9px;
    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
  }
  .copy-btn {
    font-family: var(--font-body);
    font-size: 12.5px;
    font-weight: 700;
    padding: 5px 12px;
    background: var(--selected);
    border: 2px solid var(--border);
    border-radius: 10px 3px 12px 3px;
    color: var(--heading);
    cursor: pointer;
  }
  .copy-btn:hover {
    background: var(--accent);
    border-color: var(--accent-border);
  }
  .invite-hint {
    font-size: 11.5px;
    color: var(--text-3);
    flex-basis: 100%;
  }

  .join-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 12px 16px;
  }
  .join-label {
    font-size: 13.5px;
    color: var(--text-2);
  }
  :global(.join-input) {
    flex: 1;
    min-width: 200px;
  }
  .foot-note {
    font-size: 13px;
    color: var(--text-3);
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .modal {
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 15px 255px 15px 225px / 225px 15px 255px 15px;
    padding: 32px 38px 28px;
    width: 400px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    box-shadow: 0 16px 50px var(--shadow-2);
  }
  .modal-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .modal-title {
    font-family: var(--font-title);
    font-size: 24px;
    color: var(--heading);
  }
  .modal-sub {
    font-size: 14px;
    color: var(--text-2);
  }
  .modal-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
  }
  .field-input {
    font-family: var(--font-body);
    font-size: 16px;
    padding: 10px 13px;
    border: 2px solid var(--border);
    border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }
  .modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 16px;
  }
  .cancel-btn {
    font-family: var(--font-body);
    font-size: 14.5px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-2);
  }
  .cancel-btn:hover {
    color: var(--text);
  }
</style>
