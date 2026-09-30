# 06 — Le design system de surfaces

Objectif : **« structure Atlas, peau carnet »**. On prend le modèle de surfaces
d'Atlas (3 plans, un seul traitement de bordure, une échelle de rayons, des coins
concentriques) et on garde l'identité encre/papier là où elle est une force.

---

## 1. Le problème, chiffré

Rappel de `02-etat-des-lieux-rollwith.md` §4.3 :

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
| 14 px   | `14px 4px 16px 5px`, `14px 5px 16px 5px`                                                   |

Le même motif, réécrit deux fois, a un rayon différent :
`Button.svelte:54` = `15px 230px 15px 225px / 225px 15px 255px 15px`,
`CharacterSheet.svelte:617` = `15px 255px 15px 225px / 225px 15px 255px 15px`.

Et le `z-index` est une série de nombres arbitraires dispersés : `50, 50, 60, 60,
60, 70, 90, 95` sur 9 fichiers, **sans nommage sémantique**.

**Ce n'est pas un problème de goût, c'est un problème de cohérence mesurable.**
C'est la cause racine **C2**.

---

## 2. Trois plans de surfaces, définis une seule fois

C'est le cœur de la proposition. Trois plans, pas dix.

### 2.1 Les tokens primitifs

Déclarés avec `@property` ([Baseline 2024](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property)) pour la vérification de type et
l'**animation des transitions entre plans** :

```css
@property --surface-canvas {
  syntax: "<color>";
  inherits: true;
  initial-value: #26221d;
}
@property --surface-raised {
  syntax: "<color>";
  inherits: true;
  initial-value: #2e2a24;
}
@property --surface-overlay {
  syntax: "<color>";
  inherits: true;
  initial-value: #2e2a24;
}
@property --border-subtle {
  syntax: "<color>";
  inherits: true;
  initial-value: #3a352d;
}
@property --border-default {
  syntax: "<color>";
  inherits: true;
  initial-value: #575043;
}
```

> ⚠️ Porter ces tokens sur **`:root`** _et_ sur le conteneur `document.body` du
> portail, sinon les popups en top layer n'héritent pas des bonnes couleurs (les
> propriétés héritées cascadent depuis le parent DOM, même en top layer).

### 2.2 La dérivation — zéro hexadécimal dupliqué

```css
--surface-raised-hover: color-mix(in oklab, var(--surface-raised), var(--accent) 6%);
--surface-overlay-blur: color-mix(in oklab, var(--surface-overlay), transparent 78%);
--border-strong: color-mix(in oklab, var(--border-default), var(--text) 22%);
```

### 2.3 L'exposition par classes

```css
.surface-canvas {
  background: var(--surface-canvas);
}

.surface-raised {
  background: var(--surface-raised);
  border: 1.5px solid var(--border-subtle);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-raised);
}

.surface-overlay {
  background: var(--surface-overlay-blur);
  backdrop-filter: blur(8px);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-overlay);
}
```

Règle **non négociable** (c'est la règle d'Atlas, et elle est bonne) :

> _All elevated surfaces share the same border treatment defined in one mixin.
> Use it instead of ad-hoc border values._

Chez nous, en CSS : **on n'écrit plus jamais `border:` ni `border-radius:` ni
`box-shadow:` dans un composant.** On écrit `class="surface-raised"`. La lint CSS
peut l'interdire.

---

## 3. L'échelle de rayons

Une seule échelle, hérée de notre échelle d'espacement (base 8 px) :

```css
--radius-xs: 4px; /* chips, cases à cocher, petits badges */
--radius-sm: 8px; /* boutons, champs, cartes */
--radius-md: 12px; /* panneaux, popovers, dropdowns */
--radius-lg: 16px; /* modales */
--radius-xl: 24px; /* fenêtres flottantes */
--radius-full: 9999px; /* pilules */
```

Et **3 tailles de composants**, comme Atlas :

```css
--control-h-sm: 24px;
--control-h: 32px; /* la taille par défaut */
--control-h-lg: 40px;
--icon-sm: 16px;
--icon: 20px;
--icon-lg: 24px;
```

**Le `--control-h` unique est important** : il garantit que tous les boutons d'une
barre d'outils ont la même hauteur, quelle que soit leur icône ou leur contenu.

---

## 4. L'ordre d'empilement

