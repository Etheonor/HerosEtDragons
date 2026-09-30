# Recherche — Stack UI pour la refonte de l'écran de jeu (VTT)

> **Date de la recherche : 2026-09-30.** Toutes les versions/dates citées sont vérifiées via le registre npm et l'API GitHub à cette date.
> **Contexte :** SvelteKit 2.70.3 / Svelte 5.57.1, runes, TypeScript strict, `noUncheckedIndexedAccess`, **pas de Tailwind**, pas de librairie UI, pas de librairie d'état (store en runes), déploiement Cloudflare Workers.

---

## 0. TL;DR

1. **Problème n°1 (popups dans un parent `transform: scale()`) :** la spec CSS résout le problème **nativement** — un élément `[popover]` ou `<dialog>` en _top layer_ a pour containing block **le viewport**, insensible au `transform` de ses ancêtres. `bits-ui` ne l'exploite pas (il utilise Floating UI) mais se contourne en 2 props : `<X.Portal>` + `strategy="fixed"`.
2. **Primitives headless : `bits-ui` 2.19.3** est le seul candidat viable : Svelte 5 natif, zéro Tailwind, `Portal`, `ContextMenu` avec ancrage virtuel, et un composant `Command` (= port de cmdk) qui donne la command palette gratuitement.
3. **Command palette :** `cmdk` est React. Cote Svelte, le seul choix sérieux est **`bits-ui/Command`**. Les libs dédiées (`cmdk-svelte`, `svelte-cmdk`, `cmdk-sv`) sont mortes ou dépréciées.
4. **Gestes :** aucune librairie n'est nécessaire. `setPointerCapture` + `pointerdown/move/up` + `touch-action: none` = ~40 lignes, et c'est la seule façon d'avoir un contrôle correct du pan/zoom composé avec le transform de la carte.
5. **Animations :** transitions natives Svelte + attributs `data-state` de bits-ui. `motion.dev` **n'a pas d'entry point Svelte** ; les ports Svelte sont soit morts (`svelte-motion`, `@motionone/svelte`), soit très jeunes (`@humanspeak/svelte-motion`, 102 ★).
6. **Window manager (panneaux flottants) :** ça n'existe pas en Svelte maturity. **À écrire maison** (~200 lignes).
7. **Map :** garder le **DOM**. L'industrie VTT utilise PixiJS (Foundry), mais à l'échelle d'un H&D (20–200 pions, texte, effets CSS) le DOM est plus simple _et_ suffisant. Canvas en porte de sortie tardive.
8. **CSS :** `@property` (Baseline 2024), `color-mix()`, `light-dark()`, container queries, nesting → tous sûrs. **`corner-shape` reste expérimental** → ne pas l'utiliser en prod.

---

## 1. Le problème n°1 : couches (layers) et parent transformé

### 1.1 Ce que la spec dit exactement

Source normative : [CSS Positioned Layout Module Level 4 §3.1 Top Layer Styling](https://drafts.csswg.org/css-position-4/#top-styling) (Editor's Draft, 25 décembre 2025).

> - « Elements in the top layer do not lay out normally based on their position in the document; instead they generate boxes **as if they were siblings of the root element**. »
> - « It is rendered as an atomic unit as if it were a sibling of the document's root. _Note: Ancestor elements with `overflow`, `opacity`, `mask`, etc. cannot affect it._ »
> - « **If its `position` property computes to `fixed`, its containing block is the viewport; otherwise, it's the initial containing block.** »
> - « If its specified `position` property is not `absolute` or `fixed`, it computes to `absolute`. »

**Conséquence directe et décisive pour nous :** un `<div popover>` placé _enfant DOM_ de notre conteneur `transform: scale(2)` **n'est pas mis à l'échelle et n'est pas positionné relativement à ce conteneur**. Il est peint comme un frère de `<html>`, et son containing block est le viewport (si `position: fixed`) ou l'ICB (si `position: absolute`).

→ **L'API native `popover` résout exactement notre problème.** Ce n'est pas un contournement, c'est le comportement normatif.

Corollaires :

- `z-index` devient **inutilisable** pour l'ordre des popups : l'ordre est celui du _top layer_ (dernier ouvert = au-dessus). C'est exactement le modèle « docking » d'un VTT (le panneau le plus récemment cliqué au-dessus).
- Le light-dismiss et `Escape` sont fournis par le navigateur.
- Les propriétés **héritées** cascadent toujours depuis le parent DOM (`font-size`, `color`, `font-family`…). Il faut donc soit porter les variables de thème sur `:root`, soit sur un conteneur `document.body` directement.

### 1.2 Disponibilité

- **Popover API** — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) : **Baseline 2025**, « Newly available ». Page modifiée le 17/12/2025. Nouveautés récentes : `popover="hint"`, `showPopover({options.source})` (ancrage implicite).
- `<dialog>` + `showModal()` — dans le top layer depuis bien plus longtemps ; `closedby` est une extension plus récente.

**Verdict : utilisable en production en 2026.** Il n'y a plus de raison d'en avoir peur. Le seul coût est l'absence de collision detection / flip automatique — que nous firewalls pas besoin (voir §2).

### 1.3 CSS Anchor Positioning — prometteur mais piège subtil

