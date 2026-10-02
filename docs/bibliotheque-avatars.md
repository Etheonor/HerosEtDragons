# Bibliothèque d'avatars — ticket

> **Feature dédiée**, née des compléments de l'asset manager (commit
> `c516dcc`). Le chantier d'UX/UI (lots 0-5) a livré l'upload direct
> « Changer l'avatar… » **sans cadrage**, stocké par personnage ; ce ticket
> remplace ce flux par une vraie bibliothèque de campagne avec recadrage
> carré et réutilisation.
>
> À traiter sur son propre commit, `pnpm check` et `pnpm e2e` verts.

---

## 1. L'état actuel

Deux sources d'avatars coexistent :

| Source              | Clé en base `sheet.portrait` | Fichier                                          |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| Bibliothèque Penpot | `<Race>/<CODE>`              | `web/static/portraits/<Race>/<CODE>.webp` (128²) |
| Upload direct       | `custom:<charId>:<version>`  | R2 `portraits/<campaignId>/<charId>`             |

Limites :

- l'upload direct **ne recadre pas** : une photo paysage est étirée/rogner
  par `object-fit: cover` au bon vouloir du conteneur, et la sortie garde la
  résolution d'origine (une photo de 12 Mo part telle quelle dans R2) ;
- l'avatar est **attaché au personnage** : impossible de réutiliser un joli
  portrait pour trois gobelins, ou de le corriger une fois pour toutes ;
- pas de nom, pas de liste, pas de suppression : on ne peut qu'écraser ;
- l'orientation EXIF des photos n'est pas traitée (`createImageBitmap` la
  corrige seulement si on le demande) ;
- `sheet.portrait` est borné à 80 caractères (le marqueur `custom:` fait 57) :
  il faut garder les identifiants courts.

## 2. Objectif

1. **Uploader** une image, la **cadrer en carré** (zoom + déplacement),
   produire un avatar 512×512 raisonnable (≤ 150 Ko).
2. La ranger dans une **bibliothèque de campagne** : nommée, listée,
   réutilisable sur n'importe quel personnage (PJ comme PNJ), renommable,
   supprimable.
3. Remplacer le flux « Changer l'avatar… » par un **sélecteur** : avatars de
   la campagne + portraits Penpot + « Importer une image… ».
4. Garder les avatars `custom:` existants **fonctionnels** (rétrocompat).

**Hors périmètre** : filtres/retouche, détourage automatique du fond, avatars
partagés entre campagnes, GIF/vidéo, recadrage non carré.

## 3. Modèle de données

Table D1 (migration drizzle) :

```ts
export const campaignAvatars = sqliteTable("campaign_avatars", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
```

R2 : clé `avatars/<campaignId>/<avatarId>` (sans extension ; le type vient de
`httpMetadata.contentType`, comme les portraits actuels).

Marqueur en base : `sheet.portrait = "avatar:<avatarId>:<version>"` — 7 + 36 +
1 + 13 = 57 caractères, sous la borne de 80. `portraitUrl()` le résout vers
`/api/avatars/<avatarId>/image?v=<version>` (cache-busting identique à
`custom:`).

La liste des avatars n'entre **pas** dans le snapshot WS : elle vit en REST,
comme les cartes et les modèles PNJ. Seul le marqueur de la fiche circule
(dans `CharacterCard.portrait`, déjà filtré B5).

## 4. Le cadrage

Composant maison `<AvatarCropper>` (`web/src/lib/table/`), pas de lib :