### 4.1 Le principe

Avec le **top layer** (cf. `05-architecture-svelte.md` §1), les popups ne se gèrent
plus par `z-index` mais par **l'ordre d'ouverture**. Le dernier ouvert est
au-dessus.

Conséquence : `z-index` ne sert **plus** qu'à ordonner les couches de **notre
DOM**, et il doit être nommé.

```css
--z-map: 0; /* la carte */
--z-grid: 10;
--z-fog: 20;
--z-tokens: 30;
--z-map-hud: 100; /* HUD sur la carte */
--z-chrome: 200; /* barres ancrées */
--z-panels: 300; /* panneaux flottants */
--z-overlay: 400; /* backs modaux */
```

Et plus **rien** au-dessus : tout ce qui est popover/dialog est en top layer, donc
hors de cette échelle.

### 4.2 L.Convertir les `z-index` actuels

| Actuel                                     | Devient                   |
| ------------------------------------------ | ------------------------- |
| `.fog-canvas` 15                           | `--z-fog`                 |
| `.token` 10, `.marker` 5, `.ping` 20       | `--z-tokens` / `--z-grid` |
| `.map-hud` 30                              | `--z-map-hud`             |
| `.dice-overlay` 40, `.overlay` 50          | top layer                 |
| `.maps-panel` / `.picker` / `.ctx-menu` 60 | top layer                 |
| `.encre-menu` 70                           | top layer                 |
| `.toast` 90, `.tip-card` 95                | top layer                 |

Un grep sur `z-index` dans `web/src` doit **ne rien retourner** après la migration.

---

## 5. La décision « structure Atlas, peau carnet »

C'est la partie la plus importante du fichier, parce qu'elle est facile à rater.

### 5.1 Le principe

Atlas a un seul langage de rayon (échelle Obsidian stricte). Nous avons 8 «
sketchy radii » appliqués par index. Ce n'est pas incompatible — mais il faut
**trancher où s'applique quoi**, sinon on a aujourd'hui du bruit partout.

| Zone                                                                                                             | Langage de rayon                                               | Pourquoi                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Chrome** (barre d'outils, onglets, panneaux, popovers, modales, HUD)                                           | **Échelle stricte** (`--radius-sm/md/lg`)                      | Le chrome ne doit pas attirer l'attention. Un panneau qui «oodle » est un panneau qu'on regarde trop. |
| **Contenus éditoriaux** (cartes de personnage, blocs de feuille, chips de résumé, cartes de PNJ dans la sidebar) | **Organic / sketchy**                                          | C'est notre identité. Le papier et l'encre vivent ici.                                                |
| **Objets de jeu** (pions, dés, portraits)                                                                        | **Organic en pourcentage** (déjà fait : `48% 52% 50% 50% / …`) | C'est un personnage dessiné, pas un composant d'interface.                                            |
| **Carte**                                                                                                        | **Aucun rayon**                                                | Une carte de jeu n'a pas de coins arrondis.                                                           |

Ce qui sort, concrètement : `MapManager`, `NpcLibrary`, `EncreSelector`,
`CompendiumTooltip`, `ChoicePicker`, `CharacterCreateModal`, `.overlay`, `.modal`
— tous passent à l'échelle stricte. Ce qui reste : `.char-card`, `SheetCaracs`,
`SheetSaves`, `SheetTraits`, `.cond-chip`, les rayons en pourcentage des pions.

### 5.2 Le test

> _Est-ce que ce bord est dessiné à la main, ou est-ce un panneau d'interface ?_

Si la réponse est « panneau », il prend l'échelle stricte. Point.

### 5.3 L'option `corner-shape`

Atlas utilise `corner-shape` pour que ses boutons heredent de la superellipse
macOS d'Obsidian. C'est exactement la bonne idée pour une UI organique — **mais**
[MDN le classe « Limited availability — Experimental »
](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/properties/corner-shape)
(page modifiée le 2026-08-27). Il accepte `round | scoop | bevel | notch | square |
squircle | superellipse(<n>)` et est animable.

Si on veut l'expérimenter, **derrière `@supports`** — le fallback (`border-radius`
seul) donne déjà `round`, la valeur initiale, donc la dégradation est gratuite :

```css
@supports (corner-shape: scoop) {
  .sheet-block {
    corner-shape: superellipse(2.2);
  }
}
```

