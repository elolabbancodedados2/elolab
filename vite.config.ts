import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  build: {
    // Code splitting for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', 
                        '@radix-ui/react-select', '@radix-ui/react-tabs',
                        '@radix-ui/react-tooltip', 'lucide-react'],
          // Charts
          'charts-vendor': ['recharts'],
          // Date utilities
          'date-vendor': ['date-fns'],
          // Animation
          'motion-vendor': ['framer-motion'],
          // Supabase
          'supabase-vendor': ['@supabase/supabase-js'],
          // Forms
          'form-vendor': ['react-hook-form', 'zod', '@hookform/resolvers'],
          // PDF/Excel
          'export-vendor': ['jspdf', 'xlsx'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: mode === 'development',
    minify: 'esbuild',
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "robots.txt", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "EloLab - Sistema de Gestão para Clínicas",
        short_name: "EloLab",
        description: "Sistema completo de gestão para clínicas e consultórios médicos. Agenda, prontuário, financeiro e mais.",
        theme_color: "#6bcfa4",
        background_color: "#eef0f2",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/dashboard",
        id: "/dashboard",
        categories: ["medical", "business", "productivity"],
        lang: "pt-BR",
        dir: "ltr",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [],
        shortcuts: [
          {
            name: "Agenda",
            short_name: "Agenda",
            url: "/agenda",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Pacientes",
            short_name: "Pacientes",
            url: "/pacientes",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Financeiro",
            short_name: "Financeiro",
            url: "/financeiro",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // Dados clínicos e arquivos de paciente NÃO são cacheados no disco do
          // navegador: em máquina compartilhada (recepção) o conteúdo continuava
          // recuperável depois do logout. Ambos passam a ir sempre à rede.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/supabase/, /^\/~oauth/],
      },
    }),
  ].filter(Boolean),
  define: {
    "globalThis.__APP_BUILD_ID__": JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.VITE_APP_BUILD_ID ??
        `build-${Date.now()}`,
    ),
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom',
      'framer-motion', '@supabase/supabase-js',
      'date-fns', 'recharts', 'lucide-react',
    ],
  },
}));
