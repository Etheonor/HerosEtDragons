# Atlas VTT ↔ RollWith H&D — benchmark UX/UI

**Objet.** État des lieux complet d'Atlas VTT, différentiel avec RollWith H&D, et
recommandations priorisées pour refaire l'UX/UI de l'application en visant une
interface **de jeu** plutôt qu'une interface web.

**Date.** 30 septembre 2026.
**Sources.** `~/Documents/Git/atlas-vtt` (v0.4.2, AGPL-3.0-only) et
`RollWithv2` au commit `42af3fb`.

> **Note licence.** Atlas est sous AGPL-3.0-only. Le projet RollWith est privé,
> non distribué, et son auteur a explicitement validé l'usage de ce qui l'intéresse.
> Ce document reste néanmoins rédigé en **description de patterns et d'intentions**,
> pas en copie de code : c'est plus utile pour la suite (on réécrit dans notre
> idiome Svelte) et ça évite d'accrocher une dépendance insoutenable.

> **Cible d'usage : PC de bureau, grand écran, clavier-souris.** Décidé le
> 30/09/2026. Il n'y a **aucun chantier responsive** dans ce dossier, et aucune
> recommandation n'est faite pour le tactile. Voir `07-parcours-implémentation.md`
> §Lot 9.

---

## 0. Où on en est — résumé des décisions et des validations

> À lire avant tout le reste. Cette section est la **synthèse de ce qui a été
> décidé et vérifié** depuis l'ouverture du dossier. Le reste du README détaille.

### Les décisions

| Décision                    | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Où          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Direction artistique**    | Hybride : **structure Atlas, peau carnet**. On prend la densité, la hiérarchie et les patterns d'Atlas ; on garde l'identité encre/papier, les rayons organic et la typo Vidaloka.                                                                                                                                                                                                                                                                                                                       | §3          |
| **Cible d'usage**           | PC de bureau, grand écran, clavier-souris. **Aucun chantier responsive.** Le seul point conservé est la hauteur (`100vh` → `100dvh`), qui mord même sur un 1440p.                                                                                                                                                                                                                                                                                                                                        | `07` §Lot 9 |
| **Librairie d'UI**          | `bits-ui` 2.19.3, adoptée et **validée sur trois moteurs**.                                                                                                                                                                                                                                                                                                                                                                                                                                              | §6bis       |
| **Rendu de la carte**       | **DOM**, pas WebGL. Le débat est documenté, avec porte de sortie (`<MapLayer>` isolé).                                                                                                                                                                                                                                                                                                                                                                                                                   | `05` §6     |
| **Licence**                 | Atlas est AGPL-3.0-only. Le projet est privé et non distribué ; l'usage de ce qui intéresse est assumé. Ce dossier reste une description de patterns, pas une copie de code.                                                                                                                                                                                                                                                                                                                             | en-tête     |
| **États des lignes**        | Une ligne cliquable (initiative, inventaire, listes) réagit au survol : fond éclairci **+ liseré accent**. L'état actif garde sa barre gauche rouge.                                                                                                                                                                                                                                                                                                                                                     | `06` §7.3   |
| **Taille des pions**        | `tokenScale` par personnage, en cases (multiplicateur de `gridSize`) ; repli sur `tokenSize` px si la carte n'a pas de grille. Réglage MJ dans la Compagnie.                                                                                                                                                                                                                                                                                                                                             | `04` §1     |
| **PV des PNJ (vue joueur)** | Barre **absente** quand le serveur masque les PV (`pnjPvVisible=false`) ; le MJ les reçoit toujours. Le réglage de campagne fait office d'option MJ.                                                                                                                                                                                                                                                                                                                                                     | `04` §1     |
| **Undo**                    | Pile **dans le DO** (source de vérité, 50 pas, persistée), annulation = mutation normale journalisée + diffusée. **Un geste = un pas** (drag de pion/repère, trait de brouillard). Réservé MJ ; les clients ne reçoivent que `canUndo`/`canRedo` (jamais la pile). `map.settings` (REST) reste hors périmètre.                                                                                                                                                                                           | `03` §12    |
| **Panneaux flottants**      | Shell unique `<Panel>` : drag par l'en-tête, 8 poignées de resize, snap aux bords, z-order partagé **sous `--z-overlay`** (les popovers legacy restent au-dessus), persistance **en fraction du viewport** avec version de schéma.                                                                                                                                                                                                                                                                       | `07` §5.1   |
| **Menu contextuel**         | Un seul `<ContextMenu>` (bits-ui, ancré au pointeur) : pion, repère, vide de carte. Un pan au clic droit le referme (macOS dispatche `contextmenu` au mousedown).                                                                                                                                                                                                                                                                                                                                        | `07` §5.2   |
| **Initiative**              | **Verticale** à droite (remplace le bandeau horizontal) : PV, vaincu, réordonnancement ▲▼ (`combat.reorder`), clic = recadrage caméra, tourniquet d'auto-roll conservé.                                                                                                                                                                                                                                                                                                                                  | `07` §5.3   |
| **Asset manager**           | Overlay unique à onglets `Cartes` / `PNJ` / `Personnages` : grille de vignettes, recherche, double-clic = poser, badge `− ×N +`, clic droit délégué au menu unique. Import de carte depuis l'overlay, renommage, remplacement d'image, **avatars importés** (R2, marqueur `custom:`) pour PJ comme PNJ. Les `MapManager`/`NpcLibrary` restent en secours dans la barre d'outils. La **bibliothèque d'avatars avec cadrage** a son ticket : [`docs/bibliotheque-avatars.md`](../bibliotheque-avatars.md). | `07` §5.4   |
| **Dashboard MJ**            | Panneau `<Panel>` fermé par défaut (palette) : PNJ de la scène (PV, CA, états, recentrage, fiche) + notes de la carte (REST, enregistrement à la demande).                                                                                                                                                                                                                                                                                                                                               | `07` §5.5   |
| **Branche**                 | Tout le chantier est sur `feat/uiv2`. `main` est intacte.                                                                                                                                                                                                                                                                                                                                                                                                                                                | §6bis       |

