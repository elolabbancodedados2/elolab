import { useMemo } from 'react';
import { useAgendamentos, useSalas } from '@/hooks/useSupabaseData';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { faixaDeHoras, montarGradeOcupacao, type AgendamentoGrade } from '@/lib/gradeOcupacao';
import { ErrorState } from '@/components/ErrorState';
import { cn } from '@/lib/utils';

/** Ocupação das salas hora a hora no dia de hoje (São Paulo). */
export function GradeOcupacaoDia() {
  const hoje = todaySaoPauloDateOnly();
  const salasQuery = useSalas();
  const agendaQuery = useAgendamentos(hoje);
  const agendamentos = useMemo<AgendamentoGrade[]>(() => (agendaQuery.data ?? []).map((ag: any) => ({
    id: ag.id,
    sala_id: ag.sala_id,
    hora_inicio: ag.hora_inicio,
    hora_fim: ag.hora_fim,
    status: ag.status,
    paciente: ag.pacientes?.nome_social || ag.pacientes?.nome || null,
  })), [agendaQuery.data]);
  const salas = useMemo(() => (salasQuery.data ?? []).map((s: any) => ({ id: s.id as string, nome: s.nome as string })), [salasQuery.data]);
  const horas = useMemo(() => faixaDeHoras(agendamentos), [agendamentos]);
  const grade = useMemo(() => montarGradeOcupacao(salas, agendamentos, horas), [salas, agendamentos, horas]);
  const semSala = agendamentos.filter(ag => !ag.sala_id && ag.status !== 'cancelado' && ag.status !== 'faltou').length;

  if (salasQuery.isError || agendaQuery.isError) {
    return <ErrorState title="Não foi possível montar a grade de ocupação" error={salasQuery.error || agendaQuery.error} onRetry={() => { void salasQuery.refetch(); void agendaQuery.refetch(); }} />;
  }
  if (salasQuery.isLoading || agendaQuery.isLoading) {
    return <p role="status" className="py-6 text-sm text-muted-foreground">Carregando a ocupação do dia…</p>;
  }
  if (salas.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Cadastre salas para ver a ocupação do dia.</p>;
  }

  return (
    <section aria-labelledby="grade-ocupacao-titulo" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header>
        <h2 id="grade-ocupacao-titulo" className="text-sm font-semibold text-foreground">Ocupação de hoje por sala e hora</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Agendamentos com sala definida na Agenda. Cancelados e faltas não ocupam a sala.
          {semSala > 0 && ` ${semSala} ${semSala === 1 ? 'agendamento está' : 'agendamentos estão'} sem sala.`}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <caption className="sr-only">Ocupação das salas por hora</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">Sala</th>
              {horas.map(hora => (
                <th key={hora} scope="col" className="px-1 py-1.5 text-center font-medium tabular-nums text-muted-foreground">{String(hora).padStart(2, '0')}h</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grade.map(linha => (
              <tr key={linha.sala.id} className="border-t border-border/70">
                <th scope="row" className="sticky left-0 max-w-[10rem] truncate bg-card px-2 py-1.5 text-left font-medium text-foreground">
                  {linha.sala.nome}
                  <span className="ml-1 font-normal text-muted-foreground">· {linha.ocupadas}h</span>
                </th>
                {linha.celulas.map(celula => {
                  const nomes = celula.agendamentos.map(ag => `${ag.hora_inicio?.slice(0, 5) ?? ''} ${ag.paciente ?? 'Paciente'}`.trim());
                  return (
                    <td key={celula.hora} className="p-0.5">
                      <div
                        title={nomes.join('\n') || 'Livre'}
                        aria-label={`${linha.sala.nome}, ${String(celula.hora).padStart(2, '0')}h: ${nomes.length ? nomes.join(', ') : 'livre'}`}
                        className={cn(
                          'flex h-8 items-center justify-center rounded-md tabular-nums',
                          celula.agendamentos.length > 1
                            ? 'border border-warning/50 bg-warning/15 font-semibold text-warning-foreground'
                            : celula.agendamentos.length === 1
                              ? 'bg-foreground text-background'
                              : 'bg-muted/40 text-muted-foreground',
                        )}
                      >
                        {celula.agendamentos.length > 0 ? celula.agendamentos.length : ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Preto: sala ocupada. Âmbar: mais de um agendamento na mesma hora.</p>
    </section>
  );
}