- **Décodage** : `createImageBitmap(file, { imageOrientation: "from-image" })`
  (corrige l'EXIF) ; repli `<img>` + `URL.createObjectURL` si indisponible ;
- **UI** : carré de 512 px, image en `cover`, drag au pointeur, molette pour
  zoomer (1× à 4×, minimum = cover), clamp aux bords, grille des tiers ;
- **Sortie** : canvas 512×512, `drawImage` avec les offsets calculés,
  `toBlob("image/webp", 0.85)` — repli `image/jpeg` 0.9 si le navigateur
  n'encode pas WebP (Safari ancien) ;
- pas d'animation (aucun besoin de `prefers-reduced-motion`), testé sur la
  fixture e2e avec un PNG généré.

C'est ~150-200 lignes de canvas, largement sous le coût d'intégration d'une
lib (`cropperjs` ≈ 50 Ko, `svelte-easy-crop` = une dépendance de plus pour
un seul écran).

## 5. API

| Route                                     | Rôle                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| `POST /api/campaigns/:campaignId/avatars` | multipart `image` + `name` → crée (sniff signature, 8 Mo)      |
| `GET /api/campaigns/:campaignId/avatars`  | liste (membres de la campagne)                                 |
| `PATCH /api/avatars/:avatarId`            | renommer `{ name }` (MJ ou auteur)                             |
| `DELETE /api/avatars/:avatarId`           | supprime — **409 si utilisée** par un personnage               |
| `GET /api/avatars/:avatarId/image`        | sert l'objet R2 (membres, `cache-control: immutable`)          |
| `PUT /api/characters/:charId/avatar`      | `{ avatarId }` → marqueur versionné + `notifyCharacterUpdated` |

Toutes les routes passent par `requireAuth` + `requireMemberOf` (résolveur
d'avatar comme `memberOfMap`/`memberOfChar`) ; création/suppression réservées
MJ ou auteur. Le contrôle de signature réutilise `sniffImageType` exporté de
`routes/maps.ts`.

Le `PUT /api/characters/:id/portrait` actuel (upload direct) **reste servi**
pour la rétrocompat, mais n'est plus exposé par l'UI une fois le sélecteur en
place ; on pourra le retirer quand tous les `custom:` auront été migrés (un
avatar de bibliothèque peut être créé à la volée à partir d'un `custom:`).

## 6. UI

1. **Menu contextuel d'un personnage** (bibliothèque, pion, dashboard) :
   « Changer l'avatar… » ouvre `<AvatarPicker>` (Dialog) :
   - grille des **avatars de la campagne** (double-clic = affecter) ;
   - section « Portraits » (la bibliothèque Penpot actuelle) ;
   - tuile « **Importer une image…** » → `<AvatarCropper>` → crée l'avatar,
     l'affecte et ferme.
2. **Asset manager, onglet « Avatars »** (5ᵉ onglet, MJ) : grille de gestion
   (nom, auteur, usages), renommage via `<PromptDialog>` (déjà là),
   suppression avec confirmation, tuile d'import (mêmes cropper).
3. La feuille de personnage (`CharacterSheet.svelte`) garde son sélecteur de
   portraits Penpot et gagne les avatars de campagne dans le même onglet.

## 7. Risques

- 🔴 **Suppression d'un avatar utilisé** : refus 409 tant qu'un personnage
  pointe dessus (compter via `sheet.portrait LIKE 'avatar:<id>:%'`). Sinon le
  pion tombe en 404 silencieux.
- 🟡 **Safari et l'encodage WebP** : vérifier `toBlob` (repli JPEG, déjà
  prévu) ; la taille de sortie dépend de l'encodeur.
- 🟡 **EXIF** : sans `imageOrientation: "from-image"`, une photo portrait
  arrive couchée — le cadrage la « corrige » visuellement mais le blob reste
  tourné.
- 🟡 **Nettoyage R2** : supprimer un personnage ne supprime pas son
  `portraits/<campaign>/<charId>` (legacy `custom:`) — best-effort à ajouter
  dans le flux `npc.remove`, ou laisser tel quel (quelques dizaines de Ko).
- 🟡 **Tests** : le seed dev doit purger les avatars de la campagne et
  détacher les portraits des personnages seedés (lecture-modification-écriture
  de `sheet`), sinon les runs e2e ne sont plus déterministes.

## 8. Recette

- Upload d'une photo paysage → cadrage (zoom + déplacement) → affectation à
  un PNJ : le pion, la vignette et la feuille montrent le carré 512² ;
- réutilisation du **même** avatar sur un PJ ;
- renommage dans l'onglet Avatars ; suppression refusée tant qu'il est
  utilisé, acceptée après détachement ;
- un joueur non-membre reçoit 403 sur la liste et l'image ;
- les avatars `custom:` existants continuent de s'afficher.

## 9. Fichiers concernés

- `api/src/db/schema.ts` + migration ; `api/src/routes/avatars.ts` (nouveau) ;
  `api/src/routes/characters.ts` (assignation + rétrocompat) ;
  `api/src/routes/dev.ts` (purge) ; `api/src/index.ts` (montage).
- `shared/src/dto.ts` (`AvatarDto`), rien dans le protocole WS.
- `web/src/lib/api.ts` ; `web/src/lib/portraits.ts` (`avatar:` → URL) ;
  `web/src/lib/table/AvatarCropper.svelte` + `AvatarPicker.svelte`
  (nouveaux) ; `AssetManager.svelte` (onglet) ;
  `campaigns/[id]/table/+page.svelte` (menu contextuel).
- `e2e/table.spec.ts` (cadrage, affectation, réutilisation, 409).

## 10. Estimation

| #   | Tâche                                                          | E           |
| --- | -------------------------------------------------------------- | ----------- |
| 1   | D1 + migration + routes REST + tests REST                      | 0,5 j       |
| 2   | `<AvatarCropper>` (canvas, EXIF, WebP/JPG, e2e)                | 0,5-1 j     |
| 3   | `<AvatarPicker>` + affectation + broadcast + menus             | 0,5 j       |
| 4   | Onglet Avatars de la bibliothèque (gestion, 409, confirmation) | 0,5 j       |
| 5   | Rétrocompat `custom:`, seed, docs                              | 0,5 j       |
|     | **Total**                                                      | **2,5-3 j** |
