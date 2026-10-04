# Brouillard — ticket d'optimisation

> **Ticket indépendant du chantier d'UX/UI.** Aucun lien avec la refonte
> de l'interface. À traiter sur `main`, dans son propre commit.
>
> Né du spike `docs/atlas-benchmark/07bis-spike-lot1.md` §2 bis, où le relevé
> a révélé un problème préexistant et indépendant.

---

## 1. Le problème

`drawFog()` dimensionne la backing store du canvas de brouillard ainsi :

```js
const w = Math.max(2, mapContainer.offsetWidth);
const h = Math.max(2, mapContainer.offsetHeight);
const nextScale = Math.min(3, Math.max(1, viewZoom * dpr)); // ← le coupable
fogCanvas.width = Math.round(w * nextScale);
fogCanvas.height = Math.round(h * nextScale);
```

et `drawFogBase()` repeint ensuite la totalité du backing store :

```js
ctx.clearRect(0, 0, w, h);
ctx.fillRect(0, 0, w, h);                 // ~2 × la surface du backing store
for (let i = -h; i < w; i += 14) { … }    // hachures : (w + h) / 14 traits
```

**Le coût est linéaire en la surface de la backing store, donc en
`fogScale²`.** Et `fogScale` atteint 3 dès qu'on zoome sur un écran Retina,
puisque la formule est `min(3, zoom × dpr)`.

## 2. Les chiffres

Relevé sur la vraie table (`dev-camp`, carte `map-image`), `drawFogBase()`
reproduit à l'identique, CPU ralenti ×4 via CDP, médiane sur 7 répétitions avec
`getImageData(1×1)` pour forcer la rasterisation.

**2560×1440 `dpr` 2, zoom 1 → `fogScale` 2, surface 1681×1261 :**

| `fogScale`               | backing store | mémoire     | repeint médian | max      | vs budget image |
| ------------------------ | ------------- | ----------- | -------------- | -------- | --------------- |
| **1,0**                  | 1681×1261     | 8,1 Mo      | **5,8 ms**     | 12,7 ms  | ×0,3            |
| 1,5                      | 2522×1892     | 18,2 Mo     | 28,5 ms        | 42,5 ms  | ×1,7            |
| 2,0                      | 3362×2522     | 32,3 Mo     | 53,9 ms        | 74,1 ms  | ×3,2            |
| **3,0 — le code actuel** | 5043×3783     | **72,8 Mo** | **105,5 ms**   | 167,4 ms | ×6,3            |

Le budget d'image à 60 Hz est de **16,7 ms**. À `fogScale` 3, un repeint du
brouillard coûte **six budgets d'image, dix au pic**.

**Ce que ça donne aujourd'hui, sans aucune refonte :**

| écran                       | `fogScale` à zoom 1 | mémoire     | repeint médian |
| --------------------------- | ------------------- | ----------- | -------------- |
| 1280×720 `dpr` 1            | 1,0                 | 1,2 Mo      | 0,9 ms         |
| 1920×1080 `dpr` 1           | 1,0                 | 4,1 Mo      | 2,8 ms         |
| **2560×1440 `dpr` 2**       | **2,0**             | **32,3 Mo** | **58,1 ms**    |
| 2560×1440 `dpr` 2, zoom 1,5 | 3,0                 | 72,8 Mo     | 105,5 ms       |

## 3. À quel moment ça se sent

Un repeint complet ne se déclenche qu'à trois moments :

1. **changement de carte** (`!sameMap`)
2. **redimensionnement** de la surface (`resized`, via `ResizeObserver`)
3. **changement de `fogScale`** (tous les paliers de zoom), debouncé à 140 ms

Pendant le jeu, le chemin utilisé est l'**incrémental** : `drawFog()` ne découpe
que les **nouveaux** points de révélation (`reveals.slice(fogDrawnCount)`), ce
qui coûte quelques microsecondes. Le `destination-out` d'un dégradé radial de
68 px est une opération locale.

Donc le problème ne se voit **pas** pendant un tour de jeu. Il se voit quand on
change de carte ou qu'on zoome — c'est-à-dire aux transitions, qui sont précisément
les moments où une saccade se remarque.

## 4. Le correctif

### 4.1 Plafonner par nombre de pixels — le correctif principal

Une seule règle, valable sur toutes les résolutions et tous les écrans, là où le
multiplicateur actuel ne veut rien dire hors 720p :

