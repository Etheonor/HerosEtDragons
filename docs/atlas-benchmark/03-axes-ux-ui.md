# 03 — Différentiel UX/UI, axe par axe

Format de chaque axe :
**Atlas** · **Nous** · **Écart** · **Reco**.

Les icônes : 🔴 = problème structurant · 🟡 = annoyance · 🟢 = on est déjà bons.

---

## 1. Layout : la page est l'interface vs la carte est l'application

### Atlas

3 couches empilées (`services/uiLayers.ts`) :

```css
.atlas-react-ui-container {
  position: absolute;
  inset: 0;
  z-index: 1000;
  pointer-events: none; /* ← le point clé */
}
.atlas-bottom-toolbar-row {
  pointer-events: none;
}
.atlas-vtt-toolbar {
  pointer-events: auto;
}
.atlas-top-bar-row {
  pointer-events: none;
}
.atlas-widget-bar {
  pointer-events: auto;
}
.atlas-initiative-tracker {
  pointer-events: auto;
}
```

Le conteneur de chrome est transparent aux événements ; **chaque barre réactive est
`pointer-events: auto` individuellement**. Le vide entre deux widgets reste donc
cliquable sur la carte.

Tout est `position: fixed` sur des barres ancrées aux bords, avec uneéchelle de
gouttière de 8-16 px. La carte occupe tout le viewport derrière.

![Table Atlas](../assets/01-table-atlas.webp)

### Nous

```css
.table-screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.table-body {
  display: grid;
  grid-template-columns: 288px 1fr 324px;
  overflow: hidden;
}
aside.compagnie {
  width: 288px;
  overflow-y: auto;
}
aside.panel {
  width: 324px;
}
```

Une grille de page. La carte est **encadrée** par 612 px de sidebars opaques. Le
`.mj-toolbar` est dans le flux, donc dans la colonne centrale, au-dessus de la
carte, et prend de la hauteur à la carte.

### Écart

🔴 **C'est la cause racine C1.** La sensation « page web avec une image » vient
entièrement de là. Concrètement, chez Atlas à 1600×900 px on voit ~1850×900 px de
monde ; chez nous on voit ~950×760 px. Le monde est deux fois moins grand, et il
est **encadré**, ce qui le rend décoratif au lieu d'être le sujet.

Corollaires :

- impossible d'«habiter» la carte : les sidebars sont toujours là ;
- impossible de faire surgir un panneau à côté d'un objet **dans** la carte ;
- le `.mj-toolbar` (flex-wrap) réduit encore la hauteur disponible ;
- sur mobile, la grille à 3 colonnes fixes est inutilisable.

### Reco — P0 #1

Supprimer `.table-body`. Nouvelle structure :

```
.table-screen            position: relative; height: 100dvh; overflow: hidden
├── layer-map            position: absolute; inset: 0;   (la carte, plein écran)
├── layer-chrome         position: absolute; inset: 0; pointer-events: none
│   ├── top-bar          pointer-events: auto   (onglets de carte + widgets)
│   ├── bottom-toolbar   pointer-events: auto   (barre d'outils GM)
│   ├── initiative       pointer-events: auto   (panneau latéral droit)
│   └── map-hud          pointer-events: auto   (zoom, main)
└── layer-popups         portail document.body (menus, palette, modales, tooltips)
```

Les sidebars deviennent des **panneaux flottants** (§4), ouverts par défaut ou
restaurés, mais jamais « structurels ».

⚠️ **Contrainte à anticiper.** `.map-zoom` porte un `transform`. Tout
`position: fixed` à l'intérieur devient relatif au parent transformé. Deux
solutions :

1. Porter le transform sur un élément **cousin** de la couche chrome, pas un
   ancêtre (préféré, et ça reste dans le DOM local) ;
2. Ou passer les popups par un portail `document.body` + conversion de coordonnées.

C'est exactement le piège qu'Atlas documente (`contain: strict` sur
`.workspace-leaf`). → voir `05-architecture-svelte.md`.

---

## 2. La barre d'outils GM

### Atlas

`BottomToolbarRow` + `MainToolbar` + `ResponsiveToolbar`.

- Split-button : `ToolButton` + chevron `DropdownMenu` qui ouvre **les options de
  l'outil** (mode, taille, couleur, opacité…).
- **Familles d'outils** : `toolFaces.ts` — `fogToolFace`, `drawToolFace`,
  `measureToolFace`, `wallToolFace`, `textToolFace`. Le bouton principal ET son
  entrée dans le menu « More tools » lisent la même face.
- `PRIORITY` : `move 100 · measure 90 · fog 85 · assets 80 · dice 75 · pin 70 ·
draw 65 · palette 55 · text 50 · loot 45 · wall 40 · audio 35`, avec le
  commentaire _« The tools a GM reaches for during play outrank setup and reference
  tools, which also have hotkeys »_.
- `overflowingToolbarItems` : fonction **pure**, sortie stricte par priorité, à
  égalité les derniers d'abord. Un contrôle reste **épinglé** si son outil est
  actif ou son panneau ouvert.
- Tout reste **monté** dans le menu → l'état des options survit, et la barre peut
  re-mesurer quand l'item revient.
- Icônes 16-20 px via `lucide-react`, jamais de texte dans la barre.

### Nous

