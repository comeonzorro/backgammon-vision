# Session 2026-07-19 — Dés bipolaires & orientation plateau

## Contexte

Retours terrain : les dés ne sont pas toujours blancs à points noirs, et le téléphone peut filmer le plateau en **portrait** (charnière horizontale) comme en paysage. La CV refusait ou confondait ces cas.

## Actions livrées

### Commit `f0fdc68` — Vision bipolaire + grille orientable

- **`diceVision`** : dés foncés à pips clairs (image inversée) **et** clairs à pips foncés ; a priori de taille relatif au plateau ; dilatation pour combler les pips ; multi-recadrages pour la face 6 ; validation motif
- **`boardVision`** : grille orientable (transposed portrait / paysage), fond des flèches modélisé, résolution auto du sens via position de départ
- **`TableApp`** : mapping persisté, résolu à la validation / démarrage
- Banc d’essai synthétique : `npm run check:vision` (dés 1–6 × 2 polarités, rejet pions, paysage + portrait)

### Commit `014264e` — Docs README

- README mis à jour : lecture bipolaire, plateau portrait, commande `check:vision`

## État fonctionnel

| Fonction | Statut |
|----------|--------|
| Dés blancs / noirs (bipolaires) | OK (synthétique + conditions terrain) |
| Plateau portrait / paysage | OK (mapping auto + persisté) |
| `npm run check:vision` | OK |

## Limites connues

- Éclairage non uniforme, reflets, ombres fortes restent difficiles
- Mapping orientation dépend d’une position de départ lisible

## Références

- Repo : https://github.com/comeonzorro/backgammon-vision
- Branche : `main`
- Commits session : `f0fdc68`, `014264e` (merge `4d88651`)
