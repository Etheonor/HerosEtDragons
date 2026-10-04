# 04 — Le « game feel » : ce qui fait que ça ressemble à un jeu

Ce fichier isole ce qui ne relève pas de la « mise en page » mais de la
**représentation du jeu**. C'est ce que l'utilisateur a cité en premier
(« plus axé sur la map », « leur interface est 100x mieux »), et c'est ce qui
distingue un VTT d'un tableur partagé.

---

## 1. Les pions sont des objets de jeu, pas des divs

### Atlas

Un pion est un objet qui a un **état diégétique** — l'information est _sur_ le pion,
pas dans un panneau latéral :

- **Barre de vie intégrée** sous le portrait, 4 px, seuils :
  `≥70 %` vert · `30-69 %` jaune · `<30 %` rouge.
- **Numéro d'initiative** en pastille, en haut.
- **Badge d'instance** affiché seulement si 2+ tokens partagent la même image.
- **Nom** affiché en nameplate (réglable).
- **Barre de ressource secondaire** (« stress » dans Daggerheart) — la clé persistée
  s'appelle `showStressBars` mais l'UI dit « secondary » pour rester agnostique au
  jeu.
- États visuels : `--defeated` (`opacity .45` + `grayscale(70%)` + overlay crâne).
- **Clic sur la carte d'initiative → recadrage caméra animé + highlight du pion.**

Et surtout : **chaque token de la map est automatiquement ajouté à
l'initiative** (sauf retrait explicite), avec HP/ressources lus depuis le
statblock lié et resynchronisés à chaque changement.

### Nous

- `div.token` en `left/top` %, `transform: translate(-50%,-50%)`.
- Portrait webp, sinon initiale du nom en `.token-label` **sous** le pion.
- `.token-active` = double halo (3 px fond, 6 px accent).
- `title` contextuel : le MJ voit `nom — CA n · PV x/y`, le joueur le nom.
- La **barre de vie est dans la sidebar compagnie**, pas sur le pion.

### Écart

🔴 **Le MJ ne peut pas lire l'état de sa table.** Pour savoir qui va mal, il faut
promener le regard sur la colonne de gauche. En plein combat, avec 6 PNJ, c'est
impossible.

🟡 La taille du pion est un réglage global unique (`tokenSize`, 32 px par défaut),
indépendante de la grille. Un gobelin est donc aussi gros qu'un dragon.

🟡 Pas de numéro d'initiative sur le pion → il faut croiser avec le bandeau.

🟡 Pas d'état « mort / assommé / prone » visuel.

### Reco — P0 #5

Sur le pion, dans cet ordre d'importance :

1. **Barre de vie sous le portrait** (4-5 px), seuils Atlas
   (`≥70` vert / `30-69` jaune / `<30` rouge), visible seulement si on a le droit
   de la voir — **donc pilotée par la même règle serveur que le reste**.
2. **Numéro d'initiative** en pastille quand le combat est actif.
3. **État** : `grayscale(70%)` + `opacity .5` quand PV à 0, un voile quand il y a
   des conditions adaptées (`dead`, `unconscious`, `prone`, `blinded`… — les
   conditions viennent déjà du protocole, `CONDITIONS` est déjà dans le code).
4. **Nameplate optionnel** (réglage dans la palette).
5. **Taille liée à la grille** : `tokenSize` devient une **multiplicatrice de case**
   (1 case = `gridSize` px, le pion fait `n × gridSize`), avec une valeur par
   type de token (perso = 1 case, petit PNJ = 0,75, gros = 2). C'est une seule
   ligne de calcul et ça change complètement la lisibilité d'une carte.

⚠️ **Le point 1 et 5 touchent au modèle de données.** Les PV sont déjà dans
`TableState.tokens` (`{charId, x, y}`) — il faut y ajouter `hp`/`hpMax` visibles, ou
les lire depuis `tableStore.characters` (ce qui est déjà fait pour la taille).
Donc **faire attention à ne pas diffuser les PV d'un PNJ non révélé** : c'est
exactement le piège que documente `AGENTS.md` §9 (B5).