`.mj-toolbar` : `flex-wrap: wrap`, **boutons texte**, options dépliées **dans** la
barre, un `.tool-hint` de largeur variable.

```
[Outils du MJ] [Cartes ⟨N⟩] [PNJ ⟨N⟩] │ [Main] [Déplacer] [+ PNJ] [Repère]
[Effacer les repères] │ [Brouillard] Cliquez sur la carte pour placer
```

### Écart

🔴 **C3.** Trois problèmes cumulés :

1. La barre **change de largeur** selon l'outil actif (options dépliées) et peut
   passer à la ligne. Un HUD instable.
2. Aucun popover d'options : les réglages d'outil sont dans le flux.
3. Des **boutons texte** là où Atlas a des icônes + un chevron. Le texte est 3× plus
   large et ne se scanne pas.

🟡 Pas de famille d'outils (on a `move`, `hand`, `pnj`, `marker`, `fog` — 5 outils
plats), donc pas de split-button possible.

### Reco — P0 #3

Barre ancrée en bas, centrée, avec le mécanisme `BottomToolbarRow` :

```css
.toolbar-row {
  position: fixed;
  inset: auto 16px 16px 16px;
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
  align-items: end;
  column-gap: 8px;
  pointer-events: none;
}
```

Chaque outil devient un `ToolGroup` = bouton icône + chevron d'options. Les
familles à créer, dans l'ordre : `move`, `fog` (3 modes), `measure` (3 formes),
`draw` (stylo / tampon / gomme), `token`, `note`, `text`, `palette`.

Et le **fit par priorité en fonction pure** (`toolbarFit.ts`), avec pin. C'est
~150 lignes et c'est le morceau qui fait le plus « outillé ».

---

## 3. La command palette — le point de bascule

### Atlas

`CommandPalette.tsx` (943 l.) + `command-palette/` (12 fichiers).

Contenu : onglets `Tools` / `Mode` / `Settings`, avec :

- **Tools** : Move, Fog, Measure, Note Pin, Scene browser, Scene snapshots,
  Dice log, Loot roller.
- **Mode** : Enter/Exit Player Mode, Freeze Player Camera, Send Map to Player View.
- **Settings** : Grid, Token, Widget, Local player view.

Plus 9 panneaux de réglages (`GridSettingsPanel`, `TokenSettingsPanel`,
`WidgetSettingsPanel`, `SceneSnapshotsPanel`, `LocalPlayerViewSettingsPanel`),
tous en **2 colonnes**.

Le filtrage est volontairement simple (`includes()` sur label + keywords), mais
les **keywords sont des synonymes d'action** : `open-scene-browser` →
`["asset manager", "maps", "toggle"]`, `scene-snapshots` →
`["save","restore","reset","encounter","state"]`.

Navigation clavier complète : `Escape` à 3 niveaux, `Tab`/`Shift+Tab` entre onglets,
flèches cycliques + `scrollIntoView`, `ArrowRight`/`Enter` pour entrer dans un
sous-menu, `ArrowLeft` pour sortir.

Le footer d'aide est **toujours affiché** : `Tab / Shift+Tab → to switch tabs`,
`↑↓ → to navigate`, `↵ → to select`, `Esc → to clear / to close`.

Et le détail qui compte : `canRunMapHotkeys` est respecté, les raccourcis carte ne
volent pas les touches pendant que la palette est ouverte.

### Nous

Rien. Le `session-bar` est une rangée de `<a href>` et de boutons :

```svelte
<a href="/compendium?campaign={campaignId}" class="compendium-link">Compendium</a>
```

Les réglages de carte vivent dans le popover `MapManager` (745 lignes de popover),
ceux de PNJ dans `NpcLibrary` (515 lignes). Aucune vue d'ensemble des réglages, aucun
raccourci « ouvrir les réglages de grille ».

### Écart

🔴 **C4.** Trois conséquences :

1. **On ne peut pas tout retirer de l'écran.** Tant qu'il n'y a pas de palette, les
   réglages _doivent_ être visibles quelque part en permanence. C'est la raison pour
   laquelle notre barre est chargée.
2. **`<a href>` dans le header** = le signal visuel de « site web » le plus fort du
   produit. Dans un jeu, on ne « visite » pas le compendium : on l'ouvre par-dessus
   la table, ou dans un panneau.
3. **Aucun moyen d'apprendre.** Sans palette ni aide clavier (`?`), un nouveau
   joueur doit découvrir les raccourcis (`V`, `P`, `R`, `B`, `1`-`6`) par
   -hasard — et ils ne sont écrits que dans des `title=` que personne ne survole.

### Reco — P0 #4

Une `CommandPalette` avec `Space` au clavier, et surtout **deux usages** :

1. **Navigation / actions** : aller au compendium, ouvrir la feuille, ouvrir
   l'asset manager, poser un PNJ, lancer un jet, démarrer/arrêter le combat,
   ouvrir/fermer les panneaux.
2. **Réglages** : les 4-5 panneaux (`MapSettingsPanel`, `GridSettingsPanel`,
   `TokenSettingsPanel`, `FogSettingsPanel`, `CampaignSettingsPanel`) — tous en 2
   colonnes, avec le footer d'aide.

⚠️ **Point d'architecture spécifique à notre projet.** Atlas persiste ses réglages
en local, par utilisateur. **Nous, les `TableSettings` sont partagées de campagne.**
Donc :

