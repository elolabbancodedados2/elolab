import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { friendlyError } from './format';
import { supabase } from './supabase';

// The generated DB types predate many tables/RPCs used by the screens.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;
export const db = supabase as Db;

/**
 * Runs `load` on mount, when deps change and when the screen regains focus.
 * `load` returns undefined to mean "nothing to load" (e.g. missing clinic).
 */
export function useLoad<T>(load: (client: Db) => Promise<T | undefined>, deps: DependencyList) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const firstFocus = useRef(true);

  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    setTick(value => value + 1);
  }, []));

  useEffect(() => {
    if (!db) { setLoading(false); setError('O app ainda não está conectado ao servidor.'); return; }
    let active = true;
    setError(null);
    loadRef.current(db)
      .then(result => { if (active) setData(result); })
      .catch((err: unknown) => { if (active) setError(friendlyError(err, 'Não conseguimos carregar estas informações agora.')); })
      .finally(() => { if (active) { setLoading(false); setRefreshing(false); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick(value => value + 1), []);
  const refresh = useCallback(() => { setRefreshing(true); setTick(value => value + 1); }, []);
  return { data, loading: loading && data === undefined, refreshing, error, reload, refresh, setData };
}

/** Throws Supabase errors so useLoad/handlers can surface them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function must<T = any>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
