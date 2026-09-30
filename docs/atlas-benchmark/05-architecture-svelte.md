# 05 — Architecture : comment on reconstruit ça en Svelte 5

> La recherche de libs (versions, dates, URLs) est dans
> [`08-recherche-stack-ui.md`](./08-recherche-stack-ui.md). Ce fichier donne la
> **décision** et le **plan**.

---

## 1. Le problème n°1 : le `transform` et les popups

### Le piège

La refonte veut faire de la carte une couche plein écran. Aujourd'hui le pan/zoom
est un `transform` :

```css
.map-zoom {
  transform: translate(var(--pan-x), var(--pan-y)) scale(var(--zoom));
}
```

Or **un `transform` sur un ancêtre crée un containing block pour tous ses
descendants `position: fixed`**. Un menu contextuel, une palette, une infobulle
n'epouse plus le viewport : elle est transformée avec la carte.

C'est exactement le piège qu'Atlas documente (`contain: strict` sur
`.workspace-leaf` dans Obsidian) et que la recherche confirme comme notre
contrainte n°1.

### La bonne nouvelle : la spec le résout

CSS Positioned Layout Level 4, [§3.1 Top Layer Styling](https://drafts.csswg.org/css-position-4/#top-styling) :

> - « Elements in the top layer … generate boxes **as if they were siblings of the
>   root element**. »
> - « **If its `position` property computes to `fixed`, its containing block is the
>   viewport; otherwise, it's the initial containing block.** »

Un élément `[popover]` ou un `<dialog>` en **top layer** est peint comme un frère
de `<html>` : il n'est **pas** mis à l'échelle par le `transform` de la carte, et
son containing block est le viewport.

Et la [Popover API est Baseline 2025](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API).

Trois conséquences :

1. **Le `popover` natif est la solution de référence pour les cas simples**
   (bulles, menus, panneaux) — zéro dépendance, light-dismiss et `Escape`
   fournis par le navigateur.
2. **L'ordre d'empilement n'est plus `z-index`** mais l'ordre du top layer : le
   dernier ouvert est au-dessus. C'est pile le modèle « docking » d'un VTT.
3. **Les propriétés héritées cascadent toujours** depuis le parent DOM (variables
   de thème, `font-family`…). Il faut porter les tokens sur `:root` **et** sur le
   conteneur du portail.

### Et les libs ?

`bits-ui` 2.19.3 ne l'exploite pas (il passe par Floating UI + `Portal`), mais c'est
contournable en **deux props** : `<X.Portal>` (défaut `document.body`) et
`strategy="fixed"`.

> ⚠️ **Piège vérifié dans le code publié de bits-ui 2.19.3** : la doc annonce
> `strategy` par défaut = `'fixed'`, mais
> `dist/bits/utilities/popper-layer/popper-layer-inner.svelte.js` fait
> `strategy ?? (preventScroll ? "fixed" : "absolute")` et
> `use-floating.svelte.js` fait `strategyOption = strategy ?? "absolute"`.
> **Le défaut réel est `absolute`** → popups cassés dans notre parent transformé.
> Il faut donc passer `strategy="fixed"` **explicitement partout**, et le
> **factoriser dans un wrapper maison** pour ne pas l'oublier.

### ❌ Ce qu'on ne fonce pas

**CSS Anchor Positioning** est passé Baseline en 2026 (Chrome 117 / FF 145 /
Safari 26) et serait la solution élégante. Mais sa règle
[§2.3 Finding an Anchor](https://drafts.csswg.org/css-anchor-position-1/#anchor-scope)
exige que l'ancre et le popover aient **le même _original containing block_**.
Nos pions vivent dans un conteneur `position: absolute` → leur _original containing
block_ est ce conteneur → **le popover en top layer ne pourra pas s'y ancrer**.

Verdict : `anchor()` est utilisable pour la barre d'outils et les rails (ancrés à
leur rail), **pas** pour les popups de pions. Pour ceux-là, on calcule `left/top`
depuis `clientX/Y` + un clamp simple.

### 1.5 Ce que le spike a mesuré (30/09/2026)

Spike joué le 30/09/2026 : `bits-ui@2.19.3` installé, harnais jetable sur
`/dev/overlays`, Svelte 5.36.0 (peer requis `^5.33` ✓).

| Mesure                            | Résultat                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm check`                      | vert — 0 erreur, 309 tests, format OK                                                                    |
| `pnpm --filter web build`         | OK                                                                                                       |
| Tree-shaking                      | **OK** — aucun composant inutilisé dans le bundle (ni `Calendar`, ni `DatePicker`, ni `Menubar`…)        |
| Poids `Dialog` + `Popover`        | **+35,1 Ko gzip** (Floating UI + focus scope + dismissible layer)                                        |
| Poids `ContextMenu` **en plus**   | **+6,6 Ko gzip** — il réutilise le même outillage que `Popover`, donc quasi gratuit une fois celui-là là |
| **Poids total pour 3 primitives** | **+41,7 Ko gzip** sur un total de 128,9 Ko → 170,6 Ko                                                    |

**Un piège confirmé dans le code publié.** `dist/internal/floating-svelte/
use-floating.svelte.js:11` :

```js
const strategyOption = $derived(get(options.strategy) ?? "absolute");
```

La doc en ligne annonce `Default: 'fixed'` ; le `.d.ts` livré ne documente **aucun**
défaut. **La valeur réelle est `absolute`.** À encoder dans `<Surface>`.

### 1.6 Résultat du spike : validé, 54/54 sur trois moteurs

Balayage rejoué par Playwright (`scripts/_diag-crossbrowser.cjs`) : 6 tests ×
3 zooms × **Chromium, Firefox, WebKit/Safari** — **54/54 conformes**, y compris le
témoin négatif.

|                                | 1×      | 2×          | 3×          |
| ------------------------------ | ------- | ----------- | ----------- |
| T1 Dialog (hors carte)         | 300/300 | 300/300     | 300/300     |
| T2 Popover (hors carte)        | 260/260 | 260/260     | 260/260     |
| T3 popover natif (hors carte)  | 260/260 | 260/260     | 260/260     |
| T4 Popover **dans la carte**   | 260/260 | 260/260     | 260/260     |
| T5 ContextMenu **sur un pion** | 200/200 | 200/200     | 200/200     |
| T6 **sans Portal ni strategy** | 260/260 | **520/260** | **780/260** |

La dernière ligne est la preuve que le test a du mordant : 260 × 2 = 520,
260 × 3 = 780. Sans `Portal` + `strategy="fixed"`, l'overlay est bel et bien
multiplié par le zoom.

**Conclusion** : l'architecture tient sur les trois moteurs. Les surfaces
flottantes peuvent se poser au-dessus d'une carte zoomée.

### 1.7 Les trois pièges qu'il a fallu traverser

Tous découverts en pilotant la page avec Playwright plutôt qu'en supposant.
Les deux premiers sont des contraintes réelles du produit.

#### Piège A — le CSS scopé ne touche que ce que Svelte déclare

> Le CSS scopé ne s'applique **qu'aux éléments déclarés dans le template du
> composant**. Le sélecteur compilé est `.ma-classe.s-hash` : l'élément doit porter
> le hash, et Svelte ne le pose que sur les éléments qu'il contrôle.

Deux directions, **même cause** :

| Cas                                                                | Effet                                     |
| ------------------------------------------------------------------ | ----------------------------------------- |
| Contenu **portalé** hors du sous-arbre stylé                       | les styles scoped ne l'atteignent pas     |
| Contenu **rendu par un composant enfant** (les Triggers `bits-ui`) | les styles scoped ne l'ont jamais atteint |

Symptôme rencontré : les ancres de test ne prenaient aucun style, donc elles
restaient dans le flux, alors que `.map-bg` — un vrai `<div>` scopé, en
`position: absolute` — les recouvrait. **En CSS un élément positionné peint
au-dessus du contenu en flux** : les clics, y compris le clic droit, partaient
tous dans `.map-bg`. Trois symptômes, une seule cause.

**Conséquence pour le chantier** : notre idiom par défaut est le `<style>` scopé.
Il ne convient **ni** aux panneaux portalés, **ni** aux surfaces rendues par un
composant de bibliothèque. D'où le choix déjà fait en `06-design-system.md` —
une couche de classes `.surface-*` écrites **en `:global()`**, comme seule
source de vérité pour les surfaces. Ce n'est pas une préférence, c'est une
contrainte.

#### Piège B — `setPointerCapture` sur un ancêtre

Les gestionnaires de pointer posés sur un élément **ancêtre** de tous les
éléments interactifs, avec `setPointerCapture`, rendent le document entier cible
du pointeur dès le premier `pointerdown`. Les descendants ne reçoivent plus
leur `click` ni leur `contextmenu`.

**Règle** : poser les gestionnaires sur la **couche qui ne contient aucun
élément interactif**, jamais sur un ancêtre commun. Ici : `.map-bg`, couche
frère des ancres.

⚠️ **La table actuelle a exactement ce défaut.** `.map-frame` porte les handlers
de pan/zoom **et** contient les pions et repères (qui ont un menu contextuel).
Le Lot 1 doit le corriger, sinon le bug est en production.

#### Piège C — les hooks de cycle de vie précèdent le DOM

`onOpenChange(true)` est appelé **avant** que le contenu portalé ne soit inséré.
Toute mesure prise à ce moment-là ne trouve rien.

**Règle** : ne jamais mesurer dans le callback d'ouverture ; attendre que l'élément
existe (`requestAnimationFrame` en boucle bornée, plutôt qu'un délai aveugle
qu'il faudra régler).

### 1.8 Deux corrections de critère

Le harnais s'est d'abord trompé **lui-même**, deux fois, ce qui est exactement le
risque qu'un témoin négatif est censé couvrir.

- **L'ancrage.** Comparer `rect.left` à `anchor.left` est faux : `bits-ui`
  **centre** le popover sur son ancre, et son middleware de _shift_ le déplace
  quand il frôle le bord. La bonne définition est : _posé sous l'ancre_
  (distance à `anchor.bottom` ≈ 0) **et** _centre de l'ancre dans l'étendue
  horizontale du popover_. Pour un **menu contextuel**, la référence est le
  **pointeur** : l'écart à `anchor.bottom` y croît linéairement avec le zoom
  (41 / 55 / 82 px à 1,5× / 2× / 3×), soit la moitié de la hauteur du pion — ce
  qui prouve que le menu s'ouvrait bien au pointeur.

- **L'échelle à zoom 1.** À 1× le transform est l'identité : un overlay correct
  et un overlay mis à l'échelle ont le même ratio (1). Le critère déclarait donc
  « ko » sur un résultat parfaitement sain. Il est désormais déclaré **non
  applicable** — on ne teste pas ce qui n'existe pas.

### 1.9 Ce que ça change pour la suite

1. `bits-ui` est **adopté** : il fonctionne, sur les trois moteurs, et le poids
   mesuré est acceptable (+41,7 Ko gzip pour 3 primitives).
2. **La règle des surfaces passe en `:global()`**, pas en classes utilitaires.
   C'est une décision de design system, pas un tours de main.
3. **Le Lot 1 doit scinder `.map-frame`** : une couche de fond qui porte le
   pointer, une couche d'objets qui ne le porte pas. C'est un prérequis, pas un
   détail.
4. **Aucune mesure d'UI dans un callback d'ouverture** — règle générale, elle
   vaut pour les tests qu'on écrira.
5. Le harnais Playwright (`scripts/_diag-*.cjs`) est la méthode à rependre pour
   valider la suite du chantier : **un test sans témoin négatif ne prouve rien**.

**Deux résultats qui changeaient le plan :**

1. **`Dialog.Content` n'accepte PAS `strategy`.** Seuls les composants _ancrés_
   l'acceptent (`Popover`, `DropdownMenu`, `ContextMenu`, `Tooltip`). Un `Dialog`
   n'utilise pas Floating UI : il est centré. Donc :
   - **ancré** → `Portal` **+ `strategy="fixed"`**
   - **modal centré** → `Portal` **seulement**

2. **Les styles Svelte scopés ne s'appliquent pas au contenu portalé.** Un
   `<style>` scopé génère des classes à hash, et le portail déplace le DOM hors du
   sous-arbre stylé : les styles ne suivent pas. Les overlays doivent être stylés en
   `:global(...)`, via une classe `.surface-*`, ou par styles inline.
   → Cela **renforce** la décision du design system (une seule source de vérité pour
   les surfaces) au lieu de la contredire.

## 2. Ce qu'on adopte

| Quoi                                                   | Version       | Pourquoi                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`bits-ui`**                                          | 2.19.3 (MIT)  | Seule lib headless Svelte 5 couvrant tout : Popover, Dialog, **ContextMenu** (avec ancrage virtuel sur les coordonnées du pointeur), DropdownMenu, Tooltip, Select, Tabs, Toggle, **Command**, ScrollArea, Slider. **Zéro Tailwind**, stylable par attributs `data-*`. 3 587 ★, releases toutes les 2-3 semaines. |
| `<BitsConfig defaultPortalTo="body">`                  | —             | Un seul point de config pour que **tous** les contenus flottants échappent au parent transformé.                                                                                                                                                                                                                  |
| **`popover` natif**                                    | Baseline 2025 | Pour les cas où une lib est overkill. Zéro `z-index` à gérer.                                                                                                                                                                                                                                                     |
| **`bits-ui/Command`** + `Dialog`                       | —             | La command palette, avec le scorer fuzzy de `cmdk` (port direct). Inclut `Kbd` pour l'affichage des raccourcis.                                                                                                                                                                                                   |
| **`@property`**                                        | Baseline 2024 | Design system de surfaces : vérification de type + **animation des transitions entre plans d'élévation**.                                                                                                                                                                                                         |
| **`color-mix()` / `light-dark()` / container queries** | Baseline      | Échelles d'élévation sans dupliquer de hex ; thème clair/sombre sans media query.                                                                                                                                                                                                                                 |
| `runed`                                                | transitif     | Déjà une dépendance de bits-ui. `useResizeObserver` etc.                                                                                                                                                                                                                                                          |

## 3. Ce qu'on évite

| Quoi                                            | Pourquoi                                                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `melt` / `melt-ui`                              | Belle archi (`popover` natif, « no need for portalling ») mais `0.44.0` du 2026-01-04, 9 mois sans commit, **pas de Menu / DropdownMenu / ContextMenu / Command**. Le prix (écrire nous-mêmes les 4) annule l'avantage. |
| `shadcn-svelte`                                 | Tailwind v4 obligatoire. Utilisable seulement comme **catalogue d'API bits-ui**.                                                                                                                                        |
| `@ark-ui/svelte`                                | ~60 deps `@zag-js/*` épinglées, pas de `Command`, pas de `ContextMenu` dédié.                                                                                                                                           |
| `svelte-headlessui`                             | Inactif depuis 2025-01-26.                                                                                                                                                                                              |
| `cmdk`, `cmdk-svelte`, `svelte-cmdk`, `cmdk-sv` | React, ou morts/dépréciés.                                                                                                                                                                                              |
| `svelte-motion`, `@motionone/svelte`            | Svelte 4, morts depuis 2023-24.                                                                                                                                                                                         |
| `motion` (motion.dev) v13                       | Actif mais **aucun entry point Svelte**.                                                                                                                                                                                |
| `paneforge`                                     | 14 mois d'inactivité, et ce sont des split panes pas des fenêtres flottantes.                                                                                                                                           |
| `svelte-panzoom`                                | **N'existe pas** sur npm.                                                                                                                                                                                               |
| `interactjs`                                    | ~200 KB pour un besoin de 40 lignes.                                                                                                                                                                                    |
| `corner-shape`                                  | MDN : « Limited availability — Experimental ». **Derrière `@supports`** si on l'expérimente, jamais en dépendance dure.                                                                                                 |
| PixiJS / three.js pour la map                   | Voir §6.                                                                                                                                                                                                                |

## 4. Ce qu'on écrit maison (~800 lignes au total)

| Module                            | Taille      | Pourquoi                                                                                                                                            |
| --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`<Surface>`**                   | ~40 l.      | Wrapper au-dessus de bits-ui qui **force** `Portal` + `strategy="fixed"` + les classes de surface. Impossible d'oublier le garde-fou.               |
| **Shell de panneau flottant**     | ~200-250 l. | Drag (pointer capture), 8 poignées de resize, z-order, snap, persistance `localStorage`. Aucune lib Svelte mature (`svelte-windows` est en 0.1.13). |
| **Contrôleur de caméra**          | ~120 l.     | Pointer capture, wheel, **pinch 2 doigts**, clamp, animation. Voir `04-game-feel.md` §4.                                                            |
| **Barre d'outils + `toolbarFit`** | ~150 l.     | Le modèle `BottomToolbarRow` + l'algo de sortie par priorité. Fonction **pure** = testable.                                                         |
| **Registre de commandes**         | ~40 l.      | `register()`/`unregister()`, `when()` par rôle.                                                                                                     |
| **Couche de tokens CSS**          | ~150 l.     | Primitifs `@property` + dérivés `color-mix()` + classes `.surface-*`.                                                                               |
| **`hotkeys.ts`**                  | ~60 l.      | Table déclarative + aide générée.                                                                                                                   |

**Pourquoi « maison » plutôt qu'une lib ?** Parce que le pan/zoom doit **composer
avec la couche carte** : il faut calculer un `offsetX/offsetY` à partir de la
matrice `transform` (`getBoundingClientRect()` seul ne suffit pas quand le pointeur 3. **Le pincement au trackpad** exige de suivre **plusieurs
`pointerId`**. Toute abstraction de drag qui cache ça est un frein. Zéro
dépendance, et testable avec les outils Playwright déjà en place.

---

## 5. Décomposer le monolithe

`+page.svelte` de la table fait **2 285 lignes** (script 1 069 / markup 560 / CSS
650). C'est le principal frein à toute refonte : on ne peut pas faire d'A/B, on ne
peut pas tester isolément, et chaque modif touche à tout.

### Cible

```
web/src/lib/table/
├── table-page.svelte          ~250 l.   assemblage des couches
├── layers/
│   ├── map-layer.svelte       ~200 l.   la carte (transform, pan/zoom, tokens, fog, liens)
│   ├── chrome-layer.svelte    ~150 l.   top bar, barre d'outils, initiative, HUD
│   └── popup-layer.svelte     ~80 l.   surface d'accueil des popups non-portal
├── components/
│   ├── map/       MapSurface, MapGrid, MapImage, FogCanvas, TokenView, MarkerView, PingView, MapLinkView
│   ├── toolbar/   ToolbarRow, ToolGroup, ToolButton, toolbarFit.ts, faces.ts
│   ├── panels/    CharacterPanel, JournalPanel, DicePanel, InventoryPanel, GmDashboard
│   ├── initiative/InitiativeTracker, InitiativeCard
│   ├── widgets/   WidgetBar, CounterWidget, ClockWidget, TimerWidget
│   └── overlays/  AssetManager, LinkedNotePanel, MapLoadingOverlay
├── state/
│   ├── camera.svelte.ts       <Camera> (cf. 04 §4)
│   ├── tool.svelte.ts         outil actif + modes + options
│   ├── panels.svelte.ts       registre de panneaux, géométrie persistée
│   └── hotkeys.svelte.ts      table + exécution
└── ds/                        <Surface>, <Panel>, <ContextMenu>, <CommandPalette>
```

**Règle** : la page n'a plus aucun `{#if}` de layout. Elle assemble, elle ne
décide pas.

### Migration sans casser

| Étape | Extrait                                                                                                    | Pourquoi c'est safe                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1     | Extraire `MapManager` / `NpcLibrary` / `DiceOverlay` / `CompendiumTooltip` dans `components/`              | Aucun changement de comportement, juste du déplacement                 |
| 2     | Extraire `aside.compagnie` → `<CharacterPanel>`                                                            | Idem                                                                   |
| 3     | Extraire `aside.panel` → `<JournalPanel>` / `<DicePanel>` / `<InventoryPanel>`                             | Idem                                                                   |
| 4     | Extraire `.mj-toolbar` → `<ToolbarRow>` en `position: fixed`, **à côté** de `.map-frame` et non au-dessus  | On gagne le centrage + la stabilité sans toucher au layout de la carte |
| 5     | Passer `.map-area` + `.map-frame` en `position: absolute; inset: 0`, et les sidebars en panneaux flottants | **Le seul vrai basculement** — à faire avec les e2e verts              |

⚠️ Les 20 tests Playwright (`pnpm e2e`) sont le filet. Ils utilisent
`dev-camp` (campagne `mj` / `kaelith` / `ragnar`). Voir `AGENTS.md` §4bis.

---

## 6. DOM ou WebGL pour la carte — le débat

> L'utilisateur a demandé d'analyser les deux sans trancher. Voici l'analyse.

### Ce que fait l'industrie

**Foundry VTT**, le standard du marché, est en WebGL :
[« The virtual tabletop environment is implemented using a WebGL powered HTML 5
canvas using the powerful PIXI.js library »](https://foundryvtt.com/api/classes/foundry.canvas.Canvas.html).
`pixi.js` est en 8.21.0, 48 248 ★, activité journalière.

Donc la question n'est pas « Pixi est-il capable » — il l'est, massivement — mais
« est-il nécessaire pour **notre** échelle ».

### Les repères quantitatifs

| Repère                                         | Chiffre                                             | Source                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Canvas 2D, sprites avec rotation/alpha/échelle | **1 000-1 300 sprites/frame**                       | [StackOverflow](https://stackoverflow.com/questions/42303988/html5-canvas-poor-performance-with-2000-images)           |
| PixiJS, **10 000 sprites**                     | **47 FPS** (le plus rapide des renderers 2D testés) | [js-game-rendering-benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark)                                |
| **DOM animé**                                  | « stutters past **500 elements** »                  | [blog vendorisé, à prendre avec recul](https://blog.abdulkabirmusa.com/why-dom-animations-choke-pixijs-webgl-batching) |

Le seuil « ~500 éléments DOM animés » est le seul qui compte pour nous.

**Une table H&D, c'est 6 joueurs + une poignée de PNJ : 20 à 200 pions par carte.**
On est très en dessous du seuil. Et surtout : nos pions ne sont **pas tous animés
en même temps** — seuls ceux déplacés le sont.

### Pour le DOM

1. **Les pions vivent dans la couche transformée.** Le pan/zoom = un seul
   `transform` sur le conteneur. En DOM, un seul style mis à jour déplace tout. En
   canvas, il faut gérer la caméra, le DPR, les matrices, le **hit-testing manuel** —
   et l'UI de surimpression doit rester synchronisée en permanence.
2. **Texte.** Noms, PV, badges : `text-shadow` / `-webkit-text-stroke` en CSS,
   gratuit et net à toutes les densités. Sur canvas il faut un système de labels.
3. **Effets CSS.** `filter: drop-shadow()`, `backdrop-filter`, `mix-blend-mode`,
   `transition`, `outline` pour l'état « survolé / sélectionné ». Sur canvas : des
   shaders ou rien.
4. **Accessibilité et testabilité.** Un pion en DOM est focusable au clavier et
   inspectable par Playwright. Le projet a **déjà** une suite e2e : des pions en
   canvas casseraient des tests existants.
5. **Coût d'entrée nul.** Pas de bundling WebGL, pas de gestion de la perte de
   contexte GPU, pas de ~450 Ko.

### Pour le canvas / WebGL

1. **Une seule opération de layout** au lieu de 200 nœuds recalculés. Le
   `contain`/`content-visibility` limite, mais on reste à recalculer le style et la
   peinture du DOM à chaque frame de pan.
2. **Les effets composés** deviennent possibles : brouillard avec masque de vision
   par shader, lumières, `filter: blur()` sur le brouillard, transitions de
   parallaxe.
3. **Une carte vraiment grande** (500+ objets interactifs) deviendrait possible.
4. Cohérence avec l'industrie → unun transfert futur de map / assets plus simple.
5. `hitTest` et le rendu seraient à écrire nous-mêmes (~300 lignes), donc **pas
   gratuit**.

### Le pour/contre, franchement

|                                            | DOM                 | PixiJS                                      |
| ------------------------------------------ | ------------------- | ------------------------------------------- |
| Écriture                                   | 0 ligne (déjà fait) | ~300-500 lignes (hit-test, caméra, couches) |
| Pan/zoom à 60 fps avec 200 pions           | ✅ très confortable | ✅                                          |
| Pan/zoom à 60 fps avec 1 000 pions         | ⚠️                  | ✅                                          |
| Texte net                                  | ✅ CSS              | ⚠️ système de labels                        |
| Brouillard avec vision par shader          | ❌                  | ✅                                          |
| Accessibilité clavier des pions            | ✅                  | ❌                                          |
| Tests Playwright existants                 | ✅                  | ❌ à réécrire                               |
| Bundle                                     | 0                   | ~450 Ko                                     |
| Synchronisation avec l'UI de surimpression | gratuite            | manuelle, permanente                        |

### Le verdict que je recommande (et comment on reste honnête)

**DOM**, avec un **garde-fou architectural** qui rend le choix réversible :

- la couche carte est **un composant isolé** `<MapLayer>` qui reçoit un état en
  runes et ne rend que des objets ;
- si un jour une carte dépasse ~500-1 000 objets interactifs simultanés, ou si on
  veut des shaders, on remplace **l'intérieur** de `<MapLayer>` par un canvas —
  **l'UI de surimpression ne change pas**.

C'est le seul argument qui compte : **avec l'isolation, le débat n'est plus
bloquant**. On ne choisit pas « DOM pour toujours », on choisit « DOM maintenant,
et la porte de sortie est maintained ».

Deux-seils d'optimisation à respecter dès maintenant (gratuit) :

1. **ne jamais écrire `left`/`top`** pendant un pan/zoom → un seul `transform` ;
2. `will-change: transform` sur la couche carte **seulement pendant le geste**
   (sinon on crée des couches de composition permanentes) ;
3. `content-visibility: auto` + `contain-intrinsic-size` sur les conteneurs
   hors-champ d'une très grande carte ;
4. **séparer la carte et l'UI en deux sous-arbres de layout** pour ne pas
   recalculer le layout de l'UI à chaque frame de pan.

**Le seul scénario qui changerait l'avis** : si on veut la vision (murs, lumières,
ligne de vue) avec un rendu fluide. C'est une fonctionnalité de jeu, pas d'UX — et
elle est hors périmètre.

---

## 7. Séquence d'architecture

| #   | Étape                                                                                                                                      | Dépend de | Test d'acceptation                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `tokens.css` : primitifs `@property`, dérivés `color-mix()`, `light-dark()`, classes `.surface-canvas\|raised\|overlay`, container queries | —         | Les 3 surfaces rendent visuellement correctes                                                                                                                |
| 2   | `<Surface>` + `<BitsConfig>` : wrapper qui force `Portal` + `strategy="fixed"`                                                             | 1         | Ouvrir un Dialog/Popover/ContextMenu **au-dessus de la carte zoomée à 2.5×** et vérifier le positionnement → **c'est le test d'acceptation du problème n°1** |
| 3   | `popover` natif : prototyper le context menu de carte (`contextmenu` → `clientX/Y`) et comparer avec bits-ui, y compris sur iOS Safari     | 2         | Le menu reste net à tous les niveaux de zoom, et se retourne au bord                                                                                         |
| 4   | Shell de panneau flottant + persistance (`localStorage`, coords **normalisées en fraction du viewport** + version de schéma)               | 2         | Un panneau se déplace, se redimensionne, survit au rechargement, s'adapte à un autre écran                                                                   |
| 5   | `<Camera>` : objet caméra avec animations                                                                                                  | —         | `fitMap`, `zoomToPoint`, `centerOn` ; le cadrage survit au rechargement                                                                                      |
| 6   | `hotkeys.ts` : table déclarative + aide `?`                                                                                                | —         | L'aide est générée depuis la table ; filtrée par rôle                                                                                                        |
| 7   | Registre de commandes                                                                                                                      | 6         | `when()` filtre les commandes MJ-only                                                                                                                        |
| 8   | `CommandPalette` = `Dialog` + `Command` + registre                                                                                         | 2, 6, 7   | La palette s'ouvre/ferme au clavier, filtre, et ne vole pas les raccourcis carte                                                                             |
| 9   | `ToolbarRow` + `toolbarFit`                                                                                                                | 5, 6      | La barre reste centrée, les options ne font pas bouger les autres boutons, le menu overflow est correct                                                      |
| 10  | Animations : attributs `data-*` + transitions CSS + `prefersReducedMotion`                                                                 | 1         | `prefers-reduced-motion` coupe tout mouvement                                                                                                                |
| —   | Optionnel : `@humanspeak/svelte-motion` si FLIP/shared-layout est requis · `corner-shape` derrière `@supports`                             | 10        | —                                                                                                                                                            |

⚠️ **Note Svelte.** Svelte n'a toujours pas de `<Portal>` natif
([sveltejs/svelte#7082](https://github.com/sveltejs/svelte/issues/7082), ouvert).
Ne pas compter dessus — `bits-ui` le fournit, et le `popover` natif règle le
reste.

---

## 8. Ce qui change côté serveur

L'UX ne s'arrête pas au front. Ces recos imposent du travail dans `api/` et
`shared/` :

| Besoin                                                              | Conséquence                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panneaux flottants, barres de vie sur pion, taille liée à la grille | `TableState.tokens` passe de `{charId, x, y}` à `{charId, x, y, sizeCells?, hidden?}`                                                                                                                      |
| Liens entre cartes                                                  | Nouveau type d'entité `MapLink` dans le snapshot + handler WS                                                                                                                                              |
| Notes épinglées                                                     | Nouveau type `MapPin`                                                                                                                                                                                      |
| Undo                                                                | Nouveau type de message `undo` + une pile dans le DO ; les routes existantes doivent produire leur inverse                                                                                                 |
| Panneau d'initiative vertical                                       | Réutilise `CombatState` — aucun changement de protocole                                                                                                                                                    |
| Widgets (horloge/timer)                                             | Valeur **partagée** dans `TableState` (décompte côté serveur)                                                                                                                                              |
| Réglages via la palette                                             | `TableSettings` est **partagé de campagne** → la palette écrit via le DO, et il faut **créer l'écran de réglages de campagne qui n'existe pas** (`api.campaigns.updateSettings()` n'est appelé nulle part) |
| Aperçu au survol                                                    | Nouvelle route de lecture ; **filtrer par la règle de visibilité PNJ**                                                                                                                                     |

**Le point le plus dangereux, et le plus facile à oublier** : chaque nouvelle voie
de diffusion (`snapshot`, `delta`, `broadcastRoleAware`, la palette, les pins, le
hover) doit respecter la règle de `AGENTS.md` §9 — **un PNJ est visible si et
seulement s'il a un pion révélé**. Une barre de vie sur un pion non révélé, ou un
aperçu au survol d'un PNJ non posé, sont deux fuites.

---

## 9. Ce qu'on ne fait pas dans ce chantier

- **Vision / murs / lumières** — c'est une fonctionnalité de jeu, pas d'UX, et ça
  ouvre le débat canvas (§6).
- **Audio** — hébergement R2 + licences. Voir `04-game-feel.md` §7.
- **Thème clair** — `light-dark()` rend ça peu coûteux (cf. `06`), mais ça ne se
  fait pas avant que le système de surfaces existe.
- **Collections / tags façon Atlas** — à notre échelle (10 cartes, 20 PNJ), c'est
  de la complexité sans usage.
- **Recherche `keyword:value`** façon deck-builder —Atelierbezirk même raison.
- **Fenêtre joueur séparée** — n'a pas de sens dans un jeu réseau.
- **`@ark-ui/svelte` / `melt`** — cf. §3.
