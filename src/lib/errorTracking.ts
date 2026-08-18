import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';

/**
 * Global error tracking — captures unhandled errors and promise rejections.
 * Stores them in-memory for debugging and could be extended to send to an analytics service.
 */

interface TrackedError {
  message: string;
  source?: string;
  line?: number;
  col?: number;
  stack?: string;
  type: 'error' | 'unhandledrejection';
  timestamp: string;
  url: string;
}

const errorStore: TrackedError[] = [];
const MAX_ERRORS = 50;
const TELEMETRY_URL = `${SUPABASE_URL}/functions/v1/client-telemetry`;
const TELEMETRY_KEY = SUPABASE_PUBLISHABLE_KEY;
const sentFingerprints = new Set<string>();

async function reportError(error: TrackedError) {
  if (import.meta.env.DEV || !TELEMETRY_KEY) return;
  const fingerprint = `${error.type}:${error.message}:${error.source ?? ''}:${error.line ?? ''}`.slice(0, 100);
  if (sentFingerprints.has(fingerprint)) return;
  sentFingerprints.add(fingerprint);
  try {
    // Nunca interpretar diretamente o armazenamento de autenticação. A sessão
    // é obtida pela API oficial, que também abstrai mudanças no formato interno.
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    await fetch(TELEMETRY_URL, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: TELEMETRY_KEY, Authorization: `Bearer ${accessToken || TELEMETRY_KEY}` },
      body: JSON.stringify({ tipo: error.type, mensagem: error.message, origem: error.source,
        rota: `${location.pathname}${location.search}`, release: (globalThis as any).__APP_BUILD_ID__, fingerprint }),
    }).catch(() => undefined);
  } catch { /* telemetria nunca pode derrubar a aplicação */ }
}

function storeError(error: TrackedError) {
  errorStore.push(error);
  if (errorStore.length > MAX_ERRORS) errorStore.shift();
  void reportError(error);
}

export function initGlobalErrorTracking() {
  // Global error handler
  window.addEventListener('error', (event) => {
    storeError({
      message: event.message || 'Unknown error',
      source: event.filename,
      line: event.lineno,
      col: event.colno,
      stack: event.error?.stack,
      type: 'error',
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });

    console.error('[GlobalError]', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
    });
  });

  // Unhandled promise rejection handler  
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    storeError({
      message: reason?.message || String(reason) || 'Unhandled Promise Rejection',
      stack: reason?.stack,
      type: 'unhandledrejection',
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });

    console.error('[UnhandledRejection]', reason);
    event.preventDefault();
  });
}

export function getTrackedErrors(): TrackedError[] {
  return [...errorStore];
}

export function clearTrackedErrors() {
  errorStore.length = 0;
}

/**
 * Generate a debug report with errors and environment info.
 */
export function generateDebugReport(): string {
  const report = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    errors: errorStore.slice(-10),
    memory: (performance as any).memory ? {
      usedJSHeapSize: ((performance as any).memory.usedJSHeapSize / 1048576).toFixed(1) + 'MB',
      totalJSHeapSize: ((performance as any).memory.totalJSHeapSize / 1048576).toFixed(1) + 'MB',
    } : 'N/A',
  };
  return JSON.stringify(report, null, 2);
}