### Ce qui a été validé par des mesures, pas par des avis

| Question posée                                                | Réponse                                                              | Preuve                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| Peut-on poser un menu flottant au-dessus d'une carte zoomée ? | **Oui**, sur Chromium, Firefox et Safari                             | 54 tests (6 cas × 3 zooms × 3 moteurs) |
| `bits-ui` tient-il dans le budget ?                           | **+41,7 Ko gzip** pour 3 primitives ; tree-shaking correct           | 2 builds comparés                      |
| Le CSS scopé Svelte convient-il aux surfaces ?                | **Non** — contrainte de conception, pas un bug                       | 3 directions documentées               |
| Que coûte la bascule plein écran ?                            | Les 6 tests qui cassent ont tous une cause identifiée et corrigeable | spike Lot 1                            |

### Les trois pièges à ne pas refaire

Issus du spike, ils se corrigent en amont et se re-documentent :

1. **Le CSS scopé ne touche que les éléments déclarés dans le template.** Donc ni
   le contenu portalé, ni les éléments rendus par un composant de bibliothèque.
   `:global()` partout pour les surfaces.
2. **`setPointerCapture` sur un ancêtre** rend tout le document cible du pointeur :
   les descendants ne reçoivent plus rien. Les gestionnaires vont sur une couche
   **sans** élément interactif.
3. **`onOpenChange(true)` précède l'insertion du DOM portalé.** Ne jamais mesurer
   ni enchaîner quoi que ce soit, dans ce callback.

### Les maquettes Penpot — un design system, pas des écrans

Les maquettes de validation vivent dans Penpot (page **`Croquis v2`**) et suivent
une règle unique : **le design system est la source, les écrans ne contiennent que
des instances**.

- `03 · Design system` : couleurs, typographies, icônes et composants de la
  bibliothèque du fichier (19 couleurs, 17 styles de texte, 37 composants), plus
  la section « États des lignes cliquables ».
- `01 · Table — exploration` / `02 · Table — combat` : uniquement des **instances**
  de composants, surchargées par écran (textes, jauges, couleurs de pion).
- `DS · Masters` : zone de travail des maîtres. **Modifier un maître met les écrans
  à jour** ; on ne redessine jamais un écran pour un détail partagé.

Le mode opératoire (API plugin, pièges, kit de helpers) est documenté dans le skill
`~/.config/opencode/skills/penpot/` (`SKILL.md` + `assets/kit.js`) — à lire avant
toute intervention dans le fichier Penpot.