- la palette doit savoir si elle est MJ ou joueur ;
- un réglage écrit depuis la palette doit être persisté **via le DO**, pas en local ;
- et il faut exposer les réglages de campagne (qui n'ont aujourd'hui **aucun
  écran** — `api.campaigns.updateSettings()` n'est appelé nulle part).

C'est un vrai manque produit à part entière : voir `07-parcours-implémentation.md`.

---

## 4. Panneaux et surfaces flottantes

### Atlas

- **Asset manager** : overlay `fixed inset:0` + backdrop `color-mix(...40%)` +
  `blur(6px)`, fenêtre `max-width: 1440px`, surface élevée partagée, rayon 24.
- **GM dashboard** (`Tab`) : 2 zones — les statblocks de tous les tokens liés à
  gauche, une note Obsidian détachée à droite. **Colonnes masonry adaptatives** :
  `columnCount` = 4 si `innerWidth >= 2400`, 3 si `>= 1400`, 2 si `>= 768`, 1 sinon.
- **Linked note panel** : une **vraie feuille Obsidian détachée** (`getLeaf(true)` +
  `leaf.detach()`), éditable Markdown complet avec autocomplétion de liens
  Obsidian. `min-width: 340px` pour rester lisible.
- **Panneaux redimensionnables** (`usePanelResize`, 64 l.) : bord droit, bas ou
  coin ; garde le coin haut-gauche ; reste dans son offset parent avec marge 8 ; la
  taille est appliquée pendant le drag et **reportée une seule fois au relâchement**
  (`onResizeEnd`).
- **Panneaux déplaçables** (`useDraggablePosition`, 127 l.) : clamp au mount, à la
  fin du drag, et au resize de la window ; **déplacement sans re-render** (style posé
  directement) ; commit une fois à la fin. Les pressions sur `button, input,
select, textarea` ne déclenchent pas le drag.
- **Notes prévisualisées** : `Cmd/Ctrl+hover` sur les pins **et** les tokens, avec
  `IPreviewWindow` (pin / open / edit). Les previews épinglées sont **sauvegardées
  avec la carte** et rouvrent à leur place.

### Nous

- `MapManager` : popover `position:absolute` sous son bouton, fermeture par un
  `$effect` qui écoute `pointerdown` sur `document`.
- `NpcLibrary` : idem.
- `EncreSelector` : idem.
- `ChoicePicker` : overlay `fixed inset:0` z-index 60.
- `CharacterCreateModal` : overlay `fixed inset:0` z-index 50.
- `CompendiumTooltip` : `fixed`, z-index 95.
- Toast : `fixed`, z-index 90.

**Aucun panneau déplaçable. Aucun panneau redimensionnable. Aucune prévisualisation
au survol.**

### Écart

🔴 **C5.** Le `z-index` est une série de nombres arbitraires dispersés (50, 50, 60,
60, 60, 70, 90, 95) sans nommage sémantique — donc **l'ordre d'empilement est
accidentel**, pas conçu. Ajouter un panneau, c'est deviner un numéro.

🟡 Un seul mécanisme de popover existe (click-outside dupliqué dans 3 fichiers) et il
ne gère ni le clavier, ni l'ancrage, ni le `useKeepInView`.

### Reco — P1 #8

Deux briques, dans cet ordre :

1. **`<Panel>`** : un composant de panneau flottant avec `position`, `size`,
   `resizable`, `draggable`, `persistKey`. Le `persistKey` sauvegarde la géométrie
   **par utilisateur** dans `localStorage` (c'est de la préférence d'affichage, pas
   du jeu) — donc pas de problème de persistance serveur ici.

   Les panneaux à migrer : `MapManager` → `<Panel kind="popover">` d'abord
   (migration triviale, gain immédiat de cohérence), puis le GM dashboard en
   `<Panel kind="window">`.

2. **`<Surface>`** : le traitement de bordure/fond/rayon/ombre partagé (§`06`). Sans
   lui, chaque panneau migré apporte sa propre variation.

---

## 5. L'asset manager

### Atlas

Un seul écran (`package s/components/asset-manager/`) qui remplace ce que chez nous
font `MapManager` + `NpcLibrary` + une partie de la sidebar compagnie.

- Onglets `Scenes` / `Maps` / `Encounters` / `Characters` avec compteurs.
- Sidebar : sélecteur de **collection**, tags avec compteurs, réglages de collection,
  export/import.
- Corps : `ActiveFilterBar` (un chip par filtre actif + reset) → `Breadcrumb` →
  contenu (dossiers + grille virtualisée).
- Multi-select : clic / `Shift`+range / `Ctrl+⌘`+toggle ; double-clic = ouvrir ou
  spawner.
- Historique back/forward, `useRememberedPlace` (onglet, collection, recherche,
  sections repliées, scroll).
- Recherche `keyword:value` façon deck-builder.

**Spawn** : double-clic → centre du viewport, grille `ceil(sqrt(n))` par ligne,
snap sur le centre de cellule, badge multiplicateur `− ×N +`, **un seul write →
un seul pas d'undo**, tous les tokens sélectionnés.

**Encounters** : trois niveaux de placement — formation capturée `{cell, offset}`
par token, puis offsets historiques, puis grille générique. `token.state`
(snapshot des jets de sauvegarde) restauré verbatim.

### Nous

- `MapManager` : **liste** de cartes dans un popover. Import par `<input type=file>`,
  renommage inline, suppression avec « armement » inline, réglage de grille
  (taille + couleur), notes MJ.
- `NpcLibrary` : **liste** de modèles dans un popover, avec recherche et quantité.
- Spawn d'un PNJ : choisir un modèle → l'outil passe à `pendingPlace` → cliquer
  sur la carte. Le spawn d'un groupe est « N fois un clic ».
- Le compendium permet « + Ajouter à ma bibliothèque de PNJ » → crée un
  `NpcTemplate` avec CA/PV/Init calculés par `shared/compendium`.

![Asset manager Atlas](../assets/02-asset-manager-atlas.webp)

### Écart

🟡 Pas de grille → pas de reconnaissance visuelle. Sur une liste de 40 PNJ, on lit
des lignes ; sur une grille, on **reconnaît** les portraits. C'est une vraie
amélioration de vitesse, pas de cosmétique.

🟡 Le spawn est en 3 temps (ouvrir un popover → choisir → cliquer sur la carte).
Atlas : double-clic, c'est fini. Et pour un groupe de 6 gobelins, on clique 6 fois.

🟡 Pas de collection / pas de tags / pas de multi-select. Nos cartes et PNJ sont un
tas plat.

🟢 **On a mieux qu'eux sur un point** : notre flow compendium → « ajouter à la
bibliothèque de PNJ » avec stats calculées est un vrai plus. À garder, à intégrer
au clic droit dans l'asset manager.

### Reco — P1 #7

Un `<AssetManager>` en overlay, onglets `Cartes` / `PNJ` / `Personnages`, grille de
thumbnails, avec :

- **double-clic = poser** (directement dans le viewport, comme Atlas) ;
- badge `− ×N +` pour le multiplicateur ;
- clic droit sur une vignette → « Appeoir sur la carte », « Éditer », « Épingler »,
  « Dupliquer », « Supprimer » ;
- recherche texte simple + filtre par tag (la syntaxe `keyword:value` est un
  surcoût non justifié à notre échelle — **20 PNJ, 10 cartes**).

**Ne pas virtualiser** la grille. `@tanstack/react-virtual` est prématuré ici.

Et garder `MapManager`/`NpcLibrary` comme implémentation de secours tant que
l'asset manager n'est pas prêt (feature flag côté `TableSettings`).

---

## 6. Le clic droit comme langage d'actions

### Atlas

Un context menu **par type d'objet** :

| Objet               | Menu                                                            |
| ------------------- | --------------------------------------------------------------- |
| Token               | context menu standard (déplacer, épingler, éditer, retirer…)    |
| Passe de brouillard | supprimer la passe, adjusting                                   |
| Mesure              | supprimer, changer la forme, la persistance                     |
| Pin                 | ouvrir, éditer, détacher, remplacer                             |
| Ligne de collection | spawn, edit token, link statblock, move to folder, tags, delete |
| Paroi / lumière     | éditer, split, supprimer                                        |

C'est le **levier de désencombrement** : si chaque objet a ses actions dans son menu,
l'écran n'a pas besoin de les exposer.

### Nous

**Un seul** context menu, sur un pion, MJ uniquement :

```
Dupliquer le PNJ / Retirer de la carte / Supprimer le PNJ
```

Fermeture sur `pointerdown`/`contextmenu` en phase **capture** (bon choix — ça
précède le drag d'un autre pion), `role="menu"`, items `.ctx-item`.

### Écart

🔴 **C7.** Tout ce qui n'est pas dans le menu contextuel doit être un bouton
permanent — d'où la barre chargée et les 4 boutons `−`/`+` de PV répétés dans
chaque carte de la sidebar compagnie.

🟡 Pas de clic droit sur la carte (vides), sur une image de carte, sur un repère, sur
une vignette du compendium, sur une ligne d'inventaire.

🟢 Notre closure en phase capture est un vrai bon détail, à garder tel quel.

### Reco — P0 #6

Un composant `<ContextMenu>` unique, et un clic droit sur **tout ce qui est
actionnable** :

| Cible                        | Menu                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pion                         | Appevoir / Déplacer vers / Dupliquer / Retirer / Supprimer / Lien compendium / **Apparaître dans le tableau de bord MJ** |
| Vide sur la carte            | Poser un repère / Poser une note / Mesurer ici / Lier cette zone à une carte / Recouvrir ici                             |
| Brouillard                   | Tout/controller recouvrir / Disséper / Revenir en arrière                                                                |
| Repère ⚑                     | Renommer / Supprimer                                                                                                     |
| Carte (dans l'asset manager) | Appeoir sur la carte / Appeoir dans une nouvelle table / Renommer / Réglages / Supprimer                                 |
| Vignette PNJ                 | Appeoir / Éditer / Enregistrer comme modèle / Supprimer                                                                  |
| Fiche compendium             | Partager au journal / + Bibliothèque de PNJ / Ouvrir dans un panneau                                                     |

⚠️ **Garde de sécurité.** Si une entrée de menu révèle l'existence d'un PNJ non
posé (ex. « apparaître dans le tableau de bord »), elle doit être **filtrée côté
serveur**. La règle reste : un PNJ n'existe pour un joueur que s'il a un pion
révélé (`AGENTS.md` §9).

---

## 7. L'initiative

### Atlas

Panneau vertical **96 px** à `top:50%; right:12px`, `max-height:
calc(100vh - 2*160px)`. Trois zones : controls / cards scrollables / turn controls.
Cartes de 48 px d'avatar + numéro + barre HP 4 px.

États : `--active` (bordure + glow **inset** + pulse 2 s), `--defeated`
(`opacity .45` + `grayscale(70%)` + crâne), `--drop-above/below` (ligne de 2 px),
`:active { scale(.96) }`.

Interactions : clic sur une carte → **recadrage caméra animé sur le token** ;
`Cmd+hover` → prévisualisation du statblock (fermeture au relâchement de Cmd) ;
badge d'instance si 2+ tokens partagent la même image ; auto-sync avec la carte
(chaque token est ajouté sauf retrait explicite).

`ArrowUp`/`ArrowDown` = tour précédent/suivant.

### Nous

Un **bandeau horizontal `.combat-bandeau`** qui **remplace** le header de carte.
Chips `score · nom`, `.active` en accent, rayons organic alternés. Phase `init` :
un bouton par personnage n'ayant pas lancé (accent) ou un `.waiting` dashed et
disabled (« X n'a pas encore lancé… ») — un tourniquet d'auto-roll où chaque joueur
clique pour son propre perso. Phase `run` : `round n` + « Tour suivant → ».

### Écart

🟡 Le bandeau horizontal est court : au-delà de ~8 combattants il déborde, et il
n'y a **aucune barre de vie**. On ne voit pas l'état de santé de l'ordre
d'initiative — il faut croiser avec la sidebar compagnie, c'est-à-dire promener le
regard.

🟡 **Le remplacement du header est un mauvais choix** : la carte change de hauteur
quand on passe en combat. Le HUD doit être stable.

🟡 Dérive de la hauteur entre `.combat-bandeau` et `.map-header`.

🟢 Le **tourniquet d'auto-roll** est une bonne idée que nous avons et qu'ils n'ont
pas. À garder.

### Reco — P1 #10

Passer à un panneau vertical à droite (comme Atlas), ancré comme la barre d'outils
(donc **stable**, ne remplace rien). Garder le tourniquet d'auto-roll. Ajouter :

- barre de vie sur chaque carte, seuils `≥70` vert / `30-69` jaune / `<30` rouge ;
- **`ArrowUp`/`ArrowDown`** pour changer de tour (indispensable en jeu) ;
- **clic sur une carte → recadrage caméra** sur le token (voir §`04-game-feel.md`) ;
- état `defeated` (grayscale + opacité).

---

## 8. Les dés

### Atlas

**Bac à dés** (popover) : grille de 7 dés, **clic gauche = ajouter, clic droit =
retirer**, badge de compteur qui se ré-anime (`key={count}`), tooltip « D20 • Left:
add • Right: remove ». `DiceFormulaBar` reconstruit la formule en direct
(`count > 1 ? "2d8" : "d8"`, joints par `" + "`).

**Résultat** : un **toast HUD** dans un coin, pas un plein écran.

- Portrait du token avec anneau, nom de la source, nom de l'abil, formule, **total
  en héros à droite**.
- 350 ms d'entrée, 7 s d'affichage, 300 ms de sortie.
- Le total « atterrit » : `scale(1.8) blur(6px)` → `scale(.94)` → `scale(1)`.
- Le glow retombe de 14 px à 6 px.
- Ornement SVG de nœud celtique, réutilisé par `<use>` sur les 4 coins.
- Classes `--crit-success` / `--crit-fail`.

**Journal de dés** : panneau épinglable (`isPinned` désactive la fermeture outside
et `Escape`), style chat, avatar, heure relative recalculée toutes les 10 s
(« just now / 12s ago / 5m ago / 2h ago »), résumé `formule = total`, badges
détail dépliables, bouton « Roll again ».

**Dans la fenêtre joueur** : le même toast, mais qui tombe **du haut au centre**,
parce que la fenêtre est une « drag region » (`-webkit-app-region: drag`) et les
toasts doivent remettre `no-drag`.

### Nous

- 6 boutons rapides dans le `session-bar` (`d4 d6 d8 d10 d12 d20`, d20 en accent).
- Onglet « Dés » du panneau droit : modificateur, grille 3 colonnes, encart
  « Astuce », historique local des 6 derniers.
- `DiceOverlay` : **dé plein écran**, faces qui défilent toutes les 75 ms,
  `clip-path: polygon(...)` par type, double couche tranche, `rotation` ±5°, puis
  le total dans un « cartouche ». **Durée 3 200 ms + 1 700 ms de maintien.**

### Écart

🔴 **Notre animation de dé est magnifique et elle est au mauvais endroit.** 3,2 s de
plein écran pendant que le MJ joue, c'est une **coupure de la partie**. Atlas met
350 ms + 7 s d'un toast dans un coin : la table reste jouable pendant que le
résultat s'affiche.

🟡 Pas de nom de la source ni de l'abil dans le résultat → sur un `2d8+3`, on ne
sait pas de quoi il s'agit.

🟡 Pas de détail des dés individuels dans le toast (le journal en a, mais il faut
ouvrir l'onglet).

🟢 Nos polygones de dé sont un vrai travail, à garder — en version **compacte**.

### Reco — P2

Remplacer `DiceOverlay` plein écran par un **toast de jet** :

- coin bas-droite (le `session-bar` est en haut, le journal à droite → le jet va
  en bas-droite) ;
- portrait + nom de la source + formule + total en héros ;
- 350 ms d'entrée, 6 s, 300 ms de sortie ;
- clic = dismiss ;
- garder `DiceOverlay` comme **animation de la carte** (le dé apparaît près du pion
  qui a rollé), pas comme écran bloquant.

Et un vrai `DiceRollLog` épinglable, avec « Roll again ».

---

## 9. Les widgets (horloge, timers, compteurs)

### Atlas

`ResponsiveWidgetBar` en haut-droite : un widget par carte, gap 8, `z-index: 50`
(_« below the asset manager (100) »_).

Trois types : **compteur** (`[−] valeur [+]`, la valeur est un `<span class=
editable>` qui devient un input au clic, min 0 / max 99), **horloge de progression**
(SVG à secteurs cliquables — cliquer un secteur le remplit jusqu'à celui-là,
`role="img"` + `aria-label` généré, secteurs séparés par un `stroke` pour « lire
comme des morceaux coupés »), **timer** (`[⏵/⏸] M:SS [↺]`, lecture **dans le
store** pour que la vue joueur suive sans timer local, expiration → `playTimerDing()`

- flash `timer-expired` en `--text-error` pendant 3 s, édition tolérante
  `M:SS`/`MM:SS`/`H:MM:SS`/`0200`/`130`/`5`).

Auto-repli après **4 s**, adressage clavier **maintenir `1`-`5`** puis `+`/`-`/
`Space`/`r`, synchronisation inter-vues avec pulse à intensité empilable.

### Nous

Rien. Le `session-bar` a déjà : titre, mode, lien compendium, 6 dés rapides,
séparateur, présence.

### Écart

🟡 Un MJ qui veut « 4 minutes 32 secondes » n'a nulle part où l'afficher. C'est un
besoin réel de séance. Le timer est aussi le moyen le plus simple de faireDu
« rythme » dans une partie.

### Reco — P2

Une barre de widgets en haut-droite, repliée après 4 s, avec compteur / horloge /
timer. C'est ~300 lignes et c'est le morceau le plus « facile à aimer » de toute la
liste P2.

⚠️ Attention : ces widgets sont **par joueur et par carte**, donc

- affichage → `localStorage` (préférence), valeur → elle est **partagée** (horloge
  de combat), donc valeur via le DO ;
- le timer doit être **décompté côté serveur** ou resynchronisé, sinon chaque
  navigateur a son propre « 0 ».

---

## 10. Brouillard et vision

### Atlas

- Brouillard **modèle par opérations** (1115 lignes) : chaque passe de peinture a
  son propre sprite, sélectionnable et **supprimable via le context menu**. Les
  effacements sont des trous extraits par composantes connexes (cellules 2 px,
  seuil alpha 12, max 320 rectangles).
- Modes : **brosse / lasso / rectangle**. Curseur de brosse dédié.
- `fogContainer.interactiveChildren = false` → le brouillard ne vole jamais les
  événements.
- `resolveFogPreviewAlpha: isPlayerView ? 1.0 : (isGMView ? 0.5 : 1.0)` → en
  « Session view », le MJ voit **exactement** ce que voient les joueurs.
- `FogOfWarRenderer` se désabonne automatiquement au changement de carte.
- **Vision réelle** : `visionGeometry.ts` (primitives pures),
  `radialSweep.ts` (balayage radial, ombres portées), sources de vision en
  **unités de jeu** converties en pixels monde, murs point-à-point avec lumières.

### Nous

- Canvas 2D, rendu de qualité (cf. `02` §2.6) mais **un seul modèle** : la carte
  entière est un bitmap de trous découpés.
- Un seul mode :qd brushesqi + glisser.
- Opacité MJ 0.45 / joueur 1 (l'équivalent de leur `isGMView`).
- `Tout recouvrir` / `Dissiper`.

### Écart

🟡 **Pas d'undo.** On ne peut pas défaire une zone qu'on aURSORake par erreur — et
c'est l'erreur la plus fréquente. (`AGENTS.md` §7 liste P3/undo comme restant.)

🟡 Pas de lasso ni de rectangle →plier du brouillard dans une pièce est pénible.

🟡 Pas de curseur de brosse visible (on ne sait pas où on-va peindre).

🟡 **Pas de « voir ce que voient les joueurs » explicite.** L'opacité 0.45 est
approximative ; Atlas a un **mode** dédié.

🟡 Pas de vision (murs, lumières, ligne de vue). C'est un gros manque mais c'est une
fonctionnalité, pas de l'UX — et elle est **hors périmètre d'un chantier
d'UX/UI**.

### Reco — P1 (undo) / P2 (le reste)

1. **Historique du brouillard** : on ne peut pas s'appuyer sur le canvas. Il faut
   que le serveur/journal conserve une liste d'**opérations** (mode, points, taille)
   plutôt que des pixels. C'est un changement de **modèle de données** dans le DO →
   à faire en même temps que l'undo transactionnel, pas après.
2. **Bouton droit sur la carte** → « Revenir en arrière sur le brouillard », et un
   mode « voir ce que voient les joueurs ».
3. Curseur de brosse en cercle suivant le pointeur, taille visible.
4. Lasso et rectangle : utilement, moins critique.

---

## 11. Raccourcis et aide

### Atlas

Une **table déclarative** de 88 lignes (`mapHotkeys.ts`) avec
`{id, label, group, defaultKey, dmOnly?, …}`, 5 groupes, ~30 raccourcis.

Le partage de touche est **explicitement autorisé** (`canShareHotkey`) : `v` sert à
move _et_ laser, `m` cycle 3 mesures, `Space` sert à la palette _et_ au timer tenu.
`cycleTool(family, activeTool)` gère le cycle.

`hotkeyFromEvent` est layout-aware : normalise `' '` → `Space`, minuscule les
caractères simples, **préserve `Shift+1`** via `event.code`, respecte
`isComposing`. `matchesHotkey` refuse `event.repeat`.

Persistance : **seuls les écarts aux défauts** sont stockés, avec un état
`displaced` qui **explique** plutôt que de bloquer.

`HotkeyHelp.tsx` : aide générée depuis la même table, filtrée par rôle, en `<dl>`
avec `<kbd>`, + une section manuelle « Navigation & interactions ».

### Nous

Un handler `onWindowKeydown` de ~40 lignes dans le fichier de 2 285 lignes.
`Échap`, `/`, `0`, `H`, `V`, `P`, `R`, `B`, `1`-`6`. Les raccourcis ne sont écrits
que dans des `title=` (« Raccourci : H —glisser pour déplacer la carte »).

Aucun groupe, aucune aide, aucun remappage, aucune gestion de conflit. Et le
handshake `IGNORED si metaKey/ctrlKey/altKey` est un blunt instrument.

### Écart

🟡 **Un nouveau joueur ne peut pas découvrir les raccourcis.** Il faut survoler
bouton par bouton. Et les `title=` sont le seul canal.

🟡 `1`-`6` pour les dés et `V/P/R/B` pour les outils : si on ajoute des widgets
adressables au clavier (comme Atlas), ça entre en conflit. Il faut donc décider
maintenant.

### Reco — P1 #12

Extraire `web/src/lib/hotkeys.ts` : une table déclarative, groupée, avec `mjOnly`,
une aide `?` générée depuis la même table, et la gestion des conflits.
**C'est le préalable obligatoire à la command palette** (elle doit pouvoir dire
« ouvrir les réglages (grille) », et savoir quels raccourcis sont pris).

---

## 12. Feedback, micro-interactions, undo

### Atlas

- **Press states** : `scale(0.96)` sur les boutons toolbar (160 ms ease-out),
  `0.95` sur les boutons icon, `0.97` sur les boutons modaux, `0.9` sur les
  contrôles widget, `0.98` sur les items de palette. **Désactivés sous
  `prefers-reduced-motion`.**
- **Tokens de motion centralisés** (`utils/motion.ts`) : `PANEL_ENTER_FROM =
translateY(8px) scale(0.97)`, `PANEL_EXIT_TO = translateY(4px) scale(0.98)`,
  `220/180 ms`, ease `cubic-bezier(.23,1,.32,1)`. `prefersReducedMotion(node)`
  utilise `node.win.matchMedia` (**le bon window**, important pour les popouts).
- **Sorties asymétriques** : la palette sort en 110 ms et entre en 160 ms
  (_« leaves quicker still »_).
- **Scrollbars** : le pouce est `transparent` au repos et transitionne via un
  `@property` ; **sa place reste réservée** → le contenu ne bouge jamais.
- **Undo transactionnel** : `beginTransaction`/`endTransaction`/`transaction`/
  `untracked`, **nestable**, `HISTORY_LIMIT = 50`, et un pas n'est poussé que si le
  snapshot a réellement changé. Les sliders sont debouncés à 100 ms → un drag = un
  pas.
- `MapLoadingOverlay` rendu **en dernier**, jamais démonté, message qui **crossfade
  en place** (`blur(2px)` → 0, `y: ±4px`), barre de progression en
  `transform: scaleX(p/100)`, timings partagés avec le canvas via des variables CSS.

### Nous

- Pas de press states (les boutons ne réagissent pas au clic).
- Pas de `prefers-reduced-motion` : `hdPing`, dice, `.qp` tournent
  inconditionnellement.
- Aucun token de motion. Chaque animation est écrite à la main dans son composant.
- `UndoRedoControls` : **inexistant**. Aucun undo/redo côté MJ.
- Le chargement : `<p class="muted">…</p>`.
- Toast unique, bas-centre, 4 s.

### Écart

🔴 **Pas d'undo.** C'est le manque le plus coûteux en usage réel. Un MJ qui a mal
déplacé 5 pions, mal couvert une zone, supprimé un PNJ par erreur — il doit
refaire. Sur une table de jeu, ça casse la partie.

🟡 Pas de press states → l'interface paraît inerte.
🟡 Pas de `prefers-reduced-motion` → problème d'accessibilité ET de confort.
🟡 Animations non centralisées → impossible de garder un rythme cohérent.
🟡 Toast unique, pas réutilisable, absent des autres écrans.
🟡 Aucun squelette de chargement.

### Reco — P1 (undo) / P2 (le reste)

**L'undo est le chantier le plus sérieux du lot.** Il faut :

1. côté `shared/` : un type d'**opération inverse-able** par entité
   (`token.move`, `token.add`, `token.remove`, `fog.paint`, `marker.add`,
   `map.settings`) ;
2. côté `api/` : une route `POST /api/campaigns/:id/undo` qui applique l'opération
   inverse **dans le DO** et la diffuse comme n'importe quelle mutation ;
3. côté client : une pile locale de 50 pas, uniquement pour l'affichage de
   l'état des boutons ; **c'est le DO qui est la source de vérité** (les autres
   navigateurs voient l'annulation arriver par le flux normal).

Point d'attention : l'undo doit **respecter la visibilité des PNJ**. Annuler
« supprimer un PNJ » ne doit pas révéler son nom à un joueur qui ne le voyait pas.

---

## 13. Onboarding

### Atlas

`Tutorial.tsx`, plusieurs tours à `id`, avec **spotlight** : rectangle `rect ± 4px`
posé sur l'élément ciblé, ou voile sombre si le sélecteur ne trouve rien. La carte
se place autour de la cible, **re-mesurée toutes les 200 ms** (_« follow the asset
manager's entrance and resizes without assuming a fixed layout »_). Eyebrow
`« Label · 1 / N »`, `Skip`/`Back`/`Next` + **action finale qui fait l'action**
(« Create collection » crée vraiment). Focus trap, `aria-modal`, mémorisé une fois
par tour.

### Nous

Les états vides (excellents) font un travail proche, mais il n'y a **aucun tutoriel
ciblé**. Rien ne montre la barre d'outils au premier lancement.

### Reco — P2

Un tutoriel ciblé en 4 étapes pour le **MJ** : barre d'outils → asset manager →
brouillard → palette. Conditionné à « première table MJ ouverte » (un drapeau dans
`localStorage`, pas dans les settings de campagne — c'est une préférence
d'affichage).

Réutilisable tel quel : le pattern de spotlight n'a besoin que d'un `selector` et
d'un `Rect`.

---

## 14. Responsive et accessibilité

### Atlas

Desktop only, explicitement. Mais le code est **responsive-correct** : 6 breakpoints
dans les tokens, `corner-shape`, `cqw`/`cqh` pour lire la taille du conteneur, et
chaque animation a son pendant `prefers-reduced-motion`.

`useKeepInView` gère le dépassement d'un popover hors du bord de la **vue** (pas de
la fenêtre), parce que Obsidian met `contain: strict`.

### Nous

**1 seul media query** dans tout `web/src`. La table est
`height: 100vh` + grille à largeurs fixes → inutilisable sur téléphone.

Accessibilité : les rôles existent, mais **pas de focus trap, pas de retour de
focus, pas d'`aria-live` sur le journal, pas de `:focus-visible`, pas de
`prefers-reduced-motion`, pions non focusables** (aucune navigation clavier sur la
carte).

### Écart

🔴 **Sur mobile, la table est inutilisable.** Et notre cible (un groupe qui se réunit
le soir) est majoritairement sur téléphone.

🟡 Le canvas de brouillard n'a aucun équivalent accessible, les pions ne sont pas
focusables : un joueur qui utilise un clavier ne peut pas jouer.

### Reco

- **Responsive** : c'est une conséquence directe du §1. Une couche map plein écran +
  des panneaux flottants est **naturellement** adaptatif : sur petit écran, les
  panneaux deviennent des feuilles qui montent du bas (bottom sheet), la barre
  d'outils se réduit au strict nécessaire. C'est un argument de plus pour faire le
  §1 — pas un chantier séparé.
- **Accessibilité** : focus trap + retour de focus dans les modales (P0, car on va
  en créer beaucoup), `aria-live="polite"` sur le journal, `:focus-visible` global,
  `prefers-reduced-motion` global, pions focusables avec déplacement au clavier
  (flèches + `Maj` pour plus vite).

---

## 15. Récapitulatif des écarts

| Axe                   | Gravité            | Reco                             |
| --------------------- | ------------------ | -------------------------------- |
| §1 Layout / couches   | 🔴 P0              | #1 carte plein écran             |
| §2 Barre d'outils     | 🔴 P0              | #3 barre ancrée + fit            |
| §3 Command palette    | 🔴 P0              | #4 palette                       |
| §6 Clic droit         | 🔴 P0              | #6 clic droit partout            |
| §12 Undo              | 🔴 P1              | transactionnel                   |
| §4 Surfaces           | 🔴 P1              | `<Surface>` + `<Panel>`          |
| §5 Asset manager      | 🟡 P1              | grille + spawn par double-clic   |
| §7 Initiative         | 🟡 P1              | panneau vertical + barres de vie |
| §11 Raccourcis        | 🟡 P1              | table déclarative + aide `?`     |
| §8 Dés                | 🟡 P2              | toast au lieu du plein écran     |
| §10 Brouillard        | 🟡 P2              | undo d'abord, lasso ensuite      |
| §9 Widgets            | 🟡 P2              | barre de widgets                 |
| §13 Onboarding        | 🟡 P2              | tutoriel ciblé                   |
| §14 Responsive / a11y | 🔴 P0 (responsive) | conséquence du §1                |
