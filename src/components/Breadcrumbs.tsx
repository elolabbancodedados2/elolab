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
        const emailModels = path === '/todos-templates' && location.pathname.startsWith('/todos-templates/email/');
        const isLast = index === segments.length - 1;
        if (!isLast && path === '/configuracoes/integracoes/conectar') return null;
        if (!isLast && /^\/pacientes\/[^/]+\/contatos(?:\/[^/]+)?$/.test(path) && location.pathname.includes('/contatos/')) return null;
        if (!isLast && /^\/pacientes\/[^/]+\/cobrancas(?:\/[^/]+)?$/.test(path) && location.pathname.includes('/cobrancas/')) return null;
        if (!isLast && path === '/admin/cobrancas/reconciliar') return null;
        if (!isLast && /^\/admin\/cobrancas\/reconciliar\/[^/]+$/.test(path)) return null;
        if (!isLast && /^\/admin\/consumo\/[^/]+$/.test(path)) return null;
        if (!isLast && /^\/admin\/incidentes\/[^/]+$/.test(path)) return null;
        if (!isLast && /^\/admin\/lgpd\/[^/]+$/.test(path)) return null;
        if (!isLast && /^\/seguranca-assistencial\/[^/]+$/.test(path)) return null;
        if (!isLast && /^\/laboratorio\/(?:pedidos|coletas)(?:\/[^/]+)?$/.test(path)) return null;
        if (!isLast && /^\/todos-templates\/(?:prescricoes|atestados|email)(?:\/[^/]+)?$/.test(path)) return null;
        if (!isLast && /^\/atendimentos\/[^/]+$/.test(path)) return null;
        if (!isLast && /^\/fila\/[^/]+(?:\/liberacao)?$/.test(path) && /^\/fila\/[^/]+\/liberacao\/(?:pagamento|triagem)$/.test(location.pathname)) return null;
        if (!isLast && /^\/fila\/[^/]+$/.test(path) && /^\/fila\/[^/]+\/saida$/.test(location.pathname)) return null;
        if (!isLast && /^\/repasses-medicos\/[^/]+$/.test(path) && /^\/repasses-medicos\/[^/]+\/pagamento$/.test(location.pathname)) return null;
        if (!isLast && /^\/faturamento-convenios\/lotes\/[^/]+$/.test(path) && /^\/faturamento-convenios\/lotes\/[^/]+\/retorno$/.test(location.pathname)) return null;
        if (!isLast && /^\/faturamento-convenios\/lotes\/[^/]+$/.test(path) && /^\/faturamento-convenios\/lotes\/[^/]+\/guias$/.test(location.pathname)) return null;
        if (!isLast && /^\/faturamento-convenios\/glosas\/[^/]+$/.test(path) && /^\/faturamento-convenios\/glosas\/[^/]+\/(?:recurso|retorno)$/.test(location.pathname)) return null;
        if (!isLast && path === '/faturamento-convenios/lotes' && location.pathname.startsWith(`${path}/`)) return null;
        if (!isLast && path === '/faturamento-convenios/glosas' && location.pathname.startsWith(`${path}/`)) return null;
        if (!isLast && /^\/prontuarios\/[^/]+$/.test(path)) return null;
        if (!isLast && /^\/prontuarios\/[^/]+\/anexos$/.test(path)) return null;
        if (!isLast && /^\/prontuarios\/[^/]+\/adendos$/.test(path)) return null;
        if (!isLast && /^\/prontuarios\/[^/]+\/retornos$/.test(path)) return null;
        if (!isLast && /^\/contas\/receber\/[^/]+$/.test(path) && /^\/contas\/receber\/[^/]+\/(?:recebimento|estorno)$/.test(location.pathname)) return null;
        if (!isLast && (path === '/contas/receber' || /^\/contas\/receber\/[^/]+$/.test(path)) && /^\/contas\/receber\/[^/]+\/detalhes$/.test(location.pathname)) return null;
        if (!isLast && /^\/contas\/pagar\/[^/]+$/.test(path) && /^\/contas\/pagar\/[^/]+\/pagamento$/.test(location.pathname)) return null;
        if (!isLast && /^\/recepcao\/caixa\/[^/]+$/.test(path) && /^\/recepcao\/caixa\/[^/]+\/fechar$/.test(location.pathname)) return null;
        if (!isLast && /^\/recepcao\/caixa\/lancamentos\/[^/]+$/.test(path) && /^\/recepcao\/caixa\/lancamentos\/[^/]+\/editar$/.test(location.pathname)) return null;
        if (!isLast && location.pathname.includes('/consentimentos/') && /^\/pacientes\/[^/]+(?:\/consentimentos(?:\/[^/]+)?)?$/.test(path)) return null;
        // These record segments have edit/work pages, but no standalone detail route.
        if (!isLast && /^\/(?:exames\/laboratorios|gestao-fluxo\/salas|precos-servicos\/tipos|precos-servicos\/exames\/convenios|equipe\/funcionarios|usuarios|estoque|tarefas|retornos|convenios|convenios\/[^/]+\/exames)\/[^/]+$/.test(path)) return null;

        return (
          <span key={path} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            {isLast ? (
              <span aria-current="page" className="font-medium text-foreground">{label}</span>
            ) : (
              <Link to={emailModels ? '/todos-templates?tab=email' : path} className="transition-colors hover:text-foreground">{emailModels ? 'Modelos de e-mail' : label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
