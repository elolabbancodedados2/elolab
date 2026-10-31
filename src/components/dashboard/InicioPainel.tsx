import {
  AlertTriangle, ArrowRight, Cake, CalendarDays, CheckCircle2, ClipboardList, FileText,
  ListChecks, MessageCircle, RefreshCw, Timer, UserRoundPlus,
} from '@/components/icons/elolabIcons';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { AdminDashboardOverviewProps } from './AdminDashboardOverview';

// Tela de Início no padrão aprovado em 30/10/2026: fundo branco gelo, quadros brancos,
// preto nos destaques e cor apenas para o que pede atenção.

const actionIcons = {
  calendar: CalendarDays,
  patient: UserRoundPlus,
  document: FileText,
  queue: ClipboardList,
};

const quadro = 'rounded-2xl border border-[#E3E8EE] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]';
const tituloQuadro = 'text-[15px] font-extrabold tracking-tight text-[#111214]';
const linkQuadro = 'ml-auto shrink-0 text-xs font-semibold text-[#111214] underline underline-offset-4 hover:text-[#3B3E44]';
const tonsFluxo = ['#111214', '#4A4D53', '#7C8088', '#A9ADB4', '#D3D5D9', '#E6E8EB'];

function iniciais(nome: string) {
  const partes = nome.replace(/^(dra?|dr\(a\))\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[partes.length - 1][0] : ''}`.toUpperCase();
}

/** Áreas do Início que carregam dados próprios e podem falhar sozinhas. */
export type InicioBloco = 'fila' | 'atencao' | 'agenda' | 'financeiro' | 'confirmacoes' | 'tarefas' | 'aniversariantes';

export type InicioPainelProps = AdminDashboardOverviewProps & {
  /** Áreas cujos dados não carregaram, com a ação de tentar de novo daquela área. */
  falhas?: Partial<Record<InicioBloco, () => void>>;
};

function FalhaBloco({ onRetry, mensagem = 'Não foi possível carregar esta área.' }: { onRetry: () => void; mensagem?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#F0D4D2] bg-[#FBF1F0] p-3 text-sm text-[#3B3E44]" role="status">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[#C8352E]" aria-hidden />
      <span className="min-w-0 flex-1">{mensagem}</span>
      <button type="button" onClick={() => onRetry()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E8EE] bg-white px-2.5 py-1 text-xs font-semibold text-[#111214] hover:bg-[#F1F4F7]">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />Tentar de novo
      </button>
    </div>
  );
}

const valorOuTraco = (valor: number) => (Number.isFinite(valor) ? String(valor) : '—');

function Avatar({ nome }: { nome: string }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EAEEF3] text-xs font-extrabold text-[#111214]">
      {iniciais(nome)}
    </span>
  );
}

export function InicioPainel({
  dataLabel,
  horarioLabel,
  metricas,
  agenda,
  filaAgora = [],
  filaAtualizando = false,
  onAtualizarFila,
  alertas,
  desempenho,
  fluxoFinanceiro,
  acoes,
  confirmacoesAmanha = [],
  ocupacaoSemana = [],
  resumoMes,
  tarefas = [],
  aniversariantes = [],
  falhas = {},
}: InicioPainelProps) {
  const fluxoHoje = Object.entries(agenda.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const totalFluxo = fluxoHoje.reduce((soma, [, total]) => soma + total, 0);
  const desempenhoSeguro = Math.max(0, Math.min(100, desempenho.percentual));
  const picoReceita = Math.max(1, ...fluxoFinanceiro.map(item => Number(item.receitas) || 0));
  const picoSemana = Math.max(1, ...ocupacaoSemana.map(dia => dia.total));
  const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return (
    <div className="space-y-4 pb-8 text-[#111214]" data-testid="inicio-painel">
      <header className="flex flex-col gap-3 border-b border-[#E3E8EE] pb-4 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">Início</h1>
          <p className="mt-0.5 text-sm text-[#6E737B] first-letter:uppercase">{dataLabel} · {horarioLabel}</p>
        </div>
        <dl className="flex flex-wrap items-center gap-y-2 lg:ml-auto">
          {[
            ['Consultas hoje', falhas.agenda ? '—' : String(metricas.consultas)],
            ['Na fila', falhas.fila ? '—' : String(metricas.fila)],
            ['Finalizadas', falhas.agenda ? '—' : String(metricas.finalizadas)],
            ['Recebido hoje', falhas.financeiro ? '—' : metricas.receita],
          ].map(([rotulo, valor], index) => (
            <div key={rotulo} className={cn('flex items-baseline gap-2 px-4', index > 0 && 'border-l border-[#E3E8EE]')}>
              <dt className="text-xs text-[#6E737B]">{rotulo}</dt>
              <dd className="text-base font-extrabold tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>
      </header>

      <nav aria-label="Ações rápidas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {acoes.map(acao => {
          const Icone = actionIcons[acao.icon];
          return (
            <Link key={acao.href + acao.label} to={acao.href} className={cn(quadro, 'flex items-center gap-3 transition-colors hover:border-[#B9BCC2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111214]')}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#111214] text-white"><Icone className="h-5 w-5" /></span>
              <span className="text-sm font-extrabold">{acao.label}</span>
              <ArrowRight className="ml-auto h-4 w-4 text-[#A9ADB4]" />
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-4 xl:grid-cols-12">
        <section aria-labelledby="inicio-fila" className={cn(quadro, 'space-y-3 xl:col-span-8')}>
          <div className="flex items-center gap-2">
            <h2 id="inicio-fila" className={tituloQuadro}>Na sala de espera</h2>
            {!falhas.fila && <span className="text-xs text-[#6E737B]">{filaAgora.length} {filaAgora.length === 1 ? 'paciente' : 'pacientes'}</span>}
            {onAtualizarFila && (
              <button type="button" onClick={() => void onAtualizarFila()} disabled={filaAtualizando} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#E3E8EE] px-2.5 py-1 text-xs font-semibold hover:bg-[#F1F4F7] disabled:opacity-60">
                <RefreshCw className={cn('h-3.5 w-3.5', filaAtualizando && 'animate-spin')} />Atualizar
              </button>
            )}
            <Link to="/fila" className={cn(linkQuadro, onAtualizarFila && 'ml-2')}>Abrir fila</Link>
          </div>
          {falhas.fila ? <FalhaBloco onRetry={falhas.fila} /> : filaAgora.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#D3D8DF] p-4 text-sm text-[#6E737B]">Ninguém aguardando agora.</p>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {filaAgora.slice(0, 6).map(item => {
                const prioritario = item.prioridade !== 'normal';
                const urgente = /urgen|emerg/i.test(item.prioridade);
                return (
                  <li key={item.id} className={cn('rounded-xl border border-[#E3E8EE] border-t-[3px] bg-white p-3', urgente ? 'border-t-[#C8352E]' : 'border-t-[#111214]')}>
                    <div className="flex items-center gap-2.5">
                      <Avatar nome={item.paciente} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{item.paciente}</p>
                        <p className="truncate text-xs text-[#6E737B]">{item.medico || 'Sem profissional definido'}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <Timer className="h-3.5 w-3.5 text-[#6E737B]" />
                      <span className="font-semibold tabular-nums">{item.espera}</span>
                      {prioritario && <span className={cn('ml-auto rounded-full px-2 py-0.5 font-semibold capitalize', urgente ? 'bg-[#F8E7E6] text-[#C8352E]' : 'bg-[#EEF1F5] text-[#3B3E44]')}>{item.prioridade}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="inicio-atencao" className={cn(quadro, 'space-y-3 xl:col-span-4')}>
          <div className="flex items-center gap-2">
            <h2 id="inicio-atencao" className={tituloQuadro}>Precisa de atenção</h2>
            <span className="text-xs text-[#6E737B]">{alertas.length}</span>
          </div>
          {falhas.atencao && <FalhaBloco onRetry={falhas.atencao} mensagem="Algumas pendências não puderam ser verificadas." />}
          {alertas.length === 0 ? (
            !falhas.atencao && <p className="flex items-center gap-2 rounded-xl bg-[#F1F4F7] p-3 text-sm text-[#3B3E44]"><CheckCircle2 className="h-4 w-4" />Nada pendente agora.</p>
          ) : (
            <ul className="space-y-2">
              {alertas.map(alerta => (
                <li key={alerta.id}>
                  <Link to={alerta.href} className="flex items-center gap-3 rounded-xl bg-[#F1F4F7] p-2.5 hover:bg-[#E9EDF2]">
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white', alerta.tom === 'attention' ? 'bg-[#C8352E]' : 'bg-[#111214]')}>
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{alerta.titulo}</span>
                      <span className="block truncate text-xs text-[#6E737B]">{alerta.detalhe}</span>
                    </span>
                    <span className="ml-auto text-xs font-semibold underline underline-offset-4">Resolver</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="inicio-agenda" className={cn(quadro, 'space-y-3 xl:col-span-5')}>
          <div className="flex items-center gap-2">
            <h2 id="inicio-agenda" className={tituloQuadro}>Agenda de hoje</h2>
            {!falhas.agenda && <span className="text-xs text-[#6E737B]">{totalFluxo} consultas</span>}
            <Link to="/agenda" className={linkQuadro}>Ver agenda</Link>
          </div>
          {falhas.agenda ? <FalhaBloco onRetry={falhas.agenda} /> : (<>
          {totalFluxo > 0 && (
            <>
              <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={fluxoHoje.map(([status, total]) => `${status}: ${total}`).join(', ')}>
                {fluxoHoje.map(([status, total], index) => (
                  <span key={status} style={{ width: `${(total / totalFluxo) * 100}%`, background: tonsFluxo[index % tonsFluxo.length] }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {fluxoHoje.map(([status, total], index) => (
                  <li key={status} className="flex items-center gap-1.5 text-xs text-[#3B3E44]">
                    <span className="h-2 w-2 rounded-sm" style={{ background: tonsFluxo[index % tonsFluxo.length] }} />
                    <span className="font-extrabold tabular-nums">{total}</span>{status}
                  </li>
                ))}
              </ul>
            </>
          )}
          {agenda.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D3D8DF] p-4 text-sm text-[#6E737B]">
              Nenhuma consulta agendada para hoje.{' '}
              <Link to="/agenda" className="font-semibold text-[#111214] underline underline-offset-4">Agendar consulta</Link>
            </div>
          ) : (
            <ul className="divide-y divide-[#EEF1F5]">
              {agenda.slice(0, 7).map(item => (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <Avatar nome={item.paciente} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{item.paciente}</p>
                    <p className="truncate text-xs text-[#6E737B]">{item.tipo} · {item.status}</p>
                  </div>
                  <time className="ml-auto text-sm font-extrabold tabular-nums">{item.horario}</time>
                </li>
              ))}
            </ul>
          )}
          <div>
            <div className="mb-1 flex justify-between text-xs text-[#6E737B]"><span>Atendimentos concluídos</span><span className="font-semibold tabular-nums text-[#111214]">{desempenhoSeguro}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF1F5]" role="progressbar" aria-label="Atendimentos concluídos" aria-valuenow={desempenhoSeguro} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[#111214]" style={{ width: `${desempenhoSeguro}%` }} />
            </div>
            <p className="mt-1 text-xs text-[#6E737B]">{desempenho.descricao}</p>
          </div>
          </>)}
        </section>

        <section aria-labelledby="inicio-financeiro" className={cn(quadro, 'space-y-3 xl:col-span-7')}>
          <div className="flex items-center gap-2">
            <h2 id="inicio-financeiro" className={tituloQuadro}>Recebimentos</h2>
            <span className="text-xs text-[#6E737B]">últimos 6 meses</span>
            <Link to="/financeiro" className={linkQuadro}>Abrir financeiro</Link>
          </div>
          {falhas.financeiro && <FalhaBloco onRetry={falhas.financeiro} mensagem="Não foi possível carregar os recebimentos." />}
          {resumoMes && !falhas.financeiro && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Ticket médio', resumoMes.ticketMedio],
                ['Receita x mês anterior', `${resumoMes.variacaoReceita > 0 ? '+' : ''}${resumoMes.variacaoReceita}%`],
                ['Pacientes novos', valorOuTraco(resumoMes.novosPacientes)],
                ['Faltas no mês', valorOuTraco(resumoMes.faltas)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="rounded-xl bg-[#F1F4F7] p-2.5">
                  <dt className="text-[11px] text-[#6E737B]">{rotulo}</dt>
                  <dd className="text-base font-extrabold tabular-nums">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
          {falhas.financeiro ? null : fluxoFinanceiro.length === 0 ? (
            <p className="text-sm text-[#6E737B]">Ainda não há recebimentos no período.</p>
          ) : (
            <ol className="flex h-36 items-end gap-2" aria-label="Recebimentos por mês">
              {fluxoFinanceiro.map((mes, index) => {
                const valor = Number(mes.receitas) || 0;
                const atual = index === fluxoFinanceiro.length - 1;
                return (
                  <li key={mes.name} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] font-semibold tabular-nums text-[#6E737B]">{formatoMoeda.format(valor)}</span>
                    <span className={cn('w-full max-w-12 rounded-t-md', atual ? 'bg-[#111214]' : 'bg-[#C9CCD1]')} style={{ height: `${Math.max(2, (valor / picoReceita) * 100)}%` }} />
                    <span className={cn('text-[11px] capitalize', atual ? 'font-bold text-[#111214]' : 'text-[#6E737B]')}>{mes.name}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {ocupacaoSemana.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#3B3E44]">Consultas por dia nesta semana</p>
              <ol className="flex items-end gap-2">
                {ocupacaoSemana.map(dia => (
                  <li key={dia.dia} className="flex flex-1 flex-col items-center gap-1">
                    <span className="flex h-12 w-full items-end justify-center"><span className={cn('w-full max-w-10 rounded-t-md', dia.hoje ? 'bg-[#111214]' : 'bg-[#DDE1E6]')} style={{ height: `${Math.max(6, (dia.total / picoSemana) * 100)}%` }} /></span>
                    <span className={cn('text-[11px] capitalize', dia.hoje ? 'font-bold' : 'text-[#6E737B]')}>{dia.dia} · {dia.total}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section aria-labelledby="inicio-confirmar" className={cn(quadro, 'space-y-3 xl:col-span-6')}>
          <div className="flex items-center gap-2">
            <h2 id="inicio-confirmar" className={tituloQuadro}>Confirmar consultas de amanhã</h2>
            {!falhas.confirmacoes && <span className="text-xs text-[#6E737B]">{confirmacoesAmanha.length}</span>}
          </div>
          {falhas.confirmacoes ? <FalhaBloco onRetry={falhas.confirmacoes} /> : confirmacoesAmanha.length === 0 ? (
            <p className="text-sm text-[#6E737B]">Nenhuma consulta de amanhã esperando confirmação.</p>
          ) : (
            <ul className="divide-y divide-[#EEF1F5]">
              {confirmacoesAmanha.slice(0, 6).map(item => (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <time className="w-12 text-sm font-extrabold tabular-nums">{item.horario}</time>
                  <span className="min-w-0 truncate text-sm font-semibold">{item.paciente}</span>
                  {item.whatsapp ? (
                    <a href={item.whatsapp} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#111214] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#2B2D31]">
                      <MessageCircle className="h-3.5 w-3.5" />Confirmar
                    </a>
                  ) : <span className="ml-auto text-xs text-[#6E737B]">sem telefone</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="inicio-tarefas" className={cn(quadro, 'space-y-3 xl:col-span-3')}>
          <div className="flex items-center gap-2">
            <h2 id="inicio-tarefas" className={tituloQuadro}>Minhas tarefas</h2>
            <Link to="/tarefas" className={linkQuadro}>Ver todas</Link>
          </div>
          {falhas.tarefas ? <FalhaBloco onRetry={falhas.tarefas} /> : tarefas.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-[#6E737B]"><ListChecks className="h-4 w-4" />Nenhuma tarefa pendente.</p>
          ) : (
            <ul className="space-y-1.5">
              {tarefas.slice(0, 5).map(tarefa => (
                <li key={tarefa.id} className="flex items-center gap-2 text-sm">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', tarefa.atrasada ? 'bg-[#C8352E]' : 'bg-[#111214]')} />
                  <span className="min-w-0 truncate">{tarefa.titulo}</span>
                  {tarefa.vencimento && <span className={cn('ml-auto text-xs tabular-nums', tarefa.atrasada ? 'font-semibold text-[#C8352E]' : 'text-[#6E737B]')}>{tarefa.vencimento}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="inicio-aniversario" className={cn(quadro, 'space-y-3 xl:col-span-3')}>
          <div className="flex items-center gap-2">
            <h2 id="inicio-aniversario" className={tituloQuadro}>Aniversariantes</h2>
            {!falhas.aniversariantes && <span className="text-xs text-[#6E737B]">{aniversariantes.length}</span>}
          </div>
          {falhas.aniversariantes ? <FalhaBloco onRetry={falhas.aniversariantes} /> : aniversariantes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-[#6E737B]"><Cake className="h-4 w-4" />Nenhum hoje.</p>
          ) : (
            <ul className="space-y-1.5">
              {aniversariantes.slice(0, 5).map(pessoa => (
                <li key={pessoa.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{pessoa.nome}</span>
                  {pessoa.whatsapp && (
                    <a href={pessoa.whatsapp} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold underline underline-offset-4">Parabenizar</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