[CSS Anchor Positioning](https://drafts.csswg.org/css-anchor-position-1/) est passé **Baseline** en 2026 selon plusieurs sources de l'écosystème (par ex. [mintec.co](https://mintec.co/blog/css-anchor-positioning-2026/), [nickpaolini.com](https://www.nickpaolini.com/blog/css-anchor-positioning-2026) qui indique mars 2026). Données [caniuse](https://caniuse.com/css-anchor-positioning) (extraites du JSON brut) :

| Navigateur          | Première version |
| ------------------- | ---------------- |
| Chrome / Edge       | **117**          |
| Firefox             | **145**          |
| Safari / iOS Safari | **26.0**         |

**Mais il y a une règle normative qui nous concerne** ([css-anchor-position-1 §2.3 Finding an Anchor](https://drafts.csswg.org/css-anchor-position-1/#anchor-scope)) :

> « An element _possible anchor_ is an acceptable anchor element for an absolutely positioned element _positioned el_ if … _possible anchor_ and _positioned el_ have **the same original containing block** and either _possible anchor_ is in a **lower top layer** than _positioned el_, or they both exist in the same top layer … »

Autrement dit : un popover en top layer **peut** s'ancrer sur un élément hors top layer, **à condition d'avoir le même _original containing block_**. Or nos pions sont dans un conteneur `position: absolute` (typiquement) → leur _original containing block_ est ce conteneur, pas l'ICB → **le popup en top layer ne pourra pas s'y ancrer**.

**Verdict : ne pas fonder l'architecture dessus.** `anchor()` est pertinent pour la barre d'outils, les rails, les panneaux ancrés à leur rail — **pas** pour les popups de pions. À tester explicitement si on veut l'utiliser plus tard.

### 1.4 Les trois stratégies, comparaison

| Stratégie                                       | Échappe au `transform` ? | Collision / flip       | Light-dismiss                    | Coût                                                     |
| ----------------------------------------------- | ------------------------ | ---------------------- | -------------------------------- | -------------------------------------------------------- |
| `popover` natif + `left/top` calculés à la main | ✅ oui (top layer)       | ❌ manuel (~15 lignes) | ✅ natif                         | ~20 lignes                                               |
| `popover` natif + `anchor()` / `position-area`  | ✅ oui                   | ✅ via `@position-try` | ✅ natif                         | ⚠️ bloqué par _original containing block_ dans notre cas |
| `bits-ui` + `<X.Portal>` + `strategy="fixed"`   | ✅ oui (portail → body)  | ✅ Floating UI complet | ✅ via `interactOutsideBehavior` | 0 ligne (config)                                         |
| `bits-ui` sans portal, `strategy` par défaut    | ❌ **cassé**             | ✅                     | ✅                               | —                                                        |

---

## 2. Primitives headless pour Svelte 5

### 2.1 Tableau comparatif (état au 2026-09-30)

| Librairie              | Version npm | Dernière release | Repo (pushed / ★)                                                                                | Svelte       | Tailwind requis | Menu | ContextMenu   | Command | Portal natif (top layer)  |
| ---------------------- | ----------- | ---------------- | ------------------------------------------------------------------------------------------------ | ------------ | --------------- | ---- | ------------- | ------- | ------------------------- |
| **`bits-ui`**          | **2.19.3**  | **2026-09-22**   | [huntabyte/bits-ui](https://github.com/huntabyte/bits-ui) — 2026-09-29 / **3 587 ★**             | 5.33+ (peer) | **non**         | ✅   | ✅            | ✅      | ❌ (Floating UI + Portal) |
| `melt` (next-gen)      | 0.44.0      | **2026-01-04**   | [melt-ui/next-gen](https://github.com/melt-ui/next-gen) — 2026-03-04 / 331 ★                     | 5            | non             | ❌   | ❌            | ❌      | **✅ oui**                |
| `@melt-ui/svelte` (v1) | 0.86.6      | 2025-03-28       | —                                                                                                | 4            | non             | ✅   | ✅            | ❌      | ❌                        |
| `@ark-ui/svelte`       | 5.24.2      | 2026-09-13       | [chakra-ui/ark](https://github.com/chakra-ui/ark)                                                | ≥5.20 (peer) | non             | ✅   | ⚠️ via `menu` | ❌      | ❌                        |
| `shadcn-svelte`        | 1.7.0       | 2026-09-16       | [huntabyte/shadcn-svelte](https://github.com/huntabyte/shadcn-svelte) — 2026-09-29 / **9 170 ★** | 5            | **oui (v4)**    | ✅   | ✅            | ✅      | ❌                        |
| `svelte-headlessui`    | 0.0.46      | **2025-01-26**   | [captaincodeman/svelte-headlessui](https://github.com/captaincodeman/svelte-headlessui) — 591 ★  | 4            | non             | ❌   | ❌            | ❌      | ❌                        |

### 2.2 `bits-ui` — le choix

Sources : [bits-ui.com/docs](https://www.bits-ui.com/docs), [npm `bits-ui@2.19.3`](https://www.npmjs.com/package/bits-ui), inspection du tarball publié.

- **MIT**, peer `svelte ^5.33.0`, dépendances : `@floating-ui/dom ^1.7.1`, `runed ^0.35.1`, `svelte-toolbelt`, `tabbable`, `esm-env`. **Aucune dépendance Tailwind.** Le site de doc utilise des classes Tailwind par confort, mais l'API est entièrement `class` / attributs `data-*` / CSS custom properties — utilisable en CSS pur.
- **Composants disponibles** ([liste complète](https://www.bits-ui.com/docs/components/popover)) : Accordion, Alert Dialog, Aspect Ratio, Avatar, **Command**, **ContextMenu**, Date Field/Picker, **Dialog**, **DropdownMenu**, **Menubar**, Navigation Menu, **Popover**, **Select**, Combobox, Scroll Area, **Slider**, Switch, **Tabs**, **Toggle**, **ToggleGroup**, **Tooltip**, Toolbar, PIN Input, Radio Group, Meter, Progress, Link Preview, Rating Group, Separator.
  → **Tout ce qu'on demande est là.**
- **Style via attributs data** : `data-state`, `data-side`, `data-highlighted`, `data-disabled`, `data-starting-style`, `data-ending-style`, plus des CSS variables comme `--bits-popover-content-transform-origin`, `--bits-popover-anchor-width/height`. C'est exactement ce qu'il faut pour un design system CSS pur avec transitions CSS.

#### Gestion du parent transformé chez bits-ui

Bits UI **n'utilise pas** le top layer. Il positionne via `@floating-ui/dom` et déplace le DOM via un `Portal`.

1. **`Portal`** — [bits-ui.com/docs/utilities/portal](https://www.bits-ui.com/docs/utilities/portal). Exporté par tous les composants flottants.
   - `to` : `Element | string`, **défaut `document.body`**.
   - `disabled: boolean` — rend le contenu à son emplacement DOM d'origine.
   - **Optionnel** : `Popover.Content` fonctionne sans `Popover.Portal` (mais alors il reste dans le parent transformé → cassé).
   - **Global** : `<BitsConfig defaultPortalTo="body">` (ou un sélecteur) avec héritage imbriqué — [BitsConfig](https://www.bits-ui.com/docs/utilities/bits-config).
2. **`strategy`** — [bits-ui.com/docs/components/popover](https://www.bits-ui.com/docs/components/popover), API Reference `Popover.Content` :

   > « `strategy` — The positioning strategy to use for the floating element. When `'fixed'` the element will be positioned relative to the viewport. When `'absolute'` the element will be positioned relative to the nearest positioned ancestor. **Default: `'fixed'`** »

   ⚠️ **Écart documentation / implémentation à vérifier vous-même.** Dans le code publié de 2.19.3, `dist/bits/utilities/popper-layer/popper-layer-inner.svelte.js` contient :

   ```js
   const effectiveStrategy = $derived(strategy ?? (resolvedPreventScroll ? "fixed" : "absolute"));
   ```

   et `dist/internal/floating-svelte/use-floating.svelte.js` :

   ```js
   const strategyOption = $derived(get(options.strategy) ?? "absolute");
   ```

   → **Le défaut réel est `absolute`**, sauf si `preventScroll` est actif. **Il faut passer `strategy="fixed"` explicitement.** C'est le genre de piège qui ne se voit pas dans les démos.

3. **`customAnchor`** — accepte `string | HTMLElement | Measurable | null`. `Measurable` est un **élément virtuel** (`{ getBoundingClientRect() }`). Indispensable pour ancrer un tooltip sur un pion.
4. **`ContextMenu`** — utilise nativement un élément virtuel positionné sur les coordonnées du pointeur (`dist/bits/menu/menu.svelte.js` : `getBoundingClientRect: () => DOMRect.fromRect({ width: 0, height: 0, ...this.#point })`, `#point` mis à jour depuis `e.clientX/clientY`). C'est **exactement** le cas d'usage VTT (clic droit n'importe où sur la carte).
5. **Transitions Svelte** — `forceMount` + snippet `child({ wrapperProps, props, open })` pour brancher `transition:fly` ([docs transitions](https://www.bits-ui.com/docs/transitions)).

**Conclusion bits-ui :** adopter, avec deux garde-fous : `<BitsConfig defaultPortalTo="body">` en racine et `strategy="fixed"` sur chaque contenu flottant (à factoriser dans un composant wrapper maison, ex. `<Layer>`).

### 2.3 `melt` (next-gen) — intéressant mais disqualifié

Sources : [melt-ui/next-gen](https://github.com/melt-ui/next-gen), [docs next.melt-ui.com](https://next.melt-ui.com/), tarball npm `melt@0.44.0`.

- **Avantage théorique décisif** : [docs popover](https://github.com/melt-ui/next-gen/blob/main/docs/src/content/docs/components/popover.mdx) liste comme feature : « 🌳 **Uses native `popover` attribute, no need for portalling** ». C'est la bonne architecture pour nous.
- **Maintenance faible** : release `melt@0.44.0` le **2026-01-04**, dernier commit le **2026-03-04** (≈ 9 mois). 331 ★, 33 issues ouvertes. Le README dit « We work on this project on a volunteer basis in our free time ».
- **Décisif** : la liste des builders publiés est — `SpatialMenu, accordion, avatar, collapsible, combobox, dialog, file-upload, pin-input, popover, progress, radio-group, select, slider, tabs, toaster, toggle, tooltip, tree`. **Pas de Menu, pas de DropdownMenu, pas de ContextMenu, pas de Command.** (Source : arborescence `docs/src/content/docs/components/` du dépôt.)
- `@melt-ui/svelte` (v1, 0.86.6) a bien des menus mais est figé depuis mars 2025 et cible Svelte 4.

**Verdict : ne pas adopter.** Le prix à payer (archiver `melt-ui/svelte`, écrire nous-mêmes Menu/ContextMenu/Command) annule tout l'avantage de l'API `popover`.

### 2.4 `@ark-ui/svelte` — alternative crédible mais moins adaptée

- v5.24.2 (2026-09-13), peer `svelte >=5.20`, bâti sur les state machines [zag-js](https://zagjs.com/). Same équipe que Chakra.
- **Inconvénient majeur : ~60 dépendances `@zag-js/*` épinglées** (accords non-bornés sur les versions, cf. `package.json`). Bundle et surface d'API à gérer.
- Liste des composants publiés (extraite du tarball) : menu, popover, dialog, tooltip, select, combobox, tabs, toggle, toggle-group, switch, slider, **splitter**, scroll-area, presence, portal, focus-trap, hover-card, **floating-panel**, drawer, editable, tour, toast… **Pas de Command.** Pas de ContextMenu dédié (à composer avec `menu`).
- Intérêt : `floating-panel` et `splitter` existent nativement.

**Verdict : à garder en tête si `bits-ui` nous bloque, mais pas le premier choix** — pas de `Command`, pas de `ContextMenu`, et 60 deps.

### 2.5 `shadcn-svelte` — non pour nous

- Très actif (9 170 ★, push le 2026-09-29). Mais c'est une CLI qui copie des composants **stylés avec des classes Tailwind v4**, construits sur `bits-ui`.
- Sa propre [guide de migration Svelte 5](https://shadcn-svelte.com/docs/migration/svelte-5) liste `cmdk-sv` — « deprecated in favor of Bits UI's `Command` component », ce qui confirme le §3.

**Verdict : inexploitable sans Tailwind.** On peut.eventuellement s'en servir comme **catalogue de références d'API bits-ui**, pas comme source de code à copier.

### 2.6 `svelte-headlessui` — mort

0.0.46, dernière activité 2025-01-26, 591 ★. Ne couvre ni menu, ni context menu, ni popover ancré. **À éviter.**

---

## 3. Command palette

### 3.1 Ce qui existe

| Librairie                                                                         | Version      | Date                                     | Framework        | Verdict                                                       |
| --------------------------------------------------------------------------------- | ------------ | ---------------------------------------- | ---------------- | ------------------------------------------------------------- |
| [`cmdk`](https://github.com/pacocoursey/cmdk)                                     | 1.1.1        | 2025-08-27                               | **React**        | Non utilisable en Svelte                                      |
| `cmdk-svelte`                                                                     | 0.0.1        | 2023-05-23                               | Svelte 3/4       | **Mort**                                                      |
| `svelte-cmdk`                                                                     | 0.0.1-next.0 | 2022-05-19                               | Svelte 3/4       | **Mort**                                                      |
| `cmdk-sv`                                                                         | —            | —                                        | Svelte 4         | **Déprécié** par shadcn-svelte au profit de bits-ui `Command` |
| [`bits-ui/Command`](https://www.bits-ui.com/docs/components/command)              | 2.19.3       | 2026-09-22                               | Svelte 5         | ✅ **Choix**                                                  |
| [`svelte-command-palette`](https://github.com/rohitpotato/svelte-command-palette) | 2.0.2        | 2026-01-04 (repo push 2026-09-26), 220 ★ | Svelte 5 (runes) | Alternative honorable                                         |
| [`flowbite-svelte`](https://flowbite-svelte.com/docs/extend/command-palette)      | —            | —                                        | Svelte 5         | ❌ Tailwind                                                   |

### 3.2 `bits-ui/Command` — le bon choix

- **Algorithme = port direct de cmdk** : `dist/bits/command/compute-command-score.js` contient `SCORE_CONTINUE_MATCH = 1`, `SCORE_SPACE_WORD_JUMP = 0.9`, `SCORE_NON_SPACE_WORD_JUMP = 0.8`, `SCORE_CHARACTER_JUMP = 0.17`, `SCORE_TRANSPOSITION = 0.1`, `PENALTY_SKIPPED = 0.999`, `PENALTY_CASE_MISMATCH = 0.9999`. C'est le fuzzy scorer de cmdk, donc le comportement est connu et éprouvé.
- API : `Root` (`filter`, `vimBindings`, `loop`, `pointerSelection`), `Input`, `List`, `Viewport`, `Empty`, `Group`, `GroupHeading`, `GroupItems`, `Item` (prop `keywords`, `textValue`), `Separator`, `Loading`, `InputLabel`. Attributs `data-selected`, `data-disabled`.
- **API impérative** pour les raccourcis clavier et la sélection programmatique (récupérer les items valides, fixer l'index, naviguer par groupe).
- **La doc officielle montre déjà le pattern palette** : `Command` dans un `Dialog` avec `<svelte:document onkeydown>` sur `⌘J` ([bits-ui.com/docs/components/command](https://www.bits-ui.com/docs/components/command)). Il suffit de remplacer ⌘J par ⌘K.
- Zéro Tailwind, zéro dépendance supplémentaire.

**Bonus** : `bits-ui` expose déjà `kbd` (constantes de raccourcis) et un pattern `Kbd` documenté → l'affichage des raccourcis dans la palette est natif.

### 3.3 `svelte-command-palette` — pourquoi ne pas le choisir

- Avantages : ~2,1 KB min / ~700 B gzip, `fuse.js`, runes (`$props`/`$state`/`$effect`), `shortcut` configurable, `onOpen`/`onClose`/`onActionSelect`, groupes, `emptyState` en snippet.
- Inconvénients :
  - **Embarque son propre overlay** (`lucide-svelte` en dépendance) → **pas de portail vers `document.body`** → même problème de parent transformé que nous cherchons à résoudre.
  - Version **2.0.x** seulement (réécriture complète depuis la 1.x), 220 ★, 6 issues.
  - Fuse.js en dépendance alors que l'algo est déjà fourni par bits-ui.

**Verdict : si on veut zéro assemblage, `svelte-command-palette` est acceptable — mais alors il faut vérifier explicitement que son overlay survit à notre `transform`.** Nouspreferons `bits-ui/Command` + `Dialog`, qui Composition le reste de l'écran de façon cohérente.

### 3.4 Pattern maison si besoin d'un registre de commandes

Au-delà de la palette, il faut un **registre** : les features (MJ vs joueur) déclarent leurs commandes n'importe où. ~30 lignes :

```ts
// $state dans un module .svelte.ts
export const commands = $state.raw<Command[]>([]);
export function register(list: Command[]) {
  commands.push(...list);
  return () => {
    /* unregister */
  };
}
```

Chaque commande : `{ id, label, group, keywords, when?: () => boolean, run: () => void, shortcut?: string }`. `when()` permet de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis un seul endroit les commandes **MJ-only** (dévoiler un PNJ, téléporter) et de les **désactiver pour les joueurs** — ce qui est un vrai gain de sécurité côté client (sans remplacer le contrôle serveur).
Chaque commande : `{ id, label, group, keywords, when?: () => boolean, run: () => void, shortcut?: string }`. `when()` permet de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis de décrire depuis un seul endroit les commandes **MJ-only** (dévoiler un PNJ, téléporter) et de les **désactiver pour les joueurs** — ce qui est un vrai gain de sécurité côté client (sans remplacer le contrôle serveur).

---

## 4. Gestes / pointer

### 4.1 État de l'art des librairies

| Librairie                                                                               | Version | Date           | Rôle                                    | Note                                                              |
| --------------------------------------------------------------------------------------- | ------- | -------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `svelte-panzoom`                                                                        | —       | —              | —                                       | **N'existe pas** sur npm                                          |
| `svelte-pan-zoom` ([captaincodeman](https://github.com/CaptainCodeman/svelte-pan-zoom)) | 0.1.0   | 2026-09-11     | pan/zoom                                | peer `svelte ^5.29`, **0.x**, créé en 2023                        |
| [`@neodrag/svelte`](https://www.neodrag.dev/docs/svelte)                                | 2.3.3   | 2026-08-10     | **drag** (pas resize)                   | 2 452 ★, **1,68 KB** min+brotli, action Svelte, options réactives |
| [`svelte-gestures`](https://github.com/Rezi/svelte-gestures)                            | 5.2.2   | 2025-09-21     | pan/pinch/press/rotate/swipe/tap        | basé sur les **attachments** Svelte 5                             |
| `interactjs`                                                                            | 1.10.28 | 2026-08-01     | drag + resize + inertia                 | mature, mais ~200 KB et impératif                                 |
| `@atlaskit/pragmatic-drag-and-drop`                                                     | 4.0.0   | 2026-09-24     | drag & drop de listes                   | pas du bon cas d'usage                                            |
| `paneforge`                                                                             | 1.0.2   | **2025-08-02** | panneaux **redimensionnables en split** | 658 ★, peer svelte ^5.29, **~14 mois d'inactivité**               |

### 4.2 Une librairie est-elle nécessaire ? **Non.**

Le drag d'un panneau flottant, c'est :

```svelte
<!-- concept, pas du code final -->
function onGripDown(e: PointerEvent) {
  if (e.button !== 0) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  start = { px: e.clientX, py: e.clientY, ox: panel.x, oy: panel.y };
}
function onGripMove(e: PointerEvent) {
  if (!start) return;
  panel.x = start.ox + (e.clientX - start.px);   // viewport coords
  panel.y = start.oy + (e.clientY - start.py);
}
function onGripUp(e: PointerEvent) { start = null; /* pointercancel aussi */ }
```

- `touch-action: none` sur la poignée, `user-select: none`, et un `pointercancel` + une gestion du `lostpointercapture`. **Svelte 5 supporte `use:` (actions) et `{@attach}`** ([svelte.dev/docs/svelte/svelte-attachments](https://svelte.dev/docs/svelte/svelte-attachments)), et `fromAction()` permet d'utiliser une action Svelte 4 existante en attachment.

**Pourquoi le natif est préférable ici, spécifiquement :**

1. **Le pan/zoom de la carte doit composer avec la position du pointeur.** Il faut un `offsetX/offsetY` calculé à partir de la matrice `transform` de la couche carte (`getBoundingClientRect()` seul ne suffit pas quand le pointeur est capturé hors de l'élément). Toute abstraction de drag qui cache ça est un frein.
2. **Le pincement au trackpad** exige de suivre **plusieurs `pointerId` simultanément** et de calculer une distance. C'est ~40 lignes ; une lib le fait, mais on perdrait le contrôle du momentum et du clamp.
3. **Les coordonnées de la souris sont en `clientX/Y` (viewport)** — donc _déjà_ hors du repère transformé. Il n'y a pas de piège : la conversion vers les coordonnées carte est un simple `(client - rect.origin) / scale`.
4. Zéro dépendance, zéro poids, testable avec les outils Playwright déjà en place.

**Recommandation :** écrire maison le contrôleur de pan/zoom et le shell de panneau. Évaluer `@neodrag/svelte` **seulement** si le drag de panneaux devient pénible (il ne gère pas le resize de toute façon, donc il ne nous fait gagner que ~30 % du travail).

---

## 5. Animations

### 5.1 État des lieux

| Librairie                                                                  | Version  | Date                             | Statut                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | -------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`svelte-motion`](https://github.com/micha-lmxt/svelte-motion)             | 0.12.2   | **2024-02-27** (repo 2024-05-20) | **Mort.** Port de framer-motion pour Svelte **4**. 662 ★                                                                                                                                           |
| [`@motionone/svelte`](https://www.npmjs.com/package/@motionone/svelte)     | 10.16.4  | **2023-09-21**                   | **Mort.** Svelte 4                                                                                                                                                                                 |
| [`motion`](https://motion.dev) (motiondivision)                            | 13.4.6   | 2026-09-29                       | Actif (33 776 ★) mais **exports = `.`, `./mini`, `./vgpu`, `./debug`, `./react`, `./three`, `./react-m`, `./react-mini`, `./react-client`, `./react-animate-view`** → **aucun entry point Svelte** |
| `motion-sv`                                                                | 0.1.13   | 2026-07-07                       | Port Svelte de framer-motion 12, **0.x**                                                                                                                                                           |
| [`@humanspeak/svelte-motion`](https://github.com/humanspeak/svelte-motion) | 1.4.6    | **2026-09-30**                   | Port Svelte 5 de `motion@13`. **102 ★**, créé 2025-02. [motion.svelte.page](https://motion.svelte.page/)                                                                                           |
| **Transitions natives Svelte**                                             | _in-box_ | —                                | **maintenues avec Svelte**                                                                                                                                                                         |

### 5.2 `@humanspeak/svelte-motion` — intéressant mais à risque

D'après son [README](https://github.com/humanspeak/svelte-motion) :

- `initial`/`animate`/`transition`, `variants`, `whileHover`/`whileTap`/`whileFocus`/`whileDrag`/`whileInView`, `Drag` avec constraints/momentum, `AnimatePresence`, layout FLIP + `layoutId`/`LayoutGroup`, View Transitions, `motionValue`/`styleEffect`, **`MotionConfig` avec `reducedMotion`**, **API Pan** (`onPan*`, `onPanSessionStart`), `useReducedMotion` / `useReducedMotionConfig` ([docs](https://motion.svelte.page/docs/use-reduced-motion)).
- Dépend de `motion ^13.4.6` + `motion-dom` + `acorn`.

**Contre** : 102 ★, ~7 mois d'existence, `acorn` comme dépendance runtime (lourd pour de l'analyse d'AST — probablement pour la feature View Transitions).

### 5.3 Recommandation 2026

**Transitions natives Svelte + CSS, pilotées par les attributs `data-*` de bits-ui.**

```svelte
<!-- concept -->
import { prefersReducedMotion } from 'svelte/motion';
import { fly } from 'svelte/transition';
// transition:fly={{ y: prefersReducedMotion.current ? 0 : 8, duration: prefersReducedMotion.current ? 0 : 120 }}
```

Documenté sur [svelte.dev/docs/svelte/svelte-motion](https://svelte.dev/docs/svelte/svelte-motion). Attention à la note de la doc sur `transition:` : « A global `@media (prefers-reduced-motion: reduce)` rule that zeroes `transition-duration` **therefore has no effect on them** » → il faut passer par `prefersReducedMotion.current`, pas par une règle CSS globale.

bits-ui fournit exactement les hooks : `data-state="open|closed"`, `data-starting-style`, `data-ending-style`, `data-side`. Un design system CSS pur peut donc écrire :

```css
/* concept — transitions d'ouverture/fermeture d'une couche flottante, sans JS */
.popup {
  transition:
    opacity 120ms var(--ease-out),
    transform 120ms var(--ease-out),
    overlay 120ms allow-discrete,
    display 120ms allow-discrete;
  opacity: 0;
  transform: scale(0.98);
}
.popup[data-state="open"] {
  opacity: 1;
  transform: none;
}
```

`transition-behavior: allow-discrete` sur `display`/`overlay` est **la** bonne façon d'animer l'entrée/sortie d'un élément en top layer sans `forceMount`. (`overlay` est une propriété UA-controlled qu'on peut transitionner pour garder l'élément en top layer pendant l'animation — voir [css-position-4 §3.4](https://drafts.csswg.org/css-position-4/#overlay).)

**N'opter pour `@humanspeak/svelte-motion` que si** on a réellement besoin de FLIP/shared-layout entre panneaux ou de physique spring. Un VTT veut surtout des fades/slides discrets — la complexité ne se justifie pas.

---

## 6. Overlays / gestionnaires de panneaux flottants

### 6.1 Ce qui existe

| Librairie                                                  | Version            | Date                                  | ★ / activité     | Nature                                                                       |
| ---------------------------------------------------------- | ------------------ | ------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| [`allotment`](https://github.com/johnwalley/allotment)     | 1.20.5             | 2025-12-19 (repo push **2026-09-28**) | 1 261 ★          | **React**, _split views_ redimensionnables — **pas** des fenêtres flottantes |
| [`paneforge`](https://github.com/svecosystem/paneforge)    | 1.0.2              | **2025-08-02**                        | 658 ★            | Svelte 5, panneaux en split, docking onglets — **stale**                     |
| [`svelte-windows`](https://windows.stephengruzin.dev/docs) | 0.1.13             | créé 2025-09, modifié 2026-03-20      | —                | Svelte 5, drag/resize/stacking — **0.1.x**, jeune                            |
| `horizon-layout`                                           | 1.0.2              | créé 2026-06-12, modifié 2026-09-24   | repo introuvable | Dock/onglets — **3 mois**, description vide                                  |
| `@ark-ui/svelte` `floating-panel`                          | inclus dans 5.24.2 | 2026-09-13                            | zag-js           | Fournit le panneau flottant _animations_, pas la gestion de layout persisté  |

### 6.2 Verdict : **à écrire maison**, et c'est raisonnable

Aucun candidat Svelte n'est à la fois mature et adapté. Le périmètre réel est :

1. **Modèle de données** — `{ id, kind, x, y, w, h, z, minimized, collapsed }` par panneau. Classes ~30 lignes avec `$state.raw` + validation.
2. **Drag** — voir §4.2 (~40 lignes).
3. **Resize** — 8 poignées, une seule fonction paramétrée par un vecteur direction + `min`/`max` (~50 lignes).
4. **z-order** — un compteur monotone ; `pointerdown` sur un panneau → `z = ++top`. **Pas de `z-index` pour les panneaux flottants eux-mêmes** s'ils sont dans le top layer (`popover`) : l'ordre de la pile suffit. Si on reste en DOM classique, un `z-index` croissant suffit aussi — il n'y a pas de conflit avec les popups si on garde les popups **au-dessus** via le top layer.
5. **Snap** — à l'ouverture et au drop : si le panneau est à moins de N px d'un bord du viewport, aimanter. Simple clamp sur `x/y/w/h`.
6. **Persistance** — `localStorage`, **coordonnées normalisées en fraction du viewport** (sinon le layout est cassé sur un autre écran) + version du schéma + migration.
7. **Adaptation à la largeur** — sous un breakpoint, les panneaux deviennent des feuilles pleine largeur. **Sans objet ici** : la cible est un PC de bureau (cf. `07` §Lot 9), la seule contrainte est de tenir dans ≈ 1180 px.

Total : **~200-250 lignes**, testable, sans dépendance. Une lib vous aurait coûté plus de temps à intégrer qu'à écrire.

**Note :** `paneforge` reste intéressant **si** on veut un jour des _docks_ en split (sidebar redimensionnable) plutôt que des fenêtres flottantes. Mais il est inactif depuis 14 mois — ne construisez pas dessus.

---

## 7. Design tokens / theming en CSS pur

### 7.1 Ce qui est sûr en 2026

| Fonctionnalité                            | Statut                                                                                                                                                            | Versions (caniuse)                               | Verdict                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **`@property`**                           | **Baseline 2024** — « since July 2024 » ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property))                                    | —                                                | ✅ **Utiliser.** Vérification de type, `inherits`, `initial-value`, et surtout **animation/transition d'une custom property** |
| **`color-mix()`**                         | Baseline                                                                                                                                                          | Chrome **111**, Firefox **113**, Safari **16.2** | ✅ **Utiliser.** Génération d'échelles d'élévation : `color-mix(in oklab, var(--surface), var(--accent) 12%)`                 |
| **Syntaxe de couleur relative**           | Baseline                                                                                                                                                          | Chrome **118**, Firefox **128**, Safari **16.4** | ✅ Optionnel (`oklch(from var(--c) calc(l * .8) c h)`)                                                                        |
| **`light-dark()`**                        | Baseline 2024                                                                                                                                                     | —                                                | ✅ Thème clair/sombre **sans media query ni classe**                                                                          |
| **Container queries** (`cqw`/`cqh`/`cqi`) | Working Draft, largement livré                                                                                                                                    | Chrome **92**, Firefox **110**, Safari **16.0**  | ✅ **Idéal pour les panneaux flottants**                                                                                      |
| **CSS Nesting**                           | Working Draft                                                                                                                                                     | Chrome **109**, Firefox **115**, Safari **16.5** | ✅                                                                                                                            |
| **`:has()`**                              | Working Draft                                                                                                                                                     | Chrome **101**, Firefox **103**, Safari **15.4** | ✅                                                                                                                            |
| **`overlay` transition**                  | [css-position-4 §3.4](https://drafts.csswg.org/css-position-4/#overlay)                                                                                           | livré avec le top layer                          | ✅ Utile pour animer l'entrée/sortie d'un popover                                                                             |
| **`corner-shape`**                        | **Limited availability — « Experimental »** ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/properties/corner-shape), page modifiée 2026-08-27) | non listé dans caniuse                           | ❌ **Pas en prod**                                                                                                            |

### 7.2 `corner-shape` — détail important

MDN est explicite :

> « **Limited availability** — This feature is not Baseline because it does not work in some of the most widely-used browsers. »
> « **Experimental: This is an experimental technology.** Check the Browser compatibility table carefully before using this in production. »

La propriété accepte `round | scoop | bevel | notch | square | squircle | superellipse(<number>)` et est **animable** (interpolation par superellipse). Les propriétés `background`, `border`, `outline`, `box-shadow`, `overflow`, `backdrop-filter` suivent la forme —— ce qui en ferait un outil idéal qui en ferait un outil idéal pour une UI de jeu à l'esthétiqueà l'esthétiqueà l'esthétique organique.

**Si on veut l expérimenter** : MDN propose lui-même le pattern de dégradation :

```css
@supports not (corner-shape: scoop) {
  /* fallback border-radiusonly */
}
```

C'est sans risque _si_ le fallback est correct (les `border-radius` seuls donnent déjà `round`, la valeur initiale).

### 7.3 Support Vite / SvelteKit

Aucune de ces fonctionnalités n'a besoin d'étape de build. Vite compile les CSS via Lightning CSS / esbuild selon la config ; par défaut les fonctions CSS modernes sont **préservées telles quelles** (elles sont valides pour le parseur). Seuls les _surrénaux_ (`-webkit-`) seraient transformés. SvelteKit ne pose aucune contrainte supplémentaire. Le scope est simplement `:global(...)` vs scopé — gérable.

### 7.4 Proposition de design system de surfaces

Trois plans de surfaces, définis une seule fois :

1. **Tokens primitifs** — `--surface-canvas`, `--surface-raised`, `--surface-overlay`, `--border-subtle`, `--text-primary/secondary/muted`, `--accent`. Déclarés avec `@property` (`syntax: "<color>"`, `inherits: true`) pour pouvoir **animer les transitions entre plans** et garantir la cohérence.
2. **Dérivation** — `color-mix(in oklab, …)` pour les états hover/active et les 3-4 niveaux d'élévation. Zéro duplication de valeur hexadécimale.
3. **Exposition via classes** — `.surface-canvas`, `.surface-raised`, `.surface-overlay`, chacune avec `background`, `border`, `box-shadow`, `backdrop-filter` (pour l'effet « verre » au-dessus de la carte) — **ce qui est exactement notre besoin de surimpression**.

Puis **container queries sur chaque panneau flottant** :

```css
/* concept */
.panel {
  container-type: size;
  container-name: panel;
}
@container panel (width < 320px) {
  /* compact */
}
@container panel (height < 200px) {
  /* footer masqué */
}
```

C'est le bon niveau d'abstraction pour des panneaux redimensionnables : chaque panneau décide de son layout interne selon **sa propre** taille, pas celle du viewport.

---

## 8. Canvas vs DOM pour la map de jeu

### 8.1 Ce que fait l'industrie

- **Foundry VTT** (le standard) : « The virtual tabletop environment is implemented using a **WebGL powered HTML 5 canvas using the powerful PIXI.js library**. The canvas is comprised by an ordered sequence of layers which define rendering groups and collections of objects » — [foundryvtt.com API docs](https://foundryvtt.com/api/classes/foundry.canvas.Canvas.html), également décrit dans le [wiki communautaire](https://foundryvtt.wiki/en/development/api/canvas) et le [guide PIXI](https://foundryvtt.wiki/en/development/guides/pixi).
- `pixi.js` est en **8.21.0** (2026-09-30), 48 248 ★, activité journalière.

Donc la question n'est pas « Pixi est-il capable » (oui, massivement) mais « est-il nécessaire pour NOTRE échelle ».

### 8.2 Repères quantitatifs

| Repère                                                | Chiffre                                                                             | Source                                                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas 2D, sprites avec rotation/alpha/échelleéchelle | **1 000 – 1 300 sprites par frame** budget                                          | [StackOverflow](https://stackoverflow.com/questions/42303988/html5-canvas-poor-performance-with-2000-images)                                        |
| PixiJS, **10 000 sprites**                            | **47 FPS** (Ryzen 5 4500U, 8 Go, Edge 109) — le plus rapide des renderers 2D testés | [js-game-rendering-benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark)                                                             |
| Babylon.js / Phaser, 10 000 sprites                   | 56 / 43 FPS                                                                         | idem                                                                                                                                                |
| DOM animé                                             | « The DOM stutters past **500 elements**. PixiJS renders 50 000 at 60 fps. »        | [blog.abdulkabirmusa.com](https://blog.abdulkabirmusa.com/why-dom-animations-choke-pixijs-webgl-batching) (article vendorisé, à prendre avec recul) |

Le seuil « ~500 éléments DOM animés » est le seul qui compte pour nous. **Une table de jeu H&D c'est 6 joueurs + une poignée de PNJ : 20 à 200 pions par carte**, plus quelques éléments de décor interactifs. On est **très en dessous** du seuil, et surtout : nos pions ne sont pas _tous_ animés en même temps — seuls ceux déplacés.

### 8.3 Pourquoi le DOM gagne pour notre cas

1. **Les pions doivent vivre DANS la couche transformée.** Le pan/zoom = un seul `transform: translate(...) scale(...)` sur le conteneur de carte. Si les pions sont en DOM, un seul style mis à jour déplace tout. Si la carte est un canvas Pixi, il faut gérer le zoom de la caméra, le DPR, les matrices, le hit-testing manuel — et l'UI de surimpression doit rester synchronisée en permanent.
2. **Texte.** Noms de pions, PV, badges d'état : `text-shadow`/`-webkit-text-stroke` en CSS, gratuit, net à toutes les densités. Sur canvas il faut un système de labels.
3. **Effets CSS.** `filter: drop-shadow()`, `backdrop-filter`, `mix-blend-mode`, `transition`, `outline` pour l'état « sélectionné / sous le curseur ». Sur canvas : shaders ou rien.
4. **Accessibilité et testabilité.** Un pion en DOM est sélectionnable au clavier, inspectable par Playwright, lisible par un lecteur d'écran. Le projet a déjà une suite **Playwright e2e** (`pnpm e2e`) : des pions en canvas casseraient l'existe des testsExisting.
5. **Coût d'entrée nul.** Pas de bundling WebGL, pas de gestion du contexte GPULost, pas de poids (~450 Ko pour Pixi v8).

### 8.4 Verdict et porte de sortie

**DOM**, avec un garde-fou architectural : la couche carte est **un composant isolé** (`<MapLayer>`) qui reçoit un état en runes et ne rend que des pions. Si un jour une carte dépasse ~500-1000 objets interactifs simultanés, ou si on veut des shaders/effects, on remplace **l'intérieur** de `<MapLayer>` par un canvas — l'UI de surimpression, elle, ne change pas.

DeuxSevils d'optimisation à garder en tête pour le DOM :

- **ne jamais écrire `left/top`** pendant un pan/zoom → un seul `transform` ;
- `will-change: transform` sur la couche carte **seulement pendant le geste** (sinon on crée des couches de composition permanentes) ;
- `content-visibility: auto` + `contain-intrinsic-size` sur les conteneurs hors-champ si une carte devient très grande ;
- **séparer la carte et l'UI en deux sous-arbres de layout** pour ne pas recalculer le layout de l'UI à chaque frame de pan.

---

## 9. Verdict et recommandation

### 9.1 Adopter

| Quoi                                                                           | Pourquoi                                                                                                                                                                                                                                  | Réf.                                                                                                                                             |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`bits-ui` 2.19.3**                                                           | Seule lib Svelte 5 headless qui couvre tout notre besoin (Popover, Dialog, **ContextMenu**, Menu, Tooltip, Select, Tabs, Toggle, **Command**, ScrollArea, Slider), sans Tailwind, très active (3 587 ★, releases toutes les 2-3 semaines) | [bits-ui.com](https://www.bits-ui.com/docs), [npm](https://www.npmjs.com/package/bits-ui)                                                        |
| `<BitsConfig defaultPortalTo="body">` global                                   | Un seul point de configuration pour que **tous** les contenus flottants échappent au parent transformé                                                                                                                                    | [BitsConfig](https://www.bits-ui.com/docs/utilities/bits-config)                                                                                 |
| `strategy="fixed"` sur chaque contenu flottant                                 | **Obligatoire** — le défaut réel du code est `absolute`                                                                                                                                                                                   | [Popover.Content API](https://www.bits-ui.com/docs/components/popover)                                                                           |
| `bits-ui/Command` + `Dialog`                                                   | Command palette complète (scoring cmdk) sans lib supplémentaire                                                                                                                                                                           | [Command](https://www.bits-ui.com/docs/components/command)                                                                                       |
| **`popover` natif** (top layer)                                                | La seule solution qui résout le `transform: scale()` _nativement_ etselon la spec. Zéro dépendance. Zéro `z-index` à gérer. Utiliser en complément de bits-ui pour les cas simples (bulles d'aide, indications)                           | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API), [css-position-4 §3.1](https://drafts.csswg.org/css-position-4/#top-styling) |
| **`@property` + `color-mix()` + `light-dark()` + container queries + nesting** | Design system de surfaces 100 % CSS, Baseline 2024, animation des transitions d'élévation possible                                                                                                                                        | [MDN @property](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property)                                                   |
| `runed` (transitif)                                                            | Déjà une dépendance de bits-ui — gratuit ; `useResizeObserver` etc.                                                                                                                                                                       | [svecosystem/runed](https://github.com/svecosystem/runed)                                                                                        |

### 9.2 Évaluer (optionnel, après coup)

| Quoi                              | Condition d'adoption                                                                                                 | Réf.                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@neodrag/svelte` 2.3.3           | Si le drag de panneau devient pénible. 1,68 KB, mais **ne fait pas le resize** → on n'économise que ~30 % du travail | [neodrag.dev](https://www.neodrag.dev/docs/svelte)                                        |
| `svelte-gestures` 5.2.2           | Si le pincement au trackpad mérite un raccourci. Attention : dernier commit 2025-09                                  | [GitHub](https://github.com/Rezi/svelte-gestures)                                         |
| `@humanspeak/svelte-motion` 1.4.6 | **Uniquement** si on a besoin de FLIP/shared-layout ou de spring entre panneaux. 102 ★ → risque                      | [motion.svelte.page](https://motion.svelte.page/)                                         |
| `corner-shape`                    | **Derrière `@supports`**, pour les coins « organiques » de l'UI de jeu. Jamais en dépendance dure                    | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/properties/corner-shape) |

### 9.3 Éviter

| Quoi                                            | Pourquoi                                                                                                                            | Réf.                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `melt-ui` / `melt` next-gen                     | Belle API (`popover` natif !) mais 0.44.0 du 2026-01-04, 9 mois sans commit, **pas de Menu / DropdownMenu / ContextMenu / Command** | [melt-ui/next-gen](https://github.com/melt-ui/next-gen)                                             |
| `shadcn-svelte`                                 | **Tailwind v4 obligatoire**                                                                                                         | [shadcn-svelte.com](https://shadcn-svelte.com/)                                                     |
| `@ark-ui/svelte`                                | 60 dépendances `@zag-js/*` épinglées, pas de `Command`, pas de `ContextMenu` dédié                                                  | [chakra-ui/ark](https://github.com/chakra-ui/ark)                                                   |
| `svelte-headlessui`                             | Inactif depuis 2025-01-26, ne couvre pas les menus                                                                                  | [GitHub](https://github.com/captaincodeman/svelte-headlessui)                                       |
| `svelte-motion`, `@motionone/svelte`            | Framework Svelte 4, abandon depuis 2023-2024                                                                                        | [GitHub](https://github.com/micha-lmxt/svelte-motion)                                               |
| `cmdk`, `cmdk-svelte`, `svelte-cmdk`, `cmdk-sv` | React ou morts/dépréciés — remplacés par bits-ui `Command`                                                                          | [npm cmdk](https://www.npmjs.com/package/cmdk)                                                      |
| `paneforge`                                     | 14 mois d'inactivité, et c'est des split panes pas des fenêtres flottantes                                                          | [svecosystem/paneforge](https://github.com/svecosystem/paneforge)                                   |
| `svelte-panzoom`                                | **N'existe pas** ; les candidats (`svelte-pan-zoom`, `svelte-pan-zoom`) sont en 0.x                                                 | —                                                                                                   |
| `interactjs`                                    | Trop lourd (~200 KB) pour un besoin de 40 lignes                                                                                    | [npm](https://www.npmjs.com/package/interactjs)                                                     |
| CSS Anchor Positioning pour les popups de pions | Bloqué par la règle « same original containing block »                                                                              | [css-anchor-position-1 §2.3](https://drafts.csswg.org/css-anchor-position-1/#anchor-scope)          |
| PixiJS / three.js / canvas 2D pour la map       | Surdimensionné à l'échelle H&D ; coûte l'accès DOM/a11y/tests e2e                                                                   | [foundryvtt.com](https://foundryvtt.com/api/classes/foundry.canvas.Canvas.html) (référence inverse) |

### 9.4 Écrire maison

| Module                                                                                                       | Taille          | Pourquoi                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------- |
| **`<Surface>` / `<Layer>`** — wrapper maison au-dessus de bits-ui                                            | ~40 lignes      | Centralise `strategy="fixed"` + `Portal` + `data-*` → impossible d'oublier le garde-fou        |
| **Shell de panneau flottant** — drag, 8 resize handles, z-order, snap, persistance `localStorage` normalisée | ~200-250 lignes | Aucune lib mature en Svelte ; besoin de contrôle du z-index croisé avec le top layer           |
| **Contrôleur de pan/zoom de la carte** — pointer capture, wheel, pincement, clamp, inertie optionnelle       | ~120 lignes     | Composition avec la couche carte + coordonnées ; une lib masque exactement ce dont on a besoin |
| **Registre de commandes** — `register()`/`unregister()`, `when()` par rôle (MJ vs joueur)                    | ~40 lignes      | Les commandes doivent venir de partout ; `when()` centralise les commandes MJ-only             |
| **Couche de tokens CSS** — primitifs `@property` + dérivés `color-mix` + classes `.surface-*`                | ~150 lignes     | Le « design system de surfaces » demandé ; cohérent par construction                           |

### 9.5 Séquence proposée

1. **`tokens.css`** — primitifs `@property`, dérivés `color-mix()`, `light-dark()`, classes `.surface-canvas|raised|overlay`, container queries. Sans dépendance. Testable immédiatement.
2. **`<Surface>`** — wrapper bits-ui qui force `Portal` + `strategy="fixed"`. Brancher `<BitsConfig>` racine. **Test immédiat** : ouvrir un `Dialog`/`Popover`/`ContextMenu` par-dessus la carte zoomée à 2.5× et vérifier le positionnement — c'est le test d'acceptation du problème n°1.
3. **`popover` natif** — prototypage du context-menu de carte (positionné sur `clientX/clientY` du `contextmenu`) pour comparer les deux approches côte à côte, y compris sur iOS Safari.
4. **Shell de panneau** + persistance, en DOM classique d'abord (`z-index` croissant).
5. **Pan/zoom** de la carte.
6. **Command palette** — `Dialog` + `Command` + registre.
7. **Animations** — attributs `data-*` + transitions CSS avec `prefersReducedMotion`.
8. _(Optionnel)_ `@humanspeak/svelte-motion` si les transitions natives ne suffisent pas ; `corner-shape` derrière `@supports`.

### 9.6 Points de vigilance

- ⚠️ **`strategy` par défaut = `absolute` dans le code** (les docs disent `fixed`). Ne pas faire confiance aux docs ici ; passer `strategy="fixed"` partout, et **l'encoder dans `<Surface>`**.
- ⚠️ **Le top layer gère l'ordre, pas `z-index`.** Un popover ouvert après un autre le recouvre. C'est le bon modèle pour un VTT, mais il faut le documenter : plus de tweaking de `z-index` entre panneaux et popups.
- ⚠️ **Les propriétés CSS héritées cascadent toujours** depuis le parent DOM d'un élément en top layer (`font-size`, `color`, variables de thème). Porter les tokens sur `:root` **et** sur le conteneur `document.body` du portail, sinon les popups n'auront pas les bonnes couleurs.
- ⚠️ **`popover` n'a pas de collision detection.** Pour un context menu, il faut un clamp simple vers le viewport (5-10 lignes). C'est acceptable ; Floating UI en fait plus mais au prix du problème de parent transformé.
- ⚠️ **Svelte n'a toujours pas de `<Portal>` natif** — [sveltejs/svelte#7082](https://github.com/sveltejs/svelte/issues/7082), **ouvert**, dernière activité 2026-07-16. Ne pas compter dessus.

---

## Annexe — Sources

**Spécifications**

- [CSS Positioned Layout Module Level 4 — Top Layer](https://drafts.csswg.org/css-position-4/#top-styling) · [§3.4 overlay](https://drafts.csswg.org/css-position-4/#overlay)
- [CSS Anchor Positioning Module Level 1 — Finding an Anchor](https://drafts.csswg.org/css-anchor-position-1/#anchor-scope)
- [MDN — Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) (Baseline 2025, modifié 2025-12-17)
- [MDN — @property](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property) (Baseline 2024, modifié 2026-05-01)
- [MDN — corner-shape](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/properties/corner-shape) (Limited availability / Experimental, modifié 2026-08-27)

**Bibliothèques**

- [bits-ui](https://www.bits-ui.com/docs) · [npm](https://www.npmjs.com/package/bits-ui) · [GitHub](https://github.com/huntabyte/bits-ui) — [Popover](https://www.bits-ui.com/docs/components/popover) · [ContextMenu](https://www.bits-ui.com/docs/components/context-menu) · [Command](https://www.bits-ui.com/docs/components/command) · [BitsConfig](https://www.bits-ui.com/docs/utilities/bits-config) · [Portal](https://www.bits-ui.com/docs/utilities/portal) · [Transitions](https://www.bits-ui.com/docs/transitions)
- [melt-ui/next-gen](https://github.com/melt-ui/next-gen) · [docs](https://next.melt-ui.com/) · [popover features](https://github.com/melt-ui/next-gen/blob/main/docs/src/content/docs/components/popover.mdx)
- [chakra-ui/ark](https://github.com/chakra-ui/ark) · [@ark-ui/svelte](https://www.npmjs.com/package/@ark-ui/svelte)
- [huntabyte/shadcn-svelte](https://github.com/huntabyte/shadcn-svelte) · [guide migration Svelte 5](https://shadcn-svelte.com/docs/migration/svelte-5)
- [captaincodeman/svelte-headlessui](https://github.com/captaincodeman/svelte-headlessui)
- [PuruVJ/neodrag](https://github.com/PuruVJ/neodrag) · [docs Svelte](https://www.neodrag.dev/docs/svelte)
- [Rezi/svelte-gestures](https://github.com/Rezi/svelte-gestures)
- [rohitpotato/svelte-command-palette](https://github.com/rohitpotato/svelte-command-palette)
- [humanspeak/svelte-motion](https://github.com/humanspeak/svelte-motion) · [motion.svelte.page](https://motion.svelte.page/)
- [svecosystem/paneforge](https://github.com/svecosystem/paneforge) · [johnwalley/allotment](https://github.com/johnwalley/allotment)
- [micha-lmxt/svelte-motion](https://github.com/micha-lmxt/svelte-motion) · [@motionone/svelte](https://www.npmjs.com/package/@motionone/svelte) · [motion (motion.dev)](https://motion.dev)

**Perf / rendu**

- [Foundry VTT — Canvas API](https://foundryvtt.com/api/classes/foundry.canvas.Canvas.html) · [wiki Foundry — Canvas](https://foundryvtt.wiki/en/development/api/canvas)
- [js-game-rendering-benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark) · [slaylines canvas-engines-comparison](https://bramus.github.io/canvas-engines-comparison/dom.html)
- [PixiJS v8 migration guide](https://pixijs.com/8.x/guides/migrations/v8) · [PixiJS performance tips](https://pixijs.com/8.x/guides/concepts/performance-tips)

**Svelte**

- [svelte.dev — svelte/motion (prefersReducedMotion)](https://svelte.dev/docs/svelte/svelte-motion) · [svelte/attachments](https://svelte.dev/docs/svelte/svelte-attachments) · [svelte:body](https://svelte.dev/docs/svelte/svelte-body)
- [sveltejs/svelte#7082 — [feature] Add `Portal`s to Svelte](https://github.com/sveltejs/svelte/issues/7082) (ouvert)
- [SvelteKit — adapter-cloudflare](https://svelte.dev/docs/kit/adapter-cloudflare) · [Cloudflare — SvelteKit](https://developers.cloudflare.com/workers/framework-guides/web-apps/sveltekit/)
