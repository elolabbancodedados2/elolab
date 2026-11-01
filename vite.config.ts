import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { createViteTestSupabaseDefine } from './scripts/test-supabase-env.ts';

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
        // Grupos explícitos do Rolldown (Vite 8). O antigo `manualChunks` vira
        // um único grupo cujo nome é decidido por módulo; como o Rolldown inclui
        // as dependências de cada módulo capturado no mesmo chunk, o React core
        // entrava em `charts-vendor` (dependência do recharts) e o index.html
        // pré-carregava ~109 KB gzip de gráficos em todas as telas.
        //
        // Cada pacote casa com `/node_modules/<pacote>/` (com barra final, para
        // 'react' não casar 'react-is' ou 'react-smooth'). A prioridade segue a
        // ordem da lista: o react-vendor captura React, ReactDOM e scheduler
        // antes dos demais grupos, que então não podem puxá-los. clsx e
        // tailwind-merge (usados por `cn()` em toda tela, e também dependências
        // do recharts) ficam no ui-vendor pelo mesmo motivo.
        codeSplitting: {
          groups: (
            [
              ['react-vendor', ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom']],
              ['ui-vendor', ['@radix-ui/react-', 'lucide-react', 'clsx', 'tailwind-merge']],
              ['charts-vendor', ['recharts']],
              ['date-vendor', ['date-fns']],
              ['motion-vendor', ['framer-motion']],
              ['supabase-vendor', ['@supabase/supabase-js']],
              ['form-vendor', ['react-hook-form', 'zod', '@hookform/resolvers']],
            ] as Array<[string, string[]]>
          ).map(([name, pacotes], indice, lista) => ({
            name,
            priority: lista.length - indice,
            test: (id: string) => {
              const caminho = id.replaceAll('\\', '/');
              // Prefixos terminados em '-' (ex.: '@radix-ui/react-') agrupam
              // uma família de pacotes; os demais exigem o nome exato.
              return pacotes.some((pacote) => caminho.includes(
                pacote.endsWith('-') ? `/node_modules/${pacote}` : `/node_modules/${pacote}/`,
              ));
            },
          })),
          // NÃO agrupar jspdf/xlsx aqui.
          //
          // Havia um `'export-vendor': ['jspdf', 'xlsx']`. Forçar essas duas
          // bibliotecas num chunk nomeado faz o Rollup tratá-lo como
          // dependência estática de quem o referencia, anulando a divisão que o
          // `import()` dinâmico deveria produzir: as telas de prescrição,
          // relatórios e contas baixavam ~820 KB de gerador de PDF e planilha
          // ao ABRIR, mesmo sem ninguém clicar em exportar.
          //
          // Sem a regra, o Rollup cria os chunks a partir dos próprios
          // `import()` e eles só descem quando alguém gera um documento.
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: mode === 'development',
    minify: 'oxc',
  },
  // console.log/debug são ruído de desenvolvimento e saem do bundle de produção.
  // console.error e console.warn ficam: são tratamento de erro de verdade e
  // ajudam no suporte quando o usuário relata um problema.
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
        theme_color: "#0c1f54",
        background_color: "#e0ebf2",
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
        // Raster images use the runtime image cache below, so installation
        // does not download every screen's artwork before the user needs it.
        globPatterns: ["**/*.{js,css,ico,svg,woff2}"],
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
          // O caminho funciona com o domínio atual da API na VPS. Dados
          // clínicos e arquivos de pacientes nunca entram no cache offline.
          {
            urlPattern: ({ url }) => /^\/(?:rest\/v1|storage\/v1)\//i.test(url.pathname),
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
    ...(mode === 'test' ? createViteTestSupabaseDefine({}) : {}),
    // Identifica a versão publicada para relacionar erros ao build correspondente.
    "globalThis.__APP_BUILD_ID__": JSON.stringify(
      process.env.VITE_APP_BUILD_ID ?? `build-${Date.now()}`,
    ),
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
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
