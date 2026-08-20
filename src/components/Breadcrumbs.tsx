import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  pacientes: 'Pacientes',
  agenda: 'Agenda',
  fila: 'Fila de Atendimento',
  prontuarios: 'Prontuários',
  prescricoes: 'Prescrições',
  atestados: 'Atestados',
  medicos: 'Médicos',
  funcionarios: 'Funcionários',
  exames: 'Exames',
  triagem: 'Triagem',
  salas: 'Salas',
  'lista-espera': 'Lista de Espera',
  templates: 'Templates',
  encaminhamentos: 'Encaminhamentos',
  financeiro: 'Financeiro',
  'contas-receber': 'Contas a Receber',
  'contas-pagar': 'Contas a Pagar',
  'fluxo-caixa': 'Fluxo de Caixa',
  pagamentos: 'Pagamentos',
  relatorios: 'Relatórios',
  estoque: 'Estoque',
  convenios: 'Convênios',
  usuarios: 'Usuários',
  configuracoes: 'Configurações',
  automacoes: 'Automações',
  'agente-ia': 'Agente IA',
  analytics: 'Analytics',
  planos: 'Planos',
  laboratorio: 'Laboratório',
  'precos-exames': 'Preços de Exames',
  tarefas: 'Tarefas',
  notificacoes: 'NotificaÃ§Ãµes',
};

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'dashboard')) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
      <Link to="/dashboard" className="flex items-center gap-1 hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((segment, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/');
        const label = routeLabels[segment] || segment;
        const isLast = i === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link to={path} className="hover:text-foreground transition-colors">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
