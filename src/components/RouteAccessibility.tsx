import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Painel principal',
  '/agenda': 'Agenda',
  '/pacientes': 'Pacientes',
  '/fila': 'Fila de atendimento',
  '/prontuarios': 'Prontuários',
  '/financeiro': 'Financeiro',
  '/notificacoes': 'Central de notificações',
  '/meu-historico': 'Meu histórico',
  '/indicadores': 'Indicadores de produtividade',
  '/configuracoes': 'Configurações',
};

export function getRouteAnnouncement(pathname: string): string {
  const exactLabel = ROUTE_LABELS[pathname];
  if (exactLabel) return `${exactLabel} carregado`;

  const segment = pathname.split('/').filter(Boolean).pop();
  if (!segment) return 'Página carregada';

  const readable = decodeURIComponent(segment)
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
  return `${readable} carregado`;
}

/**
 * Keeps client-side navigation perceivable for keyboard and screen-reader users.
 * The delayed focus runs after the lazy route has mounted and mirrors the browser's
 * native full-page navigation behaviour without moving the visual scroll position.
 */
export function RouteAccessibility({ mainId = 'main-content' }: { mainId?: string }) {
  const { pathname } = useLocation();
  const isInitialRender = useRef(true);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const main = document.getElementById(mainId);
      main?.focus({ preventScroll: true });
      if (main && 'scrollTo' in main) main.scrollTo({ top: 0, behavior: 'auto' });
      setAnnouncement(getRouteAnnouncement(pathname));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [mainId, pathname]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="route-announcer">
      {announcement}
    </div>
  );
}
