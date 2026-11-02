import { useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Printer } from '@/components/icons/elolabIcons';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { useAgendamentosPeriodo, useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { isValidAgendaDate } from '@/lib/agendaDate';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { nomeMedico } from '@/lib/formatters';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { TIPOS_FIXOS_CONSULTA } from '@/components/agenda/agendaStatus';

/** Lista A4 da agenda, por profissional e dia, para a recepção e o consultório. */
export function agruparParaImpressao(agendamentos: any[], medicoIds: string[] | null) {
  const grupos = new Map<string, Map<string, any[]>>();
  const ordenados = [...agendamentos]
    .filter(a => !medicoIds?.length || medicoIds.includes(a.medico_id))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
  for (const a of ordenados) {
    const chave = a.medico_id || 'sem-medico';
    if (!grupos.has(chave)) grupos.set(chave, new Map());
    const dias = grupos.get(chave)!;
    if (!dias.has(a.data)) dias.set(a.data, []);
    dias.get(a.data)!.push(a);
  }
  return grupos;
}

const ESTILO_IMPRESSAO = `
  @page { size: A4; margin: 12mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 16px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 14px 0 4px; } h3 { font-size: 11px; margin: 8px 0 4px; text-transform: capitalize; }
  p { margin: 0 0 6px; color: #444; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  th, td { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; color: #555; }
  tr { page-break-inside: avoid; } .riscado td { color: #888; text-decoration: line-through; }
  section { page-break-inside: auto; } .quebra { page-break-before: always; }
`;

export default function AgendaImpressaoPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const conteudoRef = useRef<HTMLDivElement>(null);
  const currentMedico = useCurrentMedico();
  const data = isValidAgendaDate(params.get('data')) ? params.get('data')! : todaySaoPauloDateOnly();
  const semana = params.get('view') === 'weekly';
  const periodo = useMemo(() => {
    if (!semana) return { inicio: data, fim: data };
    const ini = startOfWeek(parseISO(data), { weekStartsOn: 1 });
    return { inicio: format(ini, 'yyyy-MM-dd'), fim: format(addDays(ini, 6), 'yyyy-MM-dd') };
  }, [data, semana]);
  const medicosParam = params.get('medicos') || '';
  const agendaQuery = useAgendamentosPeriodo(periodo.inicio, periodo.fim, {
    resumoRecepcao: true,
    enabled: !currentMedico.isMedicoOnly || !!currentMedico.medicoId,
  });
  const medicosQuery = useMedicos();
  const conveniosQuery = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true }, suppressGlobalErrorToast: true });
  const medicoPorId = useMemo(() => new Map((medicosQuery.data ?? []).map((m: any) => [m.id, m])), [medicosQuery.data]);
  const convenioPorId = useMemo(() => new Map((conveniosQuery.data ?? []).map((c: any) => [c.id, c.nome])), [conveniosQuery.data]);
  // O médico só imprime a própria agenda; os demais seguem o filtro da agenda.
  const grupos = useMemo(() => {
    const ids = currentMedico.isMedicoOnly
      ? (currentMedico.medicoId ? [currentMedico.medicoId] : ['__nenhum__'])
      : medicosParam.split(',').filter(Boolean);
    return agruparParaImpressao(agendaQuery.data ?? [], ids.length ? ids : null);
  }, [agendaQuery.data, currentMedico.isMedicoOnly, currentMedico.medicoId, medicosParam]);
  const voltarPara = typeof location.state?.returnTo === 'string' && /^\/agenda(?:\?|$)/.test(location.state.returnTo)
    ? location.state.returnTo : `/agenda?data=${data}&view=${semana ? 'weekly' : 'daily'}`;
  const tituloPeriodo = semana
    ? `Semana de ${format(parseISO(periodo.inicio), "d 'de' MMM", { locale: ptBR })} a ${format(parseISO(periodo.fim), "d 'de' MMM 'de' yyyy", { locale: ptBR })}`
    : format(parseISO(data), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  const imprimir = () => {
    // Janela própria: só a lista vai para o papel, sem menu nem barra lateral.
    const janela = window.open('', '_blank', 'width=900,height=1000');
    if (!janela || !conteudoRef.current) { window.print(); return; }
    janela.opener = null;
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Agenda</title><style>${ESTILO_IMPRESSAO}</style></head><body>${conteudoRef.current.innerHTML}</body></html>`);
    janela.document.close();
    janela.focus();
    janela.print();
  };

  if (agendaQuery.isError) return <ErrorState title="Não foi possível carregar a agenda para impressão" error={agendaQuery.error} onRetry={() => void agendaQuery.refetch()} />;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className="-ml-3 min-h-11 gap-2" onClick={() => navigate(voltarPara)}><ArrowLeft className="h-4 w-4" />Voltar à agenda</Button>
        <Button className="min-h-11 gap-2" onClick={imprimir} disabled={agendaQuery.isLoading}><Printer className="h-4 w-4" />Imprimir</Button>
      </div>
      <div ref={conteudoRef} className="rounded-xl border border-border bg-card p-4 text-sm sm:p-6">
        <h1 className="text-lg font-semibold text-foreground">Agenda</h1>
        <p className="first-letter:uppercase text-muted-foreground">{tituloPeriodo}</p>
        {agendaQuery.isLoading ? (
          <p role="status" className="py-8 text-muted-foreground">Carregando consultas…</p>
        ) : grupos.size === 0 ? (
          <p className="py-8 text-muted-foreground">Nenhuma consulta no período.</p>
        ) : [...grupos.entries()].map(([medicoId, dias], indice) => {
          const medico = medicoPorId.get(medicoId) as any;
          return (
            <section key={medicoId} className={indice > 0 ? 'quebra mt-6' : 'mt-4'}>
              <h2 className="text-base font-semibold text-foreground">{medico ? nomeMedico(medico.nome || medico.crm) : 'Profissional não informado'}</h2>
              {[...dias.entries()].map(([dia, consultas]) => (
                <div key={dia} className="mt-2 overflow-x-auto">
                  {semana && <h3 className="text-xs font-semibold capitalize text-muted-foreground">{format(parseISO(dia), "EEEE, dd/MM", { locale: ptBR })}</h3>}
                  <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                        <th className="py-1 pr-2">Hora</th><th className="py-1 pr-2">Paciente</th><th className="py-1 pr-2">Telefone</th>
                        <th className="py-1 pr-2">Tipo</th><th className="py-1 pr-2">Convênio</th><th className="py-1 pr-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consultas.map(a => (
                        <tr key={a.id} className={['cancelado', 'faltou'].includes(a.status) ? 'riscado border-b border-border/60 text-muted-foreground line-through' : 'border-b border-border/60'}>
                          <td className="py-1 pr-2 tabular-nums">{String(a.hora_inicio).slice(0, 5)}{a.hora_fim ? `–${String(a.hora_fim).slice(0, 5)}` : ''}</td>
                          <td className="py-1 pr-2 font-medium">{a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'}</td>
                          <td className="py-1 pr-2 tabular-nums">{a.pacientes?.telefone || '—'}</td>
                          <td className="py-1 pr-2">{TIPOS_FIXOS_CONSULTA.find(([v]) => v === a.tipo)?.[1] || a.tipo || '—'}</td>
                          <td className="py-1 pr-2">{convenioPorId.get(a.convenio_id || a.pacientes?.convenio_id) || 'Particular'}</td>
                          <td className="py-1 pr-2">{formatAppointmentStatus(a.status || 'agendado')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
