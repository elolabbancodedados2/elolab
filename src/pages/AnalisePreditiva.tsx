import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MAX_LINHAS_AUTO } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertCircle, AlertTriangle, ActivitySquare, CalendarDays, CheckCircle2, Gauge, Loader2, Mail,
  MessageCircle, Phone, RefreshCw, Siren, TrendingUp, Users, X, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { ptBR } from 'date-fns/locale';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { FieldHelp } from '@/components/ContextualHelp';
import { PageHeader } from '@/components/PageHeader';
import { useNavigate } from 'react-router-dom';
import { linkWhatsApp } from '@/lib/whatsapp';
import {
  classificarRiscoFalta, correspondeFiltroRiscoFalta, formatarDataHoraRiscoFalta, formatarIndiceRisco,
  type FaixaRiscoFalta,
} from '@/lib/riscoFaltas';

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

const FAIXA_LABEL: Record<FaixaRiscoFalta, string> = {
  alto: 'Alto risco',
  medio: 'Risco médio',
  baixo: 'Baixo risco',
};

const FAIXA_BADGE: Record<FaixaRiscoFalta, string> = {
  alto: 'border-destructive/30 bg-destructive/10 text-destructive',
  medio: 'border-warning/30 bg-warning/10 text-warning-foreground',
  baixo: 'border-success/30 bg-success/10 text-success',
};

const FAIXA_BARRA: Record<FaixaRiscoFalta, string> = {
  alto: 'bg-destructive',
  medio: 'bg-warning',
  baixo: 'bg-success',
};

const FILTROS_RISCO = [
  { key: 'todos', label: 'Todos os níveis' },
  { key: 'alto', label: 'Alto risco' },
  { key: 'medio', label: 'Risco médio' },
  { key: 'baixo', label: 'Baixo risco' },
] as const;

function formatarDataConsulta(pred: PredictedNoShow, padrao: string): string {
  const data = parseDateOnly(pred.data_agendamento);
  const dia = data ? format(data, padrao, { locale: ptBR }) : '—';
  const hora = pred.hora_inicio?.slice(0, 5);
  return hora ? `${dia} às ${hora}` : dia;
}

function mensagemWhatsApp(pred: PredictedNoShow): string {
  const primeiroNome = pred.paciente_nome.split(' ')[0];
  return `Olá, ${primeiroNome}! Passando para confirmar sua consulta em ${formatarDataConsulta(pred, 'dd/MM')} com ${pred.medico_nome}. Podemos contar com você?`;
}

