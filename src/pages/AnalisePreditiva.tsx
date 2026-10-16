import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MAX_LINHAS_AUTO } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, TrendingUp, Zap, Phone, Mail, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { ptBR } from 'date-fns/locale';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { useNavigate } from 'react-router-dom';
import { classificarRiscoFalta, correspondeFiltroRiscoFalta, formatarDataHoraRiscoFalta, formatarIndiceRisco } from '@/lib/riscoFaltas';

const TAMANHO_PAGINA_PREDICOES = 500;

interface PredictedNoShow {
  agendamento_id: string;
  paciente_id: string;
  paciente_nome: string;
  data_agendamento: string;
  hora_inicio?: string;
  medico_nome: string;
  probabilidade_no_show: number;
  motivos_risco: string[];
  recomendacoes: string;
  updated_at?: string;
  telefone?: string;
  email?: string;
}

export default function AnalisePreditiva() {
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const [filtroRisco, setFiltroRisco] = useState('todos');
  const [enviandoLembreteId, setEnviandoLembreteId] = useState<string | null>(null);
  const [dataReferencia, setDataReferencia] = useState(() => todaySaoPauloDateOnly());
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const instante = new Date();
      setAgora(instante);
      setDataReferencia(todaySaoPauloDateOnly(instante));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: predicoes = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['predicoes_no_show', profile?.clinica_id, dataReferencia],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];

      let rows: any[] = [];
      while (rows.length < MAX_LINHAS_AUTO) {
        const from = rows.length;
        const to = Math.min(from + TAMANHO_PAGINA_PREDICOES, MAX_LINHAS_AUTO) - 1;
        const { data, error } = await (supabase as any).from('predicoes_no_show').select(`
          agendamento_id,paciente_id,probabilidade_no_show,motivos_risco,recomendacoes,updated_at,
          agendamentos!inner(data,hora_inicio,status,pacientes(nome,email,telefone),medicos(nome))
        `).eq('clinica_id', profile.clinica_id)
          .gte('agendamentos.data', dataReferencia)
          .in('agendamentos.status', ['agendado', 'confirmado'])
          .order('probabilidade_no_show', { ascending: false })
          .order('agendamento_id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        const page = (data || []) as any[];
        rows = rows.concat(page);
        if (page.length < to - from + 1) break;
      }
      if (rows.length >= MAX_LINHAS_AUTO) {
        console.warn(`[predicoes_no_show] atingiu o limite de ${MAX_LINHAS_AUTO} resultados carregados.`);
      }

      const predictions: PredictedNoShow[] = rows.map((row: any) => ({
        agendamento_id: row.agendamento_id,
        paciente_id: row.paciente_id,
        paciente_nome: row.agendamentos?.pacientes?.nome || 'Paciente',
        data_agendamento: row.agendamentos?.data,
        hora_inicio: row.agendamentos?.hora_inicio,
        medico_nome: row.agendamentos?.medicos?.nome || 'Médico',
        probabilidade_no_show: Number(row.probabilidade_no_show || 0),
        motivos_risco: row.motivos_risco || [],
        updated_at: row.updated_at,
        recomendacoes: row.recomendacoes || 'Lembrete padrão',
        telefone: row.agendamentos?.pacientes?.telefone,
        email: row.agendamentos?.pacientes?.email,
      }));

      return predictions.sort((a, b) => b.probabilidade_no_show - a.probabilidade_no_show);
    },
    enabled: !!profile?.clinica_id,
  });

  const predicoesFiltradas = predicoes.filter(predicao =>
    correspondeFiltroRiscoFalta(predicao.probabilidade_no_show, filtroRisco),
  );
  const atualizacoesValidas = predicoes
    .map(predicao => predicao.updated_at ? Date.parse(predicao.updated_at) : Number.NaN)
    .filter(Number.isFinite);
  const ultimaAtualizacao = atualizacoesValidas.length > 0 ? Math.max(...atualizacoesValidas) : null;
  const temPrevisaoAntiga = atualizacoesValidas.some(timestamp => agora.getTime() - timestamp > 2 * 60 * 60 * 1000);
  const atingiuLimite = predicoes.length >= MAX_LINHAS_AUTO;

  const getRiskColor = (probabilidade: number): string => {
    const faixa = classificarRiscoFalta(probabilidade);
    return faixa === 'alto' ? 'text-destructive' : faixa === 'medio' ? 'text-warning' : 'text-success';
  };

  const enviarLembrete = async (predicao: PredictedNoShow) => {
    if (!predicao.telefone && !predicao.email) {
      toast.warning('Não há contato cadastrado para este paciente', {
        description: 'Atualize o telefone ou e-mail no cadastro antes de enviar o lembrete.',
      });
      return;
    }

    setEnviandoLembreteId(predicao.agendamento_id);
    try {
      const { data, error } = await supabase.rpc('enfileirar_lembrete_risco' as any, {
        p_agendamento_id: predicao.agendamento_id,
      });
      if (error) throw error;
      toast.success(data ? 'Lembrete enfileirado' : 'Já existe um lembrete na fila ou enviado nas últimas 20 horas');
    } catch (error) {
      const mensagem = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : error instanceof Error ? error.message : 'Verifique a conexão e tente novamente.';
      toast.error('Não foi possível enfileirar o lembrete', {
        description: mensagem,
      });
    } finally {
      setEnviandoLembreteId(null);
    }
  };

  const getRiskBgColor = (probabilidade: number): string => {
    const faixa = classificarRiscoFalta(probabilidade);
    return faixa === 'alto' ? 'bg-destructive/10' : faixa === 'medio' ? 'bg-warning/10' : 'bg-success/10';
  };

  const getRiskLabel = (probabilidade: number): string => {
    const faixa = classificarRiscoFalta(probabilidade);
    return faixa === 'alto' ? 'ALTO RISCO' : faixa === 'medio' ? 'RISCO MÉDIO' : 'BAIXO RISCO';
  };

  const stats = {
    total: predicoes.length,
    altoRisco: predicoes.filter((p) => p.probabilidade_no_show >= 0.7).length,
    medioRisco: predicoes.filter((p) => p.probabilidade_no_show >= 0.4 && p.probabilidade_no_show < 0.7).length,
    baixoRisco: predicoes.filter((p) => p.probabilidade_no_show < 0.4).length,
    indiceMedio: predicoes.length > 0
      ? formatarIndiceRisco(predicoes.reduce((sum, p) => sum + p.probabilidade_no_show, 0) / predicoes.length)
      : 0,
  };

  if (isError) {
    return <ErrorState
      title="Não foi possível carregar as previsões de faltas"
      description="Os indicadores só aparecem depois de confirmar os dados atuais."
      error={error}
      onRetry={() => void refetch()}
    />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#111111]">Risco de faltas</h1>
        <p className="text-[#111111]/65">
          Índice heurístico baseado no histórico para ajudar a equipe a priorizar confirmações; não é uma previsão estatística confirmada. Revise cada caso antes de entrar em contato.
        </p>
        <p className={cn('mt-2 text-xs', temPrevisaoAntiga ? 'text-warning' : 'text-muted-foreground')} role={temPrevisaoAntiga ? 'alert' : 'status'}>
          {ultimaAtualizacao
            ? `Último cálculo: ${formatarDataHoraRiscoFalta(ultimaAtualizacao)}.`
            : 'Ainda não há previsões calculadas.'}
          {temPrevisaoAntiga ? ' Algumas previsões têm mais de 2 horas; confira os dados antes de agir.' : ''}
        </p>
      </div>

      {atingiuLimite && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground" role="alert">
          A lista atingiu o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} previsões carregadas. A lista e os indicadores podem estar incompletos.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Total</p>
            <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-destructive font-semibold uppercase">Alto Risco</p>
            <p className="text-2xl font-bold tabular-nums text-destructive">{stats.altoRisco}</p>
          </CardContent>
        </Card>
        <Card className="border-warning/20 bg-warning/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-warning font-semibold uppercase">Médio Risco</p>
            <p className="text-2xl font-bold tabular-nums text-warning">{stats.medioRisco}</p>
          </CardContent>
        </Card>
        <Card className="border-success/20 bg-success/5">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-success font-semibold uppercase">Baixo Risco</p>
            <p className="text-2xl font-bold tabular-nums text-success">{stats.baixoRisco}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Índice médio de risco</p>
            <p className="text-2xl font-bold tabular-nums">{stats.indiceMedio}/100</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Agendamentos por Risco</CardTitle>
            <Select value={filtroRisco} onValueChange={setFiltroRisco}>
              <SelectTrigger aria-label="Filtrar agendamentos por nível de risco de falta" className="w-full border-[#DCE6F2] bg-white text-[#111111] sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="alto">Alto Risco</SelectItem>
                <SelectItem value="medio">Médio Risco</SelectItem>
                <SelectItem value="baixo">Baixo Risco</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : predicoesFiltradas.length === 0 ? (
            <ActionableEmptyState
              title={predicoes.length === 0 ? 'Nenhuma previsão disponível para hoje' : 'Nenhum agendamento nesta faixa de risco'}
              description={predicoes.length === 0
                ? 'As previsões aparecem para agendamentos futuros confirmados quando há dados calculados. Você pode consultar a agenda enquanto isso.'
                : 'Há agendamentos em outras faixas. Mostre todos os níveis para voltar à lista completa.'}
              actionLabel={predicoes.length === 0 ? 'Abrir agenda' : undefined}
              onAction={predicoes.length === 0 ? () => navigate('/agenda') : undefined}
              secondaryLabel={predicoes.length > 0 ? 'Mostrar todos os riscos' : undefined}
              onSecondaryAction={predicoes.length > 0 ? () => setFiltroRisco('todos') : undefined}
            />
          ) : (
            <div className="space-y-3">
              {predicoesFiltradas.map((pred) => (
                <div
                  key={pred.agendamento_id}
                  className={cn(
                    'p-4 rounded-lg border transition-all',
                    getRiskBgColor(pred.probabilidade_no_show)
                  )}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{pred.paciente_nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseDateOnly(pred.data_agendamento)!, 'dd/MM/yyyy', {
                          locale: ptBR,
                        })} às {pred.hora_inicio?.slice(0, 5)}{' '}
                        — {pred.medico_nome}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={cn('text-lg font-bold', getRiskColor(pred.probabilidade_no_show))}>
                        {formatarIndiceRisco(pred.probabilidade_no_show)}/100
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{getRiskLabel(pred.probabilidade_no_show)}</p>
                    </div>
                  </div>

                  {/* Risk factors */}
                  <div className="space-y-2 mb-3">
                    {pred.motivos_risco.map((motivo, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {motivo}
                      </p>
                    ))}
                  </div>

                  {/* Recommendations */}
                  <div className="p-2.5 rounded bg-background/50 border text-xs mb-3">
                    <p className="font-semibold text-primary mb-1">💡 Recomendações:</p>
                    <p className="text-muted-foreground">{pred.recomendacoes}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {pred.telefone && (
                      <Button size="sm" variant="outline" className="min-h-11 gap-1 text-xs sm:h-9 sm:min-h-0" asChild>
                        <a href={`tel:${pred.telefone.replace(/[^0-9+]/g, '')}`}><Phone className="h-3 w-3" />Ligar</a>
                      </Button>
                    )}
                    {pred.email && (
                      <Button size="sm" variant="outline" className="min-h-11 gap-1 text-xs sm:h-9 sm:min-h-0" asChild>
                        <a href={`mailto:${pred.email}`}><Mail className="h-3 w-3" />Email</a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-11 gap-1 text-xs sm:h-9 sm:min-h-0"
                      disabled={enviandoLembreteId !== null || (!pred.telefone && !pred.email)}
                      title={!pred.telefone && !pred.email ? 'Cadastre telefone ou e-mail para enviar' : undefined}
                      onClick={() => void enviarLembrete(pred)}
                    >
                      {enviandoLembreteId === pred.agendamento_id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Zap className="h-3 w-3" />}
                      {!pred.telefone && !pred.email
                        ? 'Sem contato'
                        : enviandoLembreteId === pred.agendamento_id
                          ? 'Enfileirando…'
                          : 'Enviar Lembrete'}
                    </Button>
                  </div>
                  {!pred.telefone && !pred.email && (
                    <p role="status" className="mt-2 text-xs text-muted-foreground">
                      Cadastre um telefone ou e-mail no perfil do paciente para enviar o lembrete.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="border-[#DCE6F2] bg-[#EEF4FA]">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <TrendingUp className="h-5 w-5 text-[#1080CA] shrink-0 mt-0.5" />
            <div className="text-sm text-[#111111]">
              <p className="font-semibold mb-1">Como funciona o índice?</p>
              <ul className="text-xs space-y-1">
                <li>✓ Histórico real de faltas e cancelamentos do paciente</li>
                <li>✓ Confirmação pendente e antecedência do agendamento</li>
                <li>✓ Dia da semana e horário da consulta</li>
                <li>✓ Recalculado automaticamente a cada hora</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
