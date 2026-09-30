# 02 — État des lieux : RollWith H&D

> Source : `RollWithv2` @ `42af3fb`.
> SvelteKit 2 + Svelte 5 (runes), `ssr: false`, `adapter-static`.
> **11 054 lignes** au total, **38 fichiers**.

## 0. Vue d'ensemble

| Sujet         | Réalité                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Framework     | SvelteKit 2, Svelte 5 (`$state`, `$derived`, `$effect`, `$props`)                                             |
| Rendu         | SPA pure (`ssr: false`, `prerender: false`)                                                                   |
| CSS           | **Pas de Tailwind, pas de PostCSS, aucun framework CSS.** `<style>` scopé par composant + 2 CSS globaux       |
| État          | **Pas de zustand, pas de `svelte/store`.** Un unique `$state` de module dans `ws.svelte.ts`                   |
| Langue        | 100 % français (labels, messages, commentaires)                                                               |
| Volume        | `+page.svelte` de la table = **2 285 lignes** (20 % du front)                                                 |
| Thème         | « Carnet de nuit », **sombre uniquement**, 4 accents sélectionnables localement                               |
| Cible         | **Bureau + clavier/souris, grand écran.** Un seul media query dans `web/src` — assumé                         |
| Accessibilité | Les rôles ARIA existent ; le focus trap, `aria-live`, `:focus-visible`, `prefers-reduced-motion` sont absents |

## 1. Les routes

`+layout.svelte` fait 14 lignes : il importe les 2 CSS globaux et fait
`{@render children()}`. **Aucun layout partagé** — pas de navbar, pas de shell. Chaque
page réinvente sa propre barre de header.

| Route                   | Fichier                              | Rôle                                                                                                                               |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | `+page.svelte` (624 l.)              | Accueil = liste des campagnes. 3 états : chargement / non connecté (hero + CTA) / connecté (grille de cartes + modale de création) |
| `/login`                | `login/+page.svelte` (163 l.)        | OAuth Discord. Un bouton SVG inline                                                                                                |
| `/join/[token]`         | `join/[token]/+page.svelte` (105 l.) | Landing d'invitation                                                                                                               |
| `/campaigns/[id]/table` | `+page.svelte` (**2 285 l.**)        | **La table de jeu**                                                                                                                |
| `/characters/[id]`      | `+page.svelte` (86 l.)               | Feuille de perso                                                                                                                   |
| `/compendium`           | `+page.svelte` (555 l.)              | Compendium 3 colonnes                                                                                                              |

Il n'existe **pas** de route `/campaigns`, `/settings`, ni d'écran de paramètres de
campagne — `api.campaigns.updateSettings()` existe dans `api.ts:75` mais **n'est
appelé par aucun composant**.

Les routes sont liées par des `<a href>` classiques. Le `session-bar` de la table
contient literally `<a href="/compendium?campaign={campaignId}" class="compendium-link">Compendium</a>`.
**C'est le signal le plus fort de « application web » dans tout le produit**, et
c'est déjà visible sur la capture d'Atlas à côté.

## 2. La table de jeu

### 2.1 Il n'y a pas d'arborescence de composants

**Pas de dossier `components/table/`.** Pas de `MapCanvas`, pas de `GridOverlay`,
pas de `Token`, pas de `FogOverlay`, pas de `InitiativePanel`, pas de `ChatPanel`.
Tout le rendu — carte, compagnie, barre MJ, initiative, brouillard, inventaire —
est du markup inline dans le `<script>` + `{#if}` d'un fichier unique de 2 285
lignes (script ≈ 1 069, markup ≈ 560, CSS scopé ≈ 650).

Les 4 seuls enfants :

| Composant                  | Lignes | Rôle                                                                                      |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `MapManager.svelte`        | 745    | Popover « Cartes N » : liste, import, renommage, suppression, réglage de grille, notes MJ |
| `NpcLibrary.svelte`        | 515    | Popover « PNJ N » : bibliothèque de modèles, recherche, quantité, pose                    |
| `DiceOverlay.svelte`       | 163    | Dé animé plein écran                                                                      |
| `CompendiumTooltip.svelte` | 104    | Tooltip lazy-load sur les chips d'état                                                    |

### 2.2 La structure : une grille de page