---

## 2. Les liens entre cartes — « le HTML des maps »

### Atlas

Une carte peut pointer vers une autre carte, par **zone**. Le clic sur la zone
charge l'autre carte ; le clic inverse revient.

Implémentation chez eux : ce sont des **tokens** comme les autres, avec un type
particulier. `tokenSpawnService` gère la spawn ; le lien est un token dont le
`statblockPath`/champ pointe vers une autre `.atlasmap`. Sur la carte, on voit
l'icône et le nom de la scène cible.

Ce n'est pas une feature isolée : c'est ce qui fait qu'une **carte est un lieu**,
pas un fond. Le joueur clique sur la porte et la pièce suivante s'ouvre. C'est le
mécanique de base d'un jeu d'aventures, et nous ne l'avons pas.

### Nous

Rien. Une carte est une image. Le passage d'une carte à l'autre passe par
`MapManager` → popover → clic sur un nom.

### Écart

🔴 **On ne peut pas jouer un donjon.** Sans liens de zones, le seul workflow est :
ouvrir le panneau des cartes, cliquer, fermer. Le « jeu » est rompu à chaque
transition.

🟡 Le popover `MapManager` est à chaque fois une opération d'interface, pas un
geste de jeu.

### Reco — P1 #9

**Le modèle.** Un lien de zone est une entité de première classe, pas un token :

```ts
type MapLink = {
  id: string;
  mapId: string;
  x: number;
  y: number; // % de la surface, comme les tokens
  w: number;
  h: number; // taille en cases
  targetMapId: string;
  targetX?: number;
  targetY?: number; // point d'arrivée dans la carte cible
  label?: string;
  kind: "door" | "stairs" | "region" | "portal";
  oneWay: boolean;
};
```

Il vit dans le **même snapshot que les tokens**, donc il suit la même mécanique de
sync que tout le reste.

**L'UI.**

- Icône de lien posée sur la carte (glyph `game-icons` déjà crédités dans leur
  NOTICE — nous on peut utiliser Lucide, plus sobre) + **label visible** au
  survol.
- **Clic droit sur le lien** → « Ouvrir », « Aller à », « Lien retour », « Modifier
  la cible », « Supprimer ».
- **Lien retour automatique** : quand on arrive par un lien, on en affiche un
  « ← retour » à la position d'arrivée. Sinon le joueur est perdu.
- **Onglet « Liens » dans l'asset manager** : la liste des zones de la carte
  courante, avec un bouton « aller ».
- Le **panneau d'ouverture de carte** d'Atlas peut être imité : au chargement d'une
  carte, un overlay « brief » avec le nom de la carte et les notes du MJ qui y
  sont épinglées (cf. §3). C'est le moment naturel pour poser l'ambiance.

**Effet de jeu.** Si le lien est un portail, on peut déclencher un son et un
flash. Sinon, un simple fondu.

