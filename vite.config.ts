import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Y.A.I.R.O.S — Realtime Operating System",
        short_name: "YAIROS",
        description:
          "Your Artificial Intelligence Realtime Operating System — גלקסיית סוכנים, קול בעברית, מפעל אתרים",
        dir: "rtl",
        lang: "he",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        background_color: "#04070e",
        theme_color: "#04070e",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        importScripts: ["sw-notify.js"],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html"
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1600
  }
});