```css
.table-screen  { height: 100vh; display: flex; flex-direction: column; }
.session-bar   { flex: none; border-bottom: 2px }
.table-body    { display: grid; grid-template-columns: 288px 1fr 324px; overflow: hidden }
  aside.compagnie  { 288px, overflow-y: auto }
  main.map-area    { 1fr }
  aside.panel      { 324px, onglets }
```

`--w-compagnie: 288px`, `--w-panel: 324px` dans `web/src/lib/ds/tokens.css:48-49`.

**Toute la table est un `position: static` qui remplit le viewport.** La carte est
_encadrée_ par deux sidebars opaques, elle n'est jamais le sujet.

### 2.3 Le rendu de la carte

**DOM/CSS, pas de canvas principal.** Le seul `<canvas>` est le brouillard
(`canvas.fog-canvas`). Les tokens, repères, image et quadrillage sont des éléments
HTML positionnés **en pourcentage** de la surface.

```
div.map-frame              ← le CADRE : handlers de zoom/pan, ResizeObserver
│                          role="region" aria-label="Carte de jeu — molette…"
└── div.map-zoom           transform: translate(panX,panY) scale(zoom), origin 0 0
    └── div.map-surface    border 2px, isolation:isolate, overflow:hidden
        ├── img.map-img    object-fit: cover
        ├── div.map-grid   quadrillage (--overlay ou --tinted)
        ├── canvas.fog-canvas   z-index 15
        ├── div.marker ×N  z-index 5
        ├── div.token ×N   z-index 10
        └── div.ping ×N    z-index 20
└── div.map-hud            absolute right/bottom 10px, z-index 30
```

Les positions sont des **pourcentages** → indépendantes de la résolution, ce qui est
un vrai bon choix. Deux modes de surface :

- `--fitted` : avec image, un `ResizeObserver` + `onload` calculent le plus grand
  rectangle respectant le ratio et posent `width/height` en px inline. But
  explicite dans le code : **toujours voir l'image entière, aucun crop**.
- `--fill` : sans image, la surface remplit le cadre.

### 2.4 Zoom / panoramique

État local `viewZoom` (bornes `VIEW_MIN = 0.5`, `VIEW_MAX = 8`), `viewPanX/Y`.
**Délibérément non diffusé** (commentaire l.251-254 : « Chaque joueur a son propre
cadrage ; rien n'est stocké ni diffusé ») — c'est un bon choix produit, à garder.

- Molette : listener non-passif, `Math.exp(-e.deltaY * 0.0015)`, zoom **ancré sur
  le curseur**.
- Panoramique : 3 gestes — bouton `✋` du HUD ou touche `H` ; **clic droit ou
  molette glissé quel que soit l'outil** (`PAN_BUTTONS = {1,2}`) ; exclusion du clic
  droit sur un pion/repère (menu contextuel MJ).
- `clampView()` avec `VIEW_SLACK = 0.2`.
- Le transform est porté par `.map-zoom` et pas par la surface (commentaire l.1922 :
  un `transform` ne change pas la mise en page, donc le `ResizeObserver` ne boucle pas).

**Ce qui manque :** aucune animation. `vp.animate({time:400,
ease:'easeInOutCubic'})` n'existe pas chez nous. Passer de « zoom à 145 % » à
« 60 % » est un saut.

### 2.5 Le quadrillage

Deux variantes CSS. `--overlay` (posé sur une photo) utilise
`mix-blend-mode: difference` pour garantir le contraste sur n'importe quelle image.
`--tinted` annule le blend et utilise `color-mix(in srgb, var(--map-grid-color) 60%,
transparent)` — sans quoi une teinte rouge ressortirait cyan.

**Ce qui manque :** pas de type de grille (carré/hex), pas de snap, pas de
détection automatique, pas d'offset, pas d'unité de distance réelle.

### 2.6 Le brouillard

Canvas 2D, et il est **algorithmiquement soigné** — c'est le meilleur morceau de
rendu de notre front :

- Opacité inline : **0.45 pour le MJ, 1 pour les joueurs** (le MJ voit à travers).
- Le fond n'est repeint que si nécessaire ; ensuite **seuls les nouveaux points sont
  découpés** (`destination-out` + `cutFogHole`) → coût de dessin constant.
- Chaque trou est un dégradé radial (rayon 68).
- Aplat `#3B372E` + hachures `rgba(251,248,240,.05)` en `lineWidth 1` tous les
  14 px.
- Backing store = taille de mise en page × `fogScale` où
  `fogScale = min(3, max(1, viewZoom × devicePixelRatio))` → net au zoom. Le
  changement d'échelle est debouncé à 140 ms.
- Envoi WS throttlé par distance (`FOG_SEND_MIN_DIST = 2.5 %`).

**Ce qui manque :** modes (brosse / lasso / rectangle), taille de brosse
ajustable, **undo par passe de peinture**,.peek GM (voir la preview).

### 2.7 Les pions

DOM : `div.token` en `left/top` %, `transform: translate(-50%,-50%)`. Taille =
`store.settings.tokenSize` (défaut **32 px**) + 8 px si portrait ;
`font-size: tokenSize * 0.42`.

- `.token-pj` : fond clair, bordure `2.5px solid var(--token-color)`, rayon
  **organique** `48% 52% 50% 50% / 52% 48% 52% 48%`.
- `.token-pnj` : rayon organique miroir.
- Portrait webp, sinon **initiale du nom** en `.token-label` sous le pion.
- `.token-active` = double halo `0 0 0 3px var(--map-token-bg), 0 0 0 6px var(--accent)`.
- `title` contextuel : le MJ voit `nom — CA n · PV x/y`, le joueur seulement le nom.
- Déplacement : `setPointerCapture`, override local, envoi WS throttlé (rAF,
  `TOKEN_SEND_MIN_MS = 33`), flush au relâchement.
- `canMoveToken()` : MJ toujours, sinon seulement son propre PJ.

**Ce qui manque :** barre de vie sur le pion, numéro d'initiative, badge
d'instance, état (mort / assommé), taille relative à la grille (les pions ne sont
pas sur les cases, ils sont en pourcentage libre), anneau de taille, curseur
d'état, animation d'apparition.

