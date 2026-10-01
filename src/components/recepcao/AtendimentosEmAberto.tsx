/**
 * Atendimentos que começaram e nunca fecharam.
 *
 * O banco mostrava 13 agendamentos parados em "em atendimento", o mais antigo
 * de 15 de março — cinco meses. Cinco deles numa clínica em operação.
 *
 * Cada um desses é uma consulta que NUNCA FATUROU. E, enquanto ficam assim, o
 * sistema acha que o consultório está ocupado e que o paciente está na sala.
 *
 * Eles eram invisíveis: a fila só guarda quem está aguardando ou já terminou,
 * então esses não apareciam em tela nenhuma. Só olhando o banco.
 *
 * ─── POR QUE NÃO FECHAR SOZINHO ────────────────────────────────────────────
 *
 * Finalizar gera cobrança. Uma rotina que fechasse os 13 automaticamente
 * criaria 13 cobranças para consultas que ninguém sabe se aconteceram — e
 * cobrar paciente por engano é bem pior que um registro em aberto.
 *
 * O sistema não tem como saber o que houve. Então ele pergunta, com as duas
 * respostas possíveis à mão.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { autoFinalizarAtendimento } from '@/lib/workflowAutomation';
import { atomicMarkNoShow } from '@/lib/operationalTransitions';
import { parseDateOnly, todayDateOnly } from '@/lib/dateOnly';
import { FinalizarAtendimentoDialog } from '@/components/fila/FinalizarAtendimentoDialog';

interface Aberto {
  id: string;
  data: string;
  hora_inicio: string;
  tipo: string | null;
  observacoes?: string | null;
  paciente_id: string;
  medico_id: string | null;
  pacientes: { nome: string } | null;
}

export function AtendimentosEmAberto() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [acaoOcupada, setAcaoOcupada] = useState<'finalizar' | 'nao-realizado' | null>(null);
  /** Aguardando a resposta sobre retorno antes de finalizar. */
  const [finalizando, setFinalizando] = useState<Aberto | null>(null);
  const [confirmandoNaoRealizado, setConfirmandoNaoRealizado] = useState<Aberto | null>(null);

  const hoje = todayDateOnly();

  const { data: abertosData, isLoading, isError, refetch } = useQuery({
    queryKey: ['atendimentos-em-aberto', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Aberto[]> => {
      // Só os de dias ANTERIORES. Quem está em atendimento hoje está no
      // consultório agora — apontá-lo como esquecido seria falso alarme, e
      // alarme falso é o que faz o alarme verdadeiro ser ignorado.
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, data, hora_inicio, tipo, observacoes, paciente_id, medico_id, pacientes(nome)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('status', 'em_atendimento')
        .lt('data', hoje)
        .order('data');
      if (error) throw error;
      return (data ?? []) as unknown as Aberto[];
    },
  });

  async function finalizar(a: Aberto, diasRetorno: number | null) {
    setOcupado(a.id);
    setAcaoOcupada('finalizar');
    try {
      const r = await autoFinalizarAtendimento({
        agendamentoId: a.id,
        pacienteId: a.paciente_id,
        pacienteNome: a.pacientes?.nome ?? 'Paciente',
        medicoId: a.medico_id ?? '',
        tipoConsulta: a.tipo,
        tipoExame: ['exame', 'exames'].includes(String(a.tipo || '').toLocaleLowerCase('pt-BR'))
          ? a.observacoes : null,
        clinicaId: profile?.clinica_id,
        // Encerrar um registro antigo é uma correção operacional, não um evento
        // clínico ocorrido hoje; evite enviar uma notificação com data enganosa.
        notificarPaciente: false,
        // Mesma pergunta das outras vias de finalização: sem ela, o retorno
        // destes pacientes de dias atrás nasceria esquecido.
        agendarRetorno: diasRetorno !== null,
        diasRetorno: diasRetorno ?? undefined,
      });
      if (!r.success) {
        atualizar();
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
        queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
        throw new Error(r.message);
      }
      toast.success(r.message || 'Atendimento finalizado', { description: r.actions.join(' • ') });
      atualizar();
    } catch (e: any) {
      toast.error('Não foi possível finalizar', { description: e?.message });
    } finally {
      setOcupado(null);
      setAcaoOcupada(null);
      setFinalizando(null);
    }
  }

  async function naoAconteceu(a: Aberto) {
    setOcupado(a.id);
    setAcaoOcupada('nao-realizado');
    try {
      const resultado = await atomicMarkNoShow(a.id, profile?.clinica_id || '');
      if (!resultado.success) throw new Error(resultado.message);
      toast.success('Marcado como não realizado', { description: resultado.message });
      atualizar();
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
    } catch (e: any) {
      toast.error('Não foi possível atualizar', { description: e?.message });
    } finally {
      setOcupado(null);
      setAcaoOcupada(null);
    }
  }

  function atualizar() {
    queryClient.invalidateQueries({ queryKey: ['atendimentos-em-aberto', profile?.clinica_id] });
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
  }

  const abertos = abertosData ?? [];

  if (isLoading && !abertosData) {
    return <div className="rounded-xl border p-4 text-sm text-muted-foreground" role="status" aria-live="polite">Verificando atendimentos antigos em aberto…</div>;
  }

  if (isError && abertos.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
        <p className="text-sm font-medium text-destructive">Não foi possível verificar atendimentos antigos em aberto.</p>
        <p className="text-xs text-muted-foreground">Os dados podem estar desatualizados. Tente novamente.</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  if (abertos.length === 0 && !isError) return null;

  return (
    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-background/70 p-3" role="alert">
          <span className="text-xs text-destructive">Não foi possível atualizar a lista; os dados exibidos podem estar desatualizados.</span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      )}
      <p className="flex items-center gap-2 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        {abertos.length === 1
          ? '1 atendimento de outro dia continua em aberto'
          : `${abertos.length} atendimentos de outros dias continuam em aberto`}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Estão em andamento no sistema apesar de serem de dias anteriores. Confirme
        o que ocorreu para corrigir o atendimento e a cobrança sem fechar por engano.
      </p>

      <div className="space-y-1.5 pt-1">
        {abertos.map(a => {
          const dias = differenceInCalendarDays(parseDateOnly(hoje), parseDateOnly(a.data));
          return (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {a.pacientes?.nome ?? 'Paciente'}
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                {dias === 1 ? 'ontem' : `há ${dias} dias`}
              </Badge>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  disabled={ocupado !== null}
                  onClick={() => setFinalizando(a)}
                >
                  {ocupado === a.id && acaoOcupada === 'finalizar'
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <CheckCircle2 className="h-3 w-3 text-success" />}
                  Foi atendido
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground"
                  disabled={ocupado !== null}
                  onClick={() => setConfirmandoNaoRealizado(a)}
                >
                  {ocupado === a.id && acaoOcupada === 'nao-realizado'
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <XCircle className="h-3 w-3" />}
                  Não foi
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        “Foi atendido” finaliza e cria a cobrança que estiver faltando. “Não foi”
        cancela a cobrança pendente; pagamentos registrados precisam ser estornados primeiro.
      </p>

      <AlertDialog open={!!confirmandoNaoRealizado} onOpenChange={(open) => !open && setConfirmandoNaoRealizado(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como não realizado?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmandoNaoRealizado?.pacientes?.nome ?? 'Este paciente'} será removido da fila. Se houver cobrança pendente, ela será cancelada. Um pagamento já registrado precisa ser estornado antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmandoNaoRealizado || ocupado === confirmandoNaoRealizado.id}
              onClick={() => {
                const atendimento = confirmandoNaoRealizado;
                setConfirmandoNaoRealizado(null);
                if (atendimento) void naoAconteceu(atendimento);
              }}
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FinalizarAtendimentoDialog
        open={!!finalizando}
        pacienteNome={finalizando?.pacientes?.nome ?? 'Paciente'}
        onClose={() => setFinalizando(null)}
        onConfirm={async dias => {
          if (finalizando) await finalizar(finalizando, dias);
        }}
      />
    </div>
  );
}
