# 01 — État des lieux : Atlas VTT

> Source : `~/Documents/Git/atlas-vtt` @ v0.4.2 (commit HEAD du 29/09/2026).
> Plugin Obsidian, React 19 + PixiJS v8 + `pixi-viewport`, desktop only.
> ~110 000 lignes, 895 fichiers, AGPL-3.0-only.

## 0. Le mental model

Atlas n'est pas « une app avec une carte ». C'est **un éditeur de scène avec un
moteur temps réel**. La carte est une scène (`.atlasmap`), manipulable hors ligne,
avec undo/redo, multi-onglets, copier-coller. L'application hôte (Obsidian) n'est
qu'un conteneur.

Trois conséquences directes sur l'UX :

1. **La scène survit à l'UI.** Fermer le panneau ne détruit rien.
2. **Chaque scène a son propre état d'UI** (onglets, undo/redo, position de
   caméra sont cachés par `tabId`) — `AtlasView` garde un
   `temporalCache: Map<tabId, {pastStates, futureStates}>` et un
   `viewportCache: Map<tabId, {centerX, centerY, scale}>`.
3. **Tout est annulable**, parce que tout est une édition de document.

Nous n'avons aucune de ces trois propriétés. C'est le premier écart de modèle
mental, avant même le pixel.

## 1. Les trois couches — le pattern fondateur

`src/app/services/uiLayers.ts` :

| Couche       | Mécanisme                                                                                             | Contenu                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Canvas Pixi  | `<canvas>` en `position:absolute`                                                                     | map, tokens, pins, grille, brouillard, dessins, mesures |
| Chrome React | `div.atlas-react-ui-container`, `position:absolute; inset:0; z-index:1000; **`pointer-events:none`**` | barres, panneaux, widgets                               |
| Popups       | portail `document.body`                                                                               | menus, palette, toasts, modales                         |

Le point clé, et c'est celui à copier : **le conteneur de chrome est
`pointer-events: none`, et chaque barre réactive est `pointer-events: auto`
individuellement.** Conséquence : _le vide entre deux widgets reste cliquable sur
la carte_. C'est écrit dans `widget-bar.scss` :

> _Lays the cards out without a panel of its own; only the cards catch the
> pointer, so the gaps between them stay clickable on the map._

C'est exactement ce qui manque chez nous : nos sidebars sont des `aside` opaques
dans un `grid`, donc elles **mangent de la place de carte** et ne peuvent pas
laisser respirer le monde.

## 2. Le chrome ne se démonte jamais

`UIRoot.tsx`, commentaire ligne 197 :

> _Map chrome stays mounted while a scene loads; the loading overlay blocks input
> meanwhile._

Le `MapLoadingOverlay` est rendu **en dernier** dans l'arbre, jamais демonté, pour
pouvoir sortir en fondu. Conséquences :

- pas de re-layout au changement de scène ;
- la position des barres ne « saute » jamais ;
- l'illusion d'un HUD permanent est maintenue même pendant les chargements.

Chez nous, un changement de carte ou l'ouverture d'un panneau re-render la page
entière et recalcule tout.

## 3. Le système de coordonnées (3 espaces)

1. **World space** — pixels de la carte. `token.x/y`, pins, mesures.
2. **Viewport** — `pixi-viewport`, `worldWidth = max(mapDim, 10000)`,
   `clampZoom({minScale: 0.1, maxScale: 5})`, pan au **bouton droit**, plugin de
   décélération maison.
3. **DOM / viewport pixels** — les barres ancrées.

La conversion monde → écran passe par un `CustomEvent` sur `window` :

```ts
window.dispatchEvent(new CustomEvent('get-viewport-position', {
  detail: { worldX, worldY, callback(clientX, clientY) }
}))
```

`PixiRendererOrchestrator` répond avec `vp.toScreen(worldX, worldY)`. C'est ce
mécanisme qui permet à un popover d'être ancré à un objet **dans la carte** (le
flyout du pin, le menu contextuel d'un token) tout en restant en DOM.