### 2.8 La barre d'outils MJ

`.mj-toolbar` — bandeau horizontal `flex-wrap: wrap`, rendu seulement si `isMj`,
placé **entre** le header de carte et `.map-frame`. Libellé « Outils du MJ » en
`--accent-text`, séparateurs `.tsep`.

Ordre exact : `MapManager` « Cartes ⟨N⟩ » → `NpcLibrary` « PNJ ⟨N⟩ » → `.tsep` →
`Main` (H) → `Déplacer` (V) → `+ PNJ` (P) → `Repère` (R) → `Effacer les repères` →
`.tsep` → `Brouillard` (B) → `.tool-hint` contextuel.

Les options sont **dépliées dans la barre** : `+ PNJ` ouvre nom + PV + CA + Init +
un ghost `→ bibliothèque` ; `Repère` ouvre un input ; `Brouillard` ajoute
`Tout recouvrir` + `Dissiper`.

**Trois problèmes :**

1. `flex-wrap: wrap` → la barre passe à la ligne selon la largeur.
2. Les options dépliées **changent la largeur** de la barre, donc les autres
   boutons se décalent en permanence.
3. Le `.tool-hint` (« Cliquez sur la carte pour poser X — Échap pour annuler »)
   est du texte de largeur variable en fin de barre.

Tout est en **boutons texte**, pas en icônes. Pas de popover d'options, pas de
split-button, pas de notion de famille d'outils.

### 2.9 Les raccourcis

Handler `onWindowKeydown` sur `window`, dans le fichier de 2 285 lignes :

- **Ignoré** si la cible est `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`, ou si
  `metaKey`/`ctrlKey`/`altKey`.
- `Échap` → ferme le menu, annule `pendingPlace`, remet l'outil à `move`.
- `/` → focus chat. `0` → reset vue. `H` → Main (**avant** le garde `isMj`, car
  tout le monde cadre sa carte — bonne idée).
- `1`…`6` → `quickRoll(4|6|8|10|12|20)`, MJ.
- `V`, `P`, `R`, `B` → outils, MJ.
- `toolSelect(t)` est un toggle : recliquer l'outil actif rebascule sur `move`.

