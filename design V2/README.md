# Héros & Dragons — Design System « Carnet de nuit » (thème sombre, validé sur Accueil sombre.dc.html)

Site pour jouer à Héros et Dragons (table virtuelle + compendium + personnages + outils MJ). Desktop d'abord, thème sombre uniquement. Simple, lisible, sobre — pas de remplissage décoratif.

## Couleurs

- Fond page : #26221D · Panneau/carte : #2E2A24 · Bord panneau : 2px solid #575043
- Séparateurs discrets : #3A352D · Bordure dashed (placeholders, zones d'ajout) : #575043
- Texte : #E8E2D4 · Titres : #F2EDE0 · Secondaire : #9C947F · Estompé (mentions légales, hints) : #6E6759
- Accent carmin : #C0392B · hover #D0473A · bord #8F281D · texte sur accent #FFF3EC
- « Encre » : l'accent est un choix UTILISATEUR parmi 4 palettes (sélecteur dans le header, persisté en localStorage clé hd-encre) :
  carmin #C0392B/#D0473A/#8F281D/txt #E0705F · brique #D0473A/#DC5C50/#A22F23/txt #E8877A · ocre #B8860B/#CC9A1F/#8A6508/txt #D4A73C · forêt #5E8C61/#6FA073/#46694A/txt #8AB58D
  (base/hover/bord/texte-accent). Tout élément accentué doit dériver de la palette active, pas de carmin en dur.
- Accent en texte (badges MJ, initiales) : #E0705F
- Liens : a #E0705F → hover #EB8A7A
- Overlay modale : rgba(15,13,10,.6) · ombres : rgba(0,0,0,.3) à .45

## Typographie (Google Fonts) — 2 polices SEULEMENT

- Titres : 'Vidaloka' 400 (unique graisse)
- Tout le reste (texte, UI, boutons, labels, chiffres) : 'Alegreya Sans' 400/500/700
- SUPPRIMÉS : Caveat (annotations manuscrites), IBM Plex Mono, Cormorant Garamond, Spectral

## Traits « main levée » — dose minimale

- UNIQUEMENT le border-radius irrégulier sur panneaux et boutons, ex. `255px 15px 225px 15px/15px 225px 15px 255px` — varier les valeurs d'un élément à l'autre
- PLUS de rotations, plus de hachures décoratives, plus de labels ⟨ ⟩, pas de grille de fond
- Bouton primaire : fond #C0392B, bordure 2px #8F281D, texte #FFF3EC 700, hover #D0473A
- Zone d'action secondaire (créer, ajouter) : 2px dashed #575043, texte #9C947F, hover bord #C0392B
- Inputs : fond #26221D, bordure 2px #575043, focus #C0392B, placeholder #6E6759

## Règles

- Inline styles uniquement (Design Components) ; pas d'emoji
- Pas de texte de remplissage : chaque libellé a une fonction UX
- Consultation (règles/DRS) : dense, 2 colonnes possibles, sombre aussi ; écrans de jeu : aérés (panneaux repliables plutôt que densité)
- Barres PV : repeating-linear-gradient(-55deg, #C0392B 0 4px, #D0473A 4px 8px), cadre 2px #575043 radius 6px
- Sources contenu : https://fan.heros-et-dragons.com et https://github.com/igwane/heros-et-dragons-drs
- Référence visuelle validée : « Accueil sombre.dc.html » ; spec : « Design System sombre.dc.html » ; handoff : THEME-CARNET-DE-NUIT.md
- Écrans sombres validés : Accueil, Ecran de jeu, Feuille de personnage, Compendium (suffixe « sombre ») — les versions claires ont été supprimées
- Note technique : le serveur ne sert pas les .js à la racine — après tout dc_write, ré-inliner support.js en base64 dans le fichier (voir script utilisé dans ce chat)
