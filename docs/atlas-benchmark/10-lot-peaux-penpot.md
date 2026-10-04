# 10 — Lot « Peaux Penpot du chrome »

> **Lot ajouté après les lots 0-5**, décidé le 02/10/2026. Les lots 0-5 ont livré
> la _structure_ (carte plein écran, panneaux flottants, barre d'outils,
> initiative verticale, asset manager) ; ce lot applique les **maquettes
> Penpot** aux surfaces restantes, dont quatre composants qui n'étaient dans
> aucun lot.
>
> **Décisions actées** :
>
> 1. le **GroupFrame** (bloc groupe compact, haut-gauche) **remplace** le
>    panneau Compagnie ; l'audit de perte d'information est au §2.1 ;
> 2. le **TargetFrame** est **partagé** entre tous (l'état vit dans le DO).
>
> À traiter sur `feat/uiv2`, `pnpm check` et `pnpm e2e` verts, après le lot 6.

---

## 1. Pourquoi ce lot

Les maquettes (`Croquis v2`) contiennent des composants qui n'ont jamais été
implémentés, ou seulement en structure :

| Composant Penpot               | État actuel                                                 |
| ------------------------------ | ----------------------------------------------------------- |
| `InitiativeShell`/`Row`        | livré (5.3), à resserrer sur le maître                      |
| `Toolbar`                      | structure livrée (lot 2) ; libellés au lieu d'icônes seules |
| `DiceButton`/`DicePad`         | pad actuel plus simple ; lot 8.4 ne fait que le feedback    |
| `WindowChat`/`WindowInventory` | fonctionnels, ancien habillage des fenêtres                 |
| `Zoom`                         | HUD existant, ancien style                                  |
| `GroupFrame`/`Down`/`Enemy`    | **n'existe pas** (Compagnie à la place)                     |
| `TargetFrame`                  | **n'existe pas**                                            |
| `TopActions`                   | **n'existe pas** (aide via `?` seulement)                   |

## 2. Périmètre

### 2.1 GroupFrame — remplace la Compagnie

**Contenu du frame (maquette)** : portrait rond (avec pastille de présence),
nom, sous-titre (« Classe 5 »), barre de PV + valeurs (`32 / 45`). Variantes :
`Enemy` (PNJ, liseré rouge), `Down` (défait : grisé).

**Périmètre d'affichage (décidé)** : les **PJ sont toujours affichés** — posés
ou non sur la carte, actifs ou non (les inactifs sont grisés et non ciblables) ;
les **PNJ ne sont affichés que s'ils ont un pion sur la carte active** (comme
l'initiative et le dashboard). Un PJ non posé se place en double-cliquant sa
ligne (MJ) ; les PNJ non posés vivent dans la bibliothèque.

**Audit de perte — ce que la Compagnie fait aujourd'hui qui n'est pas sur la
maquette :**

| Fonction actuelle                 | Devient                                                           | Gravité                      | Mitigation                   |
| --------------------------------- | ----------------------------------------------------------------- | ---------------------------- | ---------------------------- |
| CA visible                        | TargetFrame (quand ciblé), menu contextuel, fiche                 | 🟢 non grave                 | —                            |
| Portrait + nom + race/classe/niv  | gardés dans le frame                                              | 🟢                           | —                            |
| Lien « Feuille »                  | clic droit → « Ouvrir la feuille » ; vignette → fiche             | 🟡                           | à ajouter au menu du frame   |
| Barre de PV + valeurs             | gardées dans le frame                                             | 🟢                           | —                            |
| Boutons `− / +` PV                | au **survol de la barre** du frame (MJ/propriétaire), + menu      | 🔴 le geste le plus fréquent | visible au survol, pas caché |
| Init +n                           | initiative rail (scores), menu/fiche                              | 🟡                           | —                            |
| « Placer sur la carte »           | double-clic sur le frame (MJ) si pas posé, sinon recentrer ; menu | 🟡                           | —                            |
| Taille du pion (select)           | clic droit (déjà sur le pion), menu du frame                      | 🟡                           | —                            |
| Conditions : pastilles + `+ état` | pastilles compactes (2-3 + « +N ») ; édition par menu/fiche       | 🟡                           | décision Q3                  |
| « modèle » / supprimer PNJ (MJ)   | clic droit → menu unique (entrées existantes)                     | 🟢                           | —                            |
| Filtre « PJ actifs »              | conservé (les inactifs vivent dans la bibliothèque)               | 🟢                           | —                            |
| Bandeau « à lui de jouer »        | liseré actif du frame (comme l'initiative)                        | 🟢                           | —                            |

**Verdict** : rien de vital n'est perdu **à condition** que (a) le `−/+` PV
soit au survol de la barre, (b) le clic droit du frame porte le menu complet
(PV, états, taille, placer, fiche, modèle/supprimer). La recette l'exige : le
MJ soigne un PJ en ≤ 2 gestes, et place un PNJ en ≤ 2 gestes.

**Interactions proposées** :

- **clic**, MJ = cibler (re-clic = retirer la cible) ; joueur = recentrer la
  caméra sur le pion ;
- **double-clic** = recentrer la caméra si posé, sinon placer (MJ) ;
- **clic droit** = menu unique (mêmes entrées que le pion + fiche) ;
- **survol de la barre de PV** = `− / +` (MJ ou propriétaire) ;
- les PJ inactifs sont grisés : ni cible, ni recadrage, ni PV.

### 2.2 TargetFrame — partagé

- L'état vit dans le DO : `TableLiveState.target: charId | null`, message WS
  `target.set { charId | null }`, diffusé comme une mutation normale.
- **Seul le MJ cible** (décision) ; tout le monde voit la même barre en haut au
  centre, et seul le MJ peut la fermer. Pas de conflit « dernier clic gagne ».
- Rendu : portrait, nom, CA, barre de PV (± au survol ?), conditions, `×`.
- **B5** : un PNJ non révélé ciblé par le MJ doit être **invisible** chez les
  joueurs (le filtre au broadcast renvoie `target: null`, comme `combat`).
- Le frame ne doit pas gêner la caméra ni la barre du header ; il se place
  sous le `TopActions`.

### 2.3 TopActions + Zoom

- `TopActions` (décidé) : trois boutons carrés — **Compendium** (navigue vers
  l'écran compendium ; deviendra un panneau au lot 7.3), **Tableau de bord**
  (bascule `panelsOpen.dashboard`, remplace l'accès par la palette seule), et
  **`?`** = aide clavier. L'engrenage de la maquette est écarté : les réglages
  vivent déjà dans la palette (Espace).
- `Zoom` : reskin du `.map-hud` actuel sur le composant Penpot (`− 100 % +`),
  même comportement (déjà validé par les e2e « caméra »).

### 2.4 Fenêtres et dés

- `<Panel>` gagne l'en-tête Penpot : icône + titre + **réduire** (repli à la
  barre de titre) + fermer (décision Q6).
- Journal / Inventaire : simple peau (titre, séparateurs, densité) — le
  contenu est déjà en place.
- **DicePad** (maquette) : modificateur en pas-à-pas `− 0 +`, dés D4-D20, gros
  bouton `LANCER 1D20 + n`, **historique des derniers jets**. Le lot 8.4 ne
  garde alors que le feedback (toast au lieu du plein écran).

### 2.5 Resserrement toolbar + initiative

- Toolbar : icônes seules (les `aria-label` restent — les e2e s'appuient
  dessus), raccourci en tooltip `<kbd>`, actif rouge, fin des libellés
  permanents.
- Initiative : typo/espacements sur `InitiativeRow` (badge score à droite,
  sous-titre PV, liseré actif) — déjà proche, c'est du réglage.

## 3. Décisions actées (02/10/2026)

1. **Périmètre** : PJ toujours affichés (posés ou non, actifs ou non, les
   inactifs grisés) ; PNJ affichés seulement s'ils sont posés sur la carte
   active. — acté.
2. **Interactions** : clic = cibler, double-clic = recentrer/placer, clic
   droit = menu, `−/+` PV au survol de la barre. — acté.
3. **Qui cible** : **MJ seul** ; tout le monde voit la barre. — acté.
4. **TopActions** : Compendium + Tableau de bord + Aide (`?`) ; pas
   d'engrenage (la palette s'en charge). — acté.
5. **Réduire** les fenêtres : oui, repli à la barre de titre. — acté.
6. **DicePad** : refonte complète dans ce lot (modificateur + historique) ;
   le lot 8.4 ne garde que le feedback (toast). — acté.
7. **Compagnie** : commande palette « Compagnie (liste complète) » en secours
   temporaire pendant la validation. — acté.

8. **Conditions sur le frame** : **Option A** — jusqu'à 3 pastilles compactes
   - « +N » au-delà, édition par le clic droit (mêmes entrées que le pion).
     — acté.

## 4. Tâches et estimation

| #   | Tâche                                                                 | E         |
| --- | --------------------------------------------------------------------- | --------- |
| 1   | `<GroupFrame>` (+ Enemy/Down), remplace la Compagnie, menu contextuel | 1,5 j     |
| 2   | TargetFrame partagé : état DO + WS + filtre B5 + rendu + clic pion    | 1 j       |
| 3   | TopActions + reskin Zoom                                              | 0,5 j     |
| 4   | Peau des fenêtres (`<Panel>` réduire) + DicePad enrichi               | 1 j       |
| 5   | Resserrement toolbar + initiative sur les maîtres                     | 0,5 j     |
|     | **Total**                                                             | **4,5 j** |

## 5. Risques

- 🔴 **Perte d'efficacité MJ** : tout ce qui était sur la Compagnie part dans
  des menus. La recette « ≤ 2 gestes » (soigner, placer) est le garde-fou.
- 🟡 **Tests e2e** : une dizaine s'appuient sur `.pj-card` / `.pnj-card` /
  `.size-select` / `.cond-select` (placer, taille, conditions, inventaire) —
  réécriture incluse dans l'estimation.
- 🟡 **TargetFrame partagé** : le dernier clic gagne ; il ne doit jamais
  divulguer un PNJ caché (filtre au broadcast ET au snapshot).
- 🟡 **Chrome masquable** : prévoir un chemin de retour évident (même bouton,
  ou Échap) pour ne pas piéger.
- 🟡 **Toolbar icône-seule** : conserver les `aria-label` et les tooltips,
  sinon perte d'accessibilité et e2e cassés.

## 6. Recette

- Le bloc gauche affiche les PJ + les PNJ de la scène, avec PV et états, et
  remplace visuellement la Compagnie ;
- le MJ cible un gobelin (clic) : la TargetFrame s'affiche **chez tous** ; le
  MJ la ferme, elle disparaît partout ; un PNJ caché ciblé n'apparaît pas
  chez les joueurs (B5) ;
- le MJ soigne un PJ en ≤ 2 gestes et place un PNJ en ≤ 2 gestes ;
- engrenage → palette Réglages ; chevron → carte seule puis retour ;
- les dés se lancent depuis le pad avec modificateur et historique ;
- `pnpm check` et `pnpm e2e` verts.

## 7. Fichiers concernés

- `shared/src/protocol.ts` + `ws-validation.ts` : `target.set`, `target` dans
  l'état et les patches ; `api/src/do/game-table.ts` : handler + filtre B5 +
  snapshot.
- `web/src/lib/table/GroupFrame.svelte`, `TargetFrame.svelte`,
  `TopActions.svelte` (nouveaux) ; `Panel.svelte` (réduire) ;
  `AssetManager` inutile ici ; `campaigns/[id]/table/+page.svelte`
  (assemblage, suppression de la Compagnie) ; `ds/icons.ts` si icônes
  manquantes.
- `e2e/table.spec.ts` : réécriture des tests Compagnie + nouveaux tests
  cible/chrome.