```ts
/** Plafond de la backing store du brouillard, en pixels (~10 Mo en RGBA). */
const FOG_MAX_PX = 2.5e6;

// dans drawFog(), à la place de :
//   const nextScale = Math.min(3, Math.max(1, viewZoom * dpr));
const parPixels = Math.sqrt(FOG_MAX_PX / (w * h));
const nextScale = Math.min(3, Math.max(1, viewZoom * dpr), parPixels);
```

À 2560×1440 `dpr` 2, cela donne `fogScale` ≈ 1,1 : **le repeint repasse sous les
10 ms sur toutes les résolutions**, et la mémoire sous 10 Mo.

Le `min(3, zoom × dpr)` reste en place pour les petits écrans, où il ne mord pas.

### 4.2 Tupler les hachures — complément gratuit

Les hachures sont `(w + h) / 14` appels à `stroke()`, soit **211 traits** à
2560 de large, chacun tracé à l'échelle `fogScale`. On peut les remplacer par un
motif :

```ts
// un petit canvas 14×14 contenant une seule hachure, une seule fois
const hachure = document.createElement("canvas");
hachure.width = 14;
hachure.height = 14;
const hctx = hachure.getContext("2d")!;
hctx.strokeStyle = "rgba(251,248,240,.05)";
hctx.lineWidth = 1;
hctx.beginPath();
hctx.moveTo(-14, 14);
hctx.lineTo(14, -14);
hctx.stroke();

ctx.fillStyle = ctx.createPattern(hachure, "repeat")!;
ctx.fillRect(0, 0, w, h);
```

**Gain limité** : le `clearRect` + `fillRect` domine le coût, pas les traits. À
faire par-dessus, pas à la place du 4.1.

### 4.3 Ce qu'il ne faut PAS faire

- **Ne pas descendre `fogScale` à 1 en dur.** Le plafond par pixels de 4.1 fait
  déjà le travail et garde la netteté quand la carte est petite.
- **Ne pas toucher au chemin incrémental.** Il est déjà correct et il est la
  raison pour laquelle le jeu est fluide. Le 4.1 ne doit pas le toucher non plus.
- **Ne pas mettre le brouillard dans le chantier d'UX.** Il n'a aucun rapport
  avec le layout ni avec les surfaces flottantes.

## 5. Recette

```bash
pnpm dev
node scripts/_mesure-fogscale.cjs
```

Le script rejoue le tableau du §2 sur trois écrans. **Critère de recette** : à
2560×1440 `dpr` 2, la ligne « fogScale 3.0 » doit disparaître au profit d'une
valeur ≤ 1,2, avec une médiane **sous 12 ms**.

Une vérification manuelle en complément : ouvrir la table, changer de carte à
2560×1440, et confirmer que le voile de brouillard n'accuse pas de saccade.

## 6. Ce que ça ne corrige pas

Le brouillard est **un seul** des deux modèles de données du problème :

- **lumped** (ce ticket) : le bitmap de pixels. Optimisable seul, sans toucher
  au serveur.
- **par opérations** : le modèle que l'**undo** (Lot 4 du chantier d'UX) devra
  introduire, pour pouvoir annuler une zone de brouillard. C'est un changement de
  format dans le DO, dans `api/src/do/game-table.ts` (~2 300 lignes) — donc
  avec `api/test/game-table.test.ts` comme filet.

**Les deux sont indépendants.** Faire le 4.1 maintenant ne gêne pas le Lot 4, et
l'attendre rendrait le jeu saccadé sur les écrans Retina pendant tout le chantier
pour rien.

## 7. Fichiers concernés

| Fichier                                            | Rôle                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `web/src/routes/campaigns/[id]/table/+page.svelte` | `drawFog()` (l.~873), `drawFogBase()` (l.~844), `scheduleFogRedraw()` (l.~823) |
| `scripts/_mesure-fogscale.cjs`                     | rejoue le tableau du §2                                                        |
| `scripts/_mesure-brouillard.cjs`                   | variante multi-résolutions                                                     |
| `scripts/_rapport-fog.cjs`                         | rapport avant/après layout, surcharge injectée à chaud                         |
| `docs/atlas-benchmark/07bis-spike-lot1.md` §2 bis  | d'où vient ce ticket                                                           |

## 8. Estimation

Une demi-journée : le 4.1 seul, c'est une ligne. Le 4.2 et la recette font le
reste. Aucun changement de protocole, aucun changement de schéma, aucun impact
sur `shared/` ou `api/`.
