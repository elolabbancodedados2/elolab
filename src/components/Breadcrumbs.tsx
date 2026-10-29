import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { getRouteLabel } from '@/config/routeLabels';

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'dashboard')) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/dashboard" aria-label="Voltar ao painel" className="flex items-center gap-1 transition-colors hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((segment, index) => {
        const path = `/${segments.slice(0, index + 1).join('/')}`;
        const label = getRouteLabel(path);
        const isLast = index === segments.length - 1;
        // These record segments have edit/work pages, but no standalone detail route.
        if (!isLast && /^\/(?:exames\/laboratorios|gestao-fluxo\/salas|precos-servicos\/tipos|precos-servicos\/exames\/convenios|equipe\/funcionarios|usuarios|estoque|retornos|convenios|convenios\/[^/]+\/exames)\/[^/]+$/.test(path)) return null;

        return (
          <span key={path} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            {isLast ? (
              <span aria-current="page" className="font-medium text-foreground">{label}</span>
            ) : (
              <Link to={path} className="transition-colors hover:text-foreground">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
