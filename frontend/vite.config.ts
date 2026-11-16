import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const agent = process.env.DECK_DEV_AGENT ?? "http://127.0.0.1:80";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/pair/],
        runtimeCaching: [],
      },
      manifest: {
        name: "PC Deck",
        short_name: "Deck",
        description: "Pannello di controllo touch per il PC",
        theme_color: "#0A0B0D",
        background_color: "#0A0B0D",
        display: "fullscreen",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      "/api": agent,
      "/ws": { target: agent.replace(/^http/, "ws"), ws: true },
    },
  },
});
