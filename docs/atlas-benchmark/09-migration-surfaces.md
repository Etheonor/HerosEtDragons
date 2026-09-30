# 09 — Feuille de route de migration des surfaces

> Établie au **Lot 0** du chantier (`07-parcours-implémentation.md` §0.4).
> Elle sert de checklist mécanique : on n'invente pas de valeurs, on remplace.
> Les valeurs cibles sont définies une seule fois dans
> `web/src/lib/ds/tokens.css` et `web/src/lib/ds/surfaces.css`.

---

## 1. `z-index` : littéral → variable sémantique

L'échelle est définie dans `tokens.css`. Le **top layer** (popovers, dialogs,
menus) n'utilise pas de `z-index` du tout : il s'ordonne par ordre d'ouverture.

| Couche             | Variable      | Valeur | Ancien (indicatif)                       |
| ------------------ | ------------- | ------ | ---------------------------------------- |
| Carte (fond)       | `--z-map`     | 0      | —                                        |
| Quadrillage        | `--z-grid`    | 10     | `1`                                      |
| Repères            | `--z-markers` | 15     | `5`                                      |
| Pions              | `--z-tokens`  | 18     | `10`                                     |
| Brouillard         | `--z-fog`     | 20     | `15`                                     |
| Ping               | `--z-ping`    | 30     | `20`                                     |
| HUD carte          | `--z-map-hud` | 100    | `30`                                     |
| Chrome ancré       | `--z-chrome`  | 200    | —                                        |
| Panneaux flottants | `--z-panels`  | 300    | `60` (panneaux maps/PNJ)                 |
| Overlay / modales  | `--z-overlay` | 400    | `40`, `50`, `60`, `70`, `80`, `90`, `95` |
| Toast              | `--z-toast`   | 500    | —                                        |

**Règle.** Un grep `z-index: [0-9]` dans `web/src` ne retourne rien.

**État.**

- ✅ Lot 0 — composants hors table : `MapManager`, `NpcLibrary`,
  `CompendiumTooltip`, `EncreSelector`, `ChoicePicker`, `CharacterSheet`,
  `SheetCombat`, `CharacterCreateModal`, accueil, `DiceOverlay`.
- ✅ Lot 1 — la table : couches `.layer-map` / `.layer-chrome` / `.layer-popups`,
  `map-bg` vs `map-zoom`, HUD, pions, repères, brouillard, ping, toast,
  ctx-menu.
- ✅ Lot 2 — les popovers ancrés (`Cartes`, bibliothèque PNJ, options d'outil)
  passent au-dessus des panneaux flottants (`--z-overlay`).

---

## 2. `border-radius` : 56 valeurs → 6 rayons

### 2.1 L'échelle cible

| Rayon           | Valeur | Usage                                |
| --------------- | ------ | ------------------------------------ |
| `--radius-xs`   | 4px    | chips, cases à cocher, petits badges |
| `--radius-sm`   | 8px    | boutons, champs, cartes              |
| `--radius-md`   | 12px   | panneaux, popovers, dropdowns        |
| `--radius-lg`   | 16px   | modales                              |
| `--radius-xl`   | 24px   | fenêtres flottantes                  |
| `--radius-full` | 9999px | pilules                              |

Deux exceptions **assumées**, hors migration :

- les **rayons organic** (`--sketchy-*`, en pourcentage) restent sur le contenu
  éditorial et les objets de jeu (cartes de personnage, blocs de feuille, pions) ;
- la **carte de jeu** n'a aucun rayon.

### 2.2 Table de conversion (chrome uniquement)

| Valeurs rencontrées (familles)                                                             | Cible                           |
| ------------------------------------------------------------------------------------------ | ------------------------------- |
| `4px`, `4px 1px 4px 1px`, `6px`, `6px 2px 6px 2px`, `6px 2px 7px 3px`                      | `--radius-xs`                   |
| `8px`, `8px 3px 8px 3px`, `8px 210px 8px 235px / 230px 8px 245px 8px`, `3px 8px 3px 8px`   | `--radius-sm`                   |
| `10px`, `10px 3px 10px 3px`, `10px 3px 12px 3px`, `10px 3px 12px 4px`, `10px 4px 10px 4px` | `--radius-md`\*                 |
| `12px`, `12px 3px 12px 3px`, `12px 3px 14px 4px`, `12px 4px 13px 4px`, `12px 4px 14px 4px` | `--radius-md`                   |
| `14px 4px 16px 5px`, `14px 5px 16px 5px`                                                   | `--radius-lg`                   |
| `15px 230px 15px 225px / …`, `15px 255px … / …`, `225px 12px …`, `255px 15px …` (sketchy)  | **on garde** (éditorial/objets) |
| `48% 52% …`, `50% 48% …`, `52% 48% …`                                                      | **on garde** (pions/portraits)  |
| `50%`                                                                                      | **on garde** (pastilles)        |
| `999px`                                                                                    | `--radius-full`                 |

\* Les chips `10px 3px 12px 3px` sont éditoriales (conditions, badges) : elles
gardent leur rayon organic. Ne migrer que les usages **chrome**.

**Règle.** On n'écrit plus `border:` ni `border-radius:` ni `box-shadow:` dans un
composant de chrome : on écrit `class="surface-raised"` / `"surface-overlay"`.

**État.**

- ✅ Lot 0 — un seul mixin de surface : `.surface-canvas` / `.surface-raised` /
  `.surface-overlay` (+ `.surface-lg` pour les modales). Migrés : `MapManager`,
  `NpcLibrary`, `EncreSelector`, `CompendiumTooltip`, `ChoicePicker`,
  `CharacterCreateModal`, accueil, `CharacterSheet` (picker portrait).
- ✅ Lot 1 — la table : panneaux flottants (`Compagnie`, `Séance`), entête de
  carte, bandeau de combat et barre d'outils passent aux classes de surface ;
  bouton de fermeture unique (`<CloseButton>`) ; carte sans rayon.
- ✅ Lot 2 — barre d'outils définitive, options d'outils (popover), command
  palette et aide clavier.

---

## 3. `title=` → libellés + `<kbd>`

Le chrome **neuf** (barre d'outils, palette, aide) n'utilise pas `title=` : les
boutons portent leur libellé visible, leur raccourci en `<kbd>` et leur
`aria-label`. La chasse aux `title=` restants (~80) et le composant `<Tooltip>`
bits-ui sont repoussés aux finitions (Lot 8), écran par écran.
