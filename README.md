# Backgammon Vision

Webapp pour filmer une partie de backgammon depuis un téléphone monté au-dessus du plateau (caméra arrière), avec lecture visuelle des dés, transcription des coups en direct et analyse par moteur backgammon intégré (inspiré d'eXtreme Gammon, BG Blitz, Digigammon et GNU Backgammon).

## Interface (mode table)

| Zone | Contenu |
|------|---------|
| **Centre (plein écran)** | Flux vidéo live de la caméra — vue overhead du plateau |
| **Panneau droit** | Logo, noms des joueurs, date, durée de partie, stats live, dés lus, analyse stratégique, mini-plateau, historique, contrôles |

Au lancement sur mobile, la caméra arrière démarre automatiquement. **Calibration obligatoire** avant la partie ; les pions sont lus en direct ensuite.

## Calibration & lecture des pions

1. **Alignement** : glissez les 4 coins sur le bord du tapis dans la vidéo
2. **Aperçu** : vérifiez le mini-plateau (détection caméra, même principe que les dés)
3. **Lancer la partie** : la sidebar passe en **LIVE** (~1 mise à jour/s)

Moteur de lecture des pions (`src/lib/boardVision.ts`) :

1. **Référence tapis** estimée sur chaque image (bande médiane du plateau, médiane robuste)
2. **Échantillonnage multi-colonnes** le long de l'axe de chaque flèche, de la base vers la pointe
3. Classification blanc / noir / tapis par écart de **luminance et de chrominance** à la référence
4. Comptage par **longueur de pile** (≈ 5 pions par flèche), tolérant aux reflets entre pions
5. **Bear-off déduit** : 15 − pions vus par couleur
6. **Recalage sur position légale** : après chaque jet, la position détectée est comparée aux coups légaux du moteur ; si elle correspond (à ≤ 2 pions près), la position affichée est recalée sur la position légale exacte — le bruit caméra ne corrompt plus le plateau diffusé

Les cases peu incertaines sont entourées en pointillés. Dés et analyse ne démarrent qu'après « Lancer la partie ».

## Lecture des dés (caméra uniquement)

Moteur CV maison (`src/lib/diceVision.ts`), sans capteur externe :

1. **Repérage** des blobs clairs carrés sur le tapis calibré (double seuil : moyenne relevée + percentile)
2. **Lecture de face** en pleine résolution : seuil d'**Otsu local**, extraction des pips par composantes connexes 8-connexité, filtres géométriques (taille, rondeur, position)
3. **Validation du motif de face** (1–6), invariante en rotation : pip central, symétrie centrale des paires, colinéarité du 3, double rangée du 6 — un simple comptage de taches est rejeté (ombres, reflets, pions blancs)
4. **Appariement des 2 dés** : tailles quasi identiques exigées (élimine les faux positifs isolés)
5. **Stabilisation** : 3 lectures identiques consécutives + score de mouvement nul avant validation

**Conditions pour une bonne lecture :**
- Dés **blancs à points noirs** (standard backgammon)
- **Éclairage uniforme**, sans ombre forte
- Téléphone **fixe** au-dessus du plateau
- Les dés peuvent atterrir **n'importe où sur le tapis** — la détection parcourt tout le plateau calibré
- Attendre que les dés soient **immobiles** après le lancer
- Éviter mains/objets dans le cadre au moment de la lecture

L'option ONNX reste disponible pour un modèle YOLO entraîné plus tard (plus robuste en conditions difficiles).

## Moteur d'analyse & transcription

Moteur backgammon intégré (`src/lib/bg/`), exécuté dans le navigateur :

| Module | Rôle |
|--------|------|
| `engine.ts` | Génération **complète des coups légaux** : entrée obligatoire du bar, doubles ×4, bear-off (dé exact + overshoot), usage maximal des dés, règle du dé fort ; notation standard XG/GNU BG (`24/18*/13`, `13/11(2)`, `bar/21`, `6/off`) |
| `evaluate.ts` | Évaluation positionnelle : course aux pips, blots pondérés par les **tirs directs sur 36**, points construits (5-point, barre, ancres), primes et pions piégés, pions au bar, distribution ; probabilité de gain et équité cubeless |
| `analysis.ts` | Classement de tous les coups par équité, alternatives avec Δ éq., **commentaire analytique en français** dérivé des faits du coup (frappes, points construits, blots laissés, prime, course), **transcription du coup joué** en comparant la position caméra aux positions légales (style Digigammon/BG Blitz) |

Vérification du moteur : `npm run check:engine` (ouvertures de référence, bar/dance, bear-off, dé fort, symétrie blanc/noir, transcription).

L'historique affiche la partie transcrite en direct : jet lu, meilleur coup théorique, puis coup effectivement joué dès que la position se stabilise.

## Sources vidéo (USB, sans fil, réseau)

| Source | Usage |
|--------|--------|
| **Liste déroulante caméras** | Webcam USB, caméra intégrée Mac/PC, capture Elgato/OBS Virtual Cam |
| **Caméra arrière** | Téléphone qui fait tourner la webapp, fixé au-dessus du plateau |
| **HLS (.m3u8)** | Flux sans fil via OBS → Restream / nginx-rtmp |
| **MJPEG** | Certaines caméras IP (selon CORS / HTTPS) |
| **Lien caméra sans fil** | 2ᵉ téléphone sur `#/camera/ROOM` → WebRTC auto vers la table |

Ouvrir **Sources vidéo** dans le panneau droit pour choisir et brancher la caméra.

## Diffusion spectateurs & chat (compétitions)

Architecture **table → serveur relay → spectateurs** :

1. Déployer le serveur WebSocket : `cd server && npm install && npm start` (port 8787)
2. Configurer `VITE_LIVE_WS_URL=wss://votre-serveur` sur Vercel
3. Sur la table : **Diffusion spectateurs & chat** → générer une room → activer le live
4. **Zones spectateurs** : cocher/décocher vidéo, joueurs, dés, analyse, plateau, historique, chat
5. Copier le **lien spectateurs** (`#/spectateur/bg-xxxxx`) — layout choisi + chat live
6. Optionnel : **lien caméra sans fil** pour un 2ᵉ téléphone (`#/camera/bg-xxxxx`)

### URLs

| Rôle | URL |
|------|-----|
| Table / réalisateur | `/` (racine) |
| Spectateur | `/#/spectateur/ROOM` |
| Caméra sans fil | `/#/camera/ROOM` |

Le flux vidéo vers les spectateurs est relayé en JPEG (~3 fps) via le serveur live (plusieurs viewers sans SFU). Pour une qualité broadcast TV, combinez avec OBS + YouTube/Twitch en parallèle.

### Dev local

```bash
npm run live:server   # terminal 1
npm run dev           # terminal 2 — VITE_LIVE_WS_URL=ws://localhost:8787 par défaut
```

## Fonctionnalités V1

| Module | Description |
|--------|-------------|
| **Sources vidéo** | Caméra / iPhone, OBS Virtual Camera, flux HLS (sortie RTMP relay), YouTube Live (embed), WebRTC P2P (signaling SDP manuel) |
| **Détection dés** | CV maison : Otsu local + validation géométrique des motifs de faces (fallback YOLO ONNX possible) |
| **Board** | Position lue par caméra, recalée sur les coups légaux du moteur ; mini-plateau diffusé aussi côté spectateurs/OBS (redondance si le flux vidéo lâche) |
| **Analyse** | Moteur backgammon intégré : coups légaux, équité, win %, pips, alternatives classées, commentaire analytique |
| **Historique** | Transcription live : jets lus, meilleur coup théorique, coup effectivement joué |
| **Modes** | **Joueur** (vidéo + analyse côte à côte) · **Streamer** (layout compact pour Browser Source OBS) |

## Démarrage

```bash
cd backgammon-vision
npm install
npm run dev
```

Ouvrir `http://localhost:5174` (ou l'IP du réseau pour iPhone).

## Mise en ligne (URL publique)

La caméra et WebRTC **exigent HTTPS** en production (OK sur Vercel, Netlify, GitHub Pages, la plupart des hébergeurs).

### Option A — Vercel (recommandé)

Le plus simple pour une URL directe type `https://backgammon-vision.vercel.app`.

1. Compte [vercel.com](https://vercel.com) → **Add New Project** → importer le repo **`comeonzorro/backgammon-vision`**.
2. Framework : Vite (détecté automatiquement). **Root Directory** : laisser vide (repo dédié, pas de sous-dossier).
3. Deploy → l'URL est active en ~1 min.
4. (Optionnel) Domaine perso : Vercel → Settings → Domains.

Aucun `BASE_PATH` à configurer : build standard `npm run build`, servi à la racine du projet Vercel.

```bash
# Déploiement CLI alternatif (depuis backgammon-vision/)
npx vercel
```

### Option B — Sous-dossier d'un site existant

Si tu as déjà un site (WordPress, OVH, Netlify, etc.) et tu veux  
`https://tonsite.fr/backgammon-vision/` :

```bash
cd backgammon-vision
npm ci
npm run build:subdir
```

Copier **le contenu** de `dist/` (pas le dossier `dist` lui-même) vers le dossier sur ton serveur, par ex. :

```
/var/www/tonsite.fr/backgammon-vision/
  index.html
  assets/
  models/
```

Sur **Apache** (`.htaccess` dans ce dossier) :

```apache
RewriteEngine On
RewriteBase /backgammon-vision/
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /backgammon-vision/index.html [L]
```

Sur **nginx** :

```nginx
location /backgammon-vision/ {
  alias /var/www/tonsite.fr/backgammon-vision/;
  try_files $uri $uri/ /backgammon-vision/index.html;
}
```

Pour un autre chemin, adapter la variable :

```bash
BASE_PATH=/mon-chemin/ npm run build
```

### Option C — GitHub Pages (ce repo)

Le workflow existant `deploy-apprentissage-grec.yml` publie **à la racine** de `gh-pages`. Pour éviter d'écraser l'autre app, préférer Vercel ou un sous-dossier manuel sur ton hébergement principal. Un workflow Pages dédié en sous-chemin peut être ajouté si besoin.

### Quel choix ?

| Besoin | Solution |
|--------|----------|
| URL propre, HTTPS, caméra iPhone, déploiement auto | **Vercel** (sous-domaine ou domaine perso) |
| Déjà un site, juste un dossier en plus | **`build:subdir`** + upload FTP |
| Overlay OBS Browser Source | Les deux marchent ; URL HTTPS stable recommandée |

## Connecter OBS

1. **Virtual Camera** (le plus simple) : OBS → Outils → Virtual Camera → Démarrer. Dans l'app : bouton **OBS** → *Utiliser OBS Virtual Camera*.
2. **Flux HLS** : diffusez OBS vers un relay RTMP (nginx-rtmp, Restream, etc.), récupérez l'URL `.m3u8`, collez-la dans le modal OBS.
3. **Overlay** : mode Streamer + Browser Source dans OBS pointant vers cette app.

## YouTube Live

Collez l'URL ou l'ID de la diffusion. L'embed permet la visualisation ; la **détection des dés** nécessite une source directe (caméra, HLS, WebRTC) à cause des restrictions CORS de YouTube.

## Brancher un vrai modèle YOLO

1. Exporter votre modèle en ONNX (classes = faces de dés 1–6).
2. Placer le fichier dans `public/models/dice-yolo.onnx`.
3. Cocher **ONNX YOLO** dans l'interface.
4. Compléter le pré/post-processing dans `src/lib/diceDetector.ts` (tensor NCHW, NMS, etc.).

Sans modèle, l'heuristique luminosité + mock assure un flux démo fonctionnel.

## WebRTC

- **Broadcast** : iPhone filme le plateau → copier l'offer SDP → answer depuis le viewer.
- **Viewer** : créer offer → coller answer du broadcaster.

Un serveur de signaling (WebSocket) pourra remplacer l'échange manuel plus tard.

## Stack

- React 19 + Vite 6 + TypeScript
- hls.js (flux OBS/RTMP relay)
- onnxruntime-web (inférence navigateur, optionnelle)

## Prochaines étapes suggérées

- Entraîner / fine-tuner YOLO sur dés de backgammon (conditions difficiles)
- Serveur signaling WebRTC
- Export des parties transcrites au format `.mat` / `.sgf` (import GNU BG / XG)
- Brancher GNU Backgammon (WASM ou API) pour une équité réseau de neurones
