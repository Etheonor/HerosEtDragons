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

## 2. Le brouillard — la mesure principale

`drawFogBase()` reproduit **à l'identique** dans la page, sur un canvas jetable
aux dimensions réelles (`mapContainer.offsetWidth/Height`, la même source que le
produit), avec un `getImageData(1×1)` pour forcer la rasterisation — sans quoi on
ne chronomètre que la soumission des commandes et on obtient 0,0 ms.

Viewport 1280×720, `devicePixelRatio` 1, 7 répétitions, médiane.

| zoom          | fogScale | backing store | Mpx  | mémoire     | traits | repeint médian | max  |
| ------------- | -------- | ------------- | ---- | ----------- | ------ | -------------- | ---- |
| **grille** 1× | 1,00     | 640×480       | 0,31 | 1,2 Mo      | 80     | **1,8 ms**     | 3,0  |
| **plein** 1×  | 1,00     | 960×720       | 0,69 | **2,6 Mo**  | 120    | **5,6 ms**     | 14,4 |
| **grille** 2× | 2,00     | 1280×960      | 1,23 | 4,7 Mo      | 80     | **9,2 ms**     | 12,2 |
| **plein** 2×  | 2,00     | 1920×1440     | 2,76 | **10,5 Mo** | 120    | **17,3 ms**    | 35,2 |
| **grille** 3× | 3,00     | 1920×1440     | 2,76 | 10,5 Mo     | 80     | **14,9 ms**    | 28,9 |
| **plein** 3×  | 3,00     | 2880×2160     | 6,22 | **23,7 Mo** | 120    | **30,0 ms**    | 46,2 |

**Bilan.**

- **Mémoire ×2,25**, exactement le rapport de surface (960×720 contre 640×480).
- **Repeint ×2 à ×3,1.**
- Le pic à **46 ms** dépasse **trois budgets de frame** (16,7 ms).

### Ce que ça veut dire — et ce que ça ne veut pas dire

Ce n'est pas un blocage. Un repeint complet ne se produit qu'au **changement de
carte**, au **redimensionnement** et au **changement de `fogScale`** (debouncé à
140 ms). Pendant le jeu, le chemin utilisé est l'incrémental : on ne découpe que
les nouveaux points, ce qui coûte quelques µs.

En revanche la marge est mince, et trois leviers existent, par ordre de rapport
effort/résultat :

1. **Plafonner `fogScale` à 2 au lieu de 3.** Divise par ~2,2 la mémoire et le
   repeint. Le brouillard reste net jusqu'à 200 % de zoom, ce qui couvre
   l'usage réel. Une ligne à changer.
2. **Ne pas redessiner quand seule la taille change à la marge.** Le debounce de
   140 ms existe déjà ; ajouter un seuil sur le rapport de taille évite des
   repeints à chaque micro-resize.
3. **Tupler le motif de hachures** au lieu de tracer 120 lignes à chaque fois :
   un petit canvas 14×14 en motif `createPattern`. Divise le coût des hachures
   par un ordre de grandeur.

⚠️ **Ces chiffres sont mesurés en 1280×720 `dpr` 1** — la référence la plus
prudente. La cible étant un grand écran souvent **Retina**, le coût réel est
**bien pire** : voir `07bis` §2 bis, où le même relevé à 2560×1440 `dpr` 2 donne
105 ms de repeint et 73 Mo par passe.

## 2 bis. Le même relevé sur la cible réelle : c'est pire

La section 2 ci-dessus mesure en 1280×720 `dpr` 1. C'est la référence la plus
prudente — **et la moins représentative**. La cible est un PC de bureau avec un
grand écran, et ces écrans sont très souvent en **Retina** (`devicePixelRatio` 2).

Or la formule du produit est `fogScale = min(3, zoom × dpr)`. **Sur un Retina,
le canvas de brouillard double dès le zoom 1.** Relevé en plein écran, CPU ralenti
×4, surface 1681×1261 à 2560×1440 :

| `fogScale`               | backing store | Mpx   | mémoire     | repeint médian | max          | vs budget image (16,7 ms) |
| ------------------------ | ------------- | ----- | ----------- | -------------- | ------------ | ------------------------- |
| **1,0**                  | 1681×1261     | 2,12  | 8,1 Mo      | **5,8 ms**     | 12,7 ms      | **×0,3**                  |
| 1,5                      | 2522×1892     | 4,77  | 18,2 Mo     | 28,5 ms        | 42,5 ms      | ×1,7                      |
| 2,0                      | 3362×2522     | 8,48  | 32,3 Mo     | 53,9 ms        | 74,1 ms      | ×3,2                      |
| **3,0 — le code actuel** | 5043×3783     | 19,08 | **72,8 Mo** | **105,5 ms**   | **167,4 ms** | **×6,3**                  |

En 1920×1080 `dpr` 1, on est déjà à 54,8 ms et 37,2 Mo en `fogScale` 3.

**Sur la machine d'un joueur Retina en 1440p, le repeint complet du brouillard
dure 105 ms et coûte 73 Mo par passe — six budgets d'image, dix au pic.** C'est
le pire qui arrive au changement de carte, au redimensionnement et au passage
d'un palier de zoom. Ce n'est pas un gel, mais c'est très visible.

Le levier est net : **`fogScale` à 1,0 coûte 5,8 ms pour 8,1 Mo.** Le brouillard
est un voile sombre à dégradés radiaux : à `fogScale` 1 il reste parfaitement
lisible, juste légèrement adouci quand on zoome.

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
3. **Plafonner la backing store du brouillard par nombre de pixels** (§2 bis).
   En 2560×1440 `dpr` 2, le code actuel coûte 105 ms et 73 Mo par repeint.
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
travail, et un dossier `scripts/` qui accumulates des scripts de debug jetables
devient un piège dans six mois.
