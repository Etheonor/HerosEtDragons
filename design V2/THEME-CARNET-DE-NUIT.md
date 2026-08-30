# RollWith H&D — Thème « Carnet de nuit » — Guide d'implémentation

Document de handoff pour appliquer le thème sombre validé à l'ensemble du produit.
Références visuelles (HTML autonomes, ouvrables dans un navigateur) :

- `Accueil sombre.dc.html` — login Discord, dashboard, modale création de campagne, sélecteur d'Encre (RÉFÉRENCE VALIDÉE)
- `Design System sombre.dc.html` — spec visuelle : palette, typo, composants
- `Ecran de jeu sombre.dc.html` — table virtuelle complète (carte, combat, journal, dés, inventaire)
- `Feuille de personnage sombre.dc.html` — feuille interactive
- `Compendium sombre.dc.html` — bibliothèque DRS 3 colonnes
  Les styles sont tous inline dans ces fichiers : en cas de doute, la valeur dans le fichier fait foi.

## 1. Palette (tokens)

| Token           | Valeur                   | Usage                                                                        |
| --------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `--bg`          | `#26221D`                | fond de page                                                                 |
| `--panel`       | `#2E2A24`                | panneaux, cartes, modales, chips inactives                                   |
| `--border`      | `#575043`                | bordures de panneaux/inputs (2px solid), bordures dashed, éléments inactifs  |
| `--border-soft` | `#3A352D`                | séparateurs discrets, border-bottom de listes                                |
| `--selected`    | `#575043`                | fond d'élément sélectionné (chip, onglet, ligne active) avec texte `#F2EDE0` |
| `--text`        | `#E8E2D4`                | texte courant                                                                |
| `--heading`     | `#F2EDE0`                | titres                                                                       |
| `--text-2`      | `#9C947F`                | texte secondaire, métadonnées, labels                                        |
| `--text-3`      | `#6E6759`                | estompé : hints, mentions, placeholders                                      |
| `--overlay`     | `rgba(15,13,10,.6)`      | fond de modale                                                               |
| ombres          | `rgba(0,0,0,.3)` à `.45` | box-shadow                                                                   |

## 2. Encre (accent choisi par l'utilisateur)

L'accent n'est PAS une constante : c'est un choix utilisateur parmi 4 palettes, via le
sélecteur « Encre » du header (voir dashboard). Persistance : `localStorage['hd-encre']`
(valeurs `carmin | brique | ocre | foret`), défaut `carmin`. Portée : par navigateur/utilisateur.

| Encre           | base      | hover     | bord      | texte-accent |
| --------------- | --------- | --------- | --------- | ------------ |
| carmin (défaut) | `#C0392B` | `#D0473A` | `#8F281D` | `#E0705F`    |
| brique          | `#D0473A` | `#DC5C50` | `#A22F23` | `#E8877A`    |
| ocre            | `#B8860B` | `#CC9A1F` | `#8A6508` | `#D4A73C`    |
| forêt           | `#5E8C61` | `#6FA073` | `#46694A` | `#8AB58D`    |

Rôles : `base` = fond des boutons primaires, pions PNJ, barre PV ; `hover` = hover des
primaires + 2e bande des barres PV hachurées ; `bord` = bordure des primaires, badges MJ ;
`texte-accent` = accent utilisé COMME TEXTE sur fond sombre (liens, badges MJ, valeurs de
caracs, hints actifs) — jamais `base` en texte sur fond sombre (contraste insuffisant).
Liens : `a { color: texte-accent }`, hover = version éclaircie (carmin : `#EB8A7A`).
IMPORTANT : dans les prototypes, seul le dashboard a le sélecteur branché ; les autres
écrans sont figés en carmin. En prod, TOUT élément accentué doit dériver de l'encre active
(variables CSS recommandées : `--accent`, `--accent-hover`, `--accent-border`, `--accent-text`).

## 3. Typographie (Google Fonts) — 2 familles seulement

- Titres : `Vidaloka` 400 (seule graisse existante). H1 page 30–40px, titre de carte 21–24px,
  gros chiffres de jeu (mod de carac, total de dé) 20–26px.