function BarraRisco({ probabilidade, className }: { probabilidade: number; className?: string }) {
  const indice = formatarIndiceRisco(probabilidade);
  const faixa = classificarRiscoFalta(probabilidade);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn('h-full rounded-full', FAIXA_BARRA[faixa])} style={{ width: `${indice}%` }} />
      </div>
      <span className="text-sm font-bold tabular-nums text-foreground">{indice}%</span>
    </div>
  );
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

  const { data: predicoes = [], isLoading, isFetching, isError, error, refetch } = useQuery({
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

  const stats = {
    total: predicoes.length,
    altoRisco: predicoes.filter((p) => p.probabilidade_no_show >= 0.7).length,
    medioRisco: predicoes.filter((p) => p.probabilidade_no_show >= 0.4 && p.probabilidade_no_show < 0.7).length,
    baixoRisco: predicoes.filter((p) => p.probabilidade_no_show < 0.4).length,
    indiceMedio: predicoes.length > 0
      ? formatarIndiceRisco(predicoes.reduce((sum, p) => sum + p.probabilidade_no_show, 0) / predicoes.length)
      : 0,
  };

  // A lista já vem ordenada por probabilidade decrescente: o primeiro é o maior risco.
  const maiorRisco = useMemo(() => predicoes[0] ?? null, [predicoes]);
  const temFiltro = filtroRisco !== 'todos';

  const descricaoHeader = stats.total > 0
    ? `${stats.total} consulta${stats.total === 1 ? '' : 's'} a partir de hoje · ${stats.altoRisco} em alto risco${stats.medioRisco > 0 ? ` · ${stats.medioRisco} em risco médio` : ''}`
    : 'Priorize confirmações pelos agendamentos com maior chance de falta';

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
      <PageHeader
        title="Risco de faltas"
        description={(
          <>
            <span className="block">{descricaoHeader}</span>
            <span className="mt-1 block text-xs text-muted-foreground/90">
              Índice heurístico baseado no histórico para ajudar a equipe a priorizar confirmações; não é uma previsão estatística confirmada. Revise cada caso antes de entrar em contato.
            </span>
            <span className={cn('mt-1 block text-xs', temPrevisaoAntiga ? 'text-warning' : 'text-muted-foreground')} role={temPrevisaoAntiga ? 'alert' : 'status'}>
              {ultimaAtualizacao
                ? `Último cálculo: ${formatarDataHoraRiscoFalta(ultimaAtualizacao)}.`
                : 'Ainda não há previsões calculadas.'}
              {temPrevisaoAntiga ? ' Algumas previsões têm mais de 2 horas; confira os dados antes de agir.' : ''}
            </span>
          </>
        )}
        icon={<ActivitySquare />}
        actions={(
          <>
            <Button variant="outline" className="shrink-0 gap-2 rounded-full" onClick={() => navigate('/agenda')}>
              <CalendarDays className="h-4 w-4" />
              Ver agenda
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Atualizar previsões de faltas"
              title="Atualizar previsões"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </>
        )}
      />

      {atingiuLimite && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground" role="alert">
          A lista atingiu o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} previsões carregadas. A lista e os indicadores podem estar incompletos.
        </div>
      )}

      {/* Indicadores */}
      <section role="group" aria-label="Resumo do risco de faltas" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {([
          { key: 'alto', icon: Siren, label: 'Alto risco', value: stats.altoRisco, caption: 'confirmar primeiro', color: 'text-white', surface: 'bg-white/15', escuro: true, filtro: 'alto' as const },
          { key: 'medio', icon: AlertTriangle, label: 'Risco médio', value: stats.medioRisco, caption: 'vale um lembrete', color: 'text-warning', surface: 'bg-warning/10', escuro: false, filtro: 'medio' as const },
          { key: 'baixo', icon: CheckCircle2, label: 'Baixo risco', value: stats.baixoRisco, caption: 'tendem a comparecer', color: 'text-success', surface: 'bg-success/10', escuro: false, filtro: 'baixo' as const },
          { key: 'todos', icon: Users, label: 'Total', value: stats.total, caption: 'consultas com previsão', color: 'text-primary', surface: 'bg-primary/10', escuro: false, filtro: 'todos' as const },
          { key: 'indice', icon: Gauge, label: 'Índice médio', value: `${stats.indiceMedio}%`, caption: 'chance média de falta', color: 'text-foreground', surface: 'bg-muted', escuro: false, filtro: null },
        ]).map(s => {
          const Icon = s.icon;
          const ativo = s.filtro !== null && filtroRisco === s.filtro;
          const conteudo = (
            <div className="flex min-h-[96px] items-center gap-3 p-3">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}>
                <Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                  <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                </div>
                <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
              </div>
            </div>
          );
          const classes = cn(
            'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200',
            s.escuro && 'border-transparent bg-gradient-primary text-white',
          );
          if (s.filtro === null) {
            return <div key={s.key} className={classes}>{conteudo}</div>;
          }
          const filtro = s.filtro;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltroRisco(ativo && filtro !== 'todos' ? 'todos' : filtro)}
              className={cn(
                classes,
                'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                ativo && !s.escuro && 'border-primary/50 ring-1 ring-primary/30',
                ativo && s.escuro && 'ring-2 ring-primary/60',
              )}
            >
              {conteudo}
            </button>
          );
        })}
      </section>

      {/* Maior risco agora */}
      {maiorRisco && (() => {
        const faixa = classificarRiscoFalta(maiorRisco.probabilidade_no_show);
        const whatsapp = linkWhatsApp(maiorRisco.telefone, mensagemWhatsApp(maiorRisco));
        const semContato = !maiorRisco.telefone && !maiorRisco.email;
        const enviando = enviandoLembreteId === maiorRisco.agendamento_id;
        return (
          <Card className="overflow-hidden rounded-2xl border-primary/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                  <Siren className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Maior risco agora</p>
                  <h2 className="truncate text-lg font-bold text-foreground">{maiorRisco.paciente_nome}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatarDataConsulta(maiorRisco, 'dd/MM/yyyy')}</span>
                    <span>{maiorRisco.medico_nome}</span>
                    <Badge variant="outline" className={cn('rounded-full text-[10px]', FAIXA_BADGE[faixa])}>{FAIXA_LABEL[faixa]}</Badge>
                    <BarraRisco probabilidade={maiorRisco.probabilidade_no_show} />
                  </div>
                  {maiorRisco.motivos_risco.length > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={maiorRisco.motivos_risco.join(' · ')}>
                      {maiorRisco.motivos_risco.join(' · ')}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-xs font-medium text-primary" title={maiorRisco.recomendacoes}>
                    Recomendação: {maiorRisco.recomendacoes}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {whatsapp ? (
                  <Button asChild variant="outline" className="h-10 gap-1.5 rounded-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp</a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{semContato ? 'Sem contato cadastrado' : 'Sem telefone válido'}</span>
                )}
                <Button
                  className="h-10 gap-1.5 rounded-full bg-gradient-primary text-white hover:brightness-110"
                  onClick={() => void enviarLembrete(maiorRisco)}
                  disabled={enviandoLembreteId !== null || semContato}
                  title={semContato ? 'Cadastre telefone ou e-mail para enviar' : 'Enfileira um lembrete automático para o paciente.'}
                >
                  {enviando ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Zap aria-hidden="true" className="h-4 w-4" />}
                  {enviando ? 'Enfileirando…' : 'Enviar lembrete'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Lista */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-1 text-base">Agendamentos por risco<FieldHelp term="risco_falta" /></CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{predicoesFiltradas.length} de {predicoes.length}</span>
                <Select value={filtroRisco} onValueChange={setFiltroRisco}>
                  <SelectTrigger aria-label="Filtrar agendamentos por nível de risco de falta" className="h-10 w-full rounded-full border-[#DCE6F2] bg-white text-foreground sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTROS_RISCO.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div role="group" aria-label="Filtro rápido por nível de risco" className="flex flex-wrap items-center gap-1.5">
              {FILTROS_RISCO.map(opt => {
                const ativo = filtroRisco === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltroRisco(opt.key)}
                    className={cn(
                      'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {temFiltro && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={() => setFiltroRisco('todos')}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : predicoesFiltradas.length === 0 ? (
            <ActionableEmptyState
              icon={ActivitySquare}
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
            <div className="overflow-hidden rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F3F8FC] hover:bg-[#F3F8FC]">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead className="hidden md:table-cell">Consulta</TableHead>
                    <TableHead className="hidden lg:table-cell">Médico</TableHead>
                    <TableHead>Risco</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {predicoesFiltradas.map((pred, index) => {
                    const faixa = classificarRiscoFalta(pred.probabilidade_no_show);
                    const whatsapp = linkWhatsApp(pred.telefone, mensagemWhatsApp(pred));
                    const semContato = !pred.telefone && !pred.email;
                    const enviando = enviandoLembreteId === pred.agendamento_id;
                    const eMaiorRisco = maiorRisco?.agendamento_id === pred.agendamento_id;
                    return (
                      <TableRow key={pred.agendamento_id} className={cn(faixa === 'alto' && 'bg-destructive/[0.03]')}>
                        <TableCell>
                          <span className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                            eMaiorRisco ? 'bg-gradient-primary text-white' : 'bg-muted text-muted-foreground',
                          )}>
                            {index + 1}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-foreground">{pred.paciente_nome}</p>
                            {eMaiorRisco && <Badge className="rounded-full border-transparent bg-gradient-primary text-[9px] text-white hover:bg-gradient-primary">Maior risco</Badge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">{formatarDataConsulta(pred, 'dd/MM')} · {pred.medico_nome}</p>
                          {pred.motivos_risco.length > 0 && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground" title={pred.motivos_risco.join(' · ')}>
                              <AlertCircle aria-hidden="true" className="h-3 w-3 shrink-0" />
                              <span className="truncate">{pred.motivos_risco.join(' · ')}</span>
                            </p>
                          )}
                          <p className="mt-0.5 truncate text-xs text-primary" title={pred.recomendacoes}>{pred.recomendacoes}</p>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">{formatarDataConsulta(pred, 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="hidden max-w-[180px] truncate text-sm lg:table-cell">{pred.medico_nome}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <BarraRisco probabilidade={pred.probabilidade_no_show} />
                            <Badge variant="outline" className={cn('w-fit rounded-full text-[10px]', FAIXA_BADGE[faixa])}>{FAIXA_LABEL[faixa]}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {whatsapp && (
                              <Button aria-label={`Chamar ${pred.paciente_nome} no WhatsApp`} asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full text-primary hover:bg-primary/10 hover:text-primary">
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${pred.paciente_nome} no WhatsApp`} title="Chamar no WhatsApp">
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {pred.telefone && (
                              <Button aria-label={`Ligar para ${pred.paciente_nome}`} asChild variant="outline" size="icon" className="h-9 w-9 rounded-full">
                                <a href={`tel:${pred.telefone.replace(/[^0-9+]/g, '')}`} aria-label={`Ligar para ${pred.paciente_nome}`} title="Ligar">
                                  <Phone className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {pred.email && (
                              <Button aria-label={`Enviar e-mail para ${pred.paciente_nome}`} asChild variant="outline" size="icon" className="hidden h-9 w-9 rounded-full sm:inline-flex">
                                <a href={`mailto:${pred.email}`} aria-label={`Enviar e-mail para ${pred.paciente_nome}`} title="Enviar e-mail">
                                  <Mail className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className={cn(
                                'h-9 gap-1 rounded-full text-xs',
                                semContato ? 'bg-muted text-muted-foreground' : 'bg-gradient-primary text-white hover:brightness-110',
                              )}
                              disabled={enviandoLembreteId !== null || semContato}
                              title={semContato ? 'Cadastre um telefone ou e-mail no perfil do paciente para enviar o lembrete.' : 'Enfileira um lembrete automático para o paciente.'}
                              onClick={() => void enviarLembrete(pred)}
                            >
                              {enviando
                                ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                                : <Zap aria-hidden="true" className="h-3.5 w-3.5" />}
                              {semContato ? 'Sem contato' : enviando ? 'Enfileirando…' : 'Enviar lembrete'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Como funciona */}
      <Card className="rounded-2xl border-[#DCE6F2] bg-[#F3F8FC] shadow-none">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="text-sm text-foreground">
              <p className="mb-1 font-semibold">Como funciona o índice?</p>
              <ul className="space-y-1 text-xs text-foreground/75">
                <li>Histórico real de faltas e cancelamentos do paciente</li>
                <li>Confirmação pendente e antecedência do agendamento</li>
                <li>Dia da semana e horário da consulta</li>
                <li>Recalculado automaticamente a cada hora</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