> **Icônes : les maquettes mentent, exprès.** Les glyphes de `03 · Design system`
> servent à valider _quelle_ icône va où et à quelle taille, pas la géométrie.
> À l'intégration, on importe les composants du paquet **`@lucide/svelte`**
> (déjà installé dans `web/`) — jamais de SVG recopié depuis Penpot, jamais de
> `<path>` écrit à la main. Règle complète : `06` §3.1.

### Ce qui n'est pas un problème

- **Réécrire ce qui marche est le principe de la tâche**, pas un risque.
- **Le nombre d'utilisateurs est de 5** : pas de risque de migration, pas de
  compatibilité ascendante à préserver.
- **Le brouillard n'est pas un risque de la refonte.** C'est un bug
  préexistant — 58 ms et 32 Mo par repeint dès aujourd'hui en 2560×1440 Retina —
  dont la refonte n'aggrave le coût que de **26 %**. Il est traité dans un ticket
  séparé : [`docs/brouillard-optimisation.md`](../brouillard-optimisation.md).
- **PixiJS n'est pas la réponse.** Il ne résout aucun des problèmes réels et en
  créerait quatre autres. Voir `05` §6.

### État du chantier

**9 lots, 36-45 jours.** Les lots 0, 1 et 2 forment la séquence critique : c'est
là qu'est le basculement de paradigme. Le Lot 4 (undo) est le plus risqué
techniquement, et c'est aussi le plus cher en usage réel.

**Livrés au 01/10/2026 : lots 0, 1, 2, 3, 4 et 5** — fondations de surfaces ;
carte plein écran, panneaux flottants ; barre d'outils, command palette et
raccourcis ; la vie sur la carte : caméra animée persistée par carte, barres de
PV sur les pions (seuils Penpot, jamais diffusées hors droit serveur), pastille
d'initiative, état mort/couché, taille de pion en cases (`tokenScale`), plaque de
nom au survol et curseur de brosse ; l'**undo/redo transactionnel** (DO source de
vérité, un geste = un pas, `Ctrl/⌘ Z` et `Ctrl/⌘ ⇧ Z`) ; puis le **lot 5** :
`<Panel>` drag/resize/persisté, menu contextuel unique, initiative **verticale**
réordonnable, **asset manager** (Cartes/PNJ/Personnages, pose ×N) et **dashboard
MJ** (PNJ de la scène + notes de carte). Le design system Penpot est la source
(19 couleurs, 17 typographies, 37 composants). Prochain : le **lot 6** (liens
entre cartes, pins, aperçu au survol) ou le **lot 7** (autres écrans).

---

## 1. Le verdict en une page

Atlas n'est pas « plus joli que nous ». Il fait deux choses que nous ne faisons
pas, et ces deux-là produisent **tout** l'effet « jeu vidéo » :

1. **La carte est l'application, l'UI est une surimpression.** Le monde est
   plein écran. Les panneaux flottent _au-dessus_, ils s'ouvrent, se ferment, se
   déplacent. Rien n'est « une section de page ».
2. **La surface permanente est minuscule, tout le reste est à une commande.** Atlas
   a une barre d'outils de 10 boutons en bas et une barre d'onglets en haut. Le
   reste — réglages, filtres, spawn, snapshots, stats, aide — vit dans une
   **command palette** et un **asset manager**. Notre table, elle, a ~40 contrôles
   permanents à l'écran en permanence.

Nous avons l'inverse : beaucoup de surface permanente, presque pas de surface
temporaire. C'est la définition exacte d'une interface web.

**Le chiffre qui résume l'écart.** Atlas : 2 barres permanentes + 1 overlay à la
demande. Nous : `session-bar` + 2 sidebars de 288/324 px + barre MJ `flex-wrap`

- bandeau d'initiative + onglets + HUD. Rien n'est repliable, rien n'est
  déplaçable, tout occupe de la place en permanence.

---

## 2. Les 7 causes racines

Chacune est démontrée dans un fichier du dossier, avec le détail et le correctif.

