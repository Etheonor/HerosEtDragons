<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tableStore, connectWs, disconnectWs, sendWs, clearWsError } from '$lib/ws.svelte';
  import { api, type MapSummary } from '$lib/api';
  import { DropdownMenu } from 'bits-ui';
  import type { JournalEntry, TableSettings } from '@rollwith/shared/protocol';
  import type { Inventory } from '@rollwith/shared/inventory';
  import { auth } from '$lib/auth-client';
  import Button from '$lib/ds/Button.svelte';
  import SketchyInput from '$lib/ds/SketchyInput.svelte';
  import DiceOverlay from '$lib/components/DiceOverlay.svelte';
  import CompendiumTooltip from '$lib/components/CompendiumTooltip.svelte';
  import CloseButton from '$lib/ds/CloseButton.svelte';
  import { scrollArea } from '$lib/ds/scroll-area';
  import { surfaceProps } from '$lib/ds/surface';
  import HotkeyHelp from '$lib/components/HotkeyHelp.svelte';
  import CommandPalette from '$lib/table/CommandPalette.svelte';
  import ToolGroup from '$lib/table/toolbar/ToolGroup.svelte';
  import { fitToolbar } from '$lib/table/toolbar/toolbarFit';
  import { TOOL_FACES } from '$lib/table/toolbar/faces';
  import { hotkeyIdFromEvent } from '$lib/hotkeys';
  import { commandRegistry, type PaletteCommand } from '$lib/table/commands.svelte';
  import { createCamera, type CameraPose } from '$lib/table/camera.svelte';
  import { slugify } from '$lib/slug';
  import MapManager from '$lib/components/MapManager.svelte';
  import { portraitUrl } from '$lib/portraits';
  import { ICONS } from '$lib/ds/icons';
  import Panel from '$lib/table/Panel.svelte';
  import ContextMenu from '$lib/table/ContextMenu.svelte';
  import type { AssetTarget, ContextMenuItem } from '$lib/table/context-menu';
  import AssetManager from '$lib/table/AssetManager.svelte';
  import GmDashboard from '$lib/table/GmDashboard.svelte';
  import PromptDialog from '$lib/components/PromptDialog.svelte';
  import NpcLibrary from '$lib/components/NpcLibrary.svelte';

  let { params } = $props();
  let campaignId = params.id;

  // Repli si le compendium n'est pas encore ingéré ; la liste réelle est
  // chargée depuis la catégorie « etats » au montage (8.5).
  const CONDITIONS = [
    'À terre', 'Assourdi', 'Aveuglé', 'Charmé', 'Empoigné', 'Empoisonné',
    'Entravé', 'Étourdi', 'Inconscient', 'Invisible', 'Neutralisé', 'Paralysé',
    'Pétrifié', 'Terrorisé', 'Repoussé', 'Surpris',
  ];
  let stateOptions = $state<string[]>(CONDITIONS);

  /** États qui couchent la figurine : voile sur le pion (les PV à 0 ont leur
   *  propre traitement : grisé + translucide). */
  const DOWN_CONDITIONS = new Set(['Inconscient', 'À terre']);

  /** Presets de taille de pion, en cases (multiplicateur de `gridSize`). */
  const TOKEN_SCALES = [0.5, 1, 2, 3, 4];

  // Store runes partagé (ws.svelte.ts) : l'objet mute en place, tout est réactif.
  // NB : PAS de $state() ici — tableStore est déjà un proxy $state (N4 audit),
  // envelopper une seconde fois crée une double proxification inutile.
  const store = tableStore;

  let chatText = $state('');
  let journalEl = $state<HTMLDivElement | null>(null);
  let stickToBottom = true;
  let lastJournalTab = 'journal';

  let unseen = $state<number[]>([]);
  const unseenCount = $derived(unseen.length);

  function onJournalScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (stickToBottom && unseen.length) unseen = [];
  }

  // Journal « non lu » façon Discord : quand on est remonté, compter les
  // nouveaux messages et proposer d'y sauter.
  let lastJournalLen = 0;
  $effect(() => {
    const len = store.journal.length;
    if (len > lastJournalLen && !stickToBottom) {
      const fresh = store.journal.slice(lastJournalLen).map((e) => e.id);
      unseen = [...unseen, ...fresh];
    }
    if (len < lastJournalLen) unseen = [];
    lastJournalLen = len;
  });

  function jumpToNew() {
    const first = unseen[0];
    unseen = [];
    const target =
      first !== undefined
        ? journalEl?.querySelector<HTMLElement>(`[data-jid="${first}"]`)
        : null;
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      // laisse le temps au smooth-scroll : stickToBottom se recalculera au scroll
    } else if (journalEl) {
      stickToBottom = true;
      journalEl.scrollTo({ top: journalEl.scrollHeight, behavior: 'smooth' });
    }
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

  // ── Panneaux flottants (Lot 1) ───────────────────────────────
  // Ouverts par défaut ; l'état est persistant par navigateur. Un panneau ne se
  // referme que par son bouton — pas au clic sur la carte (décision du 07 §Lot 1).
  const PANELS_KEY = 'hd-table-panels';
  type PanelId = 'compagnie' | 'panel' | 'dashboard';

  function loadPanelState(): Record<PanelId, boolean> {
    try {
      const raw = localStorage.getItem(PANELS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Record<PanelId, boolean>>;
        // Le dashboard MJ est fermé par défaut (surface à la demande).
        return {
          compagnie: p.compagnie !== false,
          panel: p.panel !== false,
          dashboard: p.dashboard === true,
        };
      }
    } catch {
      /* stockage indisponible : on garde les panneaux ouverts */
    }
    return { compagnie: true, panel: true, dashboard: false };
  }

  let panelsOpen = $state(loadPanelState());

  function setPanelOpen(id: PanelId, open: boolean) {
    panelsOpen = { ...panelsOpen, [id]: open };
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(panelsOpen));
    } catch {
      /* ignore */
    }
  }

  // ── Chrome (Lot 2) : palette, aide, barre d'outils ───────────
  let paletteOpen = $state(false);
  let helpOpen = $state(false);
  let assetManagerOpen = $state(false);
  /** Incrémenté après suppression d'un modèle : l'asset manager recharge. */
  let templatesRevision = $state(0);
  /** Boîte « demander une valeur » (renommage de carte, etc.). */
  let prompt = $state<{
    title: string;
    label: string;
    initial: string;
    confirmLabel?: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  let toolbarWidth = $state(1280);

  function onToolbarResize(node: HTMLElement) {
    const ro = new ResizeObserver((entries) => {
      toolbarWidth = entries[0]?.contentRect.width ?? 0;
    });
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }

  // ── Réglages (palette) ───────────────────────────────────────
  const GRID_SIZES = [16, 24, 32, 40, 48, 64];
  const TOKEN_SIZES = [24, 32, 40, 48, 56];
  const GRID_COLORS: [string, string][] = [
    ['', 'du thème'],
    ['#ffffff', 'blanche'],
    ['#000000', 'noire'],
    ['#c0392b', 'rouge'],
    ['#5e8c61', 'verte'],
    ['#4a7aa8', 'bleue'],
  ];

  async function setGridSize(size: number | null) {
    const mapId = store.state.mapId;
    if (!isMj || !mapId) return;
    try {
      await api.maps.update(mapId, { gridSize: size });
      await refreshMaps();
    } catch {
      toast = 'Réglage de la grille impossible';
    }
  }

  async function setGridColor(color: string | null) {
    const mapId = store.state.mapId;
    if (!isMj || !mapId) return;
    try {
      await api.maps.update(mapId, { gridColor: color });
      await refreshMaps();
    } catch {
      toast = 'Réglage de la grille impossible';
    }
  }

  async function setCampaignSetting(patch: Partial<TableSettings>) {
    if (!isMj) return;
    try {
      await api.campaigns.updateSettings(campaignId, patch);
    } catch {
      toast = 'Réglage impossible';
    }
  }

  /** Commandes exposées à la palette — relues à chaque ouverture. */
  function buildCommands(): PaletteCommand[] {
    const cmds: PaletteCommand[] = [
      {
        id: 'panel.compagnie',
        label: panelsOpen.compagnie ? 'Masquer la compagnie' : 'Afficher la compagnie',
        group: 'Actions',
        keywords: ['panneau', 'compagnie', 'sidebar'],
        run: () => setPanelOpen('compagnie', !panelsOpen.compagnie),
      },
      {
        id: 'panel.seance',
        label: panelsOpen.panel ? 'Masquer le panneau de séance' : 'Afficher le panneau de séance',
        group: 'Actions',
        keywords: ['panneau', 'journal', 'dés', 'inventaire'],
        run: () => setPanelOpen('panel', !panelsOpen.panel),
      },
      {
        id: 'map.reset',
        label: 'Recadrer la carte',
        group: 'Actions',
        keywords: ['caméra', 'zoom', 'centrer'],
        shortcut: '0',
        run: resetView,
      },
      {
        id: 'tool.hand',
        label: 'Outil Main',
        group: 'Actions',
        keywords: ['déplacer', 'panoramique'],
        shortcut: 'H',
        run: () => toolSelect('hand'),
      },
      {
        id: 'help.open',
        label: 'Aide clavier',
        group: 'Aide',
        keywords: ['raccourcis', 'touches', 'aide'],
        shortcut: '?',
        run: () => (helpOpen = true),
      },
      {
        id: 'nav.compendium',
        label: 'Ouvrir le compendium',
        group: 'Actions',
        keywords: ['règles', 'fiches'],
        run: () => {
          globalThis.location.href = `/compendium?campaign=${campaignId}`;
        },
      },
    ];

    if (myCharId) {
      cmds.push({
        id: 'nav.sheet',
        label: 'Ouvrir ma feuille de personnage',
        group: 'Actions',
        keywords: ['personnage', 'feuille'],
        run: () => {
          globalThis.location.href = `/characters/${myCharId}`;
        },
      });
    }

    if (isMj) {
      cmds.push(
        {
          id: 'assets.open',
          label: 'Ouvrir la bibliothèque',
          group: 'Actions',
          keywords: ['bibliothèque', 'cartes', 'pnj', 'modèles', 'personnages', 'asset'],
          run: () => (assetManagerOpen = true),
        },
        {
          id: 'dashboard.toggle',
          label: panelsOpen.dashboard ? 'Masquer le tableau de bord MJ' : 'Tableau de bord MJ',
          group: 'Actions',
          keywords: ['dashboard', 'tableau', 'pnj', 'notes', 'scène'],
          active: panelsOpen.dashboard,
          run: () => setPanelOpen('dashboard', !panelsOpen.dashboard),
        },
        {
          id: 'history.undo',
          label: 'Annuler la dernière action',
          group: 'Édition',
          keywords: ['undo', 'annuler', 'retour', 'historique'],
          shortcut: 'Ctrl/⌘ Z',
          badge: store.history.canUndo ? undefined : 'aucune action',
          run: doUndo,
        },
        {
          id: 'history.redo',
          label: 'Rétablir',
          group: 'Édition',
          keywords: ['redo', 'rétablir', 'refaire', 'historique'],
          shortcut: 'Ctrl/⌘ ⇧ Z',
          badge: store.history.canRedo ? undefined : 'rien à rétablir',
          run: doRedo,
        },
        {
          id: 'tool.move',
          label: 'Outil Déplacer',
          group: 'Actions',
          keywords: ['pion', 'sélection'],
          shortcut: 'V',
          run: () => toolSelect('move'),
        },
        {
          id: 'tool.pnj',
          label: 'Outil PNJ',
          group: 'Actions',
          keywords: ['créer', 'monstre'],
          shortcut: 'P',
          run: () => toolSelect('pnj'),
        },
        {
          id: 'tool.marker',
          label: 'Outil Repère',
          group: 'Actions',
          keywords: ['annotation', 'note'],
          shortcut: 'R',
          run: () => toolSelect('marker'),
        },
        {
          id: 'tool.fog',
          label: 'Outil Brouillard',
          group: 'Actions',
          keywords: ['révéler', 'couvrir', 'vision'],
          shortcut: 'B',
          run: fogToggle,
        },
        {
          id: 'combat.next',
          label: 'Tour suivant',
          group: 'Combat',
          keywords: ['initiative', 'round'],
          run: combatNext,
        },
        ...([4, 6, 8, 10, 12, 20] as const).map((sides, index) => ({
          id: `dice.d${sides}`,
          label: `Lancer 1d${sides}`,
          group: 'Combat',
          keywords: ['dé', 'jet', `d${sides}`],
          shortcut: String(index + 1),
          run: () => quickRoll(sides),
        })),
      );

      if (activeMap) {
        for (const size of GRID_SIZES) {
          cmds.push({
            id: `grid.size.${size}`,
            label: `Grille : ${size} px`,
            group: 'Réglages',
            keywords: ['grille', 'quadrillage', 'taille', String(size)],
            badge: activeGridSize === size ? 'actuel' : undefined,
            active: activeGridSize === size,
            run: () => void setGridSize(size),
          });
        }
        cmds.push({
          id: 'grid.size.off',
          label: 'Grille : retirer',
          group: 'Réglages',
          keywords: ['grille', 'quadrillage', 'retirer', 'aucune'],
          badge: activeGridSize === null ? 'actuel' : undefined,
          run: () => void setGridSize(null),
        });
        for (const [color, label] of GRID_COLORS) {
          const current = (activeGridColor ?? '') === color;
          cmds.push({
            id: `grid.color.${color || 'theme'}`,
            label: `Grille : couleur ${label}`,
            group: 'Réglages',
            keywords: ['grille', 'couleur', label],
            active: current,
            badge: current ? 'actuel' : undefined,
            run: () => void setGridColor(color || null),
          });
        }
      }

      cmds.push(
        {
          id: 'mode.exploration',
          label: 'Passer en exploration',
          group: 'Réglages',
          keywords: ['mode', 'exploration'],
          active: store.state.mode === 'exploration',
          run: () => setMode('exploration'),
        },
        {
          id: 'mode.combat',
          label: 'Passer en combat',
          group: 'Réglages',
          keywords: ['mode', 'combat', 'initiative'],
          active: store.state.mode === 'combat',
          run: () => setMode('combat'),
        },
        {
          id: 'fog.cover',
          label: 'Brouillard : tout recouvrir',
          group: 'Réglages',
          keywords: ['brouillard', 'couvrir', 'cacher'],
          run: fogCover,
        },
        {
          id: 'fog.disable',
          label: 'Brouillard : dissiper',
          group: 'Réglages',
          keywords: ['brouillard', 'dissiper', 'révéler'],
          run: fogDisable,
        },
        ...TOKEN_SIZES.map((size) => ({
          id: `token.size.${size}`,
          label: `Pions : taille ${size} px`,
          group: 'Réglages',
          keywords: ['pion', 'jeton', 'taille', String(size)],
          active: store.settings.tokenSize === size,
          badge: store.settings.tokenSize === size ? 'actuel' : undefined,
          run: () => void setCampaignSetting({ tokenSize: size }),
        })),
        {
          id: 'campaign.pnjPv',
          label: 'PNJ : afficher les PV aux joueurs',
          group: 'Réglages',
          keywords: ['pnj', 'pv', 'points de vie', 'visibilité'],
          active: store.settings.pnjPvVisible,
          badge: store.settings.pnjPvVisible ? 'activé' : 'désactivé',
          run: () => void setCampaignSetting({ pnjPvVisible: !store.settings.pnjPvVisible }),
        },
        {
          id: 'campaign.sheetsLocked',
          label: "Feuilles : verrouiller l'édition",
          group: 'Réglages',
          keywords: ['feuille', 'verrou', 'édition'],
          active: store.settings.sheetsLocked,
          badge: store.settings.sheetsLocked ? 'activé' : 'désactivé',
          run: () => void setCampaignSetting({ sheetsLocked: !store.settings.sheetsLocked }),
        },
      );
    }

    return cmds;
  }

  const paletteCommands = $derived(commandRegistry.list(isMj));

  // ── Carte ────────────────────────────────────────────────────
  let maps = $state<MapSummary[]>([]);
  let mapContainer = $state<HTMLDivElement | null>(null);
  let fogCanvas = $state<HTMLCanvasElement | null>(null);
  let tool = $state<'move' | 'hand' | 'pnj' | 'marker' | 'fog'>('move');
  let markerText = $state('repère');
  let npcName = $state('PNJ');
  let npcPv = $state(7);
  let npcCa = $state(13);
  let npcInit = $state(0);
  let npcSaveAsTemplate = $state(false);
  let dragOverride = $state<Record<string, { x: number; y: number }>>({});
  let markerDragOverride = $state<Record<string, { x: number; y: number }>>({});

  let drag: { id: string; kind: 'token' | 'marker'; moved: boolean; sent: boolean } | null = null;
  let fogErasing = false;
  let skipNextClick = false;
  let lastFogPoint: { x: number; y: number } | null = null;
  const FOG_SEND_MIN_DIST = 2.5;

  // P2 (audit) : un pointermove = jusqu'à 60-120 messages/s. On n'émet qu'une
  // fois par rAF ET au plus toutes les TOKEN_SEND_MIN_MS : la position locale
  // (dragOverride) reste fluide sans réseau, et les autres joueurs n'ont pas
  // besoin de 60 Hz — 30/s est indiscernable et deux fois moins de trafic.
  const TOKEN_SEND_MIN_MS = 33;
  let pendingTokenMove: { id: string; x: number; y: number; begin: boolean } | null = null;
  let tokenMoveRaf = 0;
  let tokenMoveLastSent = 0;

  function flushTokenMove(force = false) {
    if (tokenMoveRaf) cancelAnimationFrame(tokenMoveRaf);
    tokenMoveRaf = 0;
    const m = pendingTokenMove;
    if (!m) return;
    // Le `begin` ne doit jamais être perdu : s'il est trop tôt, on le garde en
    // attente (c'est lui qui ouvre le pas d'undo du geste entier).
    if (!force && !m.begin && Date.now() - tokenMoveLastSent < TOKEN_SEND_MIN_MS) return;
    pendingTokenMove = null;
    tokenMoveLastSent = Date.now();
    sendWs({ type: 'token.move', tokenId: m.id, x: m.x, y: m.y, ...(m.begin ? { begin: true } : {}) });
  }

  function scheduleTokenMove(id: string, x: number, y: number, begin = false) {
    pendingTokenMove = { id, x, y, begin: begin || (pendingTokenMove?.begin ?? false) };
    if (tokenMoveRaf) return;
    tokenMoveRaf = requestAnimationFrame(() => flushTokenMove());
  }

  function sendFogReveal(p: { x: number; y: number }, begin = false) {
    if (!begin && lastFogPoint && Math.hypot(p.x - lastFogPoint.x, p.y - lastFogPoint.y) < FOG_SEND_MIN_DIST) {
      return;
    }
    lastFogPoint = p;
    sendWs({ type: 'fog.reveal', ...p, ...(begin ? { begin: true } : {}) });
  }

  const activeMap = $derived(maps.find((m) => m.id === store.state.mapId) ?? null);
  const activeFog = $derived(store.state.mapId ? store.state.fog[store.state.mapId] : undefined);
  const fogOn = $derived(!!activeFog?.on);

  /** Taille de la case affichée sur la carte active ; null = pas de quadrillage.
   *  Une carte sans image reste quadrillée par défaut (32 px) même si la
   *  colonne est null : c'est le comportement historique du « + Quadrillée ». */
  const activeGridSize = $derived.by(() => {
    if (!activeMap) return null;
    if (activeMap.gridSize != null) return activeMap.gridSize;
    return activeMap.hasImage ? null : 32;
  });

  /** Teinte du quadrillage choisie par le MJ ; null = celle du thème. */
  const activeGridColor = $derived(activeMap?.gridColor ?? null);

  // Ratio largeur/hauteur de l'image active — on dimensionne la surface à ce
  // ratio pour TOUJOURS voir l'image à 100% (aucun crop), quel que soit son
  // format (large ou haut). Les pions/repères/brouillard restent alignés car
  // leurs coordonnées sont des % de la surface, qui épouse alors l'image.
  let mapAspect = $state<number | null>(null);
  // L'effet ci-dessous se redéclenche à CHAQUE refreshMaps() (qui remplace le
  // tableau `maps` et donc l'objet activeMap). Il ne faut remettre mapAspect à
  // que sur un vrai changement de carte : sinon la surface repassait en mode
  // « fill », l'image retombait en object-fit:cover et une carte haute se
  // retrouvait recadrée alors que l'image ne s'était pas rechargée.
  let aspectForMapId: string | null = null;
  $effect(() => {
    const id = activeMap?.id ?? null;
    if (id === aspectForMapId) return;
    aspectForMapId = id;
    mapAspect = null;
  });

  function onMapImageLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      mapAspect = img.naturalWidth / img.naturalHeight;
    }
  }

  // Taille du cadre (`.map-frame`) pour calculer la surface la plus grande qui
  // tient tout en gardant le ratio de l'image (aucun crop, quelle que soit la
  // résolution, large ou haute).
  let frameRef = $state<HTMLElement | null>(null);
  let frameW = $state(0);
  let frameH = $state(0);
  $effect(() => {
    const el = frameRef;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) {
        frameW = r.width;
        frameH = r.height;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  const fittedSize = $derived(
    mapAspect && frameW > 0 && frameH > 0
      ? (() => {
          let w = frameW;
          let h = w / mapAspect;
          if (h > frameH) {
            h = frameH;
            w = h * mapAspect;
          }
          return { w, h };
        })()
      : null,
  );

  // ── Caméra : zoom + panoramique, STRICTEMENT locaux ──────────
  // Chaque joueur a son propre cadrage ; rien n'est diffusé, donc le zoom d'un
  // joueur ne change rien pour les autres. Le DO ignore tout ça : les pions
  // restent en % de la surface, la transformation est purement visuelle.
  // Le cadrage est persisté par carte dans localStorage (préférence locale).
  let panning = $state<{ x: number; y: number; id: number; btn: number } | null>(null);

  /** Taille réelle de la surface (fitted = image ajustée, fill = cadre plein). */
  const surfaceSize = $derived(
    fittedSize ? { w: fittedSize.w, h: fittedSize.h } : { w: frameW, h: frameH },
  );

  let cameraMapId: string | null = null;
  let pendingPose = $state<CameraPose | null>(null);

  const camera = createCamera(() => {
    scheduleFogRedraw();
    scheduleCameraSave();
  });

  function cameraKey(mapId: string): string {
    return `hd-camera:${campaignId}:${mapId}`;
  }

  function loadCameraPose(mapId: string): CameraPose | null {
    try {
      const raw = localStorage.getItem(cameraKey(mapId));
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<CameraPose>;
      if (typeof p.fx !== 'number' || typeof p.fy !== 'number' || typeof p.zoom !== 'number') {
        return null;
      }
      return { fx: p.fx, fy: p.fy, zoom: p.zoom };
    } catch {
      return null;
    }
  }

  function saveCameraPose(mapId: string): void {
    try {
      localStorage.setItem(cameraKey(mapId), JSON.stringify(camera.pose));
    } catch {
      /* stockage plein ou refusé : le cadrage reste valable en mémoire */
    }
  }

  let cameraSaveTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCameraSave(): void {
    if (!cameraMapId) return;
    if (cameraSaveTimer) clearTimeout(cameraSaveTimer);
    cameraSaveTimer = setTimeout(() => {
      cameraSaveTimer = null;
      if (cameraMapId) saveCameraPose(cameraMapId);
    }, 250);
  }

  function flushCameraSave(): void {
    if (!cameraMapId) return;
    if (cameraSaveTimer) {
      clearTimeout(cameraSaveTimer);
      cameraSaveTimer = null;
    }
    saveCameraPose(cameraMapId);
  }

  $effect(() => {
    camera.setViewport(frameW, frameH);
  });

  $effect(() => {
    camera.setSurface(surfaceSize.w, surfaceSize.h);
  });

  $effect(() => {
    const id = activeMap?.id ?? null;
    if (id === cameraMapId) return;
    flushCameraSave();
    cameraMapId = id;
    pendingPose = id ? (loadCameraPose(id) ?? { fx: 0.5, fy: 0.5, zoom: 1 }) : null;
  });

  const surfaceReady = $derived(
    !!activeMap && frameW > 0 && frameH > 0 && (!activeMap.hasImage || !!fittedSize),
  );

  $effect(() => {
    if (!pendingPose || !surfaceReady) return;
    const p = pendingPose;
    pendingPose = null;
    camera.setSurface(surfaceSize.w, surfaceSize.h);
    camera.setPose(p, { instant: true });
  });

  function resetView() {
    camera.reset();
  }

  /** Zoom ancré sur le curseur : le point sous la souris reste sous la souris. */
  function zoomAt(clientX: number, clientY: number, factor: number) {
    const el = frameRef;
    if (!el || !frameW || !frameH) return;
    const r = el.getBoundingClientRect();
    camera.zoomAtPoint(clientX - r.left, clientY - r.top, factor);
  }

  function zoomAtCenter(factor: number) {
    camera.zoomBy(factor, { instant: false });
  }

  /** Recadrage animé sur le pion d'un personnage (caméra locale, jamais diffusé). */
  function focusToken(charId: string) {
    const t = store.state.tokens[charId];
    if (!t) return;
    camera.centerOn(t.x / 100, t.y / 100);
  }

  // ── Historique (lot 4) ───────────────────────────────────────
  // Le DO est la source de vérité : la route REST lui demande d'appliquer le
  // pas, et le delta `history` reçu ensuite remet les boutons d'aplomb. La
  // pile n'est jamais dans le client.
  let historyBusy = $state(false);

  async function historyStep(dir: 'undo' | 'redo') {
    if (!isMj || historyBusy) return;
    if (dir === 'undo' ? !store.history.canUndo : !store.history.canRedo) return;
    historyBusy = true;
    try {
      if (dir === 'undo') await api.campaigns.undo(campaignId);
      else await api.campaigns.redo(campaignId);
    } catch {
      /* table fermée ou pas déjà consommé : le prochain delta corrigera */
    } finally {
      historyBusy = false;
    }
  }

  function doUndo() {
    void historyStep('undo');
  }

  function doRedo() {
    void historyStep('redo');
  }

  $effect(() => {
    const el = frameRef;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

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
    store.state.mode === 'combat' &&
      store.state.combat?.phase === 'run' &&
      store.state.combat.order
      ? store.state.combat.order[store.state.combat.turn % store.state.combat.order.length]
      : null,
  );

  const myCharId = $derived(
    store.characters.find((c) => c.kind === 'pj' && c.ownerId === session?.user.id)?.id ?? null,
  );

  // ── Inventaire & échanges (R9) ───────────────────────────────
  const EMPTY_INV: Inventory = { items: [], money: { po: 0, pa: 0, pc: 0 } };
  // R9.1 : un joueur est verrouillé sur son propre sac, le MJ choisit librement.
  const invCandidates = $derived(
    isMj ? store.characters.map((c) => ({ id: c.id, name: c.name })) : [],
  );
  let invSelected = $state<string | null>(null);
  const invTarget = $derived(isMj ? (invSelected ?? invCandidates[0]?.id ?? null) : myCharId);
  const invOwner = $derived(
    invTarget ? (store.characters.find((c) => c.id === invTarget) ?? null) : null,
  );
  const inv = $derived<Inventory>(
    invTarget ? (store.inventories[invTarget] ?? EMPTY_INV) : EMPTY_INV,
  );
  // Cible de don : les autres PJs, jamais soi-même.
  const invGiveTargets = $derived(
    store.characters.filter((c) => c.kind === 'pj' && c.id !== invTarget),
  );

  let invItemDraft = $state('');
  let invQtyDraft = $state(1);
  let invGiveTo = $state<string | null>(null);
  let invPoDraft = $state(0);
  let invPaDraft = $state(0);
  let invPcDraft = $state(0);

  function invAddItem() {
    const name = invItemDraft.trim();
    if (!name || !invTarget || !isMj) return;
    sendWs({ type: 'inv.add', charId: invTarget, item: name, qty: Math.max(1, invQtyDraft | 0) });
    invItemDraft = '';
    invQtyDraft = 1;
  }

  function invDrop(item: string) {
    if (!invTarget) return;
    sendWs({ type: 'inv.drop', charId: invTarget, item });
  }

  function invGiveItem(item: string) {
    if (!invTarget || !invGiveTo) return;
    sendWs({ type: 'inv.give', kind: 'item', from: invTarget, to: invGiveTo, item });
  }

  function invGiveMoney() {
    if (!invTarget || !invGiveTo) return;
    const po = Math.max(0, invPoDraft | 0);
    const pa = Math.max(0, invPaDraft | 0);
    const pc = Math.max(0, invPcDraft | 0);
    if (po + pa + pc === 0) return;
    sendWs({ type: 'inv.give', kind: 'money', from: invTarget, to: invGiveTo, money: { po, pa, pc } });
    invPoDraft = 0;
    invPaDraft = 0;
    invPcDraft = 0;
  }

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
    sendWs({ type: 'initiative.roll', charId });
  }

  function combatNext() {
    sendWs({ type: 'combat.next' });
  }

  function reorderCombat(charId: string, up: boolean) {
    sendWs({ type: 'combat.reorder', charId, up });
  }

  onMount(() => {
    commandRegistry.register('table', buildCommands);
    return () => commandRegistry.unregister('table');
  });

  // Les cartes vivent en REST : le serveur pousse `mapsUpdated` après chaque
  // mutation, chaque navigateur relit alors la liste (Lot 2).
  let seenMapsRevision = 0;
  $effect(() => {
    const rev = store.mapsRevision;
    if (rev === seenMapsRevision) return;
    seenMapsRevision = rev;
    void refreshMaps();
  });

  onMount(async () => {
    // états pilotés par le compendium (noms officiels DRS)
    try {
      const r = await api.compendium.entries(campaignId, { category: 'etats', limit: 100 });
      const list = r.entries
        .filter((e) => ((e.meta ?? {}) as Record<string, unknown>).kind === 'etat')
        .map((e) => e.title);
      if (list.length) stateOptions = list;
    } catch {
      /* le repli CONDITIONS suffit */
    }
    session = await auth.getSession();
    try {
      const detail = await api.campaigns.detail(campaignId);
      campaignName = detail.name;
      isMj = detail.role === 'mj';
    } catch {
      /* ignore */
    }
    await refreshMaps();

    connectWs(campaignId);
  });

  onDestroy(() => {
    disconnectWs();
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
    sendWs({ type: 'chat.say', text: chatText.trim() });
    chatText = '';
  }

  function quickRoll(sides: number) {
    sendWs({ type: 'dice.roll', sides, n: 1, mod: diceMod });
    diceHistory = [
      { id: ++diceHistSeq, label: `1d${sides}${diceMod >= 0 ? '+' : ''}${diceMod}` },
      ...diceHistory,
    ].slice(0, 6);
  }

  function setMode(mode: 'exploration' | 'combat') {
    if (!isMj) return;
    sendWs({ type: 'mode.set', mode });
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function pvDelta(charId: string, delta: number) {
    sendWs({ type: 'char.hp', charId, delta });
  }

  function addCondition(charId: string, e: Event) {
    const select = e.target as HTMLSelectElement;
    const cond = select.value;
    if (!cond) return;
    sendWs({ type: 'char.condition', charId, cond, on: true });
    select.value = '';
  }

  function removeCondition(charId: string, cond: string) {
    if (!isMj) return;
    sendWs({ type: 'char.condition', charId, cond, on: false });
  }

  function removeNpc(charId: string) {
    sendWs({ type: 'npc.remove', charId });
  }

  function hasToken(charId: string): boolean {
    return !!store.state.tokens[charId];
  }

  function placeOnMap(charId: string) {
    const n = Object.keys(store.state.tokens).length;
    sendWs({ type: 'token.put', charId, x: 46 + ((n % 5) - 2) * 4, y: 50 });
  }

  // ── Carte : sélection / import ──────────────────────────────

  function selectMap(mapId: string) {
    if (!isMj) return;
    sendWs({ type: 'map.select', mapId });
  }

  // ── Carte : coordonnées & interactions ──────────────────────

  /**
   * Écran → % de la surface, en INVERSANT le zoom/panoramique courant.
   * Le wrapper porte `transform: translate(tx,ty) scale(z)` en origin 0 0, donc :
   *   écran = cadre.gauche + tx + z · (offsetSurface + pointLocal)
   * d'où l'inversion ci-dessous. Sans ce correctif, cliquer pour poser un pion
   * ou gommer du brouillard atterrirait au mauvais endroit dès que la carte est
   * zoomée ou déplacée.
   */
  function mapXY(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const el = frameRef;
    if (!el) return { x: 50, y: 50 };
    const { w: sw, h: sh } = surfaceSize;
    if (!sw || !sh) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    const z = camera.zoom || 1;
    const sx = (r.width - sw) / 2;
    const sy = (r.height - sh) / 2;
    const lx = (e.clientX - r.left - camera.panX) / z - sx;
    const ly = (e.clientY - r.top - camera.panY) / z - sy;
    return {
      x: Math.min(98, Math.max(2, (lx / sw) * 100)),
      y: Math.min(97, Math.max(3, (ly / sh) * 100)),
    };
  }

  function toolSelect(t: 'move' | 'hand' | 'pnj' | 'marker' | 'fog') {
    pendingPlace = null;
    tool = tool === t ? 'move' : t;
  }

  function tokenPointerDown(charId: string, e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isMj && tool === 'fog') return;
    // Avec l'outil Main, tout doit panoramiquer — y compris un départ sur un pion.
    if (tool === 'hand') return;
    if (!canMoveToken(charId)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag = { id: charId, kind: 'token', moved: false, sent: false };
    skipNextClick = true;
  }

  function markerPointerDown(id: string, e: PointerEvent) {
    if (!isMj) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (tool === 'hand') return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag = { id, kind: 'marker', moved: false, sent: false };
    skipNextClick = true;
  }

  function onMapPointerMove(e: PointerEvent) {
    if (isMj && tool === 'fog' && fogOn && !panning) updateFogCursor(e);
    if (panning) return;
    if (fogErasing) {
      if (fogOn) sendFogReveal(mapXY(e));
      return;
    }
    if (!drag) return;
    drag.moved = true;
    const { x, y } = mapXY(e);
    const begin = !drag.sent;
    drag.sent = true;
    if (drag.kind === 'token') {
      dragOverride = { ...dragOverride, [drag.id]: { x, y } };
      scheduleTokenMove(drag.id, x, y, begin);
    } else {
      markerDragOverride = { ...markerDragOverride, [drag.id]: { x, y } };
      sendWs({ type: 'marker.move', id: drag.id, x, y, ...(begin ? { begin: true } : {}) });
    }
  }

  function onMapPointerLeave() {
    onMapPointerUp();
    fogCursor = null;
  }

  function onMapPointerUp() {
    fogErasing = false;
    lastFogPoint = null;
    // NB : on ne touche PAS à `panning` ici. Le setPointerCapture du cadre
    // déclenche un pointerleave immédiat sur la surface, qui appelait ce
    // handler et annulait le panoramique dès la première frame.
    if (drag) {
      const { id, kind } = drag;
      drag = null;
      // `true` : la position finale part TOUJOURS, même si le throttle vient de
      //DROP la précédente — sinon le pion resterait en retard d'un mouvement.
      flushTokenMove(true);
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
    // Le clic droit/molette appartient au panoramique (voir
    // onFramePointerDown) : il ne doit déclencher aucune action d'outil ici.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!isMj || tool !== 'fog') return;
    if (!fogOn) return;
    fogErasing = true;
    lastFogPoint = null;
    sendFogReveal(mapXY(e), true);
  }

  // ── Vue : panoramique (outil « Main », clic droit ou molette) ──
  // Les handlers vivent sur le CADRE et non sur la surface : on peut ainsi
  // déplacer la carte en partant des marges, ce qui n'est pas possible si le
  // point de départ doit être sur l'image.

  /** Un clic droit ou molette panoramique QUEL QUE SOIT l'outil actif : les
   *  joueurs n'ont pas de bouton « Main » (il est dans la barre MJ), et sur un
   *  trackpad le clic molette n'existe pas — le clic droit est le geste réel. */
  const PAN_BUTTONS = new Set([1, 2]);

  /** Le clic droit sur un pion/marqueur garde sa signification (menu contextuel
   *  du MJ) : on ne le transforme pas en panoramique. */
  function isOnToken(e: PointerEvent | MouseEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.('.token, .marker');
  }

  function onFramePointerDown(e: PointerEvent) {
    if (panning) return;
    if (e.pointerType === 'mouse' && PAN_BUTTONS.has(e.button)) {
      if (e.button === 2 && isOnToken(e)) return;
      e.preventDefault();
      panning = { x: e.clientX, y: e.clientY, id: e.pointerId, btn: e.button };
      skipNextClick = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool !== 'hand' || panning) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    panning = { x: e.clientX, y: e.clientY, id: e.pointerId, btn: e.button };
    skipNextClick = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  /** Clic droit sur la carte : ouvre le menu contextuel du vide (sauf sur un
   *  pion/repère, qui a le sien), et n'ouvre rien si un panoramique vient de
   *  se terminer — sinon chaque déplacement laisserait un menu derrière lui. */
  function onFrameContextMenu(e: MouseEvent) {
    if (isOnToken(e)) return;
    e.preventDefault();
    if (Date.now() - panMovedAt < 400) return;
    ctxMenu = { kind: 'map', x: e.clientX, y: e.clientY };
  }

  function onFramePointerMove(e: PointerEvent) {
    if (!panning || panning.id !== e.pointerId) return;
    const dx = e.clientX - panning.x;
    const dy = e.clientY - panning.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      panMovedAt = Date.now();
      // macOS dispatche contextmenu au mousedown : le menu de carte s'ouvre
      // avant qu'on sache que c'est un pan — on le referme dès le mouvement.
      if (ctxMenu?.kind === 'map') ctxMenu = null;
    }
    camera.panBy(dx, dy);
    panning = { x: e.clientX, y: e.clientY, id: e.pointerId, btn: panning.btn };
  }

  function onFramePointerUp(e: PointerEvent) {
    if (!panning || (e && panning.id !== e.pointerId)) return;
    panning = null;
    skipNextClick = false;
    scheduleFogRedraw();
  }

  // Filet de sécurité : si le pointeur est relâché hors du cadre (ou si le
  // capture est perdu), on ne doit pas rester « en train de panoramique ».
  $effect(() => {
    const end = (e: PointerEvent) => onFramePointerUp(e);
    globalThis.addEventListener('pointerup', end);
    globalThis.addEventListener('pointercancel', end);
    return () => {
      globalThis.removeEventListener('pointerup', end);
      globalThis.removeEventListener('pointercancel', end);
    };
  });

  function onMapClick(e: MouseEvent) {
    if (skipNextClick) {
      skipNextClick = false;
      return;
    }
    if (!isMj) return;
    const { x, y } = mapXY(e);
    if (pendingPlace) {
      sendWs({
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
      sendWs({
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
      sendWs({ type: 'marker.set', x, y, text: markerText.trim() || 'repère' });
    }
  }

  function onMapDblClick(e: MouseEvent) {
    const { x, y } = mapXY(e);
    sendWs({ type: 'ping', x, y });
  }

  function markerRemove(id: string, e: Event) {
    e.stopPropagation();
    sendWs({ type: 'marker.remove', id });
  }

  function clearMarkers() {
    sendWs({ type: 'marker.clear' });
  }

  function fogToggle() {
    if (!fogOn) {
      sendWs({ type: 'fog.enable' });
      tool = 'fog';
    } else {
      tool = tool === 'fog' ? 'move' : 'fog';
    }
  }

  function fogCover() {
    sendWs({ type: 'fog.cover' });
  }

  function fogDisable() {
    sendWs({ type: 'fog.disable' });
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
  let fogScale = 1;
  let fogScaleTimer: ReturnType<typeof setTimeout> | null = null;
  let fogCursor = $state<{ x: number; y: number } | null>(null);

  /** Rayon de la brosse, en px de surface (identique au trou découpé). */
  const FOG_BRUSH_RADIUS = 68;

  /** Position surface (px) du curseur : le cercle de prévisualisation suit la
   *  souris à la même échelle que les trous réellement découpés. */
  function updateFogCursor(e: PointerEvent) {
    const el = frameRef;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const z = camera.zoom || 1;
    const sx = (r.width - surfaceSize.w) / 2;
    const sy = (r.height - surfaceSize.h) / 2;
    fogCursor = {
      x: (e.clientX - r.left - camera.panX) / z - sx,
      y: (e.clientY - r.top - camera.panY) / z - sy,
    };
  }

  /** Repeint le brouillard à la nouvelle résolution (le zoom change l'échelle
   *  de la backing store). Regroupé pour ne pas redessiner à chaque molette. */
  function scheduleFogRedraw() {
    if (fogScaleTimer) clearTimeout(fogScaleTimer);
    fogScaleTimer = setTimeout(() => {
      fogScaleTimer = null;
      drawFog();
    }, 140);
  }

  function cutFogHole(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const px = (x / 100) * w;
    const py = (y / 100) * h;
    const rad = FOG_BRUSH_RADIUS;
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
    // On dessine en coordonnées de SURFACE et la backing store est plus grande
    // d'un facteur `fogScale` : le canvas reste net quand la carte est zoomée.
    ctx.setTransform(fogScale, 0, 0, fogScale, 0, 0);
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
    // offsetWidth/Height = taille de MISE EN PAGE, insensible au transform CSS.
    // getBoundingClientRect() renverrait ici la taille déjà zoomée, ce qui
    // décalerait tous les trous de brouillard.
    const w = Math.max(2, mapContainer.offsetWidth);
    const h = Math.max(2, mapContainer.offsetHeight);
    const dpr = globalThis.devicePixelRatio || 1;
    const nextScale = Math.min(3, Math.max(1, camera.zoom * dpr));
    const scaleChanged = Math.abs(nextScale - fogScale) > 0.01;
    fogScale = nextScale;
    const bw = Math.round(w * fogScale);
    const bh = Math.round(h * fogScale);
    const resized = fogCanvas.width !== bw || fogCanvas.height !== bh;
    if (resized) {
      fogCanvas.width = bw;
      fogCanvas.height = bh;
    }

    const reveals = activeFog?.reveals ?? [];
    const sameCanvas = fogDrawnCanvas === fogCanvas;
    const sameMap = sameCanvas && fogDrawnMapId === store.state.mapId;
    const grew = sameMap && reveals.length >= fogDrawnCount;

    if (resized || scaleChanged || !sameMap || !grew) {
      drawFogBase(w, h);
      return;
    }
    if (reveals.length === fogDrawnCount) return;

    const ctx = fogCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(fogScale, 0, 0, fogScale, 0, 0);
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
      clearWsError();
    }, 4000);
  });

  const diceTypes = [4, 6, 8, 10, 12, 20];

  // ── Pose depuis la bibliothèque de PNJ ───────────────────────
  let pendingPlace = $state<{ templateId: string; name: string; count: number } | null>(null);

  // Largeurs estimées : la sortie est un classement par priorité, pas une
  // mesure au pixel — seuls les outils y participent, `Cartes` et la
  // bibliothèque restent toujours visibles.
  const toolbarItems = $derived([
    { id: 'hand', width: 86, priority: 90, pinned: tool === 'hand' },
    { id: 'move', width: 112, priority: 60, pinned: tool === 'move' },
    { id: 'fog', width: 132, priority: 55, pinned: tool === 'fog' },
    { id: 'marker', width: 110, priority: 50, pinned: tool === 'marker' },
    { id: 'pnj', width: 94, priority: 45, pinned: tool === 'pnj' || !!pendingPlace },
  ]);
  const toolbarAvailable = $derived(
    Math.max(0, toolbarWidth - (panelsOpen.compagnie ? 316 : 0) - (panelsOpen.panel ? 352 : 0) - 224),
  );
  const toolbarFit = $derived(fitToolbar(toolbarItems, toolbarAvailable));
  const visibleToolIds = $derived(toolbarFit.visible.map((i) => i.id));

  function runToolbarItem(id: string) {
    switch (id) {
      case 'hand':
        toolSelect('hand');
        break;
      case 'move':
        toolSelect('move');
        break;
      case 'pnj':
        toolSelect('pnj');
        break;
      case 'marker':
        toolSelect('marker');
        break;
      case 'fog':
        fogToggle();
        break;
    }
  }


  // ── Menu contextuel unique (Lot 5) ───────────────────────────
  // Une seule instance pilotée par la page ; chaque surface l'ouvre au
  // pointeur avec ses entrées. bits-ui gère focus, flèches, Échap et clic
  // extérieur (l'ancien menu maison a été retiré avec son listener global).
  type CtxTarget =
    | { kind: 'token'; charId: string; charKind: 'pj' | 'pnj'; x: number; y: number }
    | { kind: 'marker'; id: string; x: number; y: number }
    | { kind: 'map'; x: number; y: number }
    | ({ x: number; y: number } & AssetTarget);

  let ctxMenu = $state<CtxTarget | null>(null);
  /** Un panoramique au clic droit ne doit pas ouvrir le menu au relâchement. */
  let panMovedAt = 0;

  const ctxItems = $derived.by<ContextMenuItem[]>(() => {
    const t = ctxMenu;
    if (!t) return [];

    if (t.kind === 'asset-map') {
      return [
        {
          id: 'show',
          label: 'Afficher cette carte',
          onSelect: () => {
            selectMap(t.mapId);
            assetManagerOpen = false;
          },
        },
        {
          id: 'rename',
          label: 'Renommer…',
          separatorBefore: true,
          onSelect: () => openRenameMapPrompt(t.mapId),
        },
        {
          id: 'replace-image',
          label: "Remplacer l'image…",
          onSelect: () =>
            pickFile(IMAGE_ACCEPT, (f) => void replaceMapImage(t.mapId, f)),
        },
      ];
    }
    if (t.kind === 'asset-template') {
      const items: ContextMenuItem[] = [
        {
          id: 'spawn',
          label: `Poser ×${t.count}`,
          onSelect: () => {
            armTemplate(t.templateId, t.name, t.count);
            assetManagerOpen = false;
          },
        },
      ];
      if (isMj) {
        items.push({
          id: 'delete',
          label: 'Supprimer le modèle',
          danger: true,
          separatorBefore: true,
          onSelect: () => void deleteTemplate(t.templateId),
        });
      }
      return items;
    }
    if (t.kind === 'asset-char') {
      const placed = !!store.state.tokens[t.charId];
      const items: ContextMenuItem[] = placed
        ? [{ id: 'focus', label: 'Recentrer la caméra', onSelect: () => focusToken(t.charId) }]
        : [{ id: 'place', label: 'Placer sur la carte', onSelect: () => placeOnMap(t.charId) }];
      items.push(
        {
          id: 'portrait',
          label: "Changer l'avatar…",
          separatorBefore: true,
          onSelect: () => pickFile(IMAGE_ACCEPT, (f) => void changePortrait(t.charId, f)),
        },
        {
          id: 'sheet',
          label: 'Ouvrir la feuille',
          onSelect: () => {
            globalThis.location.href = `/characters/${t.charId}`;
          },
        },
      );
      return items;
    }

    if (t.kind === 'token') {
      const c = charById(t.charId);
      const items: ContextMenuItem[] = [
        { id: 'focus', label: 'Recentrer la caméra', onSelect: () => focusToken(t.charId) },
      ];
      if (isMj) {
        for (const s of TOKEN_SCALES) {
          items.push({
            id: `size.${s}`,
            label: `Taille : ${scaleLabel(s)}`,
            separatorBefore: s === TOKEN_SCALES[0],
            disabled: c?.tokenScale === s,
            onSelect: () => sendWs({ type: 'char.scale', charId: t.charId, scale: s }),
          });
        }
        if (t.charKind === 'pnj') {
          items.push({
            id: 'dup',
            label: 'Dupliquer le PNJ',
            separatorBefore: true,
            onSelect: () => sendWs({ type: 'npc.duplicate', charId: t.charId }),
          });
        }
        items.push({
          id: 'remove-token',
          label: 'Retirer de la carte',
          onSelect: () => sendWs({ type: 'token.remove', charId: t.charId }),
        });
        if (t.charKind === 'pnj') {
          items.push({
            id: 'delete-npc',
            label: 'Supprimer le PNJ',
            danger: true,
            separatorBefore: true,
            onSelect: () => sendWs({ type: 'npc.remove', charId: t.charId }),
          });
        }
      }
      return items;
    }

    if (t.kind === 'marker') {
      const focusMarker = () => {
        const m = store.state.markers.find((x) => x.id === t.id);
        if (m) camera.centerOn(m.x / 100, m.y / 100);
      };
      const items: ContextMenuItem[] = [
        { id: 'focus', label: 'Recentrer la caméra', onSelect: focusMarker },
      ];
      if (isMj) {
        items.push(
          {
            id: 'remove',
            label: 'Supprimer le repère',
            separatorBefore: true,
            onSelect: () => sendWs({ type: 'marker.remove', id: t.id }),
          },
          {
            id: 'clear',
            label: 'Effacer tous les repères',
            danger: true,
            onSelect: () => sendWs({ type: 'marker.clear' }),
          },
        );
      }
      return items;
    }

    // Vide de carte.
    const items: ContextMenuItem[] = [];
    if (myCharId && store.state.tokens[myCharId]) {
      items.push({
        id: 'focus-me',
        label: 'Recentrer sur mon pion',
        onSelect: () => focusToken(myCharId),
      });
    }
    items.push({ id: 'fit', label: 'Recadrer la carte', onSelect: resetView });
    if (isMj) {
      items.push(
        {
          id: 'tool.move',
          label: 'Outil Déplacer',
          separatorBefore: true,
          onSelect: () => toolSelect('move'),
        },
        { id: 'tool.pnj', label: 'Outil PNJ', onSelect: () => toolSelect('pnj') },
        { id: 'tool.marker', label: 'Outil Repère', onSelect: () => toolSelect('marker') },
        {
          id: 'fog.toggle',
          label: fogOn ? 'Brouillard : désactiver' : 'Brouillard : activer',
          separatorBefore: true,
          onSelect: fogToggle,
        },
      );
    }
    return items;
  });

  function openTokenMenu(e: MouseEvent, charId: string, charKind: 'pj' | 'pnj') {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu = { kind: 'token', charId, charKind, x: e.clientX, y: e.clientY };
  }

  function openMarkerMenu(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu = { kind: 'marker', id, x: e.clientX, y: e.clientY };
  }

  /** Clic droit dans l'asset manager : même menu unique, cible « asset ». */
  function openAssetMenu(e: MouseEvent, target: AssetTarget) {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu = { ...target, x: e.clientX, y: e.clientY } as CtxTarget;
  }

  function armTemplate(templateId: string, name: string, count: number) {
    tool = 'move';
    pendingPlace = { templateId, name, count };
  }

  // ── Bibliothèque : import et renommage (lot 5.4, compléments) ──
  /** Sélecteur de fichier programmatique (pas d'input permanent à l'écran). */
  function pickFile(accept: string, onPick: (file: File) => void) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) onPick(f);
    };
    input.click();
  }

  const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

  function mapNameFromFile(name: string): string {
    return name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Nouvelle carte';
  }

  async function createMapFromFile(file: File) {
    try {
      await api.maps.create(campaignId, mapNameFromFile(file.name), file);
      await refreshMaps();
    } catch {
      toast = "Import de la carte impossible";
    }
  }

  async function replaceMapImage(mapId: string, file: File) {
    try {
      await api.maps.update(mapId, { image: file });
      await refreshMaps();
    } catch {
      toast = "Remplacement de l'image impossible";
    }
  }

  async function renameMap(mapId: string, name: string) {
    try {
      await api.maps.update(mapId, { name });
      await refreshMaps();
    } catch {
      toast = 'Renommage impossible';
    }
  }

  function openRenameMapPrompt(mapId: string) {
    const map = maps.find((m) => m.id === mapId);
    prompt = {
      title: 'Renommer la carte',
      label: 'Nom',
      initial: map?.name ?? '',
      confirmLabel: 'Renommer',
      onSubmit: (v) => void renameMap(mapId, v),
    };
  }

  async function changePortrait(charId: string, file: File) {
    try {
      await api.characters.updatePortrait(charId, file);
    } catch {
      toast = "Import de l'avatar impossible";
    }
  }

  async function deleteTemplate(templateId: string) {
    try {
      await api.npcTemplates.remove(templateId);
      templatesRevision += 1;
    } catch {
      toast = 'Suppression du modèle impossible';
    }
  }

  /** Double-clic dans la bibliothèque : poser, ou recentrer s'il l'est déjà. */
  function placeCharFromLibrary(charId: string) {
    if (store.state.tokens[charId]) focusToken(charId);
    else placeOnMap(charId);
  }

  // ── Raccourcis clavier ───────────────────────────────────────
  function focusChat() {
    activeTab = 'journal';
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.chat-input')?.focus();
    });
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.altKey) return;
    if (e.key === 'Escape') {
      ctxMenu = null;
      pendingPlace = null;
      if (isMj) tool = 'move';
      return;
    }
    const id = hotkeyIdFromEvent(e, { isMj, overlayOpen: paletteOpen || helpOpen });
    if (!id) return;
    e.preventDefault();
    switch (id) {
      case 'palette.open':
        paletteOpen = true;
        break;
      case 'help.open':
        helpOpen = true;
        break;
      case 'chat.focus':
        focusChat();
        break;
      case 'map.hand':
        toolSelect('hand');
        break;
      case 'map.reset':
        resetView();
        break;
      case 'camera.focus': {
        const target = activeCharId ?? myCharId;
        if (target) focusToken(target);
        break;
      }
      case 'undo':
        doUndo();
        break;
      case 'redo':
        doRedo();
        break;
      case 'tool.move':
        toolSelect('move');
        break;
      case 'tool.pnj':
        toolSelect('pnj');
        break;
      case 'tool.marker':
        toolSelect('marker');
        break;
      case 'tool.fog':
        fogToggle();
        break;
      case 'dice.d4':
        quickRoll(4);
        break;
      case 'dice.d6':
        quickRoll(6);
        break;
      case 'dice.d8':
        quickRoll(8);
        break;
      case 'dice.d10':
        quickRoll(10);
        break;
      case 'dice.d12':
        quickRoll(12);
        break;
      case 'dice.d20':
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

  /** Taille du pion en px : `tokenScale` × case si la carte est quadrillée,
   *  sinon repli sur le réglage de campagne en px (carte sans grille). */
  function tokenSizePx(c: { tokenScale: number }): number {
    const scale = c.tokenScale > 0 ? c.tokenScale : 1;
    const base = activeGridSize ?? store.settings.tokenSize;
    return Math.round(Math.max(12, base * scale));
  }

  /** PV en % (0..100) ; null = pas de barre (PV masqués par le serveur). */
  function hpPercent(c: { pv: number | null; pvMax: number | null }): number | null {
    if (c.pv === null || c.pvMax === null || c.pvMax <= 0) return null;
    return Math.max(0, Math.min(100, (c.pv / c.pvMax) * 100));
  }

  function initiativeScore(charId: string): number | null {
    const combat = store.state.combat;
    if (store.state.mode !== 'combat' || !combat || !combat.order) return null;
    const score = combat.scores[charId];
    return typeof score === 'number' ? score : null;
  }

  function scaleLabel(scale: number): string {
    return scale === 0.5 ? '½ case' : `${scale} case${scale > 1 ? 's' : ''}`;
  }

  function setTokenScale(charId: string, e: Event) {
    const scale = Number((e.currentTarget as HTMLSelectElement).value);
    if (Number.isFinite(scale)) sendWs({ type: 'char.scale', charId, scale });
  }
</script>

<div class="table-screen">
  <!-- Couche carte : le monde est plein écran. -->
  <div class="layer-map">
      <main
        class="map-frame"
        bind:this={frameRef}
        role="region"
        aria-label="Carte de jeu — molette pour zoomer, clic droit ou outil Main pour déplacer la carte"
        onpointerdown={onMapPointerDown}
        onpointermove={onMapPointerMove}
        onpointerup={onMapPointerUp}
        onpointercancel={onMapPointerUp}
        onpointerleave={onMapPointerLeave}
        onclick={onMapClick}
        ondblclick={onMapDblClick}
        oncontextmenu={onFrameContextMenu}
      >
        {#if !activeMap}
          <div class="map-placeholder">
            {#if isMj}Créez ou sélectionnez une carte via « Cartes ».{:else}Le MJ n'a pas encore choisi de carte.{/if}
          </div>
        {:else}
          <!-- Couche gestes : sœur du contenu, jamais son ancêtre (piège B du
               spike : un setPointerCapture sur un ancêtre vole les clics des pions). -->
          <div
            class="map-bg"
            role="presentation"
            class:panning={!!panning}
            class:cursor-hand={tool === 'hand'}
            class:cursor-fog={isMj && tool === 'fog'}
            class:cursor-place={(isMj && (tool === 'pnj' || tool === 'marker')) || !!pendingPlace}
            onpointerdown={onFramePointerDown}
            onpointermove={onFramePointerMove}
            onpointerup={onFramePointerUp}
            onpointercancel={onFramePointerUp}
            oncontextmenu={onFrameContextMenu}
          ></div>

          <div
            class="map-zoom"
            class:tool-hand={tool === 'hand'}
            style="transform: translate({camera.panX}px, {camera.panY}px) scale({camera.zoom})"
          >
            <div
              bind:this={mapContainer}
              class="map-surface"
              class:map-surface--fitted={!!fittedSize}
              class:map-surface--fill={!fittedSize}
              style={fittedSize ? `width: ${fittedSize.w}px; height: ${fittedSize.h}px;` : ''}
            >
            {#if activeMap.hasImage}
              <img class="map-img" src={api.maps.imageUrl(activeMap.id)} alt="" draggable="false" onload={onMapImageLoad} />
            {/if}

            {#if activeGridSize}
              <div
                class="map-grid"
                class:map-grid--overlay={activeMap.hasImage}
                class:map-grid--tinted={!!activeGridColor}
                style="--map-grid-size: {activeGridSize}px; --map-grid-color: {activeGridColor ?? 'var(--map-line)'}"
              ></div>
            {/if}

            {#if fogOn}
              <canvas bind:this={fogCanvas} class="fog-canvas" style="opacity: {isMj ? 0.45 : 1};"></canvas>
            {/if}

            {#if isMj && tool === 'fog' && fogOn && fogCursor}
              <div class="fog-brush" style="left: {fogCursor.x}px; top: {fogCursor.y}px;"></div>
            {/if}

            {#each displayMarkers as m (m.id)}
              <div
                class="marker"
                style="left: {m.x}%; top: {m.y}%;"
                onpointerdown={(e) => markerPointerDown(m.id, e)}
                oncontextmenu={(e) => openMarkerMenu(e, m.id)}
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
                {@const tokSize = tokenSizePx(c)}
                {@const hpPct = hpPercent(c)}
                {@const hpState = hpPct === null ? null : hpPct >= 70 ? 'ok' : hpPct >= 30 ? 'mid' : 'low'}
                {@const ini = initiativeScore(c.id)}
                {@const down = c.conditions.some((cond) => DOWN_CONDITIONS.has(cond))}
                <div
                  class="token {c.kind === 'pnj' ? 'token-pnj' : 'token-pj'} {activeCharId === c.id ? 'token-active' : ''} {pUrl ? 'token-portrait' : ''}"
                  class:token-dead={hpPct !== null && hpPct <= 0}
                  class:token-down={down}
                  style="left: {t.x}%; top: {t.y}%; --token-color: {c.color}; --tok-size: {tokSize}px; width: {tokSize}px; height: {tokSize}px; font-size: {Math.round(tokSize * 0.42)}px;"
                  title={tokenTitle(c)}
                  onpointerdown={(e) => tokenPointerDown(tokenId, e)}
                  oncontextmenu={(e) => openTokenMenu(e, c.id, c.kind)}
                >
                  {#if pUrl}<img class="token-img" src={pUrl} alt="" draggable="false" />{:else}{c.name.slice(0, 1).toUpperCase()}{/if}
                  {#if ini !== null}
                    <span class="token-ini" class:is-turn={activeCharId === c.id}>{ini}</span>
                  {/if}
                  <div class="token-foot">
                    {#if hpState}
                      <span class="token-hp hp-{hpState}"><span class="token-hp-fill" style="width: {hpPct}%;"></span></span>
                    {/if}
                    <span class="token-label">{c.name}</span>
                  </div>
                </div>
              {/if}
            {/each}

            {#each store.pings as p (p.id)}
              <div class="ping" style="left: {p.x}%; top: {p.y}%;"></div>
            {/each}
            </div>
          </div>

          <div
            class="map-hud"
            class:behind-panel={panelsOpen.panel}
            role="toolbar"
            aria-label="Vue de la carte"
            tabindex="-1"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
            ondblclick={(e) => e.stopPropagation()}
          >
            <button
              class="hud-hand"
              class:on={tool === 'hand'}
              title="Déplacer la carte — raccourci H, ou glissez au clic droit"
              aria-pressed={tool === 'hand'}
              onclick={() => toolSelect('hand')}>✋</button
            >
            <button title="Dézoomer" onclick={() => zoomAtCenter(1 / 1.3)}>−</button>
            <button
              class="hud-fit"
              class:off={camera.zoom === 1 && camera.panX === 0 && camera.panY === 0}
              title="Revenir à la carte entière"
              onclick={resetView}>{Math.round(camera.zoom * 100)}%</button
            >
            <button title="Zoomer" onclick={() => zoomAtCenter(1.3)}>+</button>
          </div>
        {/if}
      </main>
    </div>
    <!-- /couche carte -->

  <!-- Couche chrome : la carte est l'application, l'UI est une surimpression.
       `pointer-events` est porté par chaque élément, pas par la couche. -->
  <div class="layer-chrome">
  <!-- Barre de session -->
  <header class="session-bar">
    <div class="session-title">
      <span class="campaign-name">{campaignName || '…'}</span>
      <span class="session-hint">Séance en cours · Espace : commandes · double-clic : ping</span>
    </div>
    <button
      class="palette-btn"
      aria-label="Command palette (Espace)"
      onclick={() => (paletteOpen = true)}
    >⌘ Commandes</button>
    <div class="mode-toggle">
      <button class="mode-btn {store.state.mode === 'exploration' ? 'exp-active' : ''}" onclick={() => setMode('exploration')}>Exploration</button>
      <button class="mode-btn {store.state.mode === 'combat' ? 'combat-active' : ''}" onclick={() => setMode('combat')}>Combat</button>
    </div>
    <a href="/compendium?campaign={campaignId}" class="compendium-link">Compendium</a>
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

    <!-- Compagnie : panneau flottant, déplaçable et redimensionnable (Lot 5). -->
    {#if panelsOpen.compagnie}
    <Panel
      id="compagnie"
      title="Compagnie"
      campaignId={campaignId}
      onClose={() => setPanelOpen('compagnie', false)}
      closeLabel="Fermer la compagnie"
      initial={{ x: 16, y: 56, w: 288, h: Math.min(640, innerHeight - 200) }}
      class="compagnie"
    >
      <div class="panel-body scroll-area" use:scrollArea>
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
          {#if isMj}
            <div class="card-row size-row">
              <span class="size-label">Taille du pion</span>
              <select class="size-select" value={String(c.tokenScale)} onchange={(e) => setTokenScale(c.id, e)}>
                {#each TOKEN_SCALES as s (s)}
                  <option value={String(s)}>{scaleLabel(s)}</option>
                {/each}
              </select>
            </div>
          {/if}
          {#if isMj && activeMap && !hasToken(c.id)}
            <button class="place-btn" onclick={() => placeOnMap(c.id)}>Placer sur la carte</button>
          {/if}
          <div class="cond-row">
            {#each c.conditions as cond (cond)}
              <CompendiumTooltip campaign={campaignId} category="etats" slug={slugify(cond)}>
                <span
                  class="cond-chip"
                  role={isMj ? 'button' : undefined}
                  tabindex={isMj ? 0 : undefined}
                  title={isMj ? 'Cliquez pour retirer' : cond}
                  onclick={() => removeCondition(c.id, cond)}
                >{cond}</span>
              </CompendiumTooltip>
            {/each}
            {#if isMj}
              <select class="cond-select" value="" onchange={(e) => addCondition(c.id, e)}>
                <option value="">+ état</option>
                {#each stateOptions as cond (cond)}
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
                <button class="model-btn" title="Enregistrer comme modèle réutilisable" onclick={() => sendWs({ type: 'npc.saveAsTemplate', charId: c.id })}>modèle</button>
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
          {#if isMj}
            <div class="card-row size-row">
              <span class="size-label">Taille du pion</span>
              <select class="size-select" value={String(c.tokenScale)} onchange={(e) => setTokenScale(c.id, e)}>
                {#each TOKEN_SCALES as s (s)}
                  <option value={String(s)}>{scaleLabel(s)}</option>
                {/each}
              </select>
            </div>
          {/if}
          {#if isMj && activeMap && !hasToken(c.id)}
            <button class="place-btn" onclick={() => placeOnMap(c.id)}>Placer sur la carte</button>
          {/if}
          <div class="cond-row">
            {#each c.conditions as cond (cond)}
              <CompendiumTooltip campaign={campaignId} category="etats" slug={slugify(cond)}>
                <span class="cond-chip">{cond}</span>
              </CompendiumTooltip>
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
      </div>
    </Panel>
    {/if}

      <div class="map-header surface-raised" class:shifted={panelsOpen.compagnie}>
        <span class="map-name">{activeMap?.name ?? 'Aucune carte sélectionnée'}</span>
        <span class="explore-label">
          {store.state.mode === 'combat'
            ? 'Mode combat — initiative en cours'
            : 'Mode exploration — déplacez-vous librement'}
        </span>
        <div class="spacer"></div>
        <span class="scale-label">1 case ≈ 1,50 m</span>
      </div>

      {#if store.state.mode === 'combat' && store.state.combat}
        <aside
          class="initiative-rail surface-raised"
          class:behind-panel={panelsOpen.panel}
          aria-label="Initiative"
        >
          <div class="init-head">
            <span class="init-title">Initiative</span>
            <span class="round-badge">
              {store.state.combat.phase === 'run' ? `round ${store.state.combat.round}` : 'à vos d20'}
            </span>
          </div>

          {#if store.state.combat.phase === 'init'}
            <div class="init-pending">
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
            </div>
          {/if}

          <div class="init-list scroll-area" use:scrollArea>
            {#each initChips as e, i (e.id)}
              {@const c = e.c}
              {@const pct = c && c.pv !== null && c.pvMax !== null && c.pvMax > 0
                ? Math.max(0, Math.min(100, (c.pv / c.pvMax) * 100))
                : null}
              {@const down = pct !== null && pct <= 0}
              <div
                class="init-row"
                class:active={activeCharId === e.id}
                class:defeated={down}
                role="button"
                tabindex="0"
                data-name={c?.name ?? ''}
                title="Recentrer la carte sur ce pion"
                onclick={() => focusToken(e.id)}
                onkeydown={(ev) => {
                  if (ev.key === 'Enter') focusToken(e.id);
                }}
              >
                {#if c && portraitUrl(c.portrait)}
                  <img class="init-portrait" src={portraitUrl(c.portrait)} alt="" draggable="false" />
                {:else}
                  <span class="init-initial" style="--token-color: {c?.color ?? 'var(--accent)'};">
                    {(c?.name ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                {/if}
                <span class="init-body">
                  <span class="init-name">{c?.name}</span>
                  {#if pct !== null}
                    <span class="init-hp">
                      <span class="init-hp-fill {pct >= 70 ? 'ok' : pct >= 30 ? 'mid' : 'low'}" style="width: {pct}%;"></span>
                    </span>
                  {/if}
                </span>
                {#if down}<span class="init-down">vaincu</span>{/if}
                <span class="init-score">{e.score ?? '—'}</span>
                {#if isMj && store.state.combat.phase === 'run' && store.state.combat.order}
                  <span class="init-move">
                    <button
                      type="button"
                      aria-label="Monter {c?.name}"
                      title="Monter dans l'initiative"
                      disabled={i === 0}
                      onclick={(ev) => {
                        ev.stopPropagation();
                        reorderCombat(e.id, true);
                      }}>▲</button
                    >
                    <button
                      type="button"
                      aria-label="Descendre {c?.name}"
                      title="Descendre dans l'initiative"
                      disabled={i === initChips.length - 1}
                      onclick={(ev) => {
                        ev.stopPropagation();
                        reorderCombat(e.id, false);
                      }}>▼</button
                    >
                  </span>
                {/if}
              </div>
            {/each}
          </div>

          {#if isMj && store.state.combat.phase === 'run'}
            <button class="next-turn-btn" onclick={combatNext}>Tour suivant →</button>
          {/if}
        </aside>
      {/if}

      <!-- Barre d'outils ancrée en bas, centrée, sortie par priorité (Lot 2). -->
      <div class="toolbar-row" use:onToolbarResize>
        {#if pendingPlace || (isMj && (tool === 'pnj' || tool === 'marker' || (tool === 'fog' && fogOn)))}
          <div class="tool-hint-chip">
            {#if pendingPlace}
              Cliquez sur la carte pour poser {pendingPlace.count > 1 ? `${pendingPlace.count} × ` : ''}{pendingPlace.name} — Échap pour annuler
            {:else if tool === 'pnj' || tool === 'marker'}
              Cliquez sur la carte pour placer
            {:else}
              Glissez sur la carte pour dévoiler — invisible pour les joueurs
            {/if}
          </div>
        {/if}
        <div class="mj-toolbar surface-raised">
          {#if isMj}
            <div class="history-group" role="group" aria-label="Historique">
              <button
                class="history-btn"
                type="button"
                disabled={!store.history.canUndo || historyBusy}
                title="Annuler — Ctrl/⌘ Z"
                aria-label="Annuler"
                onclick={doUndo}
              >
                <ICONS.undo size={16} strokeWidth={2} />
              </button>
              <button
                class="history-btn"
                type="button"
                disabled={!store.history.canRedo || historyBusy}
                title="Rétablir — Ctrl/⌘ ⇧ Z"
                aria-label="Rétablir"
                onclick={doRedo}
              >
                <ICONS.redo size={16} strokeWidth={2} />
              </button>
            </div>
            <span class="tsep"></span>
          {/if}
          {#if isMj && toolbarFit.overflow.length > 0}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger class="tool-more" aria-label="Autres outils">⋯</DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content {...surfaceProps('overlay', 'tool-overflow')} side="top" sideOffset={8}>
                  {#each toolbarFit.overflow as item (item.id)}
                    <DropdownMenu.Item class="tool-overflow-item" onSelect={() => runToolbarItem(item.id)}>
                      {TOOL_FACES[item.id as keyof typeof TOOL_FACES]?.label ?? item.id}
                    </DropdownMenu.Item>
                  {/each}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          {/if}

          {#if visibleToolIds.includes('hand')}
            <ToolGroup
              label="Main"
              icon="hand"
              hotkeyLabel="H"
              active={tool === 'hand'}
              onselect={() => toolSelect('hand')}
            />
          {/if}
          {#if isMj && visibleToolIds.includes('move')}
            <ToolGroup
              label="Déplacer"
              icon="move"
              hotkeyLabel="V"
              active={tool === 'move'}
              onselect={() => toolSelect('move')}
            />
          {/if}
          {#if isMj && visibleToolIds.includes('pnj')}
            <ToolGroup
              label="PNJ"
              icon="npc"
              hotkeyLabel="P"
              active={tool === 'pnj' || !!pendingPlace}
              onselect={() => toolSelect('pnj')}
            >
              {#snippet options()}
                <span class="opt-title">Nouveau PNJ</span>
                <label>Nom <input class="npc-input" bind:value={npcName} placeholder="nom" /></label>
                <label>PV <input class="npc-input narrow" type="number" bind:value={npcPv} /></label>
                <label>CA <input class="npc-input narrow" type="number" bind:value={npcCa} /></label>
                <label>Init <input class="npc-input narrow" type="number" bind:value={npcInit} /></label>
                <button
                  class="ghost-btn lib-toggle"
                  class:on={npcSaveAsTemplate}
                  onclick={() => (npcSaveAsTemplate = !npcSaveAsTemplate)}
                >→ bibliothèque</button>
                <span class="opt-hint">Cliquez sur la carte pour poser.</span>
              {/snippet}
            </ToolGroup>
          {/if}
          {#if isMj && visibleToolIds.includes('marker')}
            <ToolGroup
              label="Repère"
              icon="marker"
              hotkeyLabel="R"
              active={tool === 'marker'}
              onselect={() => toolSelect('marker')}
            >
              {#snippet options()}
                <span class="opt-title">Repère</span>
                <label>Texte <input class="marker-input" bind:value={markerText} placeholder="texte du repère…" /></label>
                <button class="ghost-btn danger" onclick={clearMarkers}>Effacer les repères</button>
                <span class="opt-hint">Cliquez sur la carte pour poser.</span>
              {/snippet}
            </ToolGroup>
          {/if}
          {#if isMj && visibleToolIds.includes('fog')}
            <ToolGroup
              label="Brouillard"
              icon="fog"
              hotkeyLabel="B"
              active={tool === 'fog'}
              onselect={fogToggle}
            >
              {#snippet options()}
                <span class="opt-title">Brouillard</span>
                <div class="opt-row">
                  <button class="ghost-btn" onclick={fogCover}>Tout recouvrir</button>
                  <button class="ghost-btn danger" onclick={fogDisable}>Dissiper</button>
                </div>
                <span class="opt-hint">Glissez sur la carte pour dévoiler — invisible pour les joueurs.</span>
              {/snippet}
            </ToolGroup>
          {/if}

          {#if isMj}
            <div class="tsep"></div>
            <button class="asset-btn" type="button" onclick={() => (assetManagerOpen = true)}>
              <ICONS.library size={14} strokeWidth={2} aria-hidden="true" /> Bibliothèque
            </button>
            <MapManager {campaignId} {maps} activeMapId={store.state.mapId} onPick={selectMap} onChanged={refreshMaps} />
            <NpcLibrary {campaignId} onPlace={(tpl, count) => {
              tool = 'move';
              pendingPlace = { templateId: tpl.id, name: tpl.name, count };
            }} />
          {/if}
        </div>
      </div>

      {#if !panelsOpen.compagnie}
        <button class="panel-toggle left" aria-label="Afficher la compagnie" onclick={() => setPanelOpen('compagnie', true)}>›</button>
      {/if}
      {#if !panelsOpen.panel}
        <button class="panel-toggle right" aria-label="Afficher le panneau" onclick={() => setPanelOpen('panel', true)}>‹</button>
      {/if}
  </div>
  <!-- /couche chrome -->


    <!-- Panneau à onglets : flottant, refermable, persistant. -->
    {#if panelsOpen.panel}
    <Panel
      id="panel"
      title="Séance"
      campaignId={campaignId}
      onClose={() => setPanelOpen('panel', false)}
      closeLabel="Fermer le panneau"
      initial={{
        x: Math.max(16, innerWidth - 324 - 16),
        y: 56,
        w: 324,
        h: Math.min(640, innerHeight - 200),
      }}
      class="panel"
    >
      <div class="tabs">
        <button class="tab {activeTab === 'journal' ? 'active' : ''}" onclick={() => (activeTab = 'journal')}>Journal</button>
        <button class="tab {activeTab === 'dice' ? 'active' : ''}" onclick={() => (activeTab = 'dice')}>Dés</button>
        <button class="tab {activeTab === 'inv' ? 'active' : ''}" onclick={() => (activeTab = 'inv')}>Inventaire</button>
      </div>

      <!-- Onglet Journal -->
      {#if activeTab === 'journal'}
        <div class="journal-tab">
          <div class="journal-list scroll-area" bind:this={journalEl} onscroll={onJournalScroll} use:scrollArea>
            {#if hasMoreOlder}
              <button class="older-btn" disabled={loadingOlder} onclick={loadOlder}>
                {loadingOlder ? '…' : 'Entrées antérieures'}
              </button>
            {/if}
            {#each [...olderEntries, ...store.journal] as entry, j (entry.id + ':' + j)}
              <div class="journal-entry entry-{entry.kind}" data-jid={entry.id}>
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
                {:else if entry.kind === 'share'}
                  <span class="journal-system">✦ {entry.who ?? 'Le MJ'} a partagé</span>
                  {#if entry.ref?.type === 'compendium'}
                    <a
                      class="share-chip"
                      href="/compendium?campaign={campaignId}&cat={entry.ref.category}&slug={entry.ref.slug}"
                    >{entry.ref.title ?? entry.text}</a>
                  {:else}
                    <span class="journal-text">{entry.text}</span>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
          {#if unseenCount > 0}
            <button class="new-msg-pill" onclick={jumpToNew}>
              ↓ {unseenCount} nouveau{unseenCount > 1 ? 'x' : ''} message{unseenCount > 1 ? 's' : ''}
            </button>
          {/if}
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
        <div class="dice-tab scroll-area" use:scrollArea>
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
        <div class="inv-tab scroll-area" use:scrollArea>
          {#if invGiveTargets.length === 0}
            <p class="inv-placeholder">Inventaire — aucun personnage visible</p>
          {:else}
            {#if isMj && invCandidates.length > 1}
              <div class="inv-selector">
                <label for="inv-bag">Sac</label>
                <select id="inv-bag" bind:value={invSelected}>
                  {#each invCandidates as c (c.id)}
                    <option value={c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
            {:else}
              <div class="inv-owner">{invOwner?.name ?? '—'}</div>
            {/if}

            <div class="inv-purse">
              <span class="coin po">{inv.money.po}<em>po</em></span>
              <span class="coin pa">{inv.money.pa}<em>pa</em></span>
              <span class="coin pc">{inv.money.pc}<em>pc</em></span>
            </div>

            <ul class="inv-list">
              {#each inv.items as it (it.name)}
                <li>
                  <span class="inv-name">{it.name}{#if it.qty > 1}<span class="inv-qty">×{it.qty}</span>{/if}</span>
                  <span class="inv-actions">
                    {#if invGiveTo}
                      <button title="Donner à {store.characters.find((c) => c.id === invGiveTo)?.name}" onclick={() => invGiveItem(it.name)}>→</button>
                    {/if}
                    <button title="Jeter {it.name}" onclick={() => invDrop(it.name)}>✕</button>
                  </span>
                </li>
              {:else}
                <li class="inv-empty">Sac vide</li>
              {/each}
            </ul>

            {#if isMj}
              <div class="inv-add">
                <input class="inv-input" placeholder="nom de l'objet" bind:value={invItemDraft} onkeydown={(e) => e.key === 'Enter' && invAddItem()} />
                <input class="inv-input narrow" type="number" min="1" max="9999" bind:value={invQtyDraft} title="quantité" />
                <button class="ghost-btn" onclick={invAddItem}>Ajouter</button>
              </div>
            {/if}

            {#if invGiveTargets.length > 0}
              <div class="inv-give">
                <div class="inv-give-head">Donner à</div>
                <select class="inv-select" bind:value={invGiveTo}>
                  <option value={null}>— choisir —</option>
                  {#each invGiveTargets as c (c.id)}
                    <option value={c.id}>{c.name}</option>
                  {/each}
                </select>
                <div class="inv-money">
                  <input class="inv-input narrow" type="number" min="0" bind:value={invPoDraft} placeholder="po" />
                  <input class="inv-input narrow" type="number" min="0" bind:value={invPaDraft} placeholder="pa" />
                  <input class="inv-input narrow" type="number" min="0" bind:value={invPcDraft} placeholder="pc" />
                  <button class="ghost-btn" disabled={!invGiveTo} onclick={invGiveMoney}>Donner l'argent</button>
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </Panel>
    {/if}

    {#if isMj && panelsOpen.dashboard}
    <Panel
      id="dashboard"
      title="Tableau de bord"
      campaignId={campaignId}
      onClose={() => setPanelOpen('dashboard', false)}
      closeLabel="Fermer le tableau de bord"
      initial={{ x: 340, y: 90, w: 336, h: Math.min(560, innerHeight - 240) }}
      class="dashboard"
    >
      <GmDashboard
        {campaignId}
        characters={store.characters}
        tokenCharIds={Object.keys(store.state.tokens)}
        activeMap={activeMap}
        onFocus={focusToken}
      />
    </Panel>
    {/if}

  <!-- Couche popups : éléments flottants non portalés (le reste passe par
       bits-ui + <BitsConfig>, donc dans le top layer). -->
  <div class="layer-popups">
  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}

  <ContextMenu
    open={ctxMenu !== null}
    x={ctxMenu?.x ?? 0}
    y={ctxMenu?.y ?? 0}
    items={ctxItems}
    onOpenChange={(o) => {
      if (!o) ctxMenu = null;
    }}
  />
  </div>

  {#if isMj}
    <AssetManager
      open={assetManagerOpen}
      onOpenChange={(o) => (assetManagerOpen = o)}
      {campaignId}
      {maps}
      activeMapId={store.state.mapId}
      characters={store.characters}
      tokenCharIds={Object.keys(store.state.tokens)}
      {isMj}
      {templatesRevision}
      onPickMap={selectMap}
      onNewMap={() => pickFile(IMAGE_ACCEPT, (f) => void createMapFromFile(f))}
      onPlaceTemplate={(tpl, count) => armTemplate(tpl.id, tpl.name, count)}
      onPlaceChar={placeCharFromLibrary}
      onContextMenu={openAssetMenu}
    />
  {/if}

  {#if prompt}
    <PromptDialog
      open={true}
      title={prompt.title}
      label={prompt.label}
      initial={prompt.initial}
      confirmLabel={prompt.confirmLabel}
      onOpenChange={(o) => {
        if (!o) prompt = null;
      }}
      onConfirm={(v) => prompt?.onSubmit(v)}
    />
  {/if}

  <CommandPalette open={paletteOpen} onOpenChange={(o) => (paletteOpen = o)} commands={paletteCommands} />
  <HotkeyHelp open={helpOpen} onOpenChange={(o) => (helpOpen = o)} {isMj} />

  <!-- Dé animé overlay -->
  <DiceOverlay anim={store.diceAnim} />
</div>

<style>
  .table-screen {
    position: fixed;
    inset: 0;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }

  /* ── Couches (Lot 1) ── */
  .layer-map {
    position: absolute;
    inset: 0;
    z-index: var(--z-map);
  }
  .layer-chrome {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .layer-chrome > * {
    pointer-events: auto;
  }
  .layer-popups {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .layer-popups > * {
    pointer-events: auto;
  }

  /* ── Barre de session ── */
  .session-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-chrome);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 18px;
    border-bottom: 2px solid var(--border);
    background: var(--bg);
    min-height: 48px;
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

  .palette-btn {
    font-family: var(--font-body); font-size: 12.5px; font-weight: 600;
    padding: 4px 12px; color: var(--text-2); background: var(--panel);
    border: 1.5px solid var(--border-default); border-radius: var(--radius-sm); cursor: pointer;
  }
  .palette-btn:hover { color: var(--heading); background: var(--selected); }

  .asset-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 12.5px;
    font-weight: 600;
    padding: 5px 11px;
    color: var(--text-2);
    background: var(--panel);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
  }
  .asset-btn:hover { color: var(--heading); background: var(--selected); }

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

  /* ── Panneaux flottants : le chrome est dans <Panel>, ici le contenu. ── */
  .panel-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 10px 12px;
  }
  .panel-toggle {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: var(--z-map-hud);
    width: 24px;
    height: 52px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--text-2);
    background: var(--panel);
    border: 2px solid var(--border);
    cursor: pointer;
  }
  .panel-toggle.left { left: 0; border-left: none; border-radius: 0 var(--radius-md) var(--radius-md) 0; }
  .panel-toggle.right { right: 0; border-right: none; border-radius: var(--radius-md) 0 0 var(--radius-md); }
  .panel-toggle:hover { background: var(--selected); color: var(--heading); }

  /* ── Compagnie : la surface est le <Panel>, on ne garde que le papier ligné. ── */
  .compagnie {
    background: repeating-linear-gradient(var(--bg) 0, var(--bg) 27px, var(--border-soft) 27px, var(--border-soft) 28px);
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
  .size-row { align-items: center; justify-content: space-between; gap: 6px; }
  .size-label { font-size: 11.5px; color: var(--text-3); }
  .size-select {
    font-family: var(--font-body); font-size: 12px; padding: 1px 4px;
    border: 2px dashed var(--border); border-radius: 8px; background: transparent;
    color: var(--text-2); cursor: pointer;
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
    position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
    background: var(--panel); border: 2px solid var(--accent-border);
    border-radius: var(--radius-md);
    padding: 8px 22px; z-index: var(--z-toast); text-align: center;
    font-size: 13.5px; font-weight: 500; color: var(--text);
    box-shadow: 3px 4px 0 var(--shadow-1);
  }

  /* ── Carte ── */
  .map-header {
    position: absolute;
    top: 56px;
    left: 16px;
    z-index: var(--z-map-hud);
    display: flex; align-items: center; gap: 10px; padding: 6px 12px;
  }
  .map-header.shifted { left: calc(var(--w-compagnie) + 32px); }
  .map-name { font-family: var(--font-title); font-size: 17px; color: var(--heading); }
  .explore-label { font-size: 13px; font-weight: 500; color: var(--text-2); }
  .scale-label { font-size: 12px; color: var(--text-3); }
  .spacer { flex: 1; }

  /* ── Initiative verticale (Lot 5) ─────────────────────────────── */
  .initiative-rail {
    position: absolute;
    top: 56px;
    right: 12px;
    width: 264px;
    max-height: calc(100% - 132px);
    z-index: var(--z-chrome);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  /* Le panneau de séance (à droite par défaut) ouvert : la rail se décale. */
  .initiative-rail.behind-panel { right: 340px; }
  .init-head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 7px 12px; border-bottom: 2px solid var(--border); flex: none;
  }
  .init-title { font-family: var(--font-title); font-size: 15px; color: var(--heading); }
  .round-badge {
    font-size: 11px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase;
    color: var(--accent-text);
  }
  .init-pending {
    display: flex; flex-direction: column; gap: 4px; padding: 8px 10px;
    border-bottom: 1.5px solid var(--border-soft); flex: none;
  }
  .init-pending .roll-init-btn { width: 100%; }
  .init-list { display: flex; flex-direction: column; gap: 3px; padding: 8px; overflow-y: auto; }
  .init-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 7px;
    border: 1.5px solid transparent; border-left: 3px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--panel);
    cursor: pointer;
  }
  .init-row:hover { background: var(--surface-raised-hover); }
  .init-row.active {
    border-color: var(--accent-border); border-left: 3px solid var(--accent);
    background: color-mix(in oklab, var(--panel), var(--accent) 12%);
  }
  .init-row.defeated { filter: grayscale(0.7); opacity: 0.55; }
  .init-portrait {
    width: 28px; height: 28px; flex: none; object-fit: cover;
    border-radius: 50%; border: 2px solid var(--border); background: var(--bg);
  }
  .init-initial {
    width: 28px; height: 28px; flex: none;
    display: grid; place-items: center;
    font-family: var(--font-title); font-size: 14px;
    color: var(--map-token-fg); background: var(--map-token-bg);
    border: 2px solid var(--token-color, var(--accent)); border-radius: 50%;
  }
  .init-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .init-name {
    font-family: var(--font-title); font-size: 13.5px; color: var(--heading);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .init-hp {
    display: block; height: 5px; border-radius: 3px;
    background: #2b2822; border: 1px solid #3a352d; overflow: hidden;
  }
  .init-hp-fill { display: block; height: 100%; background: var(--hp-ok); }
  .init-hp-fill.mid { background: var(--hp-mid); }
  .init-hp-fill.low { background: var(--hp-low); }
  .init-down {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    color: var(--hp-low);
  }
  .init-score {
    font-family: var(--font-body); font-size: 13px; font-weight: 700; color: var(--text-2);
    min-width: 20px; text-align: right;
  }
  .init-row.active .init-score { color: var(--heading); }
  .init-move { display: flex; flex-direction: column; gap: 1px; }
  .init-move button {
    font-size: 8px; line-height: 1; width: 18px; height: 12px; padding: 0;
    background: transparent; border: 1px solid var(--border); border-radius: 3px;
    color: var(--text-2); cursor: pointer;
  }
  .init-move button:hover:not(:disabled) { background: var(--selected); color: var(--heading); }
  .init-move button:disabled { opacity: 0.3; cursor: default; }
  .roll-init-btn {
    font-family: var(--font-body); font-size: 12.5px; padding: 5px 12px;
    background: var(--accent); color: var(--accent-fg); border: 2px solid var(--accent-border);
    border-radius: 12px 3px 12px 3px; cursor: pointer;
  }
  .roll-init-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .roll-init-btn.waiting {
    background: transparent; border: 2px dashed var(--border); color: var(--text-2); cursor: default;
  }
  .next-turn-btn {
    font-family: var(--font-body); font-size: 13px; padding: 6px 14px;
    background: var(--selected); color: var(--heading); border: 2px solid var(--border);
    border-radius: 15px 230px 15px 225px / 225px 15px 255px 15px; cursor: pointer;
  }
  .next-turn-btn:hover { background: var(--accent); border-color: var(--accent-border); }

  /* Barre d'outils : rangée pleine largeur (mesure disponible) + barre centrée. */
  .toolbar-row {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }
  .toolbar-row > * {
    pointer-events: auto;
  }
  .mj-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    max-width: 100%;
    flex-wrap: nowrap;
  }
  .tool-hint-chip {
    padding: 4px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--accent-text);
    background: var(--panel);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-full);
  }
  :global(.tool-more) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-h);
    height: var(--control-h);
    font-size: 16px;
    line-height: 1;
    color: var(--text-2);
    background: var(--panel);
    border: 1.5px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  :global(.tool-more:hover) {
    color: var(--heading);
    background: var(--selected);
  }
  :global(.tool-overflow) {
    min-width: 180px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  :global(.tool-overflow-item) {
    padding: 6px 10px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--text);
    border-radius: var(--radius-sm);
    cursor: pointer;
    outline: none;
  }
  :global(.tool-overflow-item[data-highlighted]) {
    background: var(--selected);
    color: var(--heading);
  }

  .ghost-btn {
    font-family: var(--font-body); font-size: 13px; font-weight: 500; padding: 3px 11px;
    background: transparent; border: 2px dashed var(--border); border-radius: 10px;
    color: var(--text-2); cursor: pointer;
  }
  .ghost-btn:hover { border-color: var(--text-2); color: var(--text); }
  .ghost-btn.danger:hover { border-color: var(--accent-border); color: var(--accent-text); }
  .tsep { width: 2px; height: 20px; background: var(--border-soft); margin: 0 4px; }
  .history-group { display: flex; align-items: center; gap: 2px; }
  .history-btn {
    display: grid; place-items: center;
    width: 30px; height: 30px;
    background: transparent; border: none; border-radius: var(--radius-sm);
    color: var(--text-2); cursor: pointer;
  }
  .history-btn:hover:not(:disabled) { background: var(--bg); color: var(--heading); }
  .history-btn:disabled { opacity: 0.35; cursor: default; }
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


  .map-frame {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
  }
  /* Couche gestes : sœur du contenu transformé, jamais son ancêtre. Elle
     reçoit le panoramique et les clics dans le vide ; les pions et repères la
     surplombent en `pointer-events: auto`. */
  .map-bg {
    position: absolute;
    inset: 0;
    z-index: var(--z-map);
    touch-action: none;
    cursor: default;
  }
  .map-bg.panning { cursor: grabbing; }
  .map-bg.cursor-fog { cursor: crosshair; }
  .map-bg.cursor-place { cursor: copy; }
  .map-bg.cursor-hand { cursor: grab; }
  .map-placeholder {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-2);
    font-style: italic;
  }

  /* Couche de transformation : c'est ELLE qui porte le zoom/panoramique. Un
     transform ne change pas la mise en page, donc la surface garde sa taille
     calculée et le cadre ne peut pas être redimensionné en boucle par le
     ResizeObserver (le bug de « carte zoomée »). */
  .map-zoom {
    position: absolute;
    inset: 0;
    z-index: var(--z-grid);
    display: grid;
    place-items: center;
    transform-origin: 0 0;
    pointer-events: none;
  }
  /* Le contenu de la carte ne reçoit pas les gestes — c'est `.map-bg` qui les
     porte — sauf les objets interactifs : pions et repères. */
  .token,
  .marker { pointer-events: auto; }
  /* Outil Main : les pions ne doivent pas intercepter le geste, il part du fond. */
  .map-zoom.tool-hand .token,
  .map-zoom.tool-hand .marker { pointer-events: none; }

  /* Contrôle de zoom — visible par les joueurs (c'est leur cadrage). */
  .map-hud {
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: var(--z-map-hud);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 14px var(--shadow-2);
  }
  /* Le panneau de droite est ouvert : le HUD se décale pour rester visible. */
  .map-hud.behind-panel { right: calc(var(--w-panel) + 26px); }
  .map-hud button {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    min-width: 26px;
    height: 24px;
    padding: 0 5px;
    background: transparent;
    border: none;
    border-radius: 8px 3px 8px 3px;
    color: var(--text-2);
    cursor: pointer;
  }
  .map-hud button:hover { background: var(--bg); color: var(--text); }
  .map-hud .hud-fit { color: var(--accent-text); font-size: 11.5px; }
  .map-hud .hud-fit.off { opacity: 0.55; }
  /* bouton « Main » : disponible pour tout le monde, contrairement à la barre
     d'outils MJ. S'allume quand le panoramique au clic gauche est actif. */
  .map-hud .hud-hand { font-size: 13px; opacity: 0.6; }
  .map-hud .hud-hand:hover { opacity: 1; }
  .map-hud .hud-hand.on {
    opacity: 1;
    background: var(--accent);
    color: var(--heading);
  }

  .map-surface {
    position: relative;
    /* border-box : la taille inline inclut le border, sinon la surface
       débordait du cadre de 4 px et l'image se trouvait recadrée. */
    box-sizing: border-box;
    max-width: 100%;
    max-height: 100%;
    /* Contain the mix-blend-mode of the grid overlay to the map (and keep the
       z-index layers of tokens/fog from interleaving with the rest of the page). */
    isolation: isolate;
    border: 2px solid var(--border);
    border-radius: 0;
    overflow: hidden;
    background: var(--map-bg);
    touch-action: none;
    /* Les gestes partent de `.map-bg` ; seuls les pions et repères réactivent. */
    pointer-events: none;
  }
  /* Surface dimensionnée en JS (fit du ratio de l'image) : on la voit
     TOUJOURS en entier — aucun crop haut/bas ni gauche/droite. */
  .map-surface--fitted {
    justify-self: center;
    align-self: center;
  }
  /* Sans image : la surface remplit tout le cadre, comme avant. */
  .map-surface--fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .map-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; user-select: none; }
  .map-grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(var(--map-grid-line, var(--map-line)) 1px, transparent 1px), linear-gradient(90deg, var(--map-grid-line, var(--map-line)) 1px, transparent 1px);
    background-size: var(--map-grid-size) var(--map-grid-size);
    background-color: var(--map-bg);
  }
  /* Quadrillage posé SUR l'image : --map-line (#e4dec9) est invisible sur une
     photo, on inverse donc la couleur du dessous (blend) pour garantir le
     contraste, et pointer-events:none pour ne rien gêner (pions, brouillard). */
  .map-grid--overlay {
    background-color: transparent;
    background-image:
      linear-gradient(var(--map-grid-line, rgba(255, 255, 255, 0.45)) 1px, transparent 1px),
      linear-gradient(90deg, var(--map-grid-line, rgba(255, 255, 255, 0.45)) 1px, transparent 1px);
    mix-blend-mode: difference;
    pointer-events: none;
    z-index: var(--z-grid);
  }
  /* Teinte choisie par le MJ : on rend la couleur demandée, SANS le blend —
     « difference » l'inverserait (une teinte rouge ressortirait cyan sur une
     photo). D'où la transparence : le quadrillage reste un repère, pas un voile. */
  .map-grid--tinted {
    --map-grid-line: color-mix(in srgb, var(--map-grid-color) 60%, transparent);
    mix-blend-mode: normal;
  }
  .fog-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: var(--z-fog); }
  /* Cercle de brosse : suit le pointeur, à l'échelle exacte du trou découpé. */
  .fog-brush {
    position: absolute; width: 136px; height: 136px; margin: -68px 0 0 -68px;
    border: 1.5px dashed rgba(255, 255, 255, 0.85); border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(0, 0, 0, 0.35);
    pointer-events: none; z-index: var(--z-fog);
  }

  .marker {
    position: absolute; transform: translate(-50%, -100%);
    display: flex; align-items: center; gap: 4px; z-index: var(--z-markers); cursor: grab;
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

  /* Pion « objet de jeu » (Penpot : Game/Token) : disque plein, anneau à la
     couleur du personnage, barre de PV dessous, plaque de nom au survol.
     La taille vient de --tok-size (échelle de cases, voir tokenSizePx). */
  .token {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-title); cursor: grab; user-select: none; z-index: var(--z-tokens);
    touch-action: none;
    box-sizing: border-box;
    background: var(--map-token-bg);
    border: max(2px, calc(var(--tok-size) * 0.055)) solid var(--token-color);
    border-radius: 50%;
    color: var(--map-token-fg);
    box-shadow: 2px 3px 0 rgba(0, 0, 0, 0.2);
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
  /* Tour actif (Penpot : TokenActive) : double anneau, liseré de fond entre les deux. */
  .token-active {
    --ring: max(3px, calc(var(--tok-size) * 0.047));
    box-shadow:
      0 0 0 var(--ring) var(--map-token-bg),
      0 0 0 calc(var(--ring) * 2) var(--accent),
      0 0 0 calc(var(--ring) * 2.6) var(--map-token-bg),
      0 0 0 calc(var(--ring) * 3.1) var(--accent);
  }
  /* 0 PV : grisé et translucide ; état couchant : voile (sans grisé). */
  .token-dead { filter: grayscale(0.7); opacity: 0.5; }
  .token-down::after {
    content: ''; position: absolute; inset: -1px; border-radius: inherit;
    background: radial-gradient(circle at 50% 18%, rgba(27, 25, 23, 0.5), rgba(27, 25, 23, 0.12) 72%);
    pointer-events: none;
  }
  .token-foot {
    position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    margin-top: max(2px, calc(var(--tok-size) * 0.045));
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    pointer-events: none;
  }
  /* Le double anneau du tour actif déborde : la barre passe en dessous. */
  .token-active .token-foot { margin-top: max(6px, calc(var(--tok-size) * 0.2)); }
  .token-hp {
    display: block; box-sizing: border-box;
    width: max(24px, calc(var(--tok-size) * 0.84));
    height: clamp(4px, calc(var(--tok-size) * 0.125), 8px);
    background: #2b2822; border: 1px solid #3a352d;
    border-radius: 4px; overflow: hidden;
  }
  .token-hp-fill {
    display: block; height: 100%; border-radius: 2px;
    background: var(--hp-ok);
    transition: width 200ms var(--ease-out);
  }
  .token-hp.hp-mid .token-hp-fill { background: var(--hp-mid); }
  .token-hp.hp-low .token-hp-fill { background: var(--hp-low); }
  .token-ini {
    position: absolute; top: 0; right: 0; transform: translate(35%, -35%);
    min-width: max(16px, calc(var(--tok-size) * 0.32));
    height: max(16px, calc(var(--tok-size) * 0.32));
    padding: 0 4px; box-sizing: border-box;
    display: grid; place-items: center;
    font-family: var(--font-body); font-weight: 700;
    font-size: clamp(9px, calc(var(--tok-size) * 0.19), 13px);
    color: var(--heading); background: #1b1917;
    border: 1.5px solid var(--token-color); border-radius: var(--radius-full);
    pointer-events: none;
  }
  .token-ini.is-turn { background: var(--accent); border-color: var(--accent-border); color: var(--accent-fg); }
  .token-label {
    font-family: var(--font-ui); font-size: 12px; line-height: 1.4;
    color: #f2ede0; background: #1b1917;
    border-radius: var(--radius-full); padding: 0 8px;
    white-space: nowrap; pointer-events: none;
    opacity: 0; transition: opacity 140ms var(--ease-out);
  }
  .token:hover .token-label { opacity: 1; }

  .ping {
    position: absolute; width: 70px; height: 70px;
    border: 3px solid var(--accent); border-radius: 50%; pointer-events: none; z-index: var(--z-ping);
    animation: hdPing 1.8s ease-out forwards;
  }
  @keyframes hdPing {
    0% { transform: translate(-50%, -50%) scale(0.25); opacity: 0.95; }
    100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
  }

  /* ── Panneau ── */
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

  .journal-tab {
    position: relative;
    display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0;
  }
  .new-msg-pill {
    position: absolute;
    left: 50%;
    bottom: 64px;
    transform: translateX(-50%);
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.2px;
    padding: 6px 14px;
    background: var(--accent);
    color: var(--accent-fg);
    border: 2px solid var(--accent-border);
    border-radius: 999px;
    cursor: pointer;
    box-shadow: 0 6px 18px var(--shadow-2);
    white-space: nowrap;
  }
  .new-msg-pill:hover {
    background: var(--accent-hover);
  }
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
  .share-chip {
    font-size: 12px; font-weight: 700; text-decoration: none;
    color: var(--accent-text); border: 1.5px solid var(--accent-border);
    border-radius: var(--sketchy-badge); padding: 1px 8px;
  }
  .share-chip:hover { background: var(--bg); }
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

  .inv-tab { padding: 14px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .inv-placeholder { color: var(--text-2); font-style: italic; font-size: 13px; }
  .inv-selector { display: flex; align-items: center; gap: 6px; }
  .inv-selector label { font-size: 12px; color: var(--text-2); }
  .inv-owner { font-family: var(--font-title); font-size: 14px; color: var(--heading); }
  .inv-select,
  .inv-selector select {
    font-family: var(--font-body);
    font-size: 12.5px;
    padding: 4px 7px;
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    background: var(--bg);
    color: var(--text);
    outline: none;
    max-width: 100%;
  }
  .inv-purse { display: flex; gap: 6px; }
  .coin {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-weight: 700;
    font-size: 13px;
    padding: 3px 9px;
    border: 2px solid var(--border);
    border-radius: 10px 4px 10px 4px;
    background: var(--bg);
  }
  .coin em { font-style: normal; font-size: 10.5px; color: var(--text-2); }
  .inv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .inv-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    padding: 4px 6px;
    border-bottom: 1px dashed var(--border-soft);
  }
  .inv-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inv-qty { color: var(--accent-text); font-weight: 700; margin-left: 4px; }
  .inv-empty { color: var(--text-3); font-style: italic; justify-content: center; }
  .inv-actions { display: flex; gap: 2px; flex: none; }
  .inv-actions button {
    font-size: 12px;
    width: 22px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-2);
    cursor: pointer;
  }
  .inv-actions button:hover { background: var(--bg); color: var(--text); }
  .inv-add { display: flex; gap: 4px; align-items: center; }
  .inv-input {
    font-family: var(--font-body);
    font-size: 12.5px;
    padding: 4px 7px;
    border: 2px solid var(--border);
    border-radius: 8px 3px 8px 3px;
    background: var(--bg);
    color: var(--text);
    outline: none;
    min-width: 0;
    flex: 1;
  }
  .inv-input.narrow { flex: none; width: 52px; }
  .inv-give { border-top: 1px dashed var(--border-soft); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .inv-give-head { font-size: 11.5px; color: var(--text-2); font-weight: 700; letter-spacing: 0.4px; }
  .inv-money { display: flex; gap: 4px; align-items: center; }
</style>
