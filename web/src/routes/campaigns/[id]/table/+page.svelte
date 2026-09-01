<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { wsClient, type TableStore } from '$lib/ws';
  import { api, type MapSummary } from '$lib/api';
  import type { JournalEntry } from '@rollwith/shared/protocol';
  import { auth } from '$lib/auth-client';
  import Button from '$lib/ds/Button.svelte';
  import SketchyInput from '$lib/ds/SketchyInput.svelte';
  import DiceOverlay from '$lib/components/DiceOverlay.svelte';
  import MapManager from '$lib/components/MapManager.svelte';
  import { portraitUrl } from '$lib/portraits';
  import NpcLibrary from '$lib/components/NpcLibrary.svelte';

  let { params } = $props();
  let campaignId = params.id;

  const CONDITIONS = [
    'À terre', 'Agrippé', 'Assourdi', 'Aveuglé', 'Charmé', 'Effrayé', 'Empoisonné',
    'Entravé', 'Étourdi', 'Inconscient', 'Invisible', 'Paralysé', 'Pétrifié',
  ];

  let store = $state<TableStore>({
    connected: false,
    state: { mode: 'exploration', mapId: null, tokens: {}, markers: [], fog: {}, combat: null },
    characters: [],
    settings: { pnjPvVisible: false, sheetsLocked: false, diceDuration: 1200, tokenSize: 44 },
    journal: [],
    presence: [],
    pings: [],
    diceAnim: null,
    error: null,
  });

  let chatText = $state('');
  let journalEl = $state<HTMLDivElement | null>(null);
  let stickToBottom = true;
  let lastJournalTab = 'journal';

  function onJournalScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  $effect(() => {
    void store.journal.length;
    const tabChanged = activeTab !== lastJournalTab;
    lastJournalTab = activeTab;
    if (activeTab !== 'journal' || !journalEl) return;
    const el = journalEl;
    if (tabChanged) stickToBottom = true;
    if (stickToBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });
  let toast = $state('');
  let olderEntries = $state<JournalEntry[]>([]);
  let hasMoreOlder = $state(true);
  let loadingOlder = $state(false);

  async function loadOlder() {
    if (loadingOlder) return;
    const before = olderEntries[0]?.id ?? store.journal[0]?.id;
    loadingOlder = true;
    const prevHeight = journalEl?.scrollHeight ?? 0;
    const prevTop = journalEl?.scrollTop ?? 0;
    try {
      const res = await api.campaigns.journalPage(campaignId, before);
      olderEntries = [...res.entries, ...olderEntries];
      hasMoreOlder = res.hasMore;
      stickToBottom = false;
      requestAnimationFrame(() => {
        if (journalEl) journalEl.scrollTop = prevTop + (journalEl.scrollHeight - prevHeight);
      });
    } catch {
      /* ignore */
    }
    loadingOlder = false;
  }
  let activeTab = $state<'journal' | 'dice' | 'inv'>('journal');
  let diceMod = $state(0);
  let diceHistory: { id: number; label: string }[] = $state([]);
  let diceHistSeq = 0;
  let campaignName = $state('');
  let session = $state<{ user: { id: string; name: string } } | null>(null);
  let isMj = $state(false);
  let unsub: (() => void) | null = null;

  // ── Carte ────────────────────────────────────────────────────
  let maps = $state<MapSummary[]>([]);
  let mapContainer = $state<HTMLDivElement | null>(null);
  let fogCanvas = $state<HTMLCanvasElement | null>(null);
  let tool = $state<'move' | 'pnj' | 'marker' | 'fog'>('move');
  let markerText = $state('repère');
  let npcName = $state('PNJ');
  let npcPv = $state(7);
  let npcCa = $state(13);
  let npcInit = $state(0);
  let npcSaveAsTemplate = $state(false);
  let dragOverride = $state<Record<string, { x: number; y: number }>>({});
  let markerDragOverride = $state<Record<string, { x: number; y: number }>>({});

  let drag: { id: string; kind: 'token' | 'marker'; moved: boolean } | null = null;
  let fogErasing = false;
  let skipNextClick = false;
  let lastFogPoint: { x: number; y: number } | null = null;
  const FOG_SEND_MIN_DIST = 2.5;

  function sendFogReveal(p: { x: number; y: number }) {
    if (lastFogPoint && Math.hypot(p.x - lastFogPoint.x, p.y - lastFogPoint.y) < FOG_SEND_MIN_DIST) {
      return;
    }
    lastFogPoint = p;
    wsClient.send({ type: 'fog.reveal', ...p });
  }

  const activeMap = $derived(maps.find((m) => m.id === store.state.mapId) ?? null);
  const activeFog = $derived(store.state.mapId ? store.state.fog[store.state.mapId] : undefined);
  const fogOn = $derived(!!activeFog?.on);

  const displayTokens = $derived.by(() => {
    const out: Record<string, { charId: string; x: number; y: number }> = {
      ...store.state.tokens,
    };
    for (const [id, pos] of Object.entries(dragOverride)) {
      if (out[id]) out[id] = { ...out[id], ...pos };
    }
    return out;
  });

  const displayMarkers = $derived(
    store.state.markers.map((m) => (markerDragOverride[m.id] ? { ...m, ...markerDragOverride[m.id] } : m)),
  );

  function charById(id: string) {
    return store.characters.find((c) => c.id === id) ?? null;
  }

  function canMoveToken(charId: string): boolean {
    if (isMj) return true;
    const c = charById(charId);
    return !!c && c.ownerId === session?.user.id;
  }

  const pjCards = $derived(store.characters.filter((c) => c.kind === 'pj' && c.active));
  const pnjCards = $derived(store.characters.filter((c) => c.kind === 'pnj'));
  const activeCharId = $derived(
    store.state.combat?.phase === 'run' && store.state.combat.order
      ? store.state.combat.order[store.state.combat.turn % store.state.combat.order.length]
      : null,
  );

  const myCharId = $derived(
    store.characters.find((c) => c.kind === 'pj' && c.ownerId === session?.user.id)?.id ?? null,
  );

  function canRollInitiative(charId: string): boolean {
    return isMj || charId === myCharId;
  }

  const initChips = $derived.by(() => {
    const combat = store.state.combat;
    if (!combat) return [];
    const ids = combat.phase === 'run' && combat.order ? combat.order : combat.participants;
    return ids
      .map((id) => ({ id, c: charById(id), score: combat.scores[id] }))
      .filter((e) => e.c);
  });

  const pendingInit = $derived.by(() => {
    const combat = store.state.combat;
    if (!combat || combat.phase !== 'init') return [];
    return combat.participants.filter((id) => combat.scores[id] === undefined);
  });

  function rollInitiative(charId: string) {
    wsClient.send({ type: 'initiative.roll', charId });
  }

  function combatNext() {
    wsClient.send({ type: 'combat.next' });
  }

  onMount(async () => {
    session = await auth.getSession();
    try {
      const detail = await api.campaigns.detail(campaignId);
      campaignName = detail.name;
      isMj = detail.role === 'mj';
    } catch {
      /* ignore */
    }
    await refreshMaps();

    wsClient.connect(campaignId);
    unsub = wsClient.subscribe((s) => {
      store = { ...s };
    });
  });

  onDestroy(() => {
    if (unsub) unsub();
    wsClient.disconnect();
  });

  async function refreshMaps() {
    try {
      const res = await api.maps.list(campaignId);
      maps = res.maps;
    } catch {
      /* ignore */
    }
  }

  function sendChat() {
    if (!chatText.trim()) return;
    wsClient.send({ type: 'chat.say', text: chatText.trim() });
    chatText = '';
  }

  function quickRoll(sides: number) {
    wsClient.send({ type: 'dice.roll', sides, n: 1, mod: diceMod });
    diceHistory = [
      { id: ++diceHistSeq, label: `1d${sides}${diceMod >= 0 ? '+' : ''}${diceMod}` },
      ...diceHistory,
    ].slice(0, 6);
  }

  function setMode(mode: 'exploration' | 'combat') {
    if (!isMj) return;
    wsClient.send({ type: 'mode.set', mode });
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function pvDelta(charId: string, delta: number) {
    wsClient.send({ type: 'char.hp', charId, delta });
  }

  function addCondition(charId: string, e: Event) {
    const select = e.target as HTMLSelectElement;
    const cond = select.value;
    if (!cond) return;
    wsClient.send({ type: 'char.condition', charId, cond, on: true });
    select.value = '';
  }

  function removeCondition(charId: string, cond: string) {
    if (!isMj) return;
    wsClient.send({ type: 'char.condition', charId, cond, on: false });
  }

  function removeNpc(charId: string) {
    wsClient.send({ type: 'npc.remove', charId });
  }

  function hasToken(charId: string): boolean {
    return !!store.state.tokens[charId];
  }

  function placeOnMap(charId: string) {
    const n = Object.keys(store.state.tokens).length;
    wsClient.send({ type: 'token.put', charId, x: 46 + ((n % 5) - 2) * 4, y: 50 });
  }

  // ── Carte : sélection / import ──────────────────────────────

  function selectMap(mapId: string) {
    if (!isMj) return;
    wsClient.send({ type: 'map.select', mapId });
  }

  // ── Carte : coordonnées & interactions ──────────────────────

  function mapXY(e: PointerEvent | MouseEvent): { x: number; y: number } {
    if (!mapContainer) return { x: 50, y: 50 };
    const r = mapContainer.getBoundingClientRect();
    return {
      x: Math.min(98, Math.max(2, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(97, Math.max(3, ((e.clientY - r.top) / r.height) * 100)),
    };
  }

  function toolSelect(t: 'move' | 'pnj' | 'marker' | 'fog') {
    pendingPlace = null;
    tool = tool === t ? 'move' : t;
  }

  function tokenPointerDown(charId: string, e: PointerEvent) {
    if (isMj && tool === 'fog') return;
    if (!canMoveToken(charId)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag = { id: charId, kind: 'token', moved: false };
    skipNextClick = true;
  }

  function markerPointerDown(id: string, e: PointerEvent) {
    if (!isMj) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag = { id, kind: 'marker', moved: false };
    skipNextClick = true;
  }

  function onMapPointerMove(e: PointerEvent) {
    if (fogErasing) {
      if (fogOn) sendFogReveal(mapXY(e));
      return;
    }
    if (!drag) return;
    drag.moved = true;
    const { x, y } = mapXY(e);
    if (drag.kind === 'token') {
      dragOverride = { ...dragOverride, [drag.id]: { x, y } };
      wsClient.send({ type: 'token.move', tokenId: drag.id, x, y });
    } else {
      markerDragOverride = { ...markerDragOverride, [drag.id]: { x, y } };
      wsClient.send({ type: 'marker.move', id: drag.id, x, y });
    }
  }

  function onMapPointerUp() {
    fogErasing = false;
    lastFogPoint = null;
    if (drag) {
      const { id, kind } = drag;
      drag = null;
      setTimeout(() => {
        if (kind === 'token') {
          const { [id]: _drop, ...rest } = dragOverride;
          dragOverride = rest;
        } else {
          const { [id]: _drop, ...rest } = markerDragOverride;
          markerDragOverride = rest;
        }
      }, 50);
    }
  }

  function onMapPointerDown(e: PointerEvent) {
    if (!isMj || tool !== 'fog') return;
    if (!fogOn) return;
    fogErasing = true;
    lastFogPoint = null;
    sendFogReveal(mapXY(e));
  }

  function onMapClick(e: MouseEvent) {
    if (skipNextClick) {
      skipNextClick = false;
      return;
    }
    if (!isMj) return;
    const { x, y } = mapXY(e);
    if (pendingPlace) {
      wsClient.send({
        type: 'npc.addFromTemplate',
        templateId: pendingPlace.templateId,
        x,
        y,
        count: pendingPlace.count,
      });
      pendingPlace = null;
      return;
    }
    if (tool === 'move' || tool === 'fog') return;
    if (tool === 'pnj') {
      wsClient.send({
        type: 'npc.add',
        name: npcName.trim() || 'PNJ',
        pv: npcPv,
        ca: npcCa,
        init: npcInit,
        x,
        y,
        saveAsTemplate: npcSaveAsTemplate,
      });
    } else if (tool === 'marker') {
      wsClient.send({ type: 'marker.set', x, y, text: markerText.trim() || 'repère' });
    }
  }

  function onMapDblClick(e: MouseEvent) {
    const { x, y } = mapXY(e);
    wsClient.send({ type: 'ping', x, y });
  }

  function markerRemove(id: string, e: Event) {
    e.stopPropagation();
    wsClient.send({ type: 'marker.remove', id });
  }

  function clearMarkers() {
    wsClient.send({ type: 'marker.clear' });
  }

  function fogToggle() {
    if (!fogOn) {
      wsClient.send({ type: 'fog.enable' });
      tool = 'fog';
    } else {
      tool = tool === 'fog' ? 'move' : 'fog';
    }
  }

  function fogCover() {
    wsClient.send({ type: 'fog.cover' });
  }

  function fogDisable() {
    wsClient.send({ type: 'fog.disable' });
    if (tool === 'fog') tool = 'move';
  }

  // ── Brouillard : rendu canvas ────────────────────────────────
  // Le tableau de révélations ne fait que croître pendant une session ; on
  // repeint le fond (aplat + hachures) uniquement quand c'est nécessaire
  // (carte/redimensionnement/reset) et on ne découpe ensuite que les NOUVEAUX
  // points, pour un coût de dessin constant par révélation plutôt que
  // proportionnel à l'historique complet.
  let fogDrawnCanvas: HTMLCanvasElement | null = null;
  let fogDrawnMapId: string | null = null;
  let fogDrawnCount = 0;

  function cutFogHole(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const px = (x / 100) * w;
    const py = (y / 100) * h;
    const rad = 68;
    const g = ctx.createRadialGradient(px, py, rad * 0.35, px, py, rad);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFogBase(w: number, h: number) {
    if (!fogCanvas) return;
    const ctx = fogCanvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#3B372E';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(251,248,240,.05)';
    ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    if (activeFog?.on) {
      ctx.globalCompositeOperation = 'destination-out';
      for (const p of activeFog.reveals) cutFogHole(ctx, p.x, p.y, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    fogDrawnCanvas = fogCanvas;
    fogDrawnMapId = store.state.mapId;
    fogDrawnCount = activeFog?.reveals.length ?? 0;
  }

  function drawFog() {
    if (!fogCanvas || !mapContainer) return;
    const r = mapContainer.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width));
    const h = Math.max(2, Math.round(r.height));
    const resized = fogCanvas.width !== w || fogCanvas.height !== h;
    if (resized) {
      fogCanvas.width = w;
      fogCanvas.height = h;
    }

    const reveals = activeFog?.reveals ?? [];
    const sameCanvas = fogDrawnCanvas === fogCanvas;
    const sameMap = sameCanvas && fogDrawnMapId === store.state.mapId;
    const grew = sameMap && reveals.length >= fogDrawnCount;

    if (resized || !sameMap || !grew) {
      drawFogBase(w, h);
      return;
    }
    if (reveals.length === fogDrawnCount) return;

    const ctx = fogCanvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'destination-out';
    for (const p of reveals.slice(fogDrawnCount)) {
      cutFogHole(ctx, p.x, p.y, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
    fogDrawnCount = reveals.length;
  }

  $effect(() => {
    // Re-run whenever fog state or the container changes.
    void activeFog;
    void fogOn;
    void store.state.mapId;
    if (fogCanvas && mapContainer) drawFog();
  });

  onMount(() => {
    const ro = new ResizeObserver(() => drawFog());
    if (mapContainer) ro.observe(mapContainer);
    return () => ro.disconnect();
  });

  let lastShownError: string | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const err = store.error;
    if (err === lastShownError) return;
    lastShownError = err;
    if (!err) return;
    toast = err;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = '';
      wsClient.clearError();
    }, 4000);
  });

  const diceTypes = [4, 6, 8, 10, 12, 20];

  // ── Pose depuis la bibliothèque de PNJ ───────────────────────
  let pendingPlace = $state<{ templateId: string; name: string; count: number } | null>(null);

  // ── Menu contextuel sur les pions (MJ) ───────────────────────
  let ctxMenu = $state<{ x: number; y: number; charId: string; kind: 'pj' | 'pnj' } | null>(null);
  let ctxEl: HTMLDivElement | null = null;

  function onTokenContextMenu(e: MouseEvent, charId: string, kind: 'pj' | 'pnj') {
    if (!isMj) return;
    e.preventDefault();
    e.stopPropagation();
    ctxMenu = { x: e.clientX, y: e.clientY, charId, kind };
  }

  function ctxDuplicate() {
    if (ctxMenu) wsClient.send({ type: 'npc.duplicate', charId: ctxMenu.charId });
    ctxMenu = null;
  }
  function ctxRemoveToken() {
    if (ctxMenu) wsClient.send({ type: 'token.remove', charId: ctxMenu.charId });
    ctxMenu = null;
  }
  function ctxDeleteNpc() {
    if (ctxMenu) wsClient.send({ type: 'npc.remove', charId: ctxMenu.charId });
    ctxMenu = null;
  }

  $effect(() => {
    if (!ctxMenu) return;
    const close = (e: Event) => {
      if (ctxEl && e.target instanceof Node && ctxEl.contains(e.target)) return;
      ctxMenu = null;
    };
    // en capture : la fermeture précède le pointerdown du drag sur un autre pion
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('contextmenu', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('contextmenu', close, true);
    };
  });

  // ── Raccourcis clavier ───────────────────────────────────────
  function focusChat() {
    activeTab = 'journal';
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.chat-input')?.focus();
    });
  }

  function onWindowKeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    ) {
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      ctxMenu = null;
      pendingPlace = null;
      if (isMj) tool = 'move';
      return;
    }
    if (k === '/') {
      e.preventDefault();
      focusChat();
      return;
    }
    if (!isMj) return;
    switch (k) {
      case 'v':
        tool = 'move';
        break;
      case 'p':
        toolSelect('pnj');
        break;
      case 'r':
        toolSelect('marker');
        break;
      case 'b':
        fogToggle();
        break;
      case '1':
        quickRoll(4);
        break;
      case '2':
        quickRoll(6);
        break;
      case '3':
        quickRoll(8);
        break;
      case '4':
        quickRoll(10);
        break;
      case '5':
        quickRoll(12);
        break;
      case '6':
        quickRoll(20);
        break;
    }
  }

  $effect(() => {
    window.addEventListener('keydown', onWindowKeydown);
    return () => window.removeEventListener('keydown', onWindowKeydown);
  });

  function tokenTitle(c: { name: string; ca: number; pv: number | null; pvMax: number | null }): string {
    return isMj ? `${c.name} — CA ${c.ca} · PV ${c.pv ?? '–'}/${c.pvMax ?? '–'}` : c.name;
  }
