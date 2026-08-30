# Héros & Dragons — Design System « Carnet crayonné » (option 1c retenue)

Site pour jouer à Héros et Dragons (table virtuelle + compendium + personnages + outils MJ). Desktop d'abord, mode clair uniquement. Style pen & paper : carnet de jeu moderne, traits main levée.

## Couleurs

- Papier (fond page) : #FBF8F0 · Panneau/carte : #FFFEF9
- Quadrillage carte : fond #F4F0E3, lignes #E4DEC9 (pas 32px) · Lignes de cahier : #EFEADB (pas 28px)
- Encre (texte, bordures) : #33302A · Encre secondaire : #7C7669 · Estompé : #B5AD98
- Traits clairs : #C6BFAC, dashed #A8A08D, filet discret #D9D3C4
- Rouge carmin (accent) : #C0392B · bord rouge foncé #8F281D · hachure claire #D25243 · hover #A22F23
- Barres PV : repeating-linear-gradient(-55deg, #C0392B 0 4px, #D25243 4px 8px), cadre 2px encre radius 6px

## Typographie (Google Fonts)

- Titres : 'Cormorant Garamond' 700
- Texte courant / UI : 'Spectral' 400–600
- Annotations manuscrites, labels ludiques : 'Caveat' 500–600 (souvent color:#C0392B, transform:rotate(±1.5deg))
- Chiffres, dés, stats, timestamps : 'IBM Plex Mono'

## Traits « main levée »

- Bordures : 2px solid #33302A avec border-radius sketchy, ex. `255px 15px 225px 15px/15px 225px 15px 255px` — VARIER les valeurs d'un élément à l'autre
- Rotations légères (-1.5° à +1°) sur cartes, badges, annotations
- Secondaire/placeholder : 2px dashed #A8A08D
- Bouton primaire : fond #C0392B, bordure 2px #8F281D, texte #FFF7EE
- Bouton encre : fond #33302A, texte #FBF8F0, hover → rouge
- Placeholders d'images : fond rayé ou quadrillé + label IBM Plex Mono entre ⟨ ⟩, bordure dashed

## Règles

- Inline styles uniquement (Design Components) ; pas d'emoji hors glyphes ⚔ ✦ déjà utilisés
- Consultation (règles/DRS) : dense, 2 colonnes possibles ; écrans de jeu : aérés
- Liens : a #8A2B20 → hover #C0392B (ou #C0392B/#A22F23 selon fond)
- Sources contenu : https://fan.heros-et-dragons.com et https://github.com/igwane/heros-et-dragons-drs
- Référence visuelle : « Design System — Explorations.dc.html » option 1c ; spec : « Design System.dc.html »