| #      | Cause                                                                                                                                                                             | Où c'est prouvé          | Impact                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| **C1** | **La page est l'interface.** `.table-body` est un `display:grid` à 3 colonnes de largeur fixe. La carte est _encadrée_, pas primaire.                                             | `03-axes-ux-ui.md` §1    | On « voit » une page web avec une image au milieu. Jamais un jeu. |
| **C2** | **Les surfaces ne sont pas une famille.** 56 valeurs de `border-radius` distinctes, dont des quasi-doublons qui diffèrent d'1 px. 13 `box-shadow` distincts. Aucun mixin partagé. | `06-design-system.md` §1 | Perte immédiate de l'impression de « système ».                   |
| **C3** | **La barre MJ est dans le flux.** `flex-wrap: wrap`, des inputs qui se déplient dedans, un `.tool-hint` dont la longueur change la largeur de la barre à chaque outil.            | `03-axes-ux-ui.md` §2    | La barre grossit et rétrécit. Instable, pas « outillé ».          |
| **C4** | **Pas de command palette, pas d'aide clavier.** Le `session-bar` est une rangée de `<a href>` — le signal le plus fort de « site web ».                                           | `03-axes-ux-ui.md` §3    | Tout requiert la souris et la mémoire.                            |
| **C5** | **Rien ne flotte.** 2 seuls éléments en surimpression sur la carte : `.map-hud` et `.dice-overlay`. Pas de panneau déplaçable, pas de dashboard.                                  | `03-axes-ux-ui.md` §1    | On ne peut pas réorganiser son espace de travail.                 |
| **C6** | **Les pions n'ont pas de vie.** Pas de barre de PV sur le pion — elle vit dans la sidebar.                                                                                        | `04-game-feel.md` §1     | Le MJ doit scanner la sidebar pour savoir qui va mal.             |
| **C7** | **Le clic droit n'est pas un langage.** Un seul context menu existe (pion, MJ) : 3 actions.                                                                                       | `03-axes-ux-ui.md` §6    | Les actions sont donc étalées en boutons permanents.              |

---

## 3. La décision de direction artistique

**Hybride : structure Atlas, peau carnet.**

On ne remplace pas l'identité « Carnet de nuit » (fond encre, papier ligné, typo
Vidaloka, rayons organic) — c'est ce qui nous distingue, et c'est le seul endroit
où Atlas ne peut pas nous dépasser (leur neutralité Obsidian est générique). Mais on
adopte **tout le reste** : la densité, la hiérarchie, le modèle de couches, les
patterns d'interaction.

Concrètement :

| On garde (nous)                                    | On prend (Atlas)                                             |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Palette encre/papier, 4 « encres » sélectionnables | Modèle 3 couches (map / chrome / popups)                     |
| Typo Vidaloka + Alegreya Sans                      | Une seule surface `elevated` partagée, une échelle de rayons |
| Texture papier ligné, hachures                     | La barre d'outils ancrée + fit par priorité                  |
| Caractères organic sur les blocs éditoriaux        | La command palette                                           |
| —                                                  | Panneaux flottants, liens de map, barres de vie sur pion     |