⚠️ Cette feature touche au DO : nouveau type d'entité dans `TableState`, nouveau
handler WS, et une **règle de visibilité** (un lien vers une carte ne doit pas
révéler son nom aux joueurs — c'est une info de structure de campagne).

---

## 3. Les notes dans la carte

### Atlas

Trois mécanismes distincts :

| Mécanisme                                | Ce que c'est                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pin de note** (`NotePinTool`)          | On épingle une **note Markdown du vault** ou une autre carte Atlas à un point de la carte. Hover = preview fantôme qui suit le curseur. Clic = flyout DOM (palette d'icônes + recherche de notes). L'icône par défaut est **mémorisée** pour la prochaine fois. Sur grille hex, un pin peut se lier à un hex et le suivre si la grille est réalignée. |
| **Note liée à la carte** (`dmNotePath`)  | Une note ouverte **dans un panneau**, avec **édition Markdown complète** (c'est une vraie feuille Obsidian détachée, avec autocomplétion de liens Obsidian).                                                                                                                                                                                          |
| **Preview au survol** (`Cmd/Ctrl+hover`) | Sur les pins **et** les tokens. `IPreviewWindow` = pin / open / edit. Z-index plafonné à 45 pour rester sous l'asset manager. Les previews **épinglées sont sauvegardées avec la carte** et rouvrent à leur place.                                                                                                                                    |

Le **GM dashboard** (`Tab`) regroupe : à gauche tous les statblocks des tokens de
la scène, à droite la note liée — en colonnes masonry adaptatives.

![Notes liées Atlas](../assets/03-notes-liees-atlas.webp)

### Nous

`api.notes` existe dans le client REST. `MapManager` a une section « notes MJ ».
Rien n'est épinglé sur la carte.

### Écart

🟡 La préparation de séance est dans un panneau popover → c'est du texte dans un
panneau, pas un objet dans le monde.

🟡 Survol un PNJ = rien. On ne peut pas « lire la fiche » sans cliquer et sans
ouvrir le compendium dans un nouvel onglet.

🟡 Pas de description de lieu affichable au moment où le joueur l'atteint.

### Reco — P2 (pins) / P1 (aperçu au survol)

Deux niveaux, par ordre de rapport valeur/charge :

**Niveau 1 — aperçu au survol (`Cmd/Ctrl+hover` sur un pion).** Un popover avec :
portrait, nom, CA, PV, conditions, et un extrait du compendium si le PNJ en a un.
C'est ~150 lignes, réutilise `CompendiumTooltip` qui existe déjà, et c'est le
geste « videogame » par excellence.

**Niveau 2 — notes épinglées.** Un pin = `{mapId, x, y, icone, label, noteRef}`
où `noteRef` est soit un `slug` du compendium, soit un `NpcTemplate`, soit un
texte libre. Au survol → aperçu ; au clic → panneau épinglable avec la note
rendue. Si la note est éditable, on réutilise `markdown-lite.ts` en mode édition.

**Niveau 3 — panneau d'ouverture de carte.** Quand une carte est chargée, si elle
a une description épinglée, l'afficher dans un overlay non-modal 4 s, ou le laisser
dans le panneau de notes. Simple et très « jeu ».

---

## 4. La caméra : un objet, pas un `transform`

### Atlas

- `viewport.setZoom()` **puis** `moveCenter()` — l'ordre est documenté et obligatoire.
- `vp.animate({time: 400, ease: 'easeInOutCubic'})` pour `fitMap` et `zoomToToken`.
- `clampZoom({minScale: 0.1, maxScale: 5})`.
- Fit = padding 0.9 (90 % du viewport).
- **État de caméra par onglet**, sauvegardé dans `viewportCache: Map<tabId, {centerX, centerY, scale}>`.
- Décélération maison après un pan (`SmoothDecelerate`).
- La caméra est **sauvegardée** avec la scène (donc restaurée au retour sur l'onglet).

### Nous

- `viewZoom` (0.5 → 8), `viewPanX/Y` en `$state` local.
- Zoom molette : `Math.exp(-e.deltaY * 0.0015)`, ancré au curseur. ✅ bon
- `clampView()` avec `VIEW_SLACK = 0.2`. ✅ bon
- Pan : 3 gestes, dont clic droit / molette. ✅ bon
- **Aucune animation.** Passer de 145 % à 60 % est un saut.
- **La caméra n'est ni un objet ni persistée.** Elle est perdue au rechargement.

### Écart

🟡 Un saut de zoom, c'est une désorientation — et c'est le geste le plus fréquent
de la partie, donc le plus désagréable.

🟡 Charger une carte nous met à 100 % : on perd le cadrage.

### Reco — P1 #11

Créer un objet `<Camera>` dans le front qui encapsule tout :

```ts
type CameraState = { x: number; y: number; zoom: number };
// get() / set() / fitMap(rect, opts) / zoomToPoint(pt, opts) / centerOn(pt)
// tous avec animation par défaut (400 ms, easeInOutCubic), `instant: true` pour les gestes
```

Le reste de l'app ne manipule plus `viewZoom/viewPanX/viewPanY` directement.
Trois bénéfices : les animations tombent gratuitement partout, le **cadrage d'un
pion devient une API** (donc le clic sur une carte d'initiative, ou sur un
ping-joueur, devient trivial), et on peut **sauvegarder/restaurer** le cadrage par
carte (`localStorage`, préférence d'affichage — pas de problème de persistance
serveur).

⚠️ Ne pas casser le contrat actuel « chaque joueur a son propre cadrage » : le
`<Camera>` reste purement local, et c'est une fonctionnalité à garder (cf. `02` §9).

---

## 5. Le brouillard comme tool, pas comme mode

### Atlas

`FogTool` est un **petit module d'état pur** (57 lignes) qui émet via un `EventBus`.
Trois modes (brosse / lasso / rectangle), taille de brosse 10-200 (défaut 50),
`F` qui cycle brouillard ↔ gomme.

La **gomme** est un outil séparé à part entière (`e`), pas un mode du brouillard :
c'est un outil du même groupe que le stylo et le tampon.

### Nous

`tool === 'fog'` + un booléen `fogOn` qui active/désactive. Un seul mode.

### Écart

🟡 On ne peut pas effacer une zone de brouillard. C'est l'erreur la plus fréquente
et il n'y a aucun retour en arrière.

### Reco — voir `03-axes-ux-ui.md` §10 et `07-parcours-implémentation.md`

L'undo du brouillard est le **vrai** chantier ; l'outil gomme est cosmétique à côté.

---

## 6. Le temps de la partie

### Atlas

Des widgets dédiés : horloge de progression (segments cliquables), minuteur, compteurs.
Auto-repli après 4 s, adressables au clavier, synchronisés entre fenêtres.

### Nous

Rien.

### Reco — P2

Voir `03-axes-ux-ui.md` §9. Un minuteur + 2-3 compteurs, c'est 300 lignes et ça
donne un rythme à la partie.

Point d'architecture : **la valeur vit dans le DO** (elle doit être vue par tous
et par la vue joueur), le **repli après 4 s est local**. Et le décompte doit venir
du serveur, sinon chaque navigateur a son propre zéro.

---

## 7. Le son

### Atlas

`AudioTool` (spatialisé depuis le vault, réglages par défaut inner 300 / outer 600 /
volume 0.8), `diceRevealSound.ts` avec un **délai aligné sur l'animation du
total**, les dés, l'ambiance.

### Nous

Rien. Et c'est très bien ainsi — nous n'avons pas de vault, donc pas de source
audio gratuite, et ajouter de l'audio est un sujet à part entière (hébergement
R2, licences).

