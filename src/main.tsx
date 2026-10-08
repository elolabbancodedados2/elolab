import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorTracking } from "./lib/errorTracking";
import { initWebVitals } from "./lib/webVitals";

const CACHE_BUILD_KEY = "elolab-build-id";
const APP_BUILD_ID =
  (globalThis as typeof globalThis & { __APP_BUILD_ID__?: string }).__APP_BUILD_ID__ ??
  "dev-build";

const getStoredBuildId = () => {
  try {
    return localStorage.getItem(CACHE_BUILD_KEY) ?? sessionStorage.getItem(CACHE_BUILD_KEY);
  } catch {
    try {
      return sessionStorage.getItem(CACHE_BUILD_KEY);
    } catch {
      return null;
    }
  }
};

const persistBuildId = (buildId: string) => {
  try {
    localStorage.setItem(CACHE_BUILD_KEY, buildId);
  } catch { /* armazenamento local pode estar bloqueado */ }
  try {
    sessionStorage.setItem(CACHE_BUILD_KEY, buildId);
  } catch { /* o app continua funcionando sem persistir a versão */ }
};

const bootstrapApp = () => {
  const url = new URL(window.location.href);
  if (url.searchParams.has("cache_reset")) {
    url.searchParams.delete("cache_reset");
    const sanitizedSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${sanitizedSearch ? `?${sanitizedSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }

  // O HTML e os módulos já pertencem ao build atual. Limpar todos os caches e
  // esperar pelo unregister de cada service worker antes do render travava o
  // loader em navegadores com storage/worker lento. O Workbox atualiza e limpa
  // o cache de assets; aqui só registramos a versão sem bloquear a montagem.
  if (getStoredBuildId() !== APP_BUILD_ID) persistBuildId(APP_BUILD_ID);

  // Initialize global error tracking and performance monitoring
  try {
    initGlobalErrorTracking();
    initWebVitals();
  } catch (error) {
    console.warn("A inicialização do monitoramento foi ignorada:", error);
  }

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

bootstrapApp();
