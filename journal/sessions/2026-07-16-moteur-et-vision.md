# Session 2026-07-16 — Moteur backgammon réel & vision fiabilisée

## Contexte

Après la base mobile / calibration / détection de juin, la lecture dés/pions restait trop fragile pour une partie réelle, et l’analyse stratégique était encore un stub. Objectif : un vrai moteur de règles + une CV plus stricte + une transcription live du coup joué (style Digigammon / BG Blitz).

## Actions livrées

### Commit `7a5803c` — Moteur, vision, transcription

- **Moteur `src/lib/bg/`** : coups légaux complets (barre, doubles, bear-off, dé fort), évaluation positionnelle (pips, tirs directs, points, primes, ancres), équité / win% réels, notation standard XG / GNU BG
- **Commentaire analytique FR** dérivé des faits du coup (frappes, points construits, blots, prime, course)
- **Transcription live** : position caméra comparée aux positions légales et recalée
- **`diceVision`** : Otsu local, pips en 8-connexité, validation géométrique des motifs 1–6 (invariante en rotation), appariement des 2 dés, 3 lectures stables avant validation
- **`boardVision`** : référence tapis par image, échantillonnage multi-colonnes par flèche, comptage par longueur de pile, bear-off déduit
- Plateau + historique inclus par défaut dans la diffusion spectateurs / OBS
- Script de vérif moteur : `npm run check:engine`

## État fonctionnel

| Fonction | Statut |
|----------|--------|
| Coups légaux / évaluation / notation | OK |
| Transcription live du coup | OK (dépend de la CV) |
| Lecture dés (motif géométrique) | Amélioré — encore sensible éclairage / polarité |
| Lecture pions (piles + bear-off) | Amélioré |
| Diffusion spectateurs (plateau + historique) | OK |

## Limites connues

- Dés encore surtout pensés « clairs / pips foncés » à ce stade (bipolaire arrive ensuite)
- Orientation plateau portrait non gérée ici
- Robustesse CV limitée sans modèle ML entraîné

## Références

- Repo : https://github.com/comeonzorro/backgammon-vision
- Branche : `main`
- Commit session : `7a5803c` (merge `66a6188`)
