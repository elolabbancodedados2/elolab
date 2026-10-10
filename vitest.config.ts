import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createViteTestSupabaseDefine } from './scripts/test-supabase-env.ts';

export default defineConfig({
  define: createViteTestSupabaseDefine({}),
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // `threads`/`maxThreads`/`minThreads` eram opções do Vitest 1.x e viraram
    // no-op na v3 instalada aqui — o pool ficava na configuração padrão.
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
    // isolate:false fazia todos os arquivos dividirem o mesmo ambiente jsdom,
    // então um vazamento em um teste contaminava os demais.
    isolate: true,
    testTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
