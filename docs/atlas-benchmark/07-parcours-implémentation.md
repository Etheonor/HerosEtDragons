# 07 — Parcours d'implémentation

Découpage en **lots**. Chaque lot a un résultat visible, des dépendances, la
surface serveur touchée, les risques et un critère de recette.

`E` = charge estimée en journées (1 j = une journée fiable, tests inclus).

## Règles du chantier

1. **`pnpm check` vert à chaque commit.** Jamais de commit sans.
2. **`pnpm e2e` vert** (20 tests Playwright, fixture `dev-camp`) avant chaque lot
   qui touche au layout. Le filet existe, il faut s'en servir.
3. **Pas de commit sans demande explicite.**
4. **Un lot = une branche, une PR, une revue.** Le lot 1 change beaucoup de
   choses ; il ne faut pas le mélanger avec le lot 4.
5. **La règle de visibilité PNJ** (`AGENTS.md` §9) est testée à chaque fois qu'on
   ajoute une voie de diffusion. C'est une régression de sécurité, pas un bug d'UX.
6. **Chaque animation a son pendant `prefers-reduced-motion`.**

---

## Lot 0 — Fondations · 3 j

> Invisible en soi, mais **tout** le reste en dépend.

| #   | Tâche                                                                                                                                                                                                                       | E     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 0.1 | `tokens.css` : primitifs `@property`, dérivés `color-mix()`, classes `.surface-canvas\|raised\|overlay`, échelle de rayons, `--control-h*`, z-index sémantique. Garder les variables actuelles pour ne pas casser le rendu. | 1 j   |
| 0.2 | `<Surface>` : wrapper au-dessus de `bits-ui` qui force `Portal` + `strategy="fixed"` + les classes de surface. `<BitsConfig defaultPortalTo="body">` racine.                                                                | 0,5 j |
| 0.3 | Ajouter `bits-ui` à `web/package.json`. Vérifier le bundle.                                                                                                                                                                 | 0,5 j |
| 0.4 | Feuille de route de migration : un tableau `z-index` → variable, et un tableau `border-radius` → rayon d'échelle. **Ne pas migrer encore.**                                                                                 | 0,5 j |
| 0.5 | Migrer les surfaces existantes vers `.surface-*` **sans changer le rendu** (mécanique, vérifiable à l'œil sur les e2e).                                                                                                     | 0,5 j |

**Risque.** Aucun — c'est du travail sans risque, volontairement.
**Recette.** Les e2e passent, le rendu est pixel-identique, et un `Dialog` ouvert
au-dessus de la carte zoomée à 2,5× est correctement positionné. **C'est le test
d'acceptation du problème n°1.**

---

## Lot 1 — Le basculement : la carte est l'application · 3-4 j

> **P0 #1.** Le seul lot qui change le produit.

| #   | Tâche                                                                                                                                                                                                           | E     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1.1 | Supprimer `.table-body`. Nouvelle structure 3 couches : `layer-map` / `layer-chrome` (`pointer-events: none`) / `layer-popups`.                                                                                 | 1 j   |
| 1.2 | `.map-frame` → `position: absolute; inset: 0`. La carte occupe tout le viewport.                                                                                                                                | 0,5 j |
| 1.3 | `aside.compagnie` et `aside.panel` deviennent des panneaux flottants (`position: fixed`), ouverts par défaut, avec un bouton de fermeture. Persistance de l'état ouvert/fermé par utilisateur (`localStorage`). | 1 j   |
| 1.4 | Press states globaux (`scale(0.96)`), tokens de mouvement, `prefers-reduced-motion`.                                                                                                                            | 0,5 j |
| 1.5 | Scrollbars à place réservée (`.scroll-area` avec `@property`).                                                                                                                                                  | 0,5 j |
| 1.6 | Passer `z-index` littéraux → variables sémantiques. Le grep `z-index` doit être vide.                                                                                                                           | 0,5 j |

**Risques.**

- 🔴 Le gain d'espace n'est pas gratuit : la carte passe de ~950×760 px à
  ~1600×900 px. Il faut **re-tester les seuils de pourcentage** (les tokens sont
  en `%` de la surface → ça tient, mais les brouillards reveals sont aussi en
  `%` → vérifier `fogScale` et les trous).
- 🔴 Les sidebars en panneaux flottants : le clic droit / le clic doit fermer un
  panneau quand on clique sur la carte ? Décision à prendre : **non** (comme
  Atlas), un panneau ouvert reste ouvert jusqu'à son `×`.

**Recette.** La carte est plein écran. Les panneaux flottent par-dessus. On peut
fermer les deux panneaux et n'avoir que la carte + une barre. Les e2e passent
(les sélecteurs doivent être mis à jour).

---

## Lot 2 — Le chrome : barre d'outils, palette, raccourcis · 7-8 j

> **P0 #3, #4** et **P1 #12**. C'est le lot qui permet ensuite de **retirer** de
> l'écran permanent.

### 2a — La table de raccourcis · 1 j (préalable obligatoire)

| #    | Tâche                                                                                                                                                                 | E     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2a.1 | `web/src/lib/hotkeys.ts` : table déclarative `{id, label, group, defaultKey, mjOnly, yieldsToTextSelection?}`, groupes `Carte / Outils / Édition / Combat / Widgets`. | 0,5 j |
| 2a.2 | Exécution : `hotkeyFromEvent` layout-aware, respect de `isComposing`, refus si un overlay est ouvert.                                                                 | 0,5 j |
| 2a.3 | `<HotkeyHelp>` : aide `?` générée depuis la table, filtrée par rôle, en `<dl>` + `<kbd>`.                                                                             | 0,5 j |

**Note.** Les raccourcis actuels `1`-`6` (dés rapides) entrent en conflit avec les
widgets adressables d'Atlas. **Décider maintenant** : soit on garde `1`-`6` pour
les dés, soit on passe à « maintenir `1`-`5` » pour les widgets. Je recommande de
**garder `1`-`6` pour les dés** (plusused) et d'adresser les widgets par clic seul
au MVP.

### 2b — La barre d'outils · 3 j

| #    | Tâche                                                                                                                                                                                 | E     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2b.1 | `<ToolbarRow>` : `position: fixed`, grid 3 colonnes symétriques, centrage adaptatif, mesure de l'espace disponible publiée en contexte.                                               | 1 j   |
| 2b.2 | `toolbarFit.ts` : **fonction pure** `overflowingToolbarItems(items, avail)` — sortie stricte par `PRIORITY`, à égalité les derniers d'abord, pin si actif/ouvert. Testé unitairement. | 0,5 j |
| 2b.3 | `faces.ts` : les familles d'outils (`move`, `fog`, `measure`, `draw`, `token`, `note`, `text`, `palette`) et leur face active.                                                        | 0,5 j |
| 2b.4 | `<ToolGroup>` : split-button (icône + chevron `DropdownMenu`). Remplacer les boutons texte.                                                                                           | 0,5 j |
| 2b.5 | Les options d'outil **sortent de la barre** : taille de brosse, modes de brouillard, type de mesure, taille de texte.                                                                 | 0,5 j |

**Risque.** 🟡 C'est le plus gros diff visuel du chantier. Prévoir des allers-retours
sur la priorisation des outils.

### 2c — La command palette · 3-4 j

| #    | Tâche                                                                                                                                                                                         | E     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2c.1 | Registre de commandes `commands.svelte.ts` : `register()`/`unregister()`, `when()` par rôle.                                                                                                  | 0,5 j |
| 2c.2 | `<CommandPalette>` = `Dialog` + `Command` (bits-ui), ancrée au-dessus de la barre, animée avec les tokens de mouvement.                                                                       | 1 j   |
| 2c.3 | Onglet **Actions** : navigation (compendium, feuille, asset manager), pose de PNJ, dés, combat, ouverture/fermeture des panneaux. Chaque entrée avec son `<kbd>`.                             | 0,5 j |
| 2c.4 | Onglet **Réglages** : `GridSettingsPanel`, `TokenSettingsPanel`, `FogSettingsPanel`, `MapSettingsPanel`. **Tous en 2 colonnes**, avec `SettingRow` / `SettingToggleRow` / `SettingSliderRow`. | 1,5 j |
| 2c.5 | **Créer l'écran de réglages de campagne qui n'existe pas** (`api.campaigns.updateSettings()` n'est appelé nulle part) et l'exposer dans la palette.                                           | 1 j   |

**Risques.**

- 🔴 **Les réglages de la palette sont partagés de campagne** (contrairement à
  Atlas où tout est local). Il faut donc écrire via le DO et gérer le cas
  « joueur qui ouvre la palette » (lecture seule des réglages de campagne, ou
  palette réduite). **Décision à trancher avant de coder.**
- 🟡 Le filtrage à la française / avec les abréviations que le MJ utilise
  (« brouil » pour brouillard) mérite des `keywords` par commande. C'est cheap et
  ça se voit.

**Recette.** `Space` ouvre la palette, on tape « grille », on règle la taille, ça
se propage à tous les navigateurs. Le footer d'aide s'affiche. `Escape` ferme.

---

## Lot 3 — La vie sur la carte · 4-5 j

> **P0 #5** et **P1 #11** (caméra). Le lot qui fait le plus « jeu » pour le
> plus petit diff.

| #   | Tâche                                                                                                                                                      | E     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 3.1 | `<Camera>` : objet caméra (x, y, zoom) + `fitMap` / `zoomToPoint` / `centerOn`, animés (400 ms, `ease-in-out`). Persistance par carte dans `localStorage`. | 1 j   |
| 3.2 | Barre de vie sur le pion, seuils `≥70` / `30-69` / `<30`. **Pilotée par la règle de visibilité serveur.**                                                  | 1 j   |
| 3.3 | Numéro d'initiative sur le pion quand le combat est actif.                                                                                                 | 0,5 j |
| 3.4 | État visuel : `grayscale` + opacité à 0 PV ; voile pour les conditions `dead`/`unconscious`/`prone`.                                                       | 0,5 j |
| 3.5 | `tokenSize` → multiplicateur de cases (`gridSize`), avec une valeur par type.                                                                              | 0,5 j |
| 3.6 | Nameplate optionnel. Curseur de brosse de brouillard (cercle suivant le pointeur).                                                                         | 0,5 j |
| 3.7 | Recadrage animé sur un pion : clic sur une carte d'initiative, clic sur un résultat de journal, `Shift+2`.                                                 | 0,5 j |

**Risques.**

- 🔴 **3.2 est une surface de fuite de données.** Si les PV d'un PNJ non révélé
  sont envoyés au client pour être affichés, c'est une régression de sécurité.
  → Le DO doit filtrer, comme il le fait déjà pour `inventories`.
  → Test e2e explicite : joueur connecté, PNJ posé hors brouillard → son nom,
  ses PV et sa CA ne doivent pas apparaître dans **le snapshot**.
- 🟡 3.5 change l'échelle visuelle des cartes → à tester sur la fixture.

**Recette.** Sur une carte, on voit d'un coup d'œil qui est blessé, qui est à 0 PV,
et qui joue. Un clic sur une carte d'initiative recadre la caméra.

---

## Lot 4 — L'undo · 3-4 j

> **P1, mais c'est le manque le plus coûteux en usage réel.**

| #   | Tâche                                                                                                                                                           | E     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 4.1 | `shared/` : définir un type d'opération par entité mutable et son **inverse** (`token.move`, `token.add`, `token.remove`, `marker.*`, `map.settings`, `fog.*`). | 1 j   |
| 4.2 | `api/` : le DO conserve une pile de 50 opérations et expose `POST /api/campaigns/:id/undo`. L'annulation est **une mutation normale** (journal + broadcast).    | 1,5 j |
| 4.3 | Client : boutons undo/redo dans le coin de la barre d'outils, `Mod+z` / `Mod+Shift+z`, état `canUndo` / `canRedo` affiché.                                      | 0,5 j |
| 4.4 | **Modèle de brouillard par opérations** : le DO stocke une liste d'opérations (`mode`, points, taille) au lieu d'un bitmap de pixels. Permet l'undo par passe.  | 1 j   |

**Risques.**

- 🔴 4.4 est un **changement de modèle de données** dans le fichier le plus critique
  du projet (`api/src/do/game-table.ts`, ~2 300 lignes). Il passe **obligatoirement**
  par `api/test/game-table.test.ts`.
- 🔴 L'undo ne doit **pas** contourner la visibilité PNJ : « annuler la
  suppression d'un PNJ » ne doit pas révéler son nom à un joueur qui ne le voyait
  pas. La pile doit donc être **filtrée à la lecture selon le rôle**, pas seulement
  à l'exécution.

**Recette.** On déplace 5 pions, on supprime un PNJ, on couvre une zone de
brouillard → 3 `Mod+z` et tout est revenu, **pour tous** les joueurs, avec la bonne
visibilité.

---

## Lot 5 — Les panneaux · 5-6 j

| #   | Tâche                                                                                                                                                                                             | E     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 5.1 | `<Panel>` : shell de panneau flottant (drag, 8 poignées de resize, z-order, snap, persistance `localStorage` **normalisée en fraction du viewport** + version de schéma).                         | 1,5 j |
| 5.2 | `<ContextMenu>` unique (bits-ui) + clic droit sur : pion, vide de carte, brouillard, repère, vignette de l'asset manager, fiche du compendium, ligne d'inventaire.                                | 1,5 j |
| 5.3 | Initiative **verticale** à droite (au lieu du bandeau horizontal), avec barres de vie, états `defeated`, `ArrowUp`/`ArrowDown`, et **clic = recadrage caméra**. Garder le tourniquet d'auto-roll. | 1 j   |
| 5.4 | `<AssetManager>` en overlay : onglets `Cartes` / `PNJ` / `Personnages`, grille de thumbnails, double-clic = poser, badge `− ×N +`, clic droit contextuel, recherche texte simple.                 | 1,5 j |
| 5.5 | `<GmDashboard>` : panneau flottant avec les PNJ de la scène (lien vers la fiche, ressource) + les notes épinglées.                                                                                | 0,5 j |

**Risques.**

- 🟡 5.1 : la persistance par fraction du viewport est obligatoire, sinon le
  layout est cassé sur un autre écran. Et il faut une migration de schéma.
- 🟡 5.4 : garder `MapManager` / `NpcLibrary` en secours derrière un drapeau,
  pour revenir arrière si ça ne convient pas.
- 🔴 5.2 : chaque entrée de menu qui **révèle** quelque chose doit être filtrée
  côté serveur (cf. garde de sécurité dans `03-axes-ux-ui.md` §6).

**Recette.** Un panneau se déplace, se redimensionne, survit au rechargement. Le
clic droit sur un pion fait ce qu'on attend. L'asset manager permet de poser 6
gobelins en un double-clic.

---

## Lot 6 — Le monde · 4-5 j

> **P1 #9** (liens de map), plus les pins et le panneau d'ouverture.

| #   | Tâche                                                                                                               | E     |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| 6.1 | `shared/` : type `MapLink` + `MapPin`, et les entrées de protocole WS.                                              | 0,5 j |
| 6.2 | `api/` : persistance dans le DO + handlers + snapshot.                                                              | 1 j   |
| 6.3 | Rendu des liens sur la carte (icône + label au survol) et des pins.                                                 | 0,5 j |
| 6.4 | Interactions : clic = ouvrir la carte cible (avec point d'arrivée), clic droit = menu, **lien retour automatique**. | 0,5 j |
| 6.5 | Onglet « Liens » dans l'asset manager.                                                                              | 0,5 j |
| 6.6 | Aperçu au survol (`Cmd/Ctrl+hover`) sur un pion : portrait, nom, CA, PV, conditions, extrait du compendium.         | 0,5 j |
| 6.7 | Notes épinglées : panneau non-modal avec la note rendue (`markdown-lite.ts`).                                       | 0,5 j |

**Risques.**

- 🔴 6.1-6.2 : nouveau type d'entité dans le snapshot → **toucher la règle de
  visibilité** (un lien vers une carte révèle de la structure de campagne).
- 🟡 6.6 : `CompendiumTooltip` existe déjà et a déjà un cache `Map` — le réutiliser
  est 80 % du travail.

---

## Lot 7 — Les autres écrans · 4-5 j

> La feuille de perso, le compendium et l'accueil ont les mêmes problèmes que la
> table : pages à colonnes fixes, surfaces dupliquées, pas de panels.

| #   | Tâche                                                                                                                                                | E     | Écran      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- |
| 7.1 | Feuille : passer de « une page qui défile » à un **panneau de lecture MJ** (le MJ voit les valeurs du PNJ pendant que le joueur regarde sa feuille). | 1,5 j | Feuille    |
| 7.2 | Feuille : surbrillance des modifications **non visibles** pour le MJ (« PV passé de 12 à 5 »).                                                       | 0,5 j | Feuille    |
| 7.3 | Compendium : ouvrir en **panneau flottant** plutôt qu'en navigation → plus de `<a href>` dans le header.                                             | 1 j   | Compendium |
| 7.4 | Accueil : passer des `<a>` vers un vrai shell (lien vers la table, sélecteur de personnage, raccourcis).                                             | 0,5 j | Accueil    |
| 7.5 | Remplacer tous les `<a href>` du chrome par des actions de palette.                                                                                  | 0,5 j | Tous       |

**Note.** 7.3 est important au-delà du compendium : **c'est le geste qui supprime
le `<a href>` du `session-bar`**, qui est le signal « web » le plus fort du produit
(`03-axes-ux-ui.md` §3).

---

## Lot 8 — Finitions · 4-6 j

| #   | Tâche                                                                                                                                                        | E     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 8.1 | Toast **réutilisable** (composant `<Toaster>`), présent sur tous les écrans, et non plus local à la table.                                                   | 0,5 j |
| 8.2 | Squelettes de chargement + états d'erreur **non silencieux** (aujourd'hui la plupart des `catch` sont `/* ignore */`).                                       | 0,5 j |
| 8.3 | `<Tooltip>` sans `title`, avec `<kbd>`. Supprimer tous les `title=` du chrome.                                                                               | 1 j   |
| 8.4 | Toast de jet à la place du plein écran `DiceOverlay`. Garder `DiceOverlay` comme animation **près du pion**.                                                 | 1 j   |
| 8.5 | Barre de widgets (compteur / horloge / minuteur), auto-repli 4 s, valeur partagée via le DO.                                                                 | 1 j   |
| 8.6 | Accessibilité : focus trap + retour de focus dans les modales, `aria-live` sur le journal, pions focusables + déplacement au clavier, contrastes `--text-3`. | 1 j   |
| 8.7 | Tutoriel ciblé (4 étapes MJ) avec spotlight.                                                                                                                 | 0,5 j |
| 8.8 | Brouillard : lasso + rectangle.                                                                                                                              | 0,5 j |

---

## Lot 9 — Supprimé

Il était prévu un lot « responsive » (feuilles bottom, pinch-zoom, long-press).
**La cible du produit est un PC de bureau avec un grand écran, joué au
clavier-souris.** Il n'y a donc rien à faire.

Ce qui en subsiste, et qui est resté ailleurs :

- la **hauteur** — `height: 100vh` ignore la barre des tâches Windows et le Dock
  macOS, qui rognent la table même sur un grand écran. Passer en `100dvh` ou en
  hauteur calculée. C'est une ligne, et c'est au Lot 1.
- la **largeur minimale de table** (≈ 1180 px) : en dessous, la barre d'outils se
  réduit par la priorité, pas par un media query. C'est déjà couvert par le
  mécanisme du Lot 2.
- le **pincement au trackpad** reste un besoin réel sur Mac, mais il n'est pas un
  chantier : c'est deux branches de plus dans le contrôleur de caméra (Lot 3).

## Récapitulatif

| Lot   | Contenu                                                        | E           | Dépend de |
| ----- | -------------------------------------------------------------- | ----------- | --------- |
| **0** | Fondations : tokens, `<Surface>`, `bits-ui`                    | 3 j         | —         |
| **1** | **Bascule : la carte est l'application**                       | 3-4 j       | 0         |
| **2** | Chrome : raccourcis, barre d'outils, palette                   | 7-8 j       | 0, 1      |
| **3** | La vie sur la carte : pions, caméra                            | 4-5 j       | 1         |
| **4** | **Undo**                                                       | 3-4 j       | 1         |
| **5** | Panneaux : `<Panel>`, context menus, initiative, asset manager | 5-6 j       | 0, 1, 2   |
| **6** | Le monde : liens de map, pins, aperçu                          | 4-5 j       | 3, 5      |
| **7** | Les autres écrans                                              | 4-5 j       | 0, 1, 5   |
| **8** | Finitions : toasts, squelettes, a11y, dés, widgets             | 4-6 j       | 0, 1      |
|       | **Total (lots 0 à 8)**                                         | **36-45 j** |           |

**Séquence critique : 0 → 1 → 2.** C'est là qu'est le basculement de paradigme.
Le lot 4 (undo) est le plus risqué techniquement ; s'il doit être décalé, c'est
celui-là — mais c'est aussi le plus cher en usage réel. Le mettre **juste après le
lot 1** si possible, parce que c'est le moment où le DO est encore frais.

---

## Ce qui n'est pas dans ce chantier

| Exclu                                              | Pourquoi                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Responsive / multi-usage                           | **Hors cible assumée** : PC de bureau, grand écran, clavier-souris. Voir `07` §Lot 9.                             |
| Vision / murs / lumières                           | Fonctionnalité de jeu, pas d'UX. Ouvre le débat canvas (`05` §6).                                                 |
| Audio / ambiance                                   | Hébergement R2 + licences.                                                                                        |
| Collections / tags façon Atlas                     | À notre échelle (10 cartes, 20 PNJ), complexité sans usage.                                                       |
| Recherche `keyword:value`                          | Idem.                                                                                                             |
| Fenêtre joueur séparée                             | N'a pas de sens dans un jeu réseau.                                                                               |
| Thème clair                                        | `light-dark()` rend ça bon marché, mais la recette (rayons organic, hachures) vient après le système de surfaces. |
| PixiJS / WebGL                                     | Surdimensionné à notre échelle. Porte de sortie : `<MapLayer>`.                                                   |
| Multi-sélection de pions, alignement, distribution | Utile, mais arrive **après** les liens de map.                                                                    |
| Modèles de cartes (gabarits de scène)              | Intéressant, hors périmètre.                                                                                      |

---

## Comment on mesure qu'on a réussi

Le test du `README.md` §7, appliqué sur les 4 écrans :

> _« Ce contrôle peut-il être retiré de l'écran permanent et déplacé dans la
> palette ou un clic droit, sans perte pour le MJ pendant une séance ? »_

Plus trois indicateurs chiffrés :

| Indicateur                                          | Avant            | Cible                                    |
| --------------------------------------------------- | ---------------- | ---------------------------------------- |
| Contrôles permanents sur l'écran de table           | ~40              | < 12                                     |
| Éléments en `position: fixed`/`absolute` hors carte | 2                | > 8 (les panneaux) — **et c'est le but** |
| Valeurs de `border-radius` distinctes               | 56               | 9 (l'échelle)                            |
| Valeurs de `z-index` littérales                     | 13               | 0                                        |
| `title=` dans le front                              | 6565             | 0                                        |
| Moyenne de lignes par fichier `.svelte`             | ~290 (max 2 285) | < 300 (max < 400)                        |
