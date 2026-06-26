# Backgammon Vision

Webapp pour filmer une partie de backgammon depuis un téléphone monté au-dessus du plateau (caméra arrière), avec lecture visuelle des dés et panneau d'analyse pour les spectateurs.

## Interface (mode table)

| Zone | Contenu |
|------|---------|
| **Centre (plein écran)** | Flux vidéo live de la caméra — vue overhead du plateau |
| **Panneau droit** | Logo, noms des joueurs, date, durée de partie, stats live, dés lus, analyse stratégique, mini-plateau, historique, contrôles |

Au lancement sur mobile, la caméra arrière démarre automatiquement et la détection live s'active dès que le flux est prêt.

## Fonctionnalités V1

| Module | Description |
|--------|-------------|
| **Sources vidéo** | Caméra / iPhone, OBS Virtual Camera, flux HLS (sortie RTMP relay), YouTube Live (embed), WebRTC P2P (signaling SDP manuel) |
| **Détection dés** | Capture canvas depuis `<video>`, stub `detectDiceFromFrame()` prêt pour YOLO ONNX |
| **Board** | Plateau backgammon réaliste (état initial standard) |
| **Analyse** | Moteur heuristique : meilleur coup, équité, commentaire spectateur |
| **Historique** | Journal des détections et coups suggérés |
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

- Entraîner / fine-tuner YOLO sur dés de backgammon
- Serveur signaling WebRTC
- Reconnaissance position des checkers (CV ou saisie assistée)
- Intégration moteur GNU Backgammon ou API cloud pour l'équité réelle
