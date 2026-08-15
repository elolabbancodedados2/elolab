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
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { autoFinalizarAtendimento } from '@/lib/workflowAutomation';
import { parseDateOnly, todayDateOnly } from '@/lib/dateOnly';

interface Aberto {
  id: string;
  data: string;
  hora_inicio: string;
  tipo: string | null;
  paciente_id: string;
  medico_id: string | null;
  pacientes: { nome: string } | null;
}

export function AtendimentosEmAberto() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const hoje = todayDateOnly();

  const { data: abertos = [] } = useQuery({
    queryKey: ['atendimentos-em-aberto', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async (): Promise<Aberto[]> => {
      // Só os de dias ANTERIORES. Quem está em atendimento hoje está no
      // consultório agora — apontá-lo como esquecido seria falso alarme, e
      // alarme falso é o que faz o alarme verdadeiro ser ignorado.
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, data, hora_inicio, tipo, paciente_id, medico_id, pacientes(nome)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('status', 'em_atendimento')
        .lt('data', hoje)
        .order('data');
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  async function finalizar(a: Aberto) {
    setOcupado(a.id);
    try {
      const r = await autoFinalizarAtendimento({
        agendamentoId: a.id,
        pacienteId: a.paciente_id,
        pacienteNome: a.pacientes?.nome ?? 'Paciente',
        medicoId: a.medico_id ?? '',
        tipoConsulta: a.tipo,
        clinicaId: profile?.clinica_id,
      });
      if (!r.success) throw new Error(r.message);
      toast.success('Atendimento finalizado', { description: r.actions.join(' • ') });
      atualizar();
    } catch (e: any) {
      toast.error('Não foi possível finalizar', { description: e?.message });
    } finally {
      setOcupado(null);
    }
  }

  async function naoAconteceu(a: Aberto) {
    setOcupado(a.id);
    try {
      // Cancelado, não "faltou": o paciente chegou — alguém o marcou como em
      // atendimento. Registrar falta seria mentir sobre a presença dele.
      const { error } = await supabase
        .from('agendamentos')
        .update({ status: 'cancelado' })
        .eq('id', a.id)
        .select('id')
        .single();
      if (error) throw error;
      toast.success('Marcado como não realizado', { description: 'Nenhuma cobrança foi gerada.' });
      atualizar();
    } catch (e: any) {
      toast.error('Não foi possível atualizar', { description: e?.message });
    } finally {
      setOcupado(null);
    }
  }

  function atualizar() {
    queryClient.invalidateQueries({ queryKey: ['atendimentos-em-aberto', profile?.clinica_id] });
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
  }

  if (abertos.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        {abertos.length === 1
          ? '1 atendimento de outro dia continua em aberto'
          : `${abertos.length} atendimentos de outros dias continuam em aberto`}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Foram iniciados e nunca finalizados: não geraram cobrança, e o sistema
        ainda os considera em andamento. Diga o que aconteceu em cada um.
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
                  disabled={ocupado === a.id}
                  onClick={() => finalizar(a)}
                >
                  {ocupado === a.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <CheckCircle2 className="h-3 w-3 text-success" />}
                  Foi atendido
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground"
                  disabled={ocupado === a.id}
                  onClick={() => naoAconteceu(a)}
                >
                  <XCircle className="h-3 w-3" />
                  Não foi
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        "Foi atendido" finaliza e gera a cobrança. "Não foi" cancela, sem cobrar
        nada.
      </p>
    </div>
  );
}