Pas de table déclarative, pas de groupes, pas d'aide clavier, pas
`preventDefault` sur les touches de la palette (elles n'existent pas), pas de
gestion des conflits.

### 2.10 L'initiative

Pas de panneau : un **bandeau horizontal `.combat-bandeau`** qui **remplace** le
header de carte quand `mode === 'combat'`. Chips `.init-chip` (`score · nom`),
`.active` en accent, rayons organic alternés. Phase `init` → un bouton par
personnage n'ayant pas lancé, `.roll-init-btn` (accent) ou `.waiting` (dashed,
`disabled`) : c'est un tourniquet d'auto-roll où chaque joueur clique pour son
perso. Phase `run` → `round n` + bouton MJ « Tour suivant → ».

### 2.11 Les dés

Rapides dans le `session-bar` (`d4 d6 d8 d10 d12 d20`, d20 en accent). Onglet
« Dés » du panneau droit : champ modificateur, grille de gros boutons, encart
« Astuce » (`/2d6+3`, `/4d6b`, `/caracs`), historique local des 6 derniers.

`DiceOverlay.svelte` : dé en `clip-path: polygon(...)` par type (4/8/10/12/20 ont
des polygones distincts, d6 = `border-radius` organique), double couche
`.dice-outer`/`.dice-inner` façon tranche, faces qui défilent toutes les 75 ms,
`rotation` ±5°, puis le total dans un « cartouche ». Durée 3 200 ms + 1 700 ms de
maintien. Un 1 sur 1d20 est gris (`#9C947F`) au lieu de rouge.

**C'est notre meilleur effet visuel.** Ce qui manque par rapport à Atlas : le
résultat n'est **pas** dans un toast Housing dans le coin avec le nom de la source
et le détail des dés — c'est un plein écran qui **bloque la table pendant 3,2 s**.

### 2.12 Les deux sidebars

`aside.compagnie` (288 px) — fond `repeating-linear-gradient` de lignes tous les
28 px (papier ligné). Cartes PJ : portrait 30 px, nom, `CA n`, lien « Feuille »,
barre de PV hachurée avec `−`/`+`, ligne `PV x/y · Init +n`, bouton « Placer sur la
carte » (MJ), chips d'état + `<select>` « + état ». `.turn-flag` « à lui de jouer »
en débord quand c'est son tour. Puis « PNJ présents » : nom, CA, boutons `modèle`
et `✕`.

`aside.panel` (324 px) — 3 onglets :

- **Journal** : liste `gap: 11px`, `stickToBottom` (seuil 48 px), pagination par le
  haut, pastille « ↓ N nouveau message » façon Discord avec `jumpToNew()`.
  Entrées typées par `kind` : `say`, `roll` (carte avec total en 20 px, `crit`/
  `fumble`), `system` (italique), `share`. Input chat « Parler, ou /1d20+5,
  /caracs… ».
- **Dés** : cf. 2.11.
- **Inventaire** : sélecteur de sac (MJ seulement, sinon verrouillé sur son
  propre sac), bourse (`.coin.po/.pa/.pc`), objets avec quantité `×n`, boutons `→`
  (donner) et `✕` (jeter), formulaire d'ajout (MJ), « Donner à » avec cible +
  3 champs monétaires. État vide « Sac vide ».

### 2.13 Ce qui est collé à la carte vs dans les sidebars

| Collé à la carte (sur `.map-surface`)                            | Dans le `session-bar`                                                                                     | Panneau droit            | Colonne gauche           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------ |
| image, quadrillage, brouillard (canvas), pions, repères ⚑, pings | nom de campagne, bascule Exploration/Combat, **lien Compendium**, dés rapides, présence (`presence-chip`) | journal, dés, inventaire | cartes PJ/PNJ, PV, états |

Le HUD (`.map-hud`, `✋ − % +`) est le seul élément d'UI **superposé** à la carte.

## 3. Les stores

### 3.1 Un unique `$state` de module

`web/src/lib/ws.svelte.ts` (316 l.) — pas de zustand, pas de `svelte/store` :

```ts
export const tableStore = $state<TableStore>({ … })
```

| Champ                        | Contenu                                                |
| ---------------------------- | ------------------------------------------------------ |
| `connected`                  | booléen                                                |
| `state`                      | `{ mode, mapId, tokens, markers, fog, combat }`        |
| `characters`                 | `CharacterCard[]`                                      |
| `settings`                   | `TableSettings` (partagés de campagne)                 |
| `journal`                    | `JournalEntry[]`                                       |
| `inventories`                | `Record<charId, Inventory>` — **filtrés côté serveur** |
| `presence`                   | `PresenceUser[]`                                       |
| `pings`, `diceAnim`, `error` | TTL                                                    |