C'est le **seul** endroit où on l'essaie. Jamais une dépendance dure, jamais pour la
cohérence du chrome.

---

## 6. Les coins concentriques

Le système le plus sophistonné d'Atlas (`styles/_mixins.scss`), et le plus facile à
voler en concept.

Le principe : si un élément est posé sur un panneau, **ses coins doivent être
concentriques** avec ceux du panneau, sinon le gap est irrégulier. Mathématiquement :
`rayon_interne = max(min, rayon_externe - inset)`.

```css
.surface-overlay {
  border-radius: var(--radius-lg);
}
.overlay-header {
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.overlay-footer {
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
.overlay-corner-control {
  /* le × */
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
```

Règle d'Atlas, à reprendre : _« Concentric means outer = inner + gap, and only on
the corners that face the panel's corners. When the inner radius comes out near 0,
the panel's radius is too small, so **raise it**; never shrink the inner one. »_

Et : _« every panel closes with `CloseButton` »_ — un seul composant, une seule
taille, `align-self: flex-start` pour rester dans le coin quand un titre plus grand
grandit le header.

Chez nous, ça veut dire : **un seul composant `<CloseButton>`**, qui apparaît dans
chaque panneau et modale, et qui n'est jamais réécrit à la main.

⚠️ Notre exception : `.compagnie` a des cartes à rayon organic contre un fond
ligné. La concentricité ne s'y applique pas — on l'assume.

---

## 7. Le mouvement

### 7.1 Des tokens, pas des valeurs à la main