**Piège documenté dans `CommandPalette.tsx` :** Obsidian pose `contain: strict`
sur `.workspace-leaf`, qui en fait le _containing block_ de tout overlay
`position: fixed`. Il faut convertir les coordonnées viewport du toolbar dans le
frame de l'overlay.

## 4. L'ordre des couches de rendu

`PixiRendererOrchestrator.ts`, lignes 339-494. L'ordre est ** intentionnel et
documenté** :

| zIndex | Couche                                                                   |
| ------ | ------------------------------------------------------------------------ |
| 0      | background sprite                                                        |
| (grid) | grille + labels hex                                                      |
| 100    | token UI (barres, nameplates, marqueurs)                                 |
| 200    | pins                                                                     |
| 500    | texte                                                                    |
| 900    | dessins — _« Above tokens/text, below fog so hidden areas stay hidden »_ |
| 900    | vision                                                                   |
| 1000   | brouillard (`interactiveChildren: false`)                                |
| 1001   | aperçu lasso / rectangle                                                 |
| 1100   | murs (overlay éditeur MJ)                                                |
| 2000   | pointeur laser                                                           |

Un seul détail à retenir pour nous : **`fogContainer.interactiveChildren =
false`**. Le brouillard ne vole jamais les événements.

## 5. Les 10 détails qui font la différence

### 5.1 La barre d'outils qui « respire »

`BottomToolbarRow.tsx` (54 lignes). Le concept le plus important d'Atlas côté
layout :

```css
.atlas-bottom-toolbar-row {
  position: fixed;
  bottom: 16px;
  left: 16px;
  right: 16px;
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
  align-items: end;
  column-gap: 8px;
  pointer-events: none;
}
.atlas-vtt-toolbar {
  grid-area: 1 / 2;
}
```

Les deux colonnes latérales se partagent l'espace libre **également** : la barre
centrale reste centrée tant qu'elles tiennent, et glisse vers le côté libre dès
qu'une colonne a besoin de plus que sa moitié.

Le composant mesure la place disponible en `useLayoutEffect` :

```
next = row.clientWidth - startSlot.offsetWidth - endSlot.offsetWidth - 2*gap
```

et la publie dans un contexte. `ResponsiveToolbar` consomme ce contexte pour
décider quoi pousser dans le menu « More tools ».

### 5.2 Le fit par priorité — un algorithme pur et testable

`PRIORITY` (`MainToolbar.tsx` l.40-53), commentaire inclus :

```
move 100 · measure 90 · fog 85 · assets 80 · dice 75 · pin 70 · draw 65
palette 55 · text 50 · loot 45 · wall 40 · audio 35
```

> _The tools a GM reaches for during play outrank setup and reference tools,
> which also have hotkeys._

Trois règles :

- **Sortie stricte par priorité**, et à égalité les derniers de la liste d'abord
  → la barre n'échange jamais un outil large important contre un outil étroit
  secondaire.
- **Épinglage** : un contrôle reste épinglé si son outil est actif ou si son
  panneau est ouvert. Les pin ne débordent jamais.
- **Tout reste monté** pendant qu'il est dans le menu (« so tool options keep
  their state and the bar can measure it again once it returns ») — donc l'état
  des options vit dans les composants de groupe, pas dans la barre.

Tout est dans `overflowingToolbarItems`, une **fonction pure sans DOM**.

### 5.3 Le split-button et la « face » d'une famille d'outils

`toolFaces.ts` expose `moveToolFace`, `fogToolFace`, `drawToolFace`,
`measureToolFace`, `textToolFace`, `wallToolFace`. Chacune renvoie
`{icon, label, tool, isActive}` selon le membre actif de la famille.

Le bouton de la barre **et** son entrée dans le menu « More tools » lisent la
même face : _« the family member in use, or the family's main tool when another
family is active »_.

Concrètement, le bouton `⌄` de chaque outil ouvre ses options (`ToolGroup.tsx`,
46 lignes : `ToolButton` + `DropdownMenu` chevron).

### 5.4 La command palette qui sort de la barre

