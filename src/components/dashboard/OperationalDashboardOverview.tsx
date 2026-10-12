import type { LucideIcon } from 'lucide-react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface OperationalDashboardMetric {
  label: string;
  value: string | number;
  detail: string;
  href: string;
}

export interface OperationalDashboardAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface OperationalDashboardOverviewProps {
  nome: string;
  saudacao: string;
  dataLabel: string;
  descricao: string;
  metrics: OperationalDashboardMetric[];
  actions: readonly OperationalDashboardAction[];
  isProfileLinked: boolean;
}

export function OperationalDashboardOverview({
  nome,
  saudacao,
  dataLabel,
  descricao,
  metrics,
  actions,
  isProfileLinked,
}: OperationalDashboardOverviewProps) {
  const primaryAction = actions[0];
  const metricColumns = metrics.length > 3 ? 'xl:grid-cols-4' : 'xl:grid-cols-3';

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-5 rounded-2xl border border-[#DCE6F0] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <p className="text-sm font-medium capitalize text-[#42617D]">{dataLabel}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0C1F54] sm:text-3xl">
            {saudacao}, {nome?.split(' ')[0] || 'olá'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52677C]">{descricao}</p>
        </div>
        {primaryAction && (
          <Link
            to={primaryAction.href}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#005ECC] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#004FAE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7BFD] focus-visible:ring-offset-2"
          >
            <primaryAction.icon aria-hidden="true" className="h-4 w-4" />
            {primaryAction.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      </header>

      {metrics.length > 0 && (
        <section aria-labelledby="operational-summary-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="operational-summary-title" className="text-base font-semibold text-[#0C1F54]">Resumo da rotina</h2>
              <p className="mt-0.5 text-xs text-[#52677C]">Indicadores do seu perfil e da clínica.</p>
            </div>
            <span className="text-xs text-[#52677C]">Atualizado automaticamente</span>
          </div>
          <div className={`grid grid-cols-2 overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white ${metricColumns} divide-x divide-y divide-[#E7EDF3]`}>
            {metrics.map((metric) => (
              <Link
                key={metric.label}
                to={metric.href}
                aria-label={`${metric.label}: ${metric.value}. ${metric.detail}`}
                className="group flex min-h-28 flex-col justify-center p-4 transition-colors hover:bg-[#F6F9FC] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F7BFD] sm:min-h-32 sm:px-5"
              >
                <span className="text-xs font-medium text-[#52677C]">{metric.label}</span>
                <span className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-[#0C1F54] sm:text-3xl">{metric.value}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-[#52677C] group-hover:text-[#284762]">{metric.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {actions.length > 0 && (
        <section aria-labelledby="operational-actions-title" className="rounded-2xl border border-[#DCE6F0] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="operational-actions-title" className="text-base font-semibold text-[#0C1F54]">Acessos da sua função</h2>
            <span className="text-xs text-[#52677C]">Atalhos</span>
          </div>
          <nav aria-label="Acessos frequentes" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {actions.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                to={href}
                className="group flex min-h-14 items-center gap-3 rounded-xl border border-[#E4EBF2] px-3 py-2.5 transition-colors hover:border-[#B7D9FF] hover:bg-[#F6F9FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7BFD] focus-visible:ring-offset-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF4FF] text-[#005ECC]">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-[#183553]">{label}</span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52677C] transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </nav>
        </section>
      )}

      <p className="flex items-start gap-2 px-1 text-xs leading-5 text-[#52677C]">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#18794E]" />
        {isProfileLinked
          ? 'Os módulos e dados exibidos respeitam as permissões do seu perfil. Se precisar de outro acesso, fale com o administrador da clínica.'
          : 'Seu perfil ainda não está vinculado a uma clínica. Peça ao administrador para concluir seu acesso.'}
      </p>
    </div>
  );
}