La page table fait `const store = tableStore;` **directement**, avec un commentaire
expliquant qu'il ne faut surtout pas le ré-envelopper dans un `$state()` (double
proxyification).

Tout le reste est en `$state` **local à la page** : journal (`olderEntries`,
`hasMoreOlder`, `unseen`, `stickToBottom`), carte (`tool`, `maps`, `viewZoom/PanX/
PanY`, `dragOverride`, `fogCanvas`, `frameRef`), inventaire (drafts), dés, `pendingPlace`,
`ctxMenu`, `toast`, `session`, `isMj`, `campaignName`.

### 3.2 Le client WebSocket

- `WebSocket` **brut**, pas de librairie. `onopen/onmessage/onclose/onerror` assignés.
- URL : `${origin.replace("http","ws")}/api/tables/${campaignId}/ws`.
- Reconnexion : backoff exponentiel **plafonné à 8 s** + jitter jusqu'à 800 ms.
  Toast seulement si la connexion était établie.
- `disconnectWs()` nullifie `onclose`/`onerror` et pose `disposed = true` → pas de
  reconnexion fantôme.

**Trois manques structurels :**

1. **Pas de file de messages sortants.** `sendWs` est un `ws.send()` direct,
   **silencieux si le socket n'est pas `OPEN`** → les messages sont perdus.
2. **Pas de keepalive** (`setWebSocketAutoResponse` côté DO).
3. **Pas de plafond de reconnexion** au-delà du backoff.

Le seul amortissement est local et ad hoc : `scheduleTokenMove` et
`sendFogReveal`, dans la page.

### 3.3 La réduction des messages

`switch` sur `msg.type` :

- `snapshot` → remplace l'état intégral.
- `delta` → patch partiel. Cas spécial : un patch contenant `mapId` = changement de
  carte → `tokens` est **remplacé** plutôt que fusionné.
- `journal` → **garde anti-doublon O(1)** via un `Set<number> journalIds`, puis
  append avec une nouvelle référence (pour la réactivité).
- `inv`, `dice.result` (TTL 1 700 ms), `presence` (dédupliquée), `ping` (TTL
  1 900 ms), `error`.

## 4. Le design system

### 4.1 Un thème sombre, 97 lignes de tokens

`web/src/lib/ds/tokens.css` — thème « Carnet de nuit » (`design V2/THEME-CARNET-DE-NUIT.md`).
**Aucune notion de light mode**, aucun `prefers-color-scheme`.

| Groupe       | Variables                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Fonds        | `--bg: #26221d`, `--panel: #2e2a24`, `--border: #575043`, `--border-soft: #3a352d`                   |
| Textes       | `--text: #e8e2d4`, `--heading: #f2ede0`, `--text-2: #9c947f`, `--text-3: #6e6759`                    |
| Ombres       | `--overlay: rgba(15,13,10,.6)`, `--shadow-1`, `--shadow-2`                                           |
| Carte claire | `--map-bg: #f4f0e3`, `--map-line`, `--map-grid-size: 32px`, `--map-token-bg`, `--fog-color: #3b372e` |
| Monnaies     | `--coin-po: #d4a73c`, `--coin-pa`, `--coin-pc`                                                       |
| Typo         | `--font-title: "Vidaloka", Georgia, serif` · `--font-body: "Alegreya Sans"`                          |
| Layout       | `--w-compagnie: 288px`, `--w-panel: 324px`                                                           |
| Accent       | `--accent`, `--accent-hover`, `--accent-border`, `--accent-text`, `--accent-fg`                      |

**Les « sketchy radii » sont la signature du DS** : 8 variantes à valeurs
yoniques très asymétriques (`--sketchy-1: 255px 15px 225px 15px / 15px 225px
15px 255px`…), piochées par `seed % 8` (`SketchyBox.svelte`), par index dans les
listes, ou par `[i % 6]` dans `SheetCaracs`. Les bords « tetrahex » des tokens
reprennent l'idée en pourcentages.

