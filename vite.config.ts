import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Racine de déploiement : `/` (Vercel, sous-domaine) ou `/backgammon-vision/` (sous-dossier). */
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
  },
});
