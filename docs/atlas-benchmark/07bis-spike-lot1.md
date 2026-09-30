# 07bis — Spike Lot 1 : la bascule sur la vraie table

> Complément à `07-parcours-implémentation.md` §Lot 1.
> Date : 30 septembre 2026. Branche `feat/uiv2`.
> Le spike lui-même a été **reverti** : il n'est pas destiné à être gardé.
> Ce qui reste, ce sont les mesures et les trois constats.

## 1. Ce qu'on a fait

Pas une page isolée cette fois : **la vraie table**, avec la vraie fixture
(`dev-camp`, carte `map-image`), pilotée par Playwright, CPU **ralenti ×4**.

Une surcharge CSS de ~40 lignes en fin de feuille, posée sur
`campaigns/[id]/table/+page.svelte` :

```css
.table-body {
  display: block;
  position: absolute;
  inset: 0;
}
.map-area {
  position: absolute;
  inset: 0;
  display: block;
}
.map-frame {
  position: absolute;
  inset: 0;
  margin: 0;
}
.map-header,
.combat-bandeau,
.mj-toolbar {
  position: absolute;
  z-index: 50;
}
.compagnie,
.panel {
  position: absolute;
  top: 96px;
  bottom: 16px;
  z-index: 60;
}
.mj-toolbar {
  z-index: 70;
} /* voir §3 */
```

Tout est mesuré dans les **deux layouts**, en basculant à chaud par une seconde
surcharge qui neutralise la première — donc sans jamais réécrire le produit.

## 2. Le brouillard — mesure, et mise au point

> **Mise au point (30/09, après re-mesure).** Le premier relevé comparait
> 1280×720 grille contre 1280×720 plein écran, et concluait « ×2,25 ». C'est
> **faux pour la cible**. En dessous de ~1500 px de large, la grille à 3 colonnes
> (288 + 324 px fixes) écrase la carte ; au-delà, elle lui laisse déjà presque
> toute la place. Le vrai rapport, mesuré à la résolution cible, est **×1,26**.
> Voir §2 bis.

Le brouillard dimensionne sa backing store ainsi :

```js
bw = mapContainer.offsetWidth * fogScale;
bh = mapContainer.offsetHeight * fogScale; // fogScale = min(3, zoom * dpr)
```

CPU ralenti ×4, `devicePixelRatio` 1, 1280×720, médiane sur 7 répétitions :

| zoom      | fogScale | backing store | mémoire | traits | repeint médian | max  |
| --------- | -------- | ------------- | ------- | ------ | -------------- | ---- |
| grille 1× | 1,00     | 640×480       | 1,2 Mo  | 80     | 1,8 ms         | 3,0  |
| plein 1×  | 1,00     | 960×720       | 2,6 Mo  | 120    | 5,6 ms         | 14,4 |
| grille 3× | 3,00     | 1920×1440     | 10,5 Mo | 80     | 14,9 ms        | 28,9 |
| plein 3×  | 3,00     | 2880×2160     | 23,7 Mo | 120    | 30,0 ms        | 46,2 |

Le repeint complet ne survient qu'au changement de carte, au redimensionnement
et au changement de `fogScale` (debouncé à 140 ms). Pendant le jeu c'est le chemin
incrémental qui tourne, pour quelques microsecondes.

## 2 bis. Le vrai rapport avant/après, à la résolution cible

Le même jour, sur un 2560×1440 **Retina** (`dpr` 2), zoom 1 → `fogScale` 2,
CPU ralenti ×4 :

|                         | grille **actuelle** | plein écran **après** | rapport   |
| ----------------------- | ------------------- | --------------------- | --------- |
| zone carte              | 1920×1261           | 2560×1440             |           |
| `map-surface`           | 1681×1261           | 1920×1440             |           |
| surface                 | 2,12 Mpx            | 2,76 Mpx              | **×1,30** |
| **mémoire par repeint** | **32,3 Mo**         | **42,2 Mo**           | **×1,30** |
| **durée du repeint**    | **58,1 ms**         | **73,0 ms**           | **×1,26** |

| écran             | rapport mémoire | rapport durée |
| ----------------- | --------------- | ------------- |
| 2560×1440 `dpr` 2 | ×1,30           | ×1,26         |
| 1920×1080 `dpr` 1 | ×1,44           | ×1,46         |
| 1280×720 `dpr` 1  | ×2,25           | ×2,22         |

