# Session 2026-06-26 — Mobile, détection plateau & dés

## Contexte

Retours terrain après premiers tests sur mobile :
- Panneau analytique illisible (scroll dans un petit bandeau ~48vh)
- Pions non détectés / calibration difficile
- Dés non reconnus
- **Contrainte réelle** : les dés sont lancés n'importe où sur le tapis, pas dans une zone fixe sous le plateau

## Problèmes identifiés

1. **Layout mobile** : split vidéo 42vh + sidebar 48vh avec scroll interne
2. **Calibration vs pixels** : `object-fit: cover` décalait l'image analysée par rapport à l'overlay
3. **Dés** : recherche limitée à une zone sous le plateau + exclusion de l'intérieur du tapis → incompatible avec le jeu réel
4. **Pions** : détection dépendante d'une calibration manuelle précise

## Actions livrées

### Commit `ea7c966` — Layout mobile + détection améliorée

- **Onglets plein écran** sur mobile (≤960px) : *Caméra* / *Partie & analyse*
- **Vidéo en `object-fit: contain`** pour aligner calibration et analyse CV
- **Auto-détection du tapis** (couleur feutrine vert/marron) + bouton manuel
- **Zone dés sous plateau** (approche initiale, corrigée ensuite)
- **Détection dés dès l'aperçu** (phase preview), pas seulement en partie
- **Poignées calibration agrandies** au toucher
- Fichiers clés : `MobileTabBar`, `useCompactLayout`, `autoCalibrateBoard.ts`, refonte `diceVision` / `boardVision`

### Commit `4de9462` — Dés sur tout le plateau

- Suppression de la zone de lancer imposée
- Recherche sur **tout le tapis calibré** (polygone des 4 coins)
- Filtrage dés vs pions par **comptage de points** (pip counting) : seuls les objets avec face 1–6 valide sont retenus
- UI : retrait du cadre jaune « zone de lecture », message « Recherche des dés sur le plateau… »
- README et libellés StrategyPanel mis à jour

## État fonctionnel actuel

| Fonction | Statut |
|----------|--------|
| Caméra mobile auto | OK |
| Calibration 4 coins + auto tapis | OK |
| Mini-plateau / pions live | Partiel — sensible à l'éclairage et à la calibration |
| Lecture dés caméra | Partiel — pip counting, dés blancs immobiles |
| Multi-caméra / spectateurs / chat | OK (serveur WS séparé requis en prod) |
| Déploiement Vercel | Repo prêt (`comeonzorro/backgammon-vision`) |

## Limites connues

- Pas de ML entraîné (ONNX/YOLO en placeholder) — robustesse limitée si dés blancs près de pions blancs, reflets, ombres
- YouTube embed : pas de détection (CORS)
- Serveur live (`npm run live:server` + `VITE_LIVE_WS_URL`) nécessaire pour spectateurs/chat en production

## Prochaines pistes

1. Fine-tuning seuils CV selon retours terrain (couleur tapis, type de dés)
2. Modèle YOLO ONNX entraîné sur dés de backgammon
3. Saisie manuelle des dés en fallback si la CV échoue
4. Tests sur plusieurs téléphones / angles de caméra

## Messages utilisateur (verbatim)

> « la version actuelle affiche très mal la partie analytique sur mobile, c'est un espace reduit dans lequel on doit scroller, ce n'est pas ideal, la position des pieces n'est pas detectée, de meme que les dés ne sont pas reconnus … »

> « les dés sont lancés n'importe comment sur le plateau, on ne peut pas leur assigner une zone précise »

## Références

- Repo : https://github.com/comeonzorro/backgammon-vision
- Branche principale : `main`
- Commits session : `ea7c966`, `4de9462`