</script>

<div class="table-screen">
  <!-- Barre de session -->
  <header class="session-bar">
    <div class="session-title">
      <span class="campaign-name">{campaignName || '…'}</span>
      <span class="session-hint">Séance en cours · double-clic sur la carte : ping</span>
    </div>
    <div class="mode-toggle">
      <button class="mode-btn {store.state.mode === 'exploration' ? 'exp-active' : ''}" onclick={() => setMode('exploration')}>Exploration</button>
      <button class="mode-btn {store.state.mode === 'combat' ? 'combat-active' : ''}" onclick={() => setMode('combat')}>Combat</button>
    </div>
    <a href="/compendium" class="compendium-link">Compendium</a>
    <div class="grow"></div>
    <div class="quick-dice">
      <span class="qd-label">Lancer</span>
      {#each diceTypes as d (d)}
        {#if d === 20}
          <button class="qd-btn d20" onclick={() => quickRoll(d)}>d20</button>
        {:else}
          <button class="qd-btn" onclick={() => quickRoll(d)}>d{d}</button>
        {/if}
      {/each}
    </div>
    <div class="v-sep"></div>
    <div class="presence">
      {#each store.presence as p, i (p.userId + ':' + i)}
        <span class="presence-chip" style="border-color: {p.color};">{p.name}</span>
      {/each}
    </div>
  </header>

  <!-- Corps: compagnie | carte | panneau -->
  <div class="table-body">
    <!-- Compagnie -->
    <aside class="compagnie">
      <div class="compagnie-title">La compagnie</div>
      {#if pjCards.length === 0}
        <div class="compagnie-empty">Aucun personnage joueur pour l'instant.</div>
      {/if}
      {#each pjCards as c, i (c.id)}
        <div class="char-card pj-card {activeCharId === c.id ? 'is-turn' : ''}" style="border-radius: {i % 2 ? 'var(--sketchy-4)' : 'var(--sketchy-3)'};">
          {#if activeCharId === c.id}
            <div class="turn-flag">à lui de jouer</div>
          {/if}
          <div class="card-row">
            <span class="card-id">
              {#if portraitUrl(c.portrait)}
                <img class="pj-portrait" src={portraitUrl(c.portrait)} alt="" draggable="false" />
              {/if}
              <span class="card-name">{c.name}</span>
            </span>
            <span class="card-ca">CA {c.ca}</span>
          </div>
          <div class="card-row">
            <div class="card-sub">{c.sub}</div>
            <a href={`/characters/${c.id}`} class="sheet-link">Feuille</a>
          </div>
          <div class="hp-row">
            <div class="hp-bar-bg"><div class="hp-bar-fill" style="width: {c.pvMax && c.pvMax > 0 ? Math.max(0, Math.min(100, ((c.pv ?? 0) / c.pvMax) * 100)) : 0}%;"></div></div>
            {#if isMj || c.ownerId === session?.user.id}
              <button class="hp-btn minus" onclick={() => pvDelta(c.id, -1)}>−</button>
              <button class="hp-btn plus" onclick={() => pvDelta(c.id, 1)}>+</button>
            {/if}
          </div>
          <div class="card-row stats">
            <span>PV {c.pv ?? "–"}/{c.pvMax ?? "–"}</span><span>Init +{c.initiativeBonus}</span>
          </div>
          {#if isMj && activeMap && !hasToken(c.id)}
            <button class="place-btn" onclick={() => placeOnMap(c.id)}>Placer sur la carte</button>
          {/if}
          <div class="cond-row">
            {#each c.conditions as cond (cond)}
              <span
                class="cond-chip"
                role={isMj ? 'button' : undefined}
                tabindex={isMj ? 0 : undefined}
                title={isMj ? 'Cliquez pour retirer' : cond}
                onclick={() => removeCondition(c.id, cond)}
              >{cond}</span>
            {/each}
            {#if isMj}
              <select class="cond-select" value="" onchange={(e) => addCondition(c.id, e)}>
                <option value="">+ état</option>
                {#each CONDITIONS as cond (cond)}
                  <option>{cond}</option>
                {/each}
              </select>
            {/if}
          </div>
        </div>
      {/each}

      <div class="compagnie-title pnj-title">PNJ présents</div>
      {#each pnjCards as c, i (c.id)}
        <div class="char-card pnj-card {activeCharId === c.id ? 'is-turn' : ''}" style="border-radius: {i % 2 ? 'var(--sketchy-3)' : 'var(--sketchy-5)'};">
          {#if activeCharId === c.id}
            <div class="turn-flag">à lui</div>
          {/if}
          <div class="card-row">
            <span class="card-name pnj-name">{c.name}</span>
            <span class="card-row-right">
              <span class="card-ca">CA {c.ca}</span>
              {#if isMj}
                <button class="model-btn" title="Enregistrer comme modèle réutilisable" onclick={() => wsClient.send({ type: 'npc.saveAsTemplate', charId: c.id })}>modèle</button>
                <button class="del-btn" title="Retirer ce PNJ" onclick={() => removeNpc(c.id)}>✕</button>
              {/if}
            </span>
          </div>
          {#if isMj || store.settings.pnjPvVisible}
            <div class="hp-row">
              <div class="hp-bar-bg small"><div class="hp-bar-fill" style="width: {c.pvMax && c.pvMax > 0 ? Math.max(0, Math.min(100, ((c.pv ?? 0) / c.pvMax) * 100)) : 0}%;"></div></div>
              {#if isMj}
                <button class="hp-btn minus" onclick={() => pvDelta(c.id, -1)}>−</button>
                <button class="hp-btn plus" onclick={() => pvDelta(c.id, 1)}>+</button>
              {/if}
            </div>
            <div class="card-row stats">
              <span>PV {c.pv ?? "–"}/{c.pvMax ?? "–"}</span><span>Init +{c.initiativeBonus}</span>
            </div>
          {/if}
          {#if isMj && activeMap && !hasToken(c.id)}
            <button class="place-btn" onclick={() => placeOnMap(c.id)}>Placer sur la carte</button>
          {/if}
          <div class="cond-row">
            {#each c.conditions as cond (cond)}
              <span class="cond-chip" title={cond}>{cond}</span>
            {/each}
            {#if isMj}
              <select class="cond-select" value="" onchange={(e) => addCondition(c.id, e)}>
                <option value="">+ état</option>
                {#each CONDITIONS as cond (cond)}
                  <option>{cond}</option>
                {/each}
              </select>
            {/if}
          </div>
        </div>
      {/each}
    </aside>

    <!-- Carte -->
    <main class="map-area">
      {#if store.state.mode === 'combat' && store.state.combat}
        <div class="combat-bandeau">
          <span class="combat-title">Initiative</span>
          {#each initChips as e, i (e.id)}
            <span class="init-chip {activeCharId === e.id ? 'active' : ''}" style="border-radius: {i % 2 ? '3px 12px 3px 10px' : '10px 3px 12px 3px'};">
              {e.score !== undefined ? `${e.score} · ` : ''}{e.c?.name}
            </span>
          {/each}
          {#if store.state.combat.phase === 'init'}
            {#each pendingInit as pid (pid)}
              {@const pc = charById(pid)}
              {#if pc}
                <button
                  class="roll-init-btn {canRollInitiative(pid) ? '' : 'waiting'}"
                  disabled={!canRollInitiative(pid)}
                  onclick={() => rollInitiative(pid)}
                >{canRollInitiative(pid) ? `${pc.name} lance son initiative` : `${pc.name} n'a pas encore lancé…`}</button>
              {/if}
            {/each}
          {/if}
          <div class="spacer"></div>
          {#if store.state.combat.phase === 'run'}
            <span class="round-label">round {store.state.combat.round}</span>
          {:else}
            <span class="round-label">à vos d20</span>
          {/if}
          {#if isMj && store.state.combat.phase === 'run'}
            <button class="next-turn-btn" onclick={combatNext}>Tour suivant →</button>
          {/if}
        </div>
      {:else}
        <div class="map-header">
          <span class="map-name">{activeMap?.name ?? 'Aucune carte sélectionnée'}</span>
          <span class="explore-label">Mode exploration — déplacez-vous librement</span>
          <div class="spacer"></div>
          <span class="scale-label">1 case ≈ 1,50 m</span>
        </div>
      {/if}

      {#if isMj}
        <div class="mj-toolbar">
          <span class="mj-label">Outils du MJ</span>
          <MapManager {campaignId} {maps} activeMapId={store.state.mapId} onPick={selectMap} onChanged={refreshMaps} />
          <NpcLibrary {campaignId} onPlace={(tpl, count) => {
            tool = 'move';
            pendingPlace = { templateId: tpl.id, name: tpl.name, count };
          }} />
          <div class="tsep"></div>
          <button class="tool-btn {tool === 'move' ? 'active' : ''}" title="Raccourci : V" onclick={() => toolSelect('move')}>Déplacer</button>
          <button class="tool-btn {tool === 'pnj' ? 'active' : ''}" title="Raccourci : P" onclick={() => toolSelect('pnj')}>+ PNJ</button>
          {#if tool === 'pnj'}
            <input class="npc-input" bind:value={npcName} placeholder="nom" />
            <input class="npc-input narrow" type="number" bind:value={npcPv} title="PV" />
            <input class="npc-input narrow" type="number" bind:value={npcCa} title="CA" />
            <input class="npc-input narrow" type="number" bind:value={npcInit} title="Init" />
            <button
              class="ghost-btn lib-toggle"
              class:on={npcSaveAsTemplate}
              title="Enregistrer aussi dans la bibliothèque de PNJ"
              onclick={() => (npcSaveAsTemplate = !npcSaveAsTemplate)}
            >→ bibliothèque</button>
          {/if}
          <button class="tool-btn {tool === 'marker' ? 'active' : ''}" title="Raccourci : R" onclick={() => toolSelect('marker')}>Repère</button>
          {#if tool === 'marker'}
            <input class="marker-input" bind:value={markerText} placeholder="texte du repère…" />
          {/if}
          <button class="ghost-btn danger" onclick={clearMarkers}>Effacer les repères</button>
          <div class="tsep"></div>
          <button class="tool-btn {tool === 'fog' ? 'active' : ''}" title="Raccourci : B" onclick={fogToggle}>Brouillard</button>
          {#if fogOn}
            <button class="ghost-btn" onclick={fogCover}>Tout recouvrir</button>
            <button class="ghost-btn danger" onclick={fogDisable}>Dissiper</button>
          {/if}
          {#if pendingPlace}
            <span class="tool-hint">Cliquez sur la carte pour poser {pendingPlace.count > 1 ? `${pendingPlace.count} × ` : ''}{pendingPlace.name} — Échap pour annuler</span>
          {:else if tool === 'pnj' || tool === 'marker'}
            <span class="tool-hint">Cliquez sur la carte pour placer</span>
          {/if}
          {#if tool === 'fog' && fogOn}
            <span class="tool-hint">Glissez sur la carte pour dévoiler — invisible pour les joueurs</span>
          {/if}
        </div>
      {/if}

      <div class="map-frame">
        {#if !activeMap}
          <div class="map-placeholder">
            {#if isMj}Créez ou sélectionnez une carte ci-dessus.{:else}Le MJ n'a pas encore choisi de carte.{/if}
          </div>
        {:else}
          <div
            bind:this={mapContainer}
            class="map-surface"
            class:cursor-fog={isMj && tool === 'fog'}
            class:cursor-place={(isMj && (tool === 'pnj' || tool === 'marker')) || !!pendingPlace}
            onpointerdown={onMapPointerDown}
            onpointermove={onMapPointerMove}
            onpointerup={onMapPointerUp}
            onpointerleave={onMapPointerUp}
            onclick={onMapClick}
            ondblclick={onMapDblClick}
          >
            {#if activeMap.hasImage}
              <img class="map-img" src={api.maps.imageUrl(activeMap.id)} alt="" draggable="false" />
            {:else}
              <div class="map-grid"></div>
            {/if}

            {#if fogOn}
              <canvas bind:this={fogCanvas} class="fog-canvas" style="opacity: {isMj ? 0.45 : 1};"></canvas>
            {/if}

            {#each displayMarkers as m (m.id)}
              <div
                class="marker"
                style="left: {m.x}%; top: {m.y}%;"
                onpointerdown={(e) => markerPointerDown(m.id, e)}
                role={isMj ? 'button' : undefined}
                tabindex={isMj ? 0 : undefined}
              >
                <span class="marker-flag">⚑ {m.text}</span>
                {#if isMj}
                  <span class="marker-remove" onpointerdown={(e) => markerRemove(m.id, e)}>✕</span>
                {/if}
              </div>
            {/each}

            {#each Object.entries(displayTokens) as [tokenId, t] (tokenId)}
              {@const c = charById(t.charId)}
              {#if c}
                {@const pUrl = portraitUrl(c.portrait)}
                <div
                  class="token {c.kind === 'pnj' ? 'token-pnj' : 'token-pj'} {activeCharId === c.id ? 'token-active' : ''} {pUrl ? 'token-portrait' : ''}"
                  style="left: {t.x}%; top: {t.y}%; --token-color: {c.color}; width: {store.settings.tokenSize + (pUrl ? 8 : 0)}px; height: {store.settings.tokenSize + (pUrl ? 8 : 0)}px; font-size: {Math.round(store.settings.tokenSize * 0.42)}px;"
                  title={tokenTitle(c)}
                  onpointerdown={(e) => tokenPointerDown(tokenId, e)}
                  oncontextmenu={(e) => onTokenContextMenu(e, c.id, c.kind)}
                >
                  {#if pUrl}<img class="token-img" src={pUrl} alt="" draggable="false" />{:else}{c.name.slice(0, 1).toUpperCase()}{/if}
                  <span class="token-label">{c.name}</span>
                </div>
              {/if}
            {/each}

            {#each store.pings as p (p.id)}
              <div class="ping" style="left: {p.x}%; top: {p.y}%;"></div>
            {/each}
          </div>
        {/if}
      </div>
    </main>

    <!-- Panneau à onglets -->
    <aside class="panel">
      <div class="tabs">
        <button class="tab {activeTab === 'journal' ? 'active' : ''}" onclick={() => (activeTab = 'journal')}>Journal</button>
        <button class="tab {activeTab === 'dice' ? 'active' : ''}" onclick={() => (activeTab = 'dice')}>Dés</button>
        <button class="tab {activeTab === 'inv' ? 'active' : ''}" onclick={() => (activeTab = 'inv')}>Inventaire</button>
      </div>

      <!-- Onglet Journal -->
      {#if activeTab === 'journal'}
        <div class="journal-tab">
          <div class="journal-list" bind:this={journalEl} onscroll={onJournalScroll}>
            {#if hasMoreOlder}
              <button class="older-btn" disabled={loadingOlder} onclick={loadOlder}>
                {loadingOlder ? '…' : 'Entrées antérieures'}
              </button>
            {/if}
            {#each [...olderEntries, ...store.journal] as entry, j (entry.id + ':' + j)}
              <div class="journal-entry entry-{entry.kind}">
                <span class="journal-time">{formatTime(entry.ts)}</span>
                {#if entry.kind === 'say'}
                  <span class="journal-who" style="color: {entry.whoColor};">{entry.who}</span>
                  <span class="journal-text">{entry.text}</span>
                {:else if entry.kind === 'roll'}
                  {#if entry.text !== entry.roll?.expression}
                    <span class="journal-who" style="color: {entry.whoColor};">{entry.who}</span>
                    <span class="journal-text">{entry.text}</span>
                  {/if}
                  <div class="roll-card">
                    <div class="roll-head">
                      <span class="journal-who" style="color: {entry.whoColor};">{entry.who}</span>
                      <span class="roll-expr">{entry.roll?.expression}</span>
                    </div>
                    <div class="roll-result" class:fumble={entry.roll?.fumble}>
                      {entry.roll?.total}
                      <span class="roll-detail">
                        = {entry.roll?.detail}
                        {#if entry.roll?.crit} · critique !{/if}
                        {#if entry.roll?.fumble} · échec critique…{/if}
                      </span>
                    </div>
                  </div>
                {:else if entry.kind === 'system'}
                  <span class="journal-system">{entry.text}</span>
                {/if}
              </div>
            {/each}
          </div>
          <div class="chat-input-row">
            <SketchyInput
              bind:value={chatText}
              placeholder="Parler, ou /1d20+5, /caracs…"
              onkeydown={(e) => e.key === 'Enter' && sendChat()}
              class="chat-input"
            />
            <Button variant="primary" onclick={sendChat}>➤</Button>
          </div>
        </div>
      {/if}

      <!-- Onglet Dés -->
      {#if activeTab === 'dice'}
        <div class="dice-tab">
          <div class="dice-mod-row">
            <span class="mod-label">Modificateur</span>
            <input class="mod-input" type="number" bind:value={diceMod} min="-20" max="20" />
          </div>
          <div class="dice-grid">
            {#each diceTypes as d (d)}
              {#if d === 20}
                <button class="dice-btn d20" onclick={() => quickRoll(d)}>d20</button>
              {:else}
                <button class="dice-btn" onclick={() => quickRoll(d)}>d{d}</button>
              {/if}
            {/each}
          </div>
          <div class="dice-tip">
            Astuce : /2d6+3 pour un jet composé, /4d6b pour biffer le dé le plus bas, /caracs pour
            les six jets de création
          </div>
          <div class="dice-history">
            <div class="history-title">Derniers jets</div>
            {#if diceHistory.length === 0}
              <div class="history-empty">Aucun jet pour l'instant</div>
            {:else}
              {#each diceHistory as h (h.id)}
                <div class="history-entry">{h.label}</div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      <!-- Onglet Inventaire -->
      {#if activeTab === 'inv'}
        <div class="inv-tab">
          <p class="inv-placeholder">Inventaire — à venir</p>
        </div>
      {/if}
    </aside>
  </div>

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}

  <!-- Dé animé overlay -->
  <DiceOverlay anim={store.diceAnim} />

  {#if ctxMenu}
    <div
      class="ctx-menu"
      bind:this={ctxEl}
      role="menu"
      style="left: {ctxMenu.x}px; top: {ctxMenu.y}px;"
      onclick={(e) => e.stopPropagation()}
      onpointerdown={(e) => e.stopPropagation()}
    >
      {#if ctxMenu.kind === 'pnj'}
        <button class="ctx-item" onclick={ctxDuplicate}>Dupliquer le PNJ</button>
      {/if}
      <button class="ctx-item" onclick={ctxRemoveToken}>Retirer de la carte</button>
      {#if ctxMenu.kind === 'pnj'}
        <button class="ctx-item danger" onclick={ctxDeleteNpc}>Supprimer le PNJ</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .table-screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }

  /* ── Barre de session ── */
  .session-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 18px;
    border-bottom: 2px solid var(--border);
    background: var(--bg);
    min-height: 48px;
    flex: none;
  }
  .session-title { display: flex; flex-direction: column; }
  .campaign-name { font-family: var(--font-title); font-size: 20px; line-height: 1.1; color: var(--heading); }
  .session-hint { font-size: 13px; font-weight: 500; color: var(--accent-text); }
  .grow { flex: 1; }
  .v-sep { width: 2px; height: 30px; background: var(--border-soft); }

  .mode-toggle { display: flex; margin-left: 10px; }
  .mode-btn {
    font-family: var(--font-body); font-size: 13px; padding: 7px 14px;
    border: 2px solid var(--border); background: var(--panel); color: var(--text-2); cursor: pointer;
  }
  .mode-btn:first-child { border-right-width: 1px; border-radius: 225px 0 0 12px / 12px 0 0 255px; }
  .mode-btn:last-child { border-left-width: 1px; border-radius: 0 12px 225px 0 / 0 255px 12px 0; }
  .mode-btn.exp-active { background: var(--selected); color: var(--heading); }
  .mode-btn.combat-active { background: var(--accent); border-color: var(--accent-border); color: var(--accent-fg); }

  .compendium-link { font-size: 14px; font-weight: 700; color: var(--accent-text); text-decoration: none; white-space: nowrap; }
  .compendium-link:hover { color: var(--accent-link-hover); }

  .quick-dice { display: flex; gap: 6px; align-items: center; }
  .qd-label { font-size: 13.5px; font-weight: 500; color: var(--text-2); }
  .qd-btn {
    font-family: var(--font-body); font-size: 12.5px; padding: 6px 9px;
    background: var(--panel); border: 2px solid var(--border);
    border-radius: 225px 12px 220px 12px / 12px 200px 12px 255px;
    color: var(--text); cursor: pointer;
  }
  .qd-btn:hover { background: var(--selected); color: var(--heading); }
  .qd-btn.d20 {
    font-size: 13px; padding: 7px 12px;
    background: var(--accent); border-color: var(--accent-border); color: var(--accent-fg);
    border-radius: var(--sketchy-1);
  }
  .qd-btn.d20:hover { background: var(--accent-hover); }

  .presence { display: flex; gap: 5px; }
  .presence-chip {
    font-size: 11px; font-weight: 500; padding: 2px 8px;
    background: var(--panel); border: 1.5px solid var(--border); border-radius: 10px 3px 12px 3px;
    color: var(--text); white-space: nowrap;
  }

  .table-body {
    flex: 1;
    display: grid;
    grid-template-columns: var(--w-compagnie) 1fr var(--w-panel);
    overflow: hidden;
    min-height: 0;
  }

  /* ── Compagnie ── */
  .compagnie {
    border-right: 2px solid var(--border);
    background: repeating-linear-gradient(var(--bg) 0, var(--bg) 27px, var(--border-soft) 27px, var(--border-soft) 28px);
    padding: 14px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  .compagnie-title {
    font-family: var(--font-title); font-size: 16px; color: var(--heading);
    border-bottom: 2px solid var(--accent); padding-bottom: 2px; flex: none;
  }
  .pnj-title { border-bottom-color: var(--border); margin-top: 8px; }
  .compagnie-empty { font-size: 12px; color: var(--text-2); font-style: italic; }

  .char-card {
    border: 2px solid var(--border);
    background: var(--panel); padding: 9px 12px;
    display: flex; flex-direction: column; gap: 5px; position: relative; flex: none;
  }
  .char-card.is-turn { border-color: var(--accent); }
  .turn-flag {
    position: absolute; right: -4px; top: -10px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.4px; color: var(--accent-text);
    background: var(--bg); padding: 0 6px;
  }
  .card-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .card-row-right { display: flex; gap: 6px; align-items: baseline; }
  .card-id { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
  .pj-portrait {
    width: 30px; height: 30px; flex: none;
    border-radius: 48% 52% 50% 50%/52% 48% 52% 48%;
    border: 2px solid var(--border);
    object-fit: cover;
    background: var(--bg);
  }
  .card-name { font-family: var(--font-title); font-size: 17px; line-height: 1.15; color: var(--heading); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pnj-name { font-size: 15.5px; }
  .card-ca { font-size: 12px; color: var(--text-2); }
  .card-sub { font-size: 11.5px; color: var(--text-2); font-style: italic; }
  .sheet-link { font-size: 12px; font-weight: 500; color: var(--accent-text); text-decoration: none; white-space: nowrap; }
  .sheet-link:hover { color: var(--accent-link-hover); }
  .stats { font-size: 11.5px; color: var(--text-2); }

  .hp-row { display: flex; align-items: center; gap: 6px; }
  .hp-bar-bg {
    flex: 1; height: 8px; border: 2px solid var(--border); border-radius: 6px;
    overflow: hidden; background: var(--panel);
  }
  .hp-bar-bg.small { height: 7px; }
  .hp-bar-fill {
    height: 100%;
    background: repeating-linear-gradient(-55deg, var(--accent) 0, var(--accent) 4px, var(--accent-hover) 4px, var(--accent-hover) 8px);
  }
  .hp-btn {
    font-family: var(--font-body); font-size: 12px; width: 20px; height: 20px; padding: 0;
    background: var(--panel); border: 2px solid var(--border); color: var(--text-2);
    cursor: pointer; line-height: 1;
  }
  .hp-btn.minus { border-radius: 8px 3px 8px 3px; }
  .hp-btn.minus:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .hp-btn.plus { border-radius: 3px 8px 3px 8px; }
  .hp-btn.plus:hover { border-color: var(--text-2); color: var(--text); }

  .cond-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .cond-chip {
    font-size: 12px; font-weight: 500; padding: 1px 8px;
    border: 2px solid var(--accent-border); border-radius: 10px 3px 12px 3px; color: var(--accent-text);
  }
  .cond-select {
    font-family: var(--font-body); font-size: 12px; padding: 1px 3px;
    border: 2px dashed var(--border); border-radius: 8px; background: transparent; color: var(--text-2);
    cursor: pointer; max-width: 74px;
  }
  .del-btn {
    font-family: var(--font-body); font-weight: 700; font-size: 10.5px; width: 18px; height: 18px; padding: 0;
    background: transparent; border: 2px dashed var(--border); border-radius: 6px; color: var(--text-2);
    cursor: pointer; line-height: 1;
  }
  .del-btn:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .place-btn {
    font-family: var(--font-body); font-size: 12px; font-weight: 500; padding: 3px 8px;
    background: transparent; border: 2px dashed var(--border); border-radius: 10px;
    color: var(--text-2); cursor: pointer; align-self: flex-start;
  }
  .place-btn:hover { border-color: var(--accent); color: var(--accent-text); }

  .model-btn {
    font-family: var(--font-body); font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
    padding: 1px 7px; background: transparent; border: 1.5px dashed var(--border);
    border-radius: 10px 3px 12px 3px; color: var(--text-2); cursor: pointer; line-height: 1.5;
  }
  .model-btn:hover { border-color: var(--accent); border-style: solid; color: var(--accent-text); }
  .lib-toggle { border-radius: 10px 3px 12px 3px; }
  .lib-toggle.on { border-color: var(--accent-border); border-style: solid; color: var(--accent-text); background: var(--panel); }
  .toast {
    position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
    background: var(--panel); border: 2px solid var(--accent-border);
    border-radius: 225px 12px 240px 14px/12px 235px 13px 225px;
    padding: 8px 22px; z-index: 90; text-align: center;
    font-size: 13.5px; font-weight: 500; color: var(--text);
    box-shadow: 3px 4px 0 var(--shadow-1);
  }

  .ctx-menu {
    position: fixed;
    z-index: 80;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 14px 4px 16px 5px;
    box-shadow: 0 10px 30px var(--shadow-2);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 170px;
  }
  .ctx-item {
    font-family: var(--font-body); font-size: 13px; text-align: left;
    padding: 6px 10px; background: transparent; border: none; border-radius: 8px;
    color: var(--text); cursor: pointer;
  }
  .ctx-item:hover { background: var(--selected); color: var(--heading); }
  .ctx-item.danger:hover { background: var(--accent); color: var(--accent-fg); }

  /* ── Carte ── */
  .map-area {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .map-header {
    display: flex; align-items: center; gap: 10px; padding: 9px 14px;
    border-bottom: 2px solid var(--border); background: var(--panel); flex: none;
  }
  .map-name { font-family: var(--font-title); font-size: 17px; color: var(--heading); }
  .explore-label { font-size: 13px; font-weight: 500; color: var(--text-2); }
  .scale-label { font-size: 12px; color: var(--text-3); }
  .spacer { flex: 1; }

  .combat-bandeau {
    display: flex; align-items: center; gap: 7px; padding: 8px 14px;
    border-bottom: 2px solid var(--border); background: var(--panel); flex-wrap: wrap; flex: none;
  }
  .combat-title { font-size: 14.5px; font-weight: 700; color: var(--heading); }
  .init-chip {
    font-size: 12px; padding: 4px 10px;
    background: var(--panel); color: var(--text); border: 2px solid var(--border);
  }
  .init-chip.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent-border); }
  .roll-init-btn {
    font-family: var(--font-body); font-size: 12.5px; padding: 5px 12px;
    background: var(--accent); color: var(--accent-fg); border: 2px solid var(--accent-border);
    border-radius: 12px 3px 12px 3px; cursor: pointer;
  }
  .roll-init-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .roll-init-btn.waiting {
    background: transparent; border: 2px dashed var(--border); color: var(--text-2); cursor: default;
  }
  .round-label { font-size: 14px; font-weight: 700; color: var(--accent-text); }
  .next-turn-btn {
    font-family: var(--font-body); font-size: 13px; padding: 6px 14px;
    background: var(--selected); color: var(--heading); border: 2px solid var(--border);
    border-radius: 15px 230px 15px 225px / 225px 15px 255px 15px; cursor: pointer;
  }
  .next-turn-btn:hover { background: var(--accent); border-color: var(--accent-border); }

  .mj-toolbar {
    display: flex; align-items: center; gap: 6px; padding: 7px 14px;
    border-bottom: 1px solid var(--border-soft); background: var(--bg); flex-wrap: wrap; flex: none;
  }
  .mj-label { font-size: 13px; font-weight: 500; color: var(--accent-text); }

  .ghost-btn {
    font-family: var(--font-body); font-size: 13px; font-weight: 500; padding: 3px 11px;
    background: transparent; border: 2px dashed var(--border); border-radius: 10px;
    color: var(--text-2); cursor: pointer;
  }
  .ghost-btn:hover { border-color: var(--text-2); color: var(--text); }
  .ghost-btn.danger:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .tsep { width: 2px; height: 20px; background: var(--border-soft); margin: 0 4px; }
  .tool-btn {
    font-family: var(--font-body); font-size: 12px; padding: 4px 11px;
    border: 2px solid var(--border); border-radius: 225px 8px 220px 8px / 8px 200px 8px 255px;
    background: var(--panel); color: var(--text-2); cursor: pointer;
  }
  .tool-btn:hover { background: var(--selected); color: var(--heading); }
  .tool-btn.active { background: var(--selected); color: var(--heading); }
  .npc-input {
    font-family: var(--font-body); font-size: 13px; padding: 3px 9px;
    border: 2px solid var(--border); border-radius: 10px 3px 10px 3px;
    background: var(--panel); color: var(--text); width: 100px;
  }
  .npc-input.narrow { width: 52px; }
  .marker-input {
    font-family: var(--font-body); font-size: 13px; font-weight: 500; padding: 3px 9px;
    border: 2px solid var(--border); border-radius: 10px 3px 10px 3px;
    background: var(--panel); color: var(--accent-text); width: 150px;
  }
  .tool-hint { font-size: 13px; font-weight: 500; color: var(--accent-text); }

  .map-frame {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 14px;
    min-height: 0;
    position: relative;
  }
  .map-placeholder { color: var(--text-2); font-style: italic; }

  .map-surface {
    position: absolute; inset: 0;
    border: 2px solid var(--border);
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    overflow: hidden;
    background: var(--map-bg);
    cursor: default;
    touch-action: none;
  }
  .map-surface.cursor-fog { cursor: crosshair; }
  .map-surface.cursor-place { cursor: copy; }
  .map-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; user-select: none; }
  .map-grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(var(--map-line) 1px, transparent 1px), linear-gradient(90deg, var(--map-line) 1px, transparent 1px);
    background-size: var(--map-grid-size) var(--map-grid-size);
    background-color: var(--map-bg);
  }
  .fog-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 15; }

  .marker {
    position: absolute; transform: translate(-50%, -100%);
    display: flex; align-items: center; gap: 4px; z-index: 5; cursor: grab;
  }
  .marker-flag {
    font-size: 14px; font-weight: 700; color: var(--accent-text);
    background: var(--map-token-bg); border: 2px dashed var(--accent); border-radius: 10px 3px 12px 3px;
    padding: 0 9px; white-space: nowrap; user-select: none;
  }
  .marker-remove {
    font-weight: 700; font-size: 10.5px; color: var(--text-3);
    background: var(--map-token-bg); border: 1px solid #c8c0ad; border-radius: 6px;
    padding: 0 4px; cursor: pointer;
  }
  .marker-remove:hover { color: var(--accent-text); }

  .token {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-title); cursor: grab; user-select: none; z-index: 10;
    touch-action: none;
  }
  .token-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    pointer-events: none;
  }
  .token-pj {
    background: var(--map-token-bg);
    border: 2.5px solid var(--token-color);
    border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%;
    color: var(--map-token-fg);
    box-shadow: 2px 3px 0 rgba(0, 0, 0, 0.2);
  }
  .token-pnj {
    background: var(--accent);
    border: 2.5px solid var(--accent-border);
    border-radius: 50% 48% 52% 50% / 48% 52% 48% 52%;
    color: var(--accent-fg);
    box-shadow: 2px 3px 0 rgba(0, 0, 0, 0.2);
  }
  .token-active { box-shadow: 0 0 0 3px var(--map-token-bg), 0 0 0 6px var(--accent); }
  .token-label {
    position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 3px;
    font-size: 12px; color: #2b2822;
    background: var(--map-label-bg); border-radius: 8px; padding: 0 6px;
    white-space: nowrap; pointer-events: none;
  }

  .ping {
    position: absolute; width: 70px; height: 70px;
    border: 3px solid var(--accent); border-radius: 50%; pointer-events: none; z-index: 20;
    animation: hdPing 1.8s ease-out forwards;
  }
  @keyframes hdPing {
    0% { transform: translate(-50%, -50%) scale(0.25); opacity: 0.95; }
    100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
  }

  /* ── Panneau ── */
  .panel {
    border-left: 2px solid var(--border);
    background: var(--panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .tabs {
    display: flex;
    border-bottom: 2px solid var(--border);
    flex: none;
  }
  .tab {
    flex: 1; font-family: var(--font-body); font-size: 14px; font-weight: 700;
    padding: 8px 2px; border: none; cursor: pointer;
    background: var(--panel); color: var(--text-2);
  }
  .tab.active { background: var(--selected); color: var(--heading); }

  .journal-tab { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }
  .journal-list {
    flex: 1; overflow-y: auto; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 11px; font-size: 13px; line-height: 1.5; min-height: 0;
  }
  .journal-entry { display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; }
  .older-btn {
    font-family: var(--font-body); font-size: 12px; font-weight: 500;
    align-self: center; padding: 3px 12px; margin-bottom: 4px;
    background: transparent; border: 2px dashed var(--border); border-radius: 10px;
    color: var(--text-2); cursor: pointer;
  }
  .older-btn:hover { border-color: var(--text-2); color: var(--text); }
  .journal-time { font-weight: 700; font-size: 10.5px; color: var(--text-3); }
  .journal-who { font-weight: 600; }
  .journal-text { color: var(--text); }
  .journal-entry.entry-system .journal-system { font-style: italic; color: var(--text-2); }
  .roll-card {
    flex-basis: 100%;
    border: 2px solid var(--border); border-radius: 225px 12px 240px 14px / 12px 235px 13px 225px;
    padding: 6px 11px; background: var(--bg); margin-top: 4px;
  }
  .roll-head { display: flex; justify-content: space-between; font-size: 12px; }
  .roll-expr { color: var(--text-2); }
  .roll-result { font-family: var(--font-title); font-size: 20px; color: var(--accent-text); line-height: 1.1; }
  .roll-result.fumble { color: var(--text-2); }
  .roll-detail { font-family: var(--font-body); font-size: 11.5px; color: var(--text-2); }

  .chat-input-row { display: flex; gap: 7px; padding: 10px 12px; border-top: 2px solid var(--border); flex: none; }
  :global(.chat-input) { flex: 1; min-width: 0; }

  .dice-tab { padding: 14px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; min-height: 0; }
  .dice-mod-row { display: flex; align-items: center; gap: 8px; }
  .mod-label { font-size: 14px; font-weight: 700; color: var(--heading); }
  .mod-input {
    width: 52px; font-family: var(--font-body); font-size: 14px; padding: 6px 8px; text-align: center;
    border: 2px solid var(--border); border-radius: 12px 220px 12px 225px / 225px 12px 255px 12px;
    background: var(--bg); color: var(--text); outline: none;
  }
  .dice-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
  .dice-btn {
    font-family: var(--font-body); font-size: 16px; padding: 16px 0;
    border: 2px solid var(--border);
    border-radius: 225px 12px 220px 12px / 12px 200px 12px 255px;
    background: var(--panel); color: var(--text); cursor: pointer;
  }
  .dice-btn:hover { background: var(--selected); color: var(--heading); }
  .dice-btn.d20 {
    background: var(--accent); color: var(--accent-fg); border-color: var(--accent-border);
    border-radius: var(--sketchy-1);
  }
  .dice-btn.d20:hover { background: var(--accent-hover); }
  .dice-tip { font-size: 13px; font-weight: 500; color: var(--text-2); }

  .dice-history { border-top: 1px solid var(--border-soft); padding-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .history-title { font-weight: 700; font-size: 14px; color: var(--heading); margin-bottom: 4px; }
  .history-empty { font-size: 12.5px; color: var(--text-3); }
  .history-entry {
    font-size: 12.5px; padding-bottom: 4px; margin-bottom: 4px;
    border-bottom: 1px dashed var(--border-soft); color: var(--text-2);
  }

  .inv-tab { padding: 14px; flex: 1; }
  .inv-placeholder { color: var(--text-2); font-style: italic; font-size: 13px; }
</style>