### Écart

🟡 Aucun. C'est un manque réel mais **hors périmètre d'un chantier d'UX/UI**. On le
note pour plus tard.

Le seul élément de feedback sonore à considérer à court terme : un son très court
sur le résultat de dé, pour le rythme. Mais c'est un upload + une licence.

---

## 8. Récapitulatif

| Élément                                          | Gravité | Ce que ça change                                    |
| ------------------------------------------------ | ------- | --------------------------------------------------- |
| **Pion vivant** (barre de vie, initiative, état) | 🔴 P0   | Le MJ peut enfin lire sa table sans bouger les yeux |
| **Taille des pions liée à la grille**            | 🔴 P0   | Une carte devient lisible au lieu d'être décorative |
| **Liens entre cartes**                           | 🔴 P1   | On peut jouer un donjon                             |
| **Caméra animée**                                | 🟡 P1   | Zéro désorientation ; API pour recadrer sur un pion |
| **Aperçu au survol**                             | 🟡 P1   | Le geste « videogame » par excellence               |
| **Notes épinglées**                              | 🟡 P2   | La préparation de séance vit dans le monde          |
| **Undo du brouillard**                           | 🟡 P1   | On peut se tromper                                  |
| **Widgets de temps**                             | 🟡 P2   | Rythme de partie                                    |
| **Son**                                          | ⚪ P3   | Hors périmètre                                      |
