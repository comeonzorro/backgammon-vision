# Session 2026-07-19 — Retour Table depuis overlay OBS

## Contexte

En mode overlay OBS, le bascule **Table / OBS** était enterré en bas de la sidebar — souvent inaccessible sur mobile. Impossible de revenir facilement à la vue table.

## Actions livrées

### Commit `7f3a951` — Bouton toujours visible

- Bascule Table / OBS remontée **en tête** du panneau
- Barre fixe **« Retour Table »** visible dès que le mode overlay est actif
- Ajustements CSS (`App.module.css`) + `TableApp.tsx`

## État fonctionnel

| Fonction | Statut |
|----------|--------|
| Sortie du mode OBS overlay | OK (desktop + mobile) |

## Références

- Repo : https://github.com/comeonzorro/backgammon-vision
- Branche : `main`
- Commit session : `7f3a951` (merge `10003a1`)