**L'« encre »** : 4 palettes (`carmin` défaut, `brique`, `ocre`, `foret`) dans
`localStorage["hd-encre"]`, appliquée via `document.documentElement.dataset.encre`.
Choix purement local, « visible par toi seul ».

### 4.2 Le DS est excellent mais minimal — 6 composants

`Button` (3 variantes), `Chip` (3 variantes), `SketchyInput`, `Editable` (le
meilleur : édition in-place avec tampon `buf` non resynchronisé quand le champ est
focalisé, Enter commit / Escape annule, `stopPropagation` sur pointerdown),
`SketchyBox`, `BlockLabel`.

**Il n'y a pas de `Modal`, ni `Panel`, ni `Tabs`, ni `Dialog`, ni `Popover`, ni
`Toast`, ni `Tooltip`.** La logique est dupliquée dans ~6 fichiers :

| Mécanisme                                                       | Où il est dupliqué                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Overlay + modale inline                                         | `routes/+page.svelte`, `ChoicePicker`, `CharacterCreateModal`, `CharacterSheet`, `SheetCombat` |
| Popover `absolute` + click-outside via `$effect` sur `document` | `MapManager`, `NpcLibrary`, `EncreSelector`                                                    |
| Overlay z-index                                                 | `50`, `50`, `60`, `60`, `60`, `70`, `90`, `95` — **sans échelle**                              |

### 4.3 L'inventaire des rayons — le problème chiffré

```
$ grep -rho "border-radius: [^;]*" web/src | sort -u | wc -l
56
```

**56 valeurs distinctes**, dont des familles de quasi-doublons qui diffèrent d'1 px :

| Famille | Valeurs présentes                                                                          |
| ------- | ------------------------------------------------------------------------------------------ |
| 6 px    | `6px 2px 6px 2px`, `6px 2px 7px 3px`, `6px`                                                |
| 8 px    | `8px`, `8px 3px 8px 3px`, `8px 3px 12px 3px`                                               |
| 10 px   | `10px`, `10px 3px 10px 3px`, `10px 3px 12px 3px`, `10px 3px 12px 4px`, `10px 4px 10px 4px` |
| 12 px   | `12px`, `12px 3px 12px 3px`, `12px 3px 14px 4px`, `12px 4px 13px 4px`, `12px 4px 14px 4px` |
| 14 px   | `14px 4px 16px 5px` (tooltip), `14px 5px 16px 5px` (MapManager, NpcLibrary)                |

Le même composant, réécrit deux fois, a un rayon différent. `Button.svelte:54`
fait `15px 230px 15px 225px / 225px 15px 255px 15px` et `CharacterSheet.svelte:617`
fait `15px 255px 15px 225px / 225px 15px 255px 15px` — le même motif, à un chiffre
près.

**13 `box-shadow` distincts**, dont l'ombre « dure » `2px 3px 0 rgba(0,0,0,.2)`.

Et le `z-index` est une sériesérie de nombres arbitraires dispersés : `1, 5, 10, 15, 20, 30, 40, 50, 60,
70, 80, 90, 95` répartis sur 9 fichiers, sans nommage sémantique.

**C'est la cause racine C2 du README.** Ce n'est pas un problème de goût, c'est un
problème de cohérence mesurable.

## 5. Les écrans secondaires

### 5.1 Feuille de perso `/characters/[id]`