Aujourd'hui chaque animation est écrite en dur dans son composant. D'où des
durées et des courbes incohérentes.

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1); /* entrées, relâchement */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* mouvement à l'écran */
--dur-press: 160ms;
--dur-in: 220ms;
--dur-out: 180ms; /* sortie plus rapide que l'entrée */
```

La règle d'Atlas qu'il faut garder : _« it rises out of the toolbar quickly and over
a short distance, and **leaves quicker still** »_. Une interface de jeu s'ouvre et
se ferme vite.

### 7.2 Les press states

Un seul jeu de valeurs, appliqué par un seul composant :

| Contexte           | `transform` au press |
| ------------------ | -------------------- |
| Bouton d'outil     | `scale(0.96)`        |
| Bouton icône       | `scale(0.95)`        |
| Bouton de modale   | `scale(0.97)`        |
| Carte d'initiative | `scale(0.96)`        |
| Contrôle de widget | `scale(0.90)`        |

Aujourd'hui : **aucun**. Nos boutons ne réagissent pas au clic. C'est le change-
ment le plus visible et le moins cher de toute la liste.

### 7.3 `prefers-reduced-motion`

Svelte expose `prefersReducedMotion` depuis `svelte/motion`, et `motion-reduce`
est une media query CSS. ⚠️ Attention : une règle globale
`@media (prefers-reduced-motion: reduce) { * { transition-duration: 0 } }` **n'a
aucun effet sur les `transition:` Svelte** (documenté : la transition est pilotée
par le JS). Il faut donc passer par `prefersReducedMotion.current` pour les
transitions Svelte, et par la media query pour les animations CSS.

Les deux, systématiquement.

---

## 8. Les scrollbars

Atlas a un détail qu'on n'a pas et qui fait la différence en sensation de fluidité :
**la place de la scrollbar est toujours réservée**.

- `atlas-scrollbar` : on set les propriétés standard _et_ `scrollbar-color`, parce
  qu'Obsidian met `scrollbar-color` sur `body` et que Chromium ignore alors
  `::-webkit-scrollbar`.
- `atlas-scrollbar-while-scrolling` : le pouce est `transparent` au repos et
  transitionne via un `@property --atlas-scrollbar-thumb` enregistré en racine ; il
  **apparaît instantanément** au scroll et **disparaît 300 ms après**, sans que le
  contenu bouge.
- `scroll-padding-inline` : la scrollbar vit dans le padding, la gouttière reste
  réservée.

Nous, on n'a rien de tout ça : on a `overflow-y: auto` partout, donc des
scrollbars qui apparaissent et **décalent le contenu** à chaque apparition. Sur une
sidebar de 288 px, c'est un micro-saut permanent.

**Reco** : un `.atlas-scrollbar`-équivalent, c'est 15 lignes de CSS + un
`@property`. Rapport valeur/charge excellent.

Et pour les barres d'onglets qui débordent (futures) : un fondu
`mask-image: linear-gradient(...)` plutôt qu'une scrollbar.

---

## 9. Les tooltips

Atlas a une **règle de lint** : jamais de `title=`. Parce que le `title` natif est
lent, non stylable, non accessible proprement, et double avec l'`aria-label`.

Nous, on utilise `title` partout : **65 attributs** dans `web/src` (`.tool-btn`,

`.hp-btn`, `.cond-chip`, `.model-btn`, `.del-btn`, `.place-btn`, les champs de la
feuille…). C'est à la fois un problème d'accessibilité et un problème de design :

nos tooltips sont les tooltips du navigateur, gris, retardés d'1 s.

**Reco** : `<Tooltip>` maison, based sur `bits-ui/Tooltip`, avec `delayDuration: 300`,
`sideOffset: 10`, et `aria-labelledby` prioritaire sur l'`aria-label` de l'enfant.
Et **un contenu en deux lignes** : le libellé + le raccourci dans un `<kbd>` — ce
qu'Atlas fait (`ToolButton` = label + `<kbd>` + sous-titre optionnel). C'est
gratuit et ça rend les raccourcis découvrables.

---

## 10. Thème clair, presque gratuit

`light-dark()` est [Baseline 2024](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property)
→ thème clair/sombre **sans media query ni classe**.

```css
:root {
  color-scheme: dark;
  --surface-canvas: light-dark(#f6f2e7, #26221d);
  --surface-raised: light-dark(#fffdf6, #2e2a24);
  --text-primary: light-dark(#2a251d, #e8e2d4);
  --accent: light-dark(#9c3222, #d9664f);
}
```

Ça rend le thème clair **quasiment gratuit** une fois les tokens en `@property` —
mais ça reste du travail de **recette** (nos rayons organic et nos hachures sont
conçus pour du sombre sur papier clair). Donc : **pas avant que le système de
surfaces existe**, et pas avant d'avoir corrigé les contrastes (`--text-3` est
probablement sous le seuil AA).

---

## 11. Ce qu'on fait du design Pencil existant

Il y a des maquettes dans `design V2/*.dc.html` (Écran de jeu, Feuille de
personnage, Compendium, Accueil, Design System) et
`design V2/THEME-CARNET-DE-NUIT.md`.

Elles servent de **référence d'identité** (palette, typo, texture papier, rayons
organic), pas de référence de layout : le layout actuel de la table s'en est écarté
au fil des ajouts (sidebars, barre MJ, onglets, initiative) sans que les maquettes
aient été remises à jour.

**Décision à acter** : après le §1 du chantier (carte plein écran + chrome en
surimpression), **refaire les maquettes Pencil de l'écran de jeu** avant de
détailler le reste. Sans ça, on code une troisième version qui diverge encore.

C'est aussi le bon moment pour le **projet Penpot `dragons`** qui est vide : y
reporter la nouvelle structure, ce qui donne une cible visuelle avant le code.

---

## 12. Récapitulatif

| Élément                                                   | Effort            | Bénéfice                               |
| --------------------------------------------------------- | ----------------- | -------------------------------------- |
| Tokens `@property` + `color-mix()` + classes `.surface-*` | ~150 l.           | Le socle de tout                       |
| Échelle de rayons stricte pour le chrome                  | ~1 j de migration | Fini le bruit des 56 rayons            |
| `z-index` sémantique → variables, zéro littéral           | ~0,5 j            | Fini l'empilement accidentel           |
| Press states                                              | ~0,5 j            | Le changement le plus visible par euro |
| Tokens de mouvement + `prefers-reduced-motion`            | ~0,5 j            | Rythme cohérent + a11y                 |
| Scrollbars à place réservée                               | ~0,5 j            | Supprime les micro-sauts               |
| `<Tooltip>` sans `title`                                  | ~1 j              | A11y + découvrabilité des raccourcis   |
| `<CloseButton>` unique + coins concentriques              | ~1 j              | Cohésion des surfaces                  |
| `light-dark()`                                            | recette           | Thème clair presque gratuit, plus tard |
| `corner-shape` derrière `@supports`                       | expérimentation   | Les coins « dessinés », plus tard      |
