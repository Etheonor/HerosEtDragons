# Plan — Bibliothèque de PNJ pour le MJ

> Objectif : ne plus re-saisir Gobelin / 7 / 15 / +2 à chaque encounter. Le MJ
> prépare une bibliothèque réutilisable par campagne, place des PNJ en 2 clics,
> et la branche naturellement sur le compendium DRS (phase 8).

## 1. Modèle de données

Nouvelle table D1 `npc_templates` (les PNJ de séance actuels, `characters.kind='pnj'`,
restent ce qu'ils sont : des *instances*).

```
npc_templates
  id           uuid PK
  campaign_id  FK campaigns ON DELETE CASCADE   ← périmètre : par campagne (MJ propriétaire)
  name         text          « Gobelin »
  ca           int (1-30)
  pv_max       int (1-999)
  init_bonus   int (-10..20)
  color        text          couleur du pion (#…)
  conditions   json []       états de départ (souvent [])
  notes        text (≤ 4000) capacités/attaque rapide, ex. « +3/+5 aux dégâts 1d6+1 »
  source       json | null   { category: 'bestiaire', slug: 'gobelin' } si issu du compendium
  created_at / updated_at
```

## 2. API

- `GET /api/campaigns/:id/npc-templates` (MJ)
- `POST /api/campaigns/:id/npc-templates` (MJ) — bornes idem validation feuille
- `PUT /api/npc-templates/:tplId` · `DELETE /api/npc-templates/:tplId` (MJ)
- Validation serveur sur les bornes (réutiliser le style de `shared/validation.ts`).

## 3. Temps réel (DO)

Nouveau message client → serveur :

```
{ type: 'npc.addFromTemplate', templateId: string, x: number, y: number }
```

Le DO (MJ only) :
1. charge le template (vérifie `campaignId`),
2. instancie un `characters` (kind pnj) avec les stats **copiées** (pas de lien
   vivant : modifier le modèle ne change pas les PNJ déjà posés),
3. crée le pion sur la **carte active**,
4. journalise « ✦ Le MJ ajoute Gobelin (d'après le modèle). »,
5. broadcast delta + carte (comporte l'existant `handleNpcAdd`, qui devient un
   cas particulier « creation à la volée + option save-as-template »).

`npc.add` garde son usage actuel (bouton + champ rapide), avec un ajout
`saveAsTemplate?: boolean`.

## 4. UI — panneau « Bibliothèque de PNJ »

Même famille d'interaction que `MapManager` (bouton dans la toolbar MJ → panneau
déroulant) :

- Bouton **« PNJ (n) »** à côté de « Cartes (n) ».
- Recherche + liste : pastille couleur + nom, ligne de stats `CA 15 · PV 7 · Init +2`,
  note tronquée au survol (tooltip).
- Actions par ligne : **Placer** (le curseur passe en mode « pose » : le prochain
  clic sur la carte instancie), **✎ éditer** (inline), **✕** (confirmation inline,
  le PNJ posé n'est pas affecté).
- Pied de panneau : **+ Nouveau PNJ** (formulaire compact) et case
  « Enregistrer dans la bibliothèque » à la création à la volée.
- Sur chaque carte PNJ de la colonne Compagnie : petit bouton **« ⌘ enregistrer
  comme modèle »** (capture l'état courant, stats modifiées comprises).
- **Quantité** : champ « x n » à la pose → place n instances espacées en diagonale
  avec suffixes A/B/C… (Gobelin A, Gobelin B…).

## 5. Raccord phase 8 (compendium DRS)

- Fiche bestiaire → bouton **« Ajouter à ma bibliothèque (MJ) »** : pré-remplit un
  template avec `source = {category:'bestiaire', slug}` + FP/CA/PV/init/caracs.
- `npc.addFromMonster` (déjà typé côté client, NOT_IMPLEMENTED côté serveur) :
  implémenté comme `addFromTemplate` + lookup compendium direct.
- Ré-ingestion DRS : si un template a une `source` et que la fiche change, badge
  « mise à jour dispo » sur la ligne (le MJ décide ; jamais d'écrasement silencieux).

## 6. Découpages de commits (ordre d'implémentation)

1. `feat(bdd)` : migration Drizzle + routes REST CRUD templates + validation + test shared.
2. `feat(do)` : `npc.addFromTemplate` + refactor `handleNpcAdd`/`npc.add.saveAsTemplate`.
3. `feat(ui)` : panneau Bibliothèque (liste/recherche/nouveau/éditer/supprimer) + poser au clic.
4. `feat(ui)` : pose multiple A/B/C + « enregistrer comme modèle » depuis une carte PNJ.
5. (phase 8) `feat(compendium)` : bouton d'ajout à la bibliothèque depuis une fiche bestiaire.

## 7. Questions ouvertes (à trancher avant le 1)

- Bibliothèque **par campagne** (proposé) ou globales au MJ avec copie dans les
  campagnes ? (Le multi-campagne pousse vers globales + import ; commencer simple.)
- Les notes du template doivent-elles être visibles quelque part pour les joueurs
  (partage au journal) ? Non par défaut.
- Limite de templates par campagne : 200 (au-delà, recherche obligatoire).
