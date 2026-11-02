import { useSyncExternalStore } from 'react';

const CONSULTA = '(max-width: 767px)';

function assinar(aoMudar: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(CONSULTA);
  media.addEventListener?.('change', aoMudar);
  return () => media.removeEventListener?.('change', aoMudar);
}

const ler = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(CONSULTA).matches : false);

/**
 * Tela abaixo de 768px (celular). Serve para trocar tabelas largas por fichas
 * sem renderizar as duas versões ao mesmo tempo.
 */
export function useTelaEstreita(): boolean {
  return useSyncExternalStore(assinar, ler, () => false);
}
