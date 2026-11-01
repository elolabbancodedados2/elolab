import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

const CORRECOES: Record<string, { de: string; para: string; explicacao: string }> = {
  faltou: {
    de: 'Faltou',
    para: 'Agendado',
    explicacao: 'A consulta volta para a agenda como agendada. Use quando a falta foi marcada por engano.',
  },
  em_atendimento: {
    de: 'Em atendimento',
    para: 'Aguardando na fila',
    explicacao: 'O paciente volta para a fila. Use quando o atendimento foi iniciado no paciente errado. Não vale se já houver evolução registrada.',
  },
};

/** Correção de status com motivo: desfazer falta ou início por engano. */
export default function CorrigirStatusAgendamentoPage() {
  const { agendamentoId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const [motivo, setMotivo] = useState('');
  const concluido = useRef(false);
  const returnTo = typeof (location.state as { returnTo?: unknown } | null)?.returnTo === 'string'
    ? (location.state as { returnTo: string }).returnTo
    : '/agenda';

  const agendamentoQuery = useQuery({
    queryKey: ['corrigir-status-agendamento', profile?.clinica_id, agendamentoId],
    enabled: Boolean(profile?.clinica_id && agendamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agendamentos')
        .select('id, status, data, hora_inicio, updated_at, pacientes(nome, nome_social)')
        .eq('id', agendamentoId).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const corrigir = useMutation({
    mutationFn: async () => {
      const ag = agendamentoQuery.data;
      const { data, error } = await (supabase as any).rpc('corrigir_status_agendamento', {
        p_agendamento_id: agendamentoId, p_motivo: motivo.trim(), p_updated_at: ag?.updated_at ?? null,
      });
      if (error) throw error;
      if (!data?.corrigido) throw new Error('A consulta foi alterada por outra pessoa. Atualize e tente de novo.');
      return data as { status: string };
    },
    onSuccess: async () => {
      concluido.current = true;
      toast.success('Status corrigido', { description: 'A correção e o motivo ficam no histórico da consulta.' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] }),
      ]);
      navigate(returnTo, { replace: true });
    },
    onError: (erro) => toast.error('Não foi possível corrigir', { description: mensagemDeErro(erro) }),
  });

  const ag = agendamentoQuery.data;
  const correcao = ag ? CORRECOES[ag.status] : undefined;
  const nome = ag?.pacientes?.nome_social || ag?.pacientes?.nome || 'Paciente';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-24 sm:pb-8">
      <UnsavedChangesGuard dirty={motivo.trim().length > 0} busy={corrigir.isPending} completed={concluido} />
      <PageHeader
        title="Corrigir status da consulta"
        description="Desfaz uma falta ou um início de atendimento marcados por engano, com motivo registrado."
        icon={<History />}
        actions={<Button variant="outline" onClick={() => navigate(returnTo)} disabled={corrigir.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>}
      />
      {agendamentoQuery.isLoading ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-xl border border-border bg-card" />
      ) : agendamentoQuery.isError ? (
        <ErrorState title="Não foi possível carregar a consulta" error={agendamentoQuery.error} onRetry={() => void agendamentoQuery.refetch()} />
      ) : !ag ? (
        <Card role="status"><CardContent className="p-6 text-sm text-muted-foreground">Consulta não encontrada nesta clínica.</CardContent></Card>
      ) : !correcao ? (
        <Card role="status"><CardContent className="p-6 text-sm text-muted-foreground">Só dá para corrigir consultas marcadas como falta ou iniciadas por engano. Esta está com outro status.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">{nome} · {String(ag.data).split('-').reverse().join('/')} às {String(ag.hora_inicio).slice(0, 5)}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm"><span className="font-medium">{correcao.de}</span> → <span className="font-medium">{correcao.para}</span></p>
            <p className="text-sm text-muted-foreground">{correcao.explicacao}</p>
            <div className="space-y-2">
              <Label htmlFor="corrigir-status-motivo">Motivo da correção *</Label>
              <Textarea id="corrigir-status-motivo" rows={3} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={corrigir.isPending}
                placeholder="Ex.: paciente chegou com atraso e a falta foi marcada antes" />
              <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => navigate(returnTo)} disabled={corrigir.isPending}>Cancelar</Button>
              <Button onClick={() => corrigir.mutate()} disabled={motivo.trim().length < 10 || corrigir.isPending} className="gap-2">
                {corrigir.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Corrigir status
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
