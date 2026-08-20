import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DraftStorage = 'session' | 'local' | 'none';

interface DraftEnvelope<T> {
  version: 1;
  savedAt: string;
  value: T;
}

interface RecoverableDraftOptions<T> {
  key: string;
  value: T;
  initialValue: T;
  onRestore: (value: T) => void;
  storage?: DraftStorage;
  debounceMs?: number;
  enabled?: boolean;
}

export function readDraft<T>(storage: Storage, key: string): DraftEnvelope<T> | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null') as DraftEnvelope<T> | null;
    if (!parsed || parsed.version !== 1 || !parsed.savedAt || !('value' in parsed)) return null;
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

/**
 * Recupera formulários operacionais não sensíveis. Para conteúdo clínico/financeiro
 * detalhado use `storage: 'none'`: isso mantém só a proteção de navegação, sem
 * deixar dados no disco do computador compartilhado.
 */
export function useRecoverableDraft<T>({
  key,
  value,
  initialValue,
  onRestore,
  storage = 'session',
  debounceMs = 700,
  enabled = true,
}: RecoverableDraftOptions<T>) {
  const [restorable, setRestorable] = useState<DraftEnvelope<T> | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const initialSerialized = useMemo(() => JSON.stringify(initialValue), [initialValue]);
  const serialized = JSON.stringify(value);
  const dirty = serialized !== initialSerialized;
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  const getStorage = useCallback((): Storage | null => {
    if (typeof window === 'undefined' || storage === 'none') return null;
    return storage === 'local' ? window.localStorage : window.sessionStorage;
  }, [storage]);

  useEffect(() => {
    if (!enabled) return;
    const target = getStorage();
    if (target) setRestorable(readDraft<T>(target, key));
  }, [enabled, getStorage, key]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const target = getStorage();
    if (!target) return;
    const timeout = window.setTimeout(() => {
      const timestamp = new Date();
      const envelope: DraftEnvelope<T> = { version: 1, savedAt: timestamp.toISOString(), value };
      try {
        target.setItem(key, JSON.stringify(envelope));
        setSavedAt(timestamp);
      } catch {
        // Storage indisponível/cheio não pode interromper o preenchimento.
      }
    }, debounceMs);
    return () => window.clearTimeout(timeout);
  }, [debounceMs, dirty, enabled, getStorage, key, serialized]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, enabled]);

  const clear = useCallback(() => {
    getStorage()?.removeItem(key);
    setRestorable(null);
    setSavedAt(null);
  }, [getStorage, key]);

  const restore = useCallback(() => {
    if (!restorable) return;
    restoreRef.current(restorable.value);
    setSavedAt(new Date(restorable.savedAt));
    setRestorable(null);
  }, [restorable]);

  const discard = useCallback(() => {
    clear();
    restoreRef.current(initialValue);
  }, [clear, initialValue]);

  return { dirty, savedAt, restorable, restore, discard, clear };
}