**Le point de vigilance.** Nos rayons « organic » sont une **signature assumée**,
mais 8 variantes appliquées par index dans chaque liste produisent du bruit, pas
de laconcaténation. La règle à adopter : **les rayons organic restent sur les
objets éditoriaux** (cartes de personnage, blocs de feuille, chips de résumé),
**les surfaces système (panneaux, popovers, barre d'outils, onglets) passent à
une échelle de rayons propres et constante.** C'est exactement la distinction
d'Atlas : rayons « Obsidian » stricts pour le chrome, uniquement parce que le
chrome ne doit pas attracting l'attention.

→ Détail dans `06-design-system.md`.

---

## 4. Ce qu'on ne peut pas prendre

Atlas est un **plugin local mono-utilisateur dans Obsidian**. Nous sommes une
**app multi-joueur réseau** sur Cloudflare Workers. Une partie de ses décisions
n'est pas transposable, et la copier serait une faute.

| Atlas                                              | Pourquoi ça ne marche pas chez nous                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fenêtre joueur sur un 2ᵉ écran (`LocalPlayerView`) | Nos joueurs sont sur d'autres navigateurs, souvent d'autres appareils. Le « player view » est une personne, pas une fenêtre.                                                                                                                  |
| Undo/redo local (zundo)                            | Notre undo est une action serveur → journal → broadcast. Il doit être conçu **transactionnellement côté client**.                                                                                                                             |
| Fichiers `.atlasmap` en local                      | D1 + R2 + Durable Object.                                                                                                                                                                                                                     |
| Settings locaux par joueur                         | Nos `TableSettings` sont **partagés de campagne**. Une palette doit savoir qui elle est et quoi persister.                                                                                                                                    |
| Pas de secrets (tout est dans le fichier)          | On a une règle de sécurité dure : **un PNJ n'est visible que s'il a un pion révélé**. Toute nouvelle voie de diffusion (`snapshot`, broadcast, palette) doit respecter ce filtre, sinon on réintroduit la fuite de noms (cf. `AGENTS.md` §9). |
| Barres de vie toujours visibles                    | Idem : l'affichage des PV de PNJ est un réglage serveur (`pnjPvVisible`), pas un simple `if (isMj)`.                                                                                                                                          |
| Asset manager avec grille virtualisée              | Nous n'avons que quelques dizaines de cartes et PNJ. La virtualisation (`@tanstack/react-virtual`) est premature ici — mais **la grille, les filtres et le multi-select** ne le sont pas.                                                     |

---

## 5. Index du dossier

| Fichier                         | Contenu                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-etat-des-lieux-atlas.md`    | Atlas en détail : modèle mental, décisions structurantes, les 10 détails qui font la différence                                                                                                                                                                                                                         |
| `02-etat-des-lieux-rollwith.md` | RollWith aujourd'hui, écran par écran, avec chiffres et chemins                                                                                                                                                                                                                                                         |
| `03-axes-ux-ui.md`              | Le différentiel axe par axe (layout, barre d'outils, palette, initiative, dés, widgets, clic droit, raccourcis, onboarding, undo)                                                                                                                                                                                       |
| `04-game-feel.md`               | Le « game feel » : pions vivants, liens entre maps, notes dans la map, ambiance                                                                                                                                                                                                                                         |
| `05-architecture-svelte.md`     | Comment on reconstruit ça en Svelte 5 : décomposition, couche de primitives, libs retenues/rejetées, débat DOM vs WebGL                                                                                                                                                                                                 |
| `06-design-system.md`           | Le design system de surfaces : mixin unique, échelle de rayons, z-index sémantique, « peau carnet » sur structure Atlas                                                                                                                                                                                                 |
| `07-parcours-implémentation.md` | Le backlog ordonné en **9 lots**, avec dépendances, risques, critères de recette et indicateurs de succès                                                                                                                                                                                                               |
| `07bis-spike-lot1.md`           | **Spike Lot 1 sur la vraie table** : le popover prisonnier de son parent, les tests e2e qui encodent l'ancienne géométrie, et le relevé du brouillard — **corrigé depuis**, il s'agissait d'un bug préexistant, pas d'un risque de la refonte (voir [`docs/brouillard-optimisation.md`](../brouillard-optimisation.md)) |
| `08-recherche-stack-ui.md`      | La recherche web qui fonde `05` : versions, dates, URLs (90 sources) — libs Svelte 5 retenues/rejetées, API `popover`, `@property`, DOM vs WebGL                                                                                                                                                                        |
| `assets/`                       | Les 3 captures du dépôt Atlas                                                                                                                                                                                                                                                                                           |

---

## 6. Les 12 recommandations (le Top)

Le détail et la justification sont dans les fichiers ; le classement est ici.
`E` = charge estimée en journées de dev (1j = une journée fiable, tests inclus).

### P0 — changer de paradigmat (sans ça, rien de ce qui suit ne se voit)

| #   | Reco                                                                                                                                                                            | Fichier   | E    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| 1   | **Carte plein écran + chrome en surimpression.** Supprimer `.table-body`. 3 couches (`map` / `chrome` / `popups`), `pointer-events` gérés par couche.                           | `03` §1   | 3-4j |
| 2   | **Le `SurfaceMixin` unique + échelle de rayons + z-index sémantique.** Tuer les 10 `.overlay/.modal/.panel` dupliqués et les 56 rayons.                                         | `06` §2-4 | 2-3j |
| 3   | **Barre d'outils ancrée en bas, centrée, fit par priorité + overflow.** Remplace le `flex-wrap`. Chaque outil a ses options dans un popover.                                    | `03` §2   | 3j   |
| 4   | **Command palette.** Le point de bascule : c'est ce qui permet de _retirer_ de la surface permanente. Tous les réglages de carte, grille, tokens, brouillard, raccourcis, aide. | `03` §3   | 3-4j |
| 5   | **Barre de vie + état sur le pion**, seuils de couleur, portrait du combattant.                                                                                                 | `04` §1   | 1-2j |
| 6   | **Clic droit sur tout ce qui est actionnable** (pion, carte, brouillard, repère, lien de map, pion dans la liste PNJ).                                                          | `03` §6   | 2j   |

### P1 — ce qui fait « jeu » vraiment

| #   | Reco                                                                                                                                             | Fichier | E    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---- |
| 7   | **Asset manager en grille** : remplace `MapManager` + `NpcLibrary`. Filtres, tags, multi-select, spawn par double-clic avec formation en grille. | `03` §5 | 4-5j |
| 8   | **Panneaux flottants** : « tableau de bord MJ » (PNJ de la scène + notes de séance), déplaçable et redimensionnable.                             | `03` §4 | 3j   |
| 9   | **Liens entre maps** : zones cliquables sur la carte qui ouvrent une autre carte. Le « HTML des maps ».                                          | `04` §2 | 3-4j |
| 10  | **Panneau initiative vertical** latéral au lieu du bandeau horizontal qui remplace le header.                                                    | `03` §7 | 2j   |
| 11  | **Caméra animée** : `fit`, zoom sur un pion, recadrage au clic sur une initiative. today: `transform` brut, 0 animation.                         | `04` §3 | 1-2j |
| 12  | **Système de raccourcis déclaratif + aide clavier `?`.** Une table, groupes, `mjOnly`, aide générée depuis la même table.                        | `03` §8 | 2j   |

### P2 — affinage

Notes épinglées sur la map · undo/redo transactionnel côté MJ · widgets (horloge, timers,
compteurs) · recherche `keyword:value` dans l'asset manager · tutoriels ciblés avec
spotlight · prévisualisation au survol · fondus au défilement · loot roller ·
persistance du layout de panneaux par joueur · thème clair.
→ Tous détaillés dans `07-parcours-implémentation.md`.

> **Note.** L'**undo** est classé P1 malgré son intitulé « redo/undo » ci-dessus :
> c'est le manque le plus coûteux en usage réel (un MJ qui a mal déplacé 5 pions
> doit refaire). Il a son **lot entier** (lot 4), parce que c'est le seul chantier
> qui touche au modèle de données du DO.

---

## 6bis. La réponse à « comment on construit ça »

En une page, parce que c'est la vraie question derrière le chantier :

| Question                                                     | Réponse courte                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Les popups marcheront-ils au-dessus de la carte zoomée ?** | Oui, et **par la spec, pas par une lib**. Un `[popover]` en top layer a le viewport pour containing block. `bits-ui` ne l'exploite pas → il faut `<X.Portal>` + `strategy="fixed"` explicite (le défaut réel du code est `absolute` ⚠️).               |
| **Quelle lib adopter ?**                                     | `bits-ui` 2.19.3 — seule lib headless Svelte 5 qui couvre Popover/Dialog/**ContextMenu**/Menu/Tooltip/Select/Tabs/**Command**, sans Tailwind, 3 587 ★.                                                                                                 |
| **Quelles libs rejeter ?**                                   | `melt` (9 mois sans commit, pas de Menu/ContextMenu/Command) · `shadcn-svelte` (Tailwind v4 obligatoire) · `@ark-ui/svelte` (60 deps, pas de Command) · `svelte-motion`/`motion` (morts ou pas de port Svelte) · `interactjs` (200 KB pour 40 lignes). |
| **Panneaux flottants, window manager ?**                     | **Maison.** ~250 lignes. Aucune lib Svelte mature (`svelte-windows` est en 0.1.13).                                                                                                                                                                    |
| **Animations ?**                                             | Transitions Svelte natives + attributs `data-*` de bits-ui + `@property`. Pas de lib.                                                                                                                                                                  |
| **La carte en WebGL ?**                                      | **Non.** 20-200 pions, très en dessous du seuil DOM (~500 éléments animés), et le DOM donne texte CSS, effets CSS, a11y et **tests Playwright existants**. Porte de sortie : `<MapLayer>` isolé, on remplace son intérieur plus tard si besoin.        |
| **Le thème Carnet de nuit survit ?**                         | Oui — mais **découpé** : rayons organic sur le contenu éditorial et les objets de jeu, échelle stricte sur le chrome (cf. `06` §5).                                                                                                                    |

---

## 7. Le métrique à utiliser pendant la refonte

Une seule question, à poser sur n'importe quel écran :

> **« Ce contrôle peut-il être retiré de l'écran permanent et déplacé dans la
> palette ou un clic droit, sans perte pour le MJ pendant une séance ? »**

Si oui → c'est de la surface qu'on peut rendre temporaire. C'est cette question
qui fait passer une interface de « web » à « jeu », et elle est vérifiable sur
chaque composant.

---

## 8. Par où commencer

### Pour prendre le dossier en main

- **5 minutes** : ce README, §0 (état du chantier), puis §1 et §6.
- **Une heure** : `04-game-feel.md` — c'est ce que le projet est censé devenir.
- **Pour coder** : `07-parcours-implémentation.md` (les 9 lots), puis `05`
  (les décisions techniques) et `06` (le système de surfaces).
- **Pour vérifier une affirmation** : `01`, `02`, `03`, `08`.

### Pour implémenter

Les lots sont dans `07`. Trois choses à savoir avant d'ouvrir le premier :

1. **Le filet de test est déjà en place.** 323 tests (dont 31 d'intégration
   API), 23 tests e2e Playwright sur la fixture `dev-camp`. `pnpm check` doit
   être vert à chaque commit — c'est la seule condition à ne pas négocier.
2. **Les lots 0 à 4 sont livrés, le lot 5 est entamé** : `bits-ui` et
   `@lucide/svelte` dans `web/package.json`, surfaces et tokens en place, carte
   plein écran, panneaux flottants déplaçables/redimensionnables, barre
   d'outils, command palette et raccourcis, pion « objet de jeu » (PV,
   initiative, états, échelle), caméra animée, undo/redo transactionnel, menu
   contextuel unique, initiative verticale, asset manager et dashboard MJ. La
   suite : le lot 6 (liens entre cartes, pins, aperçu) ou le lot 7 (autres
   écrans).
3. **Les trois pièges du §0** sont à respecter dès la première ligne de code,
   pas découverts en chemin.

### Pour reprendre un ticket isolé

`../brouillard-optimisation.md` — optimisation du brouillard. **Indépendant du
chantier d'UX**, à faire sur `main`.

## 9. Sources

- Dépôt Atlas local : `~/Documents/Git/atlas-vtt`
  - `CLAUDE.md` — contient une section « UI Design Principles » qui exprime les
    règles non négociables d'Atlas. **C'est la meilleure source d'intention de
    design du projet** et le meilleur point de départ du chantier.
  - `styles/_tokens.scss`, `styles/_mixins.scss`
  - `src/app/react/` (UIRoot, BottomToolbarRow, CommandPalette,
    InitiativeTracker, ResponsiveWidgetBar)
  - `src/app/packages/components/toolbar/` (ToolGroup, MainToolbar, toolbarFit)
  - `src/app/packages/components/asset-manager/`
  - `src/app/tools/`, `src/app/keyboard/`, `src/app/vision/`
  - `docs/ObsidianTheming.md`, `docs/css-scoping.md`,
    `docs/encounter-spawning-system.md`
- Captures : `assets/` (copiées depuis `docs/images/` du dépôt Atlas)
- RollWith : `web/src/routes/**`, `web/src/lib/ds/**`, `web/src/lib/components/**`
- Mesures du brouillard : `scripts/_mesure-fogscale.cjs`,
  `scripts/_mesure-brouillard.cjs`, `scripts/_rapport-fog.cjs` (relançables)
- Validation des overlays : `scripts/_diag-crossbrowser.cjs` (3 moteurs)
- Travaux internes existants : `docs/audit-herosetdragons-2026-09-06-v2.md`,
  `design V2/THEME-CARNET-DE-NUIT.md`,
  `design V2/Récapitulatif - Écran de jeu & Design System.md`