- Tout le reste : `Alegreya Sans` 400 / 500 / 700 — texte courant 13–16px, labels uppercase
  10–12px avec `letter-spacing:.05em` et graisse 700, boutons 700.
- Interdits (supprimés du thème) : Caveat, IBM Plex Mono, Cormorant Garamond, Spectral.

## 4. Trait « main levée » — dose minimale

- Un seul héritage du style carnet : le border-radius irrégulier sur panneaux et boutons,
  ex. `border-radius:255px 15px 225px 15px/15px 225px 15px 255px` — varier les valeurs
  entre éléments voisins (voir fichiers pour des variantes).
- Interdits : rotations décoratives, grilles de fond, hachures décoratives, labels ⟨ ⟩,
  emoji, texte de remplissage.

## 5. Composants (spec exacte dans Design System sombre.dc.html)

- Bouton primaire : fond `accent.base`, bordure `2px solid accent.bord`, texte `#FFF3EC` 700,
  hover `accent.hover`, radius irrégulier.
- Bouton/zone secondaire (créer, ajouter) : `2px dashed #575043`, texte `#9C947F`,
  hover : bordure `accent.base`, texte `#E8E2D4`.
- Bouton neutre (Tour suivant, Partager) : fond `#575043`, texte `#F2EDE0`, hover `accent.base`.
- Input : fond `#26221D`, bordure `2px solid #575043`, focus bordure `accent.base`,
  placeholder `#6E6759`.
- Badge de rôle : bordure 1.5px (`accent.bord` + texte `accent.texte-accent` pour MJ ;
  `#575043` + `#9C947F` pour joueur), radius `10px 3px 12px 3px`.
- Barre PV : cadre `2px solid #575043` radius 6px, remplissage
  `repeating-linear-gradient(-55deg, base 0 4px, hover 4px 8px)`.
- Sélection dans une liste/onglets : fond `#575043`, texte `#F2EDE0` (pas d'accent).
- Modale : panneau `#2E2A24`, bordure `2px solid #575043`, overlay `rgba(15,13,10,.6)`.

## 6. Cas particulier : la carte de jeu

La carte reste un « parchemin » CLAIR posé sur l'interface sombre (décision validée,
lisibilité des pions et du brouillard) : fonds `#F4F0E3` / `#ECE7DB`, grille `#E4DEC9`,
pions PJ fond `#FFFDF5` initiale `#3A362E`, pions PNJ fond `accent.base`, étiquettes
`rgba(255,253,245,.9)`, brouillard `#3B372E` (opacité .45 côté MJ, 1 côté joueurs).
Le dé animé en overlay reste clair lui aussi (faces `#FFFDF5`, chiffre `#B03427`).

## 7. Écrans → fichiers

| Écran             | Fichier                                     | Points d'attention                                                                     |
| ----------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Login             | `Accueil sombre.dc.html` (état `connexion`) | états : normal / refus (compte non autorisé) / invitation `/join/:token`               |
| Dashboard         | idem (état `dashboard`)                     | cartes campagne + badge rôle, zone dashed « créer », sélecteur Encre                   |
| Création campagne | idem (modale)                               | nom seul, système affiché en dur (H&D)                                                 |
| Table de jeu      | `Ecran de jeu sombre.dc.html`               | 3 colonnes : compagnie/PNJ · carte · Journal-Dés-Inventaire ; modes exploration/combat |
| Feuille           | `Feuille de personnage sombre.dc.html`      | tout élément lançable est cliquable (carac, comp., sauvegarde, attaque)                |
| Compendium        | `Compendium sombre.dc.html`                 | 3 colonnes ; catégories MJ verrouillées côté joueur                                    |

Écrans restant à concevoir (aucune maquette) : assistant de création de personnage (5 étapes),
modale de montée de niveau, picker compendium (saisie assistée), éditeur homebrew,
paramètres de campagne + invitations, états vides/erreurs/reconnexion.

## 8. Notes techniques

- Les `.dc.html` embarquent leur runtime : rendu fidèle en ouvrant simplement le fichier.
- Docs produit : `uploads/requirements.md` (R1–R14), `uploads/design.md`, `uploads/tasks.md`.
- Sources contenu DRS : https://fan.heros-et-dragons.com · https://github.com/igwane/heros-et-dragons-drs