`placePalette()` (`palettePlacement.ts`) :

```ts
PALETTE_MIN_WIDTH = 480; PALETTE_VIEW_MARGIN = 16; PALETTE_TOOLBAR_GAP = 8

placePalette(toolbar, frame) {
  room   = max(0, frame.width - 2*16)
  width  = min(room, max(toolbar.width, 480))  // aussi large que la barre, min 480
  left   = clamp(toolbar.left - frame.left + (toolbar.width - width)/2, 16, frame.width - 16 - width)
  bottom = frame.bottom - toolbar.top + 8       // 8px au-dessus de la barre
}
```

Quatre détails :

- La position est mesurée en `useLayoutEffect` **avant le premier paint** ;
  `position` démarre à `null` et une classe `atlas-no-transition` désactive la
  transition tant que la position n'est pas connue → jamais de flash à une place
  périmée.
- **3 couches** : `overlay` (fixed inset 0) → `anchor` (la position, transition
  `left`/`transform`) → `container` (la taille + l'animation open/close). L'anchor
  a son propre transform pour que le container puisse animer indépendamment.
- En mode panneau, l'anchor recentre (`left: 50%`) et **glisse** entre les deux
  positions → la transition liste↔panneau est un slide continu, pas un saut.
- Tailles en `cqw`/`cqh` (`container-type: size`) pour lire la taille de la vue.

Animation (`framer-motion`, `MotionConfig reducedMotion="user"`) :

```js
closed: { opacity: 0, transform: 'translateY(6px) scale(0.97)', duration: 0.11 },
open:   { opacity: 1, transform: 'translateY(0px) scale(1)',   duration: 0.16 },
```

> _The palette opens by hotkey many times per session, so it rises out of the
> toolbar quickly and over a short distance, and leaves quicker still._

Et l'overlay en `closed` a `pointerEvents: 'none'` avec
`transition: {when:'afterChildren'}` → **les clics passent à la carte pendant que
la palette sort**.

### 5.5 Les panneaux de réglages : toujours 2 colonnes

`.atlas-command-palette-panel` : `grid-template-columns: 1fr 1fr; gap: 24px;
padding: 16px`.

Trois primitives partagées (`SettingRows.tsx`) :

- `SettingRow` — label + hint à gauche, contrôle à droite, `min-height:
var(--input-height)`, **aucun séparateur** entre les lignes.
- `SettingToggleRow` — `.atlas-toggle` avec `role="switch"`, `aria-checked`,
  `aria-labelledby`, focusable, Enter/Espace.
- `SettingSliderRow` — label + slider pleine largeur + readout monospace.

Détail anti-undo : les réglages d'opacité/largeur de trait sont **debouncés à
100 ms** → un drag de slider = **un seul pas d'undo**.

### 5.6 Le panneau d'initiative

`InitiativeTracker.tsx` + `InitiativeCard.tsx`. Panneau vertical **96 px**,
`position: fixed; top:50%; right:12px`, `max-height: calc(100vh - 2*160px)`
(commenté : la symétrie garde le haut sous la top bar row).

Trois zones, `gap: 8px` : controls (🎲 roll all + ⚔️ start/end combat — **l'icône
change selon l'état**), contenu (liste scrollable sans scrollbar), turn controls
(`ChevronUp` / `R{n}` en `tabular-nums` / `ChevronDown`, **toujours visibles,
désactivés hors combat**).

États de carte :

- `--active` : bordure accent + glow **inset** + pulse 2 s. Le commentaire explique
  pourquoi inset : _« the list scrolls, so anything drawn outside the card box is
  clipped on the straight edges and leaves ragged corners »_.
- `--defeated` : `opacity: 0.45; filter: grayscale(70%)` + overlay crâne.
- `--drop-above` / `--drop-below` : ligne de 2 px avec glow, à `top:-3px` /
  `bottom:-3px`.
- `:active { transform: scale(0.96); cursor: grabbing }`.

Barre de vie : seuils `≥70 %` vert, `30-69 %` jaune, `<30 %` rouge — **les mêmes
que sur les tokens**.

Interactions :

- **Clic sur une carte → recadrage caméra animé sur le token + highlight.**
- **Cmd/Ctrl + survol → `StatblockHoverPreview`**, et le panneau se ferme **au
  relâchement de Cmd uniquement**, pas au `mouseleave`.
- Badge d'instance affiché seulement si 2+ tokens partagent la même image.
- Auto-sync : chaque token de la map est ajouté automatiquement à l'initiative
  sauf s'il a été explicitement retiré ; PV re-synchronisés à chaque changement.

### 5.7 Les widgets auto-repliables

`ResponsiveWidgetBar.tsx`. Après **4 s** d'inactivité, le libellé, les boutons
±/− et la ligne de valeur s'effondrent (`max-width:0; max-height:0; opacity:0`)
et l'icône passe de 40 px à 32 px. Un timer en cours garde son bouton pause
accessible.

**Adressage clavier** : maintenir `1`..`5` cible le widget à cette position, puis
`+`/`-` incrémente, `Space` play/pause, `r` reset. Le `keydown` est écouté **en
phase capture** pour gagner sur les raccourcis de carte qui partagent ces touches.
Le numéro est affiché comme un keycap.

Synchronisation inter-vues avec des animations `pulse` **à intensité empilable**
(max 3 sur clics rapides).

### 5.8 Les dés : un résultat qui « atterrit »

`DiceToast.tsx`, timeline `350 ms` entrée → `7 000 ms` → `300 ms` sortie.

- Entrée `translateX(48px) scale(0.92)` → `0/1`.
- Le total « atterrit » : `scale(1.8) blur(6px)` → `scale(0.94)` → `scale(1)`.
- Le glow retombe de `drop-shadow(0 0 14px accent 70%)` à `6px/30%`.
- **Le délai de révélation (300 ms) est aligné sur le son** — commentaire :
  _« Matches REVEAL_DELAY_SECONDS in diceRevealSound.ts so the number lands with
  the chime »_.
- Contenu : portrait du token avec anneau, nom de la source, nom de l'abil
  ability, formule, puis **le total en héros à droite**.
- Ornement SVG de nœud celtique défini une fois, réutilisé par `<use>` sur les 4
  coins.
- Classes `--crit-success` / `--crit-fail`.

Le bac à dés : grille de 7 dés, **clic gauche = ajouter, clic droit = retirer**,
badge de compteur qui se ré-anime à chaque changement (`key={count}`). La
formule se reconstruit en direct (`count > 1 ? "2d8" : "d8"`, joints par `" + "`).

**Dés cliquables dans le texte** : `services/statblockDiceLinks.ts` lie `2d8+3`,
`ATK: +4`, et les modificateurs nus, avec un garde
`(?<!\w)[+-]\d+(?!\s*d\d)` pour ne pas lire le `-` de « Very Close - 1d12+2 » comme
un jet négatif. ⚠️ Avertissement d'architecture : **`linkDiceIn` ne doit jamais
être appliqué à du DOM framework** (les frameworks gardent des références aux
text nodes remplacés) ; `attachDiceRolling` (listener seul) est sûr partout.

### 5.9 L'asset manager

`src/app/packages/components/asset-manager/` — entièrement hook-driven
(`useAssetData`, `useSelectionHandlers`, `useAssetCrud`, `useTagsAndCollections`,
`useContextMenus`, `useCreatureFilters`, `useGridMetrics`…). `AssetManager.tsx`
ne fait que composer (307 lignes).

- Fenêtre `max-width: 1440px`, grid 2×2 (`sidebar auto` / `body minmax(0,1fr)`),
  le `minmax(0, 1fr)` commenté : _« keeps the header's min-content width from
  widening the column past the window »_.
- **Header sur une seule ligne** : toggle sidebar, back/forward, « N selected »,
  tabs centrées, recherche + tri + nouveau dossier + refresh + création à droite.
  Quand le header rétrécit, tabs/tri/recherche **se replient en menus et boutons**
  → _« the header never moves between tabs »_.
- Multi-select : clic = simple, `Shift` = range, `Ctrl/⌘` = toggle ; `visibleIds`
  est gardé dans une ref pour que le shift-click connaisse l'ordinal de chaque
  élément **visible**.
- `useHeldWhile` : _« a tab switch keeps the previous tab's content on screen,
  untouched … until the new tab's assets have loaded; then the panes swap once »_.
- `useRememberedPlace` : onglet, collection, recherche, sections repliées, scroll.

**Recherche façon deck-builder** (`search/querySyntax.ts`) : tokens `keyword:value`
(`type:beast`, `cr>=5`, `cr:1/4-3`, `tag:forest`, `statblock:no`), guillemets pour
les espaces, `-type:beast` pour exclure, autocomplétion, et **un chip par filtre
actif** au-dessus du contenu. Normalisation inter-systèmes des valeurs (`"1/4"`,
`½`, `"Creature 3"`, `"3+1*"`, `−1`).

**Spawn** (`tokenSpawnService.ts`, 323 lignes) : clic = sélection, **double-clic =
spawn** (`!shiftKey && !ctrlKey && !metaKey`). Badge multiplicateur `− ×N +` sur la
thumbnail. Position = centre du viewport, grille `ceil(sqrt(n))` par ligne, puis
snap sur le centre de cellule. **Un seul write de store → un seul pas d'undo**, et
tous les tokens spawnés sont sélectionnés.

### 5.10 Le clic droit comme langage

Context menus sur : pion, brouillard (supprimer une passe de peinture),
mesure, pin, ligne de collection, paroi, lumière, mur. Chaque entité interactive a
son menu.

C'est le levier qui **évite d'étaler des boutons** : si chaque objet a ses
actions dans son menu contextuel, l'écran n'a pas besoin de les exposer.

## 6. Le système de design

### 6.1 Les tokens (`styles/_tokens.scss`)

```scss
// Spacing, base 8px
$spacing-xs: 4px;  $spacing-s: 8px;   $spacing-m: 12px;
$spacing-l: 16px;   $spacing-xl: 24px; $spacing-2xl: 32px;

// Radius — calés sur l'échelle Obsidian
$radius-xs:  var(--radius-s);   // 4px
$radius-m:   var(--radius-m);   // 8px
$radius-xl:  var(--radius-l);   // 12px
$radius-2xl: var(--radius-xl);  // 24px
$radius-full: 9999px;

// Borders
$border-opacity-subtle: 10%;  default: 18%;  strong: 30%;

// Z-index
$z-base:1 $z-dropdown:100 $z-sticky:200 $z-overlay:300
$z-modal:400 $z-popover:500 $z-tooltip:600 $z-notification:700

// Transitions
$transition-fast: 100ms;  normal: 200ms;  slow: 300ms;  press: 160ms;
$transition-ease:     cubic-bezier(0.4, 0, 0.2, 1);       // hover / couleur
$transition-ease-out:  cubic-bezier(0.23, 1, 0.32, 1);     // entrée, relâchement
$transition-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); // mouvement à l'écran
$transition-ease-in:   cubic-bezier(0.4, 0, 1, 1);         // à éviter pour l'UI

// Composants
$button-height-{s,m,l}: 24 / 32 / 40 px
$input-height-{s,m,l}:  28 / 36 / 44 px
$icon-{xs,s,m,l,xl}:   12 / 16 / 20 / 24 / 32 px
```

### 6.2 Les mixins (`styles/_mixins.scss`, 828 lignes)

**Une seule surface élevée** — `atlas-elevated-surface` :
`background: var(--background-primary)`, `border: 1.5px solid color-mix(in oklch,
var(--mono-100) 18%, transparent)`, `border-radius: $radius-xl`,
`box-shadow: $shadow-elevated`. CLAUDE.md impose : _« All elevated surfaces …
share the same border treatment defined in the `atlas-elevated-surface` mixin. Use
it instead of ad-hoc border values »_.

**Le système de coins concentriques** — le morceau le plus sophistiqué :

- `atlas-concentric-corner($corner, $outer, $inset, $min)` → `max($min, $outer - $inset)`
- `atlas-panel-radius($radius, $border-width)` → publie `--atlas-panel-inner-radius`
- `atlas-corner-shape` → `corner-shape: var(--corner-shape, round)` (Obsidian donne
  `corner-shape` — une superellipse macOS — à tous ses `<button>` ; un squircle
  dans un coin rond ne garde jamais un gap égal)
- `atlas-panel-inset-radius-value($inset, $max)` → `max(0, inner-radius - inset)`

Règle : _« Concentric means outer = inner + gap, and only on the corners that face
the panel's corners … When the inner radius comes out near 0, the panel's radius is
too small, so raise it; never shrink the inner one »_. Chaque `CloseButton` est
concentrique avec son panneau.

**Scrollbars** — `atlas-scrollbar-while-scrolling` : le pouce est `transparent` au
repos et **transitionne** via un `@property --atlas-scrollbar-thumb` enregistré en
racine ; **sa place reste réservée**, donc le contenu ne bouge jamais.

**Tooltips** — `styles/_native-tooltips.scss` (17 lignes) :

```css
:where([class^="atlas-"], [class*=" atlas-"]):not(html, body) {
  --no-tooltip: true;
}
```

Obsidian affiche son propre tooltip pour tout élément avec `aria-label` ; Atlas le
coupe **partout**, avec `:where()` (spécificité 0) pour rester surchargeable.
Et **jamais de `title`** — une règle de lint le refuse. `LabelTooltip` (Radix) :
`sideOffset: 10`, `delayDuration: 300`, `aria-labelledby` prioritaire sur
l'`aria-label` de l'enfant.

### 6.3 Le thème

`docs/ObsidianTheming.md` + `obsidian-colors.md` : **jamais de couleur de base
brute**, uniquement des variables sémantiques (`--text-muted`,
`--background-modifier-hover`). Les teintés passent par `color-mix()`. Le doc
précise que les variables `-rgb`/`-hsl` sont dépréciées ou n'ont jamais existé en
1.13 et **cassent silencieusement** la déclaration. Rayons, typo, ombres, hauteurs
de contrôle et z-index sont tous mappés sur les variables Obsidian → le plugin suit
la typo et la densité choisies par l'utilisateur.

`@media (prefers-reduced-motion: reduce)` est présent dans presque tous les
fichiers : on retire les mouvements, on garde les transitions de couleur.

### 6.4 Tailwind : en voie de retrait

`CLAUDE.md` l.26 : _« Prefer SCSS classes and Obsidian native styles. Tailwind
utilities exist in older components and are scoped under `.atlas-vtt-plugin`;
**do not add new Tailwind usage**. »_ (`important: '.atlas-vtt-plugin'`,
`corePlugins: { preflight: false }`.)

## 7. Le système de raccourcis

`src/app/keyboard/mapHotkeys.ts` (88 lignes) : **une seule table déclarative**.

```ts
{ id, label, group, defaultKey, dmOnly?, enabled?,
  yieldsToTextSelection?, selectsWidget?, whileWidgetHeld? }
```

Groupes : Map, Tools, Editing, Combat, Widgets.

| Groupe  | Raccourcis                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map     | `?` aide · `Space` palette · `a` asset manager\* · `Tab` GM dashboard\* · `d` toggle GM view\* · `g` scene switcher\* · `Shift+1` fit map · `Shift+2` zoom sur le pion sélectionné |
| Tools   | `v` move/laser · `f` brouillard/gomme\* · `b` dessins\* · `e` gomme\* · `t` texte\* · `m` mesure (cycle 3) · `p` pin de note\* · `w` murs & lumières\* · `s` audio\*               |
| Editing | `Mod+a/c/x/v/d` · `Mod+z` · `Mod+Shift+z` · `Mod+y` · `Delete` · `Backspace` · `Escape`                                                                                            |
| Combat  | `r` bac à dés · `Enter` journal de dés · `i` initiative\* · `l` loot\* · `↑`/`↓` tour précédent/suivant                                                                            |
| Widgets | `1`–`5` tenir pour sélectionner · `+`/`-` · `Space` play/pause\* · `r` reset\*                                                                                                     |

(\* = MJ uniquement)

Trois règles brillantes :

- **Le partage de touche est explicite et autorisé** (`canShareHotkey`) — `v`
  sert à move _et_ laser, `m` cycle 3 mesures, `Space` sert à la palette _et_ au
  timer tenu. Seuls les conflits « whileWidgetHeld » et « selectsWidget » sont
  interdits.
- **Cycle de famille** : la touche d'une famille donne son prochain outil si on est
  déjà dedans, sinon le premier de la famille.
- **Seuls les écarts aux défauts sont persistés** (une liaison égale au défaut est
  retirée : _« no default had changed while they did, so it was never a choice »_).
  Concept d'**origine** : `default | custom | displaced`. Si une future version
  donne à une action la clé que l'utilisateur avait donnée à une autre, celle-ci
  est désassignée — et les réglages **expliquent** au lieu de bloquer :
  _« Unassigned: its default, X, is assigned to \<autre action\>. »_

`canRunMapHotkeys` refuse si un modal/overlay est ouvert (liste explicite de
sélecteurs), si la cible est un input, si `isComposing`, ou si la leaf n'est pas
active.

`HotkeyHelp.tsx` génère l'aide depuis **la même table**, filtrée par
`availableHotkeys(isPlayerView)` — les actions `dmOnly` disparaissent pour un
joueur — en `<dl>` avec `<kbd>`, plus une section manuelle « Navigation &
interactions ».

## 8. L'undo : un geste = un pas

`src/app/stores/history.ts` (143 lignes), zundo.

- `partialize` ne garde que `objects`, `grid`, `background`, `widgetValues`.
- `HISTORY_LIMIT = 50`.
- `wrapTemporal` ajoute 4 API : `beginTransaction()`, `endTransaction()`,
  `transaction(fn)`, `untracked(fn)` — **nestable**, seul le `endTransaction` le
  plus externe enregistre.
- `endTransaction` ne pousse un pas que si le snapshot a réellement changé
  (`areTemporalSnapshotsEqual`).
- `runUntracked` pour l'hydratation, la sync distante, les états dérivés, et les
  **renommages de fichier** : _« a rename is not an edit: undo must never point
  tokens back at a path that no longer exists »_.

CLAUDE.md : _« any interaction that writes to the store while the pointer is down
(token drag, pin drag, wall vertex/light drag, eraser sweep, live-updating config
panels) must call `beginHistoryTransaction(store) … including on cancel/destroy »_.

## 9. La vision et le brouillard

- `visionGeometry.ts` (165 l.) — primitives pures, `EPSILON = 1e-10`.
- `radialSweep.ts` (139 l.) — balayage radial (omni-cône par source, ombres).
- `collectVisionSources(tokens, lights, visionSettings, gridSize, unitDistance)` :
  seuls les tokens avec `hasVision` génèrent de la vision ; rayons en **unités de
  jeu** convertis en pixels monde.
- Brouillard : **modèle par opérations** (1115 lignes) — chaque passe de peinture
  a son propre sprite, sélectionnable et supprimable via le context menu. Les
  effacements sont des **trous** extraits par composantes connexes (cellules 2 px,
  seuil alpha 12, max 320 rectangles).
- `FogOfWarRenderer` se **désabonne automatiquement** au changement de carte.
- Politique de visibilité, 15 lignes, très lisible :
  ```ts
  resolveFogPreviewAlpha: isPlayerView ? 1.0 : isGMView ? 0.5 : 1.0;
  canInteractWithFog: !isPlayerView;
  ```
  → en « Session view », le MJ voit **exactement** ce que voient les joueurs.

## 10. La détection automatique de grille

`src/app/pixi/gridDetection/` — architecture **propose → fit → verify** :

- **Propose** : spectre de puissance du contraste ligneux (carré = pics axiaux ;
  hex = 6 pics à `30°+k·60°`), deux vues (avant/après downsample). _« Le spectre ne
  décide jamais »_.
- **Fit** : `edgeProfile` moyenne l'image le long de chaque arête avant
  rectification ; `latticeSearch` profile ~800 arêtes une fois et vote ;
  `latticeFit` mesure la distance sous-pixel et résout taille + offset en
  **moindres carrés robustes** (poids de Tukey à cutoff décroissant).
- **Verify** : `support` = part corrigée du hasard des arêtes ayant une ligne à
  moins de 0,75 px ; sous 0,05 il n'y a pas de grille.

Les arêtes viennent des vrais drawers (`gridTemplate.ts`) → **détection et rendu ne
peuvent pas se contredire**.

## 11. L'onboarding

`src/app/onboarding/Tutorial.tsx` (74 lignes), plusieurs tours à `id` (`palette`,
`assets`, `tokenStatblocks`, `loot`). Étapes `{title, body, selector?, image?}`.

- **Spotlight** : si le `selector` pointe un élément existant et dimensionné, un
  rectangle `rect ± 4px` est posé dessus ; sinon un voile sombre plein écran.
- La carte se place **autour de la cible**, sinon centrée.
- **Re-mesure périodique** `setInterval(measure, 200)` + `resize` : _« follow the
  asset manager's entrance and resizes without assuming a fixed layout »_.
- Chrome : eyebrow `« Label · 1 / N »`, titre, paragraphe, `Skip` / `Back` /
  `Next` / **action finale personnalisée** (ex. « Create collection » qui crée
  vraiment la collection).
- `role="dialog" aria-modal="true"` + focus trap.
- L'asset manager n'affiche le tuto que si **aucun autre modal n'est ouvert**.

## 12. La vue joueur

Trois choses :

1. `PlayerView` (`atlas-vtt-player`) — force `setPlayerMode(true)`,
   `persistenceEnabled: false` (aucune écriture de fichier), widgets forcés
   visibles, drag du viewport **revendiqué 100 ms après le montage** (le pan est
   `pause`d par l'outil). Le CSS force `display: none !important` sur toute l'UI
   GM **sauf** `.atlas-widget-bar`.
2. `LocalPlayerView` — le popout. Son état (`tabId`, `filePath`, `frozen`,
   `camera`) est **sérialisé dans le layout Obsidian** pour survivre à un
   redémarrage. `body.atlas-player-window` **redéfinit tout le jeu de variables de
   thème** → le popout n'a pas besoin d'un thème Obsidian installé.
3. La fenêtre : canvas `image-rendering: pixelated`, `-webkit-app-region: drag`
   (toute la fenêtre déplaçable), titre fantôme 40 px `opacity: 0→1` au survol
   d'une zone de 80 px, indicateur de caméra gelée, overlays du DM montés **dans**
   la fenêtre.

Côté `UIRoot`, `isPlayerView` retire `SceneTabBar`, `UndoRedo`, `ViewActionsMenu`,
`SceneSwitcher`, réglages de grille, `DMDashboard`, `InitiativeTracker`, `LootRoller`
et les outils GM-only. **Le `BottomToolbarRow` reste avec `MainToolbar`** (qui ne
rend que move, measure, dice) → _« la barre d'outils du joueur est littéralement
la même barre, réduite »_.

## 13. Ce qu'on retient

1. **3 couches + `pointer-events` par couche** — le vide reste cliquable.
2. **Chrome monté en permanence**, jamais démonté.
3. **Barre ancrée qui respire** + **fit par priorité pur, testable, avec pin**.
4. **Command palette qui sort de la barre**, mesurée avant paint.
5. **Surfaces : un seul mixin**, coins concentriques, échelle de rayons.
6. **Un clic droit par objet** → moins de boutons permanents.
7. **Les tokens sont des objets de jeu** (vie, seuils, initiative, badges).
8. **Un raccourci = une ligne d'une table déclarative**, aide générée depuis elle.
9. **Un geste = un pas d'undo**, sliders debouncés.
10. **Chaque animation a son pendant `prefers-reduced-motion`.**