Route mince (86 l.) : fetch `api.characters.detail`, puis **se connecte aussi au WS
de la campagne** pour que les jets s'animent. Un `$effect` resynchronise
PV/PVMax/conditions depuis `tableStore.characters` avec un garde explicite (sinon
boucle d'effet).

`CharacterSheet.svelte` (942 l.) :

- **Autosave** debounce 700 ms, `If-Match` sur `updatedAt` (anti-écrasement),
  machine à états `idle|dirty|saving|saved|error`, `flush()` forcé au `onDestroy`.
- Calculs automatiques PV (DV+niveau+CON) et CA (DEX+armure) qui se réécrivent
  tant que l'utilisateur ne les a pas forcés.
- **Grille 4 colonnes** : `178px 242px 1fr 1fr` —
  `SheetCaracs` (6 caractéristiques, rayon organic cyclé, modificateur, clic = jet) ·
  `SheetSaves` (dots de maîtrise + compétences) · `SheetCombat` (**957 l.** :
  PV, Attaques, Armures, Sorts avec picker modal) · `SheetTraits` (Capacités,
  Personnalité, Équipement).
- Montée de niveau en un clic (`applyLevelUp` de `shared/`), pas en modale.

**Ce qui manque pour le « game feel » :** la feuille est une page qui défile. Pas
de mode « lecture / déploiementlecture / déploiementlecture / déploiementlecture / déploiementlecture / déploiementlecture / déploiement MJ », pas de surbrillance de ce qui change, pas de fantôme
des valeurs non visibles.

### 5.2 Compendium `/compendium`

Grille 3 colonnes `190px 280px 1fr`. Rail de 10 catégories avec compteurs et cadenas
✒ pour celles réservées au MJ. Liste avec recherche debounce 250 ms et pagination
par blocs de 200 (3 catégories dépassent le plafond API : bestiaire 753, grimoire
361, objets magiques 301). Fiche avec bandeau de stats contextuel, actions MJ
(« Partager au journal », « + Ajouter à ma bibliothèque de PNJ » → crée un
`NpcTemplate` avec CA/PV/Init calculés par `shared/compendium`).

`markdown-lite.ts` (222 l.) : parseur maison avec échappement HTML systématique
**avant** réinjection de `<strong>/<em>/<sup>/<sub>`, en-têtes DRS à 2 niveaux
(`colspan`/`rowspan`), lignes `__group__`, **icônes de dé SVG inline** quand un
en-tête est un `dN`.

**Lecture seule** — pas d'édition de fiches. Et c'est une page à 3 colonnes fixes
qui scrollent, donc exactement le même problème que la table.

### 5.3 Accueil `/`

Non connecté : carte hero centrée, `.brand-hero` en 40 px serif, CTA `/login`.
Connecté : header (marque, `EncreSelector`, avatar = initiale dans un blob, Déconnexion),
grille 2 colonnes de `.campaign-card`, panneau d'invitation dépliant, tuile de
création dashed. Ligne « rejoindre avec un token » en bas.

### 5.4 Sélection de personnage

`CharacterCreateModal.svelte` (649 l.) — wizard 6 étapes avec stepper cliquable,
`step` + `maxVisited` (on peut revenir en arrière mais pas sauter en avant), 3
méthodes de caractéristiques (standard / roll 4d6 / free), pool d'affectation
cliquable. C'est **le seul wizard du produit, et il est bon**.

Il n'y a **pas d'écran de sélection de personnage existant** : un joueur voit sa
carte dans la colonne compagnie. Le seul `<select>` de personnages à choix libre
est le sélecteur de sac de l'inventaire.

## 6. Les états vides et le feedback

Les **états vides sont excellents** — c'est le point fort du produit :
« Aucun personnage joueur pour l'instant », « Le MJ n'a pas encore choisi de
carte » / « Créez ou sélectionnez une carte ci-dessus », « Aucune carte — créez-en
une ou déposez une image ici », « Sac vide », « Inventaire — aucun personnage
visible », « Aucun résultat. », « Aucun jet pour l'instant », « Aucun modèle —
créez-en un ou enregistrez un PNJ posé », « Choisis une entrée pour consulter sa
fiche », « Aucun personnage visible ».

Le reste est sommaire :

| Type                   | Implémentation                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Toasts**             | **Un seul toast**, local à la page table, `role="status"`, `position:fixed` bas-centre, auto-dismiss 4 000 ms. **Aucun composant réutilisable, aucun toast sur les autres écrans.** |
| **Chargement**         | `<div class="center-page"><p class="muted">…</p></div>`. Rien d'autre.                                                                                                              |
| **Squelettes**         | **Aucun.**                                                                                                                                                                          |
| **Erreurs réseau**     | `fetchJson` extrait `body.error` et jette une `Error`. **La plupart des `catch` sont silencieux** (`/* ignore */`) → les panneaux affichent un vide au lieu d'une erreur.           |
| **Confirmation**       | Pas de modale : pattern « armement » inline (`pendingDeleteId` → « Supprimer ? Oui / Annuler » dans `MapManager`).                                                                  |
| **Perte de connexion** | Toast « Connexion perdue » (4 s), **mais la table reste visible et cliquable** — aucun bandeau hors ligne, aucune dégradation des envois (et les envois sont perdus, cf. §3.2).     |

## 7. Grand écran

**1 seul media query** dans tout `web/src` :

```css
@media (max-width: 640px) {
  .stepper-label {
    display: none;
  }
}
```

Pas de breakpoints définis, pas de `prefers-reduced-motion`. La table est
**explicitement desktop** : grille à 3 colonnes de largeurs fixes, `height: 100vh`,
`overflow: hidden`.

**Ce n'est pas un manque, c'est la cible assumée.** Le produit se joue au
clavier-souris sur un PC de bureau avec un grand écran. Il n'y a donc **aucun
chantier responsive à prévoir**, et le seul media query ci-dessus ainsi que les
`touch-action: none` sont des scories d'une époque où le produit se voulait
utilisable au doigt : ils peuvent disparaître sans conséquence.

Le point de vigilance restant n'est pas la largeur, c'est la **hauteur** :
`height: 100vh` sur un grand écran laisse passer la barre du système sous
Windows ou le Dock macOS, qui rognent la table. `100dvh` ou une hauteur calculée
résolvent le cas.

## 8. Accessibilité

**Ce qui existe :**

- Clavier sur la table (le meilleur morceau) — handler `window` global avec filtrage
  correct des cibles de saisie et des modificateurs ; `H` traité **avant** le garde
  `isMj`.
- Rôles ARIA : `.map-frame` `role="region"` avec `aria-label` décrivant les gestes ;
  `.map-hud` `role="toolbar"` ; `.toast` `role="status"` ; `.ctx-menu` `role="menu"` ;
  `.tip-card` `role="tooltip"` ; modales `role="dialog" aria-modal="true"` ;
  panneaux `role="group"` + `aria-label`.
- `aria-pressed` sur `.hud-hand` (testé par e2e).
- `<label for>` sur les champs, `alt=""` sur les images décoratives, `aria-hidden`
  sur les SVG décoratifs.

**Ce qui manque :**

- **Aucun focus trap** dans les modales, **aucun retour de focus** au déclencheur,
  **aucun `inert`** sur l'arrière-plan.
- Les `div` à `role="button"` (chips d'état, markers) n'ont **pas** de handler
  clavier — seulement `onclick`.
- Le canvas de brouillard n'a **aucun équivalent accessible**, et les pions sont des
  `div` non focusables : **aucune navigation clavier sur la carte, aucun
  déplacement de pion au clavier**.
- **Pas d'`aria-live`** sur le journal (le `role="status"` du toast est le seul).
- **Pas de `:focus-visible`** (donc pas de distinction clavier/souris), pas de
  `skip-link`, pas de `prefers-reduced-motion` (les animations `hdPing`, dice, `.qp`
  tournent inconditionnellement).
- `--text-3` (`#6e6759` sur `--bg` `#26221d`) est probablement sous le seuil AA
  pour du texte 11-12 px.

## 9. Les forces à ne pas perdre

Il ne faut pas jeter le produit pour le rendre « gaming ». Ce qui est **vraiment
bon chez nous** et qu'Atlas n'a pas :

1. **Les états vides**, tous rédigés, tous utiles.
2. **Le brouillard** — l'algorithme de rendu (`destination-out` incrémental + `fogScale`) est bien fait.
3. **La caméra volontairement locale et non diffusée** (« chaque joueur a son
   propre cadrage »).
4. **Le panoramique accessible aux joueurs** (clic droit / molette quel que soit
   l'outil) — Atlas réserve le pan à un bouton.
5. **Le `If-Match` sur la feuille** (anti-écrasement) et l'autosave à 700 ms.
6. **Le ratio d'image respecté** (`--fitted`) : on voit toujours la carte entière.
7. **Le rafraîchissement optimiste des pions** avec override local + purge différée.
8. **Le garde anti-doublon O(1) du journal** (`Set` d'ids).
9. **La règle de visibilité des PNJ** — une vraie contrainte de sécurité, à
   propager partout.
10. **Le `Editable.svelte`** : édition in-place avec tampon `buf` qui ne se
    resynchronise pas pendant la saisie — exactement le bon pattern.
11. **Les tests e2e** (12 tests Playwright) et la fixture `dev-camp` : on peut
    refondre en gardant un filet.
12. **Le wizard de création de perso**, bien fiché.e en gardant un filet.
13. **Le wizard de création de perso**, bien fiché.