### Les deux conclusions qui en découlent

**1. Ce n'est pas un risque de la refonte.** Le brouillard coûte déjà **58 ms et
32 Mo par repeint aujourd'hui**, à 2560×1440 Retina, zoom 1, sans aucune
refonte. La refonte l'aggrave de **26 %**. C'est un **bug préexistant**, pas une
conséquence du chantier.

**2. C'est un ticket séparé, à traiter séparément.** Le correctif ne dépend
absolument pas de l'UX, du layout, ni de la position de la carte. C'est une
ligne dans `drawFog()`. Il peut — et doit — être fait **sur `main`, dans son
propre commit, avant la refonte**. Le mélanger au chantier d'UX n'aurait aucun
sens : on livrerait 40 jours de travail d'interface pour un gain de 26 % sur un
bug qui en vaut 100 % tout seul.

### Le coût réel du brouillard, par valeur de `fogScale`

Relevé à 2560×1440 `dpr` 2, surface 1681×1261 (budget d'image 60 Hz = 16,7 ms) :

| `fogScale`               | backing store | mémoire | repeint médian | max      | vs budget |
| ------------------------ | ------------- | ------- | -------------- | -------- | --------- |
| **1,0**                  | 1681×1261     | 8,1 Mo  | **5,8 ms**     | 12,7 ms  | **×0,3**  |
| 1,5                      | 2522×1892     | 18,2 Mo | 28,5 ms        | 42,5 ms  | ×1,7      |
| 2,0                      | 3362×2522     | 32,3 Mo | 53,9 ms        | 74,1 ms  | ×3,2      |
| **3,0 — le code actuel** | 5043×3783     | 72,8 Mo | **105,5 ms**   | 167,4 ms | ×6,3      |

### La correction recommandée

Plafonner la backing store **par nombre de pixels**, pas par un multiplicateur —
une seule règle qui tient sur toutes les résolutions et tous les écrans :

```ts
const MAX_PX = 2.5e6; // ≈ 10 Mo
const parPixels = Math.sqrt(MAX_PX / (w * h));
const fogScale = Math.min(3, Math.max(1, viewZoom * dpr), parPixels);
```

À 2560×1440 `dpr` 2, ça donne `fogScale` ≈ 1,1 : le repeint repasse sous les
10 ms sur toutes les résolutions. Et le plafond `min(3, zoom × dpr)` reste
applicatif sur les petits écrans, où il ne mord pas.

Alternative si la netteté du voile est jugée importante : **tupler les hachures**
avec `createPattern` (un canvas 14×14 reproduit en motif). Ça ne touche pas au
`fillRect`, qui domine le coût, donc le gain est limité — mais c'est gratuit à
faire par-dessus.

`node scripts/_mesure-fogscale.cjs` rejoue ce tableau et permet de vérifier le
correctif.

### Pourquoi ce n'était pas visible avant

Le premier relevé a été fait en 1280×720 `dpr` 1, où `fogScale` plafonne à 3
sans jamais atteindre 2×. La conclusion « ×2,25, c'est gérable » était **juste à
cette résolution-là** et fausse partout ailleurs. Mesurer la répartition des
écrans cibles avant de conclure, pas après.

## 3. Constat n°1 — un popover ne peut pas sortir de son parent

**6 tests e2e cassaient**, tous au clic sur « Cartes ». Playwright a désigné le
coupable sans ambiguïté :

```
maps-panel   rect=[83, 86, 300, 406]  pos=absolute  z=60
             BLOQUE PAR  DIV.char-card pj-card
```

`MapManager` est rendu **dans** `.mj-toolbar`. La barre a un `z-index` → elle crée
un contexte d'empilement → **tout ce qu'elle contient est plafonné à son
`z-index`**. Avec la barre à 50 et les panneaux flottants à 60, le popover passait
sous la colonne compagnie.

Corrigé par `z-index: 70` sur la barre. **Mais c'est une pansement**, et c'est
la démonstration la plus nette du besoin de portail : dès qu'un élément flottant
doit dépasser son parent, la pile de z-index cesse d'être gérable.

→ **Règle pour le Lot 1** : aucun popover ne vit dans la barre d'outils. Tout
passe par `Portal`. C'est le Lot 0 qui pose la brique.

## 4. Constat n°2 — les tests e2e encodent la géométrie de l'ancien layout

**2 tests restaient en échec** : les deux tests de panoramique.

```
surface avant  {x: 160, y: 0,  w: 960, h: 720}     cadre 1280×720
surface après  {x: 160, y: 80, w: 960, h: 720}
dx = 0
```

Ce n'est **pas** un bug. `clampView()` fait :

```js
viewPanX = z * sw >= frameW ? /* pan libre */ : (frameW * (1 - z)) / 2;
```

En plein écran, la carte (960 px) est **plus étroite** que le cadre (1280 px) :
`z * sw >= frameW` est faux → la carte est centrée et **le panoramique
horizontal est verrouillé à 0**. C'est le bon comportement — toute la carte est
visible, il n'y a rien à faire défiler.

Dans l'ancien layout, cadre et carte faisaient chacun 640 px de large :
`640 >= 640` était vrai → le pan était libre. **L'égalité stricte était un
hasard géométrique**, et le test en a hérité.

→ **Conséquence pour le Lot 1** : l'assertion `|after.x - before.x| > 40` est à
**réécrire**, pas à réparer. Elle doit tester « la carte bouge **quand elle a de
la marge** », en zoomant d'abord pour créer un débordement. Le test devient plus
fort, pas plus faible.

## 5. Constat n°3 — le rapport largeur de carte / largeur de cadre change le geste

Un point de produit, pas de technique. En plein écran, une carte **plus petite**
que l'écran n'a plus de marge de panoramique : le MJ ne peut plus centrer un
détail sur une image qui tient entièrement.

Avant : le cadre était étroit (640 px), donc presque toute carte avait du
débordement et était déplaçable. Après : une carte 16:9 sur un écran large tient
et devient fixe.

C'est le comportement attendu d'un jeu — mais c'est un **changement de sensation**
qu'il faut assumer : la caméra ne sert plus qu'en zoom. Le Lot 3 (objet
`<Camera>` avec `centerOn`) devient d'autant plus nécessaire.

## 6. Bilan des tests

|           | avant | pendant le spike | après revert |
| --------- | ----- | ---------------- | ------------ |
| e2e verts | 20    | 17               | **20**       |

Casse, et pourquoi :

| Test                          | Cause                               | Verdict                              |
| ----------------------------- | ----------------------------------- | ------------------------------------ |
| 6 tests « grille et vue »     | popover prisonnier de la barre (§3) | vrai problème, résolu par le portail |
| 2 tests de panoramique        | `clampView` centre la carte (§4)    | faux test, à réécrire                |
| 1 test compendium (parfois 2) | instable **avant** le spike         | préexistant, hors sujet              |

## 7. Ce que le Lot 1 doit intégrer

1. **Aucun popover dans la barre d'outils.** Tout part en `Portal`. Non négociable,
   c'est la condition du §3.
2. **Réécrire les 2 tests de panoramique** pour zoomer d'abord et créer un
   débordement.
3. **Le brouillard n'est pas un chantier de la refonte.** C'est un bug
   préexistant : 58 ms et 32 Mo par repeint dès aujourd'hui en 2560×1440 Retina.
   La refonte l'aggrave de 26 %, pas plus. Le corriger dans un ticket séparé, sur
   `main`, avant la refonte (§2 bis).
4. **Vérifier sur la résolution cible.** Le tableau ci-dessus est à 2560×1440
   `dpr` 2. Rejouer `scripts/_mesure-fogscale.cjs` sur la machine de référence.
5. **`.map-frame` doit être scindé** (cf. `05-architecture-svelte.md` §1.7
   piège B) : une couche qui porte le pointeur, une couche d'objets qui ne le
   porte pas. Le spike ne l'a pas fait et les tests de panoramique sont passés
   par-dessus — c'est un piège qui reste ouvert.
6. **Les panneaux doivent être refermables** et ne pas recouvrir la carte. Le
   spike les laissait ouverts et superposés au bord droit.

## 8. Le script de mesure

`scripts/_mesure-brouillard.cjs` — à garder, à réexécuter après le Lot 1 pour
vérifier que le plafond `fogScale` fait son effet. Il se relance tout seul :

```bash
pnpm dev            # le worker sur :8787
node scripts/_mesure-brouillard.cjs
```

Les sondes ad hoc (`_probe-*.cjs`) ont été supprimées : elles ont fait leur
travail, et un dossier `scripts/` qui accumule des scripts de debug jetables
devient un piège dans six mois.
