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
        background_color: "#000000",
        theme_color: "#000000",
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
        globPatterns: ["**/*.{js,css,svg,png,woff2}", "index.html"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        // Let these reach the network: the APK download, the install page,
        // and the Android domain-verification file
        navigateFallbackDenylist: [
          /^\/yairos\.apk$/,
          /^\/get(\.html)?$/,
          /^\/app$/,
          /^\/\.well-known\//
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1600
  }
});
