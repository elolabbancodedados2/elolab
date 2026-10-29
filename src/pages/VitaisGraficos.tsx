import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { ErrorState } from '@/components/ErrorState';
import { usePacienteResumo, type PacienteResumo } from '@/hooks/useBuscaPacientes';
import { cn } from '@/lib/utils';
import { autorizarLeituraHistoricoPaciente } from '@/lib/prontuarioAudit';
import {
  consolidarHistoricoVitais,
  historicoVitaisLimitado,
  type ProntuarioVitalsRow,
  type TriagemVitalsRow,
  type VitalSignData,
} from '@/lib/vitalsHistory';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, Heart, Droplets, Thermometer, Weight, AlertCircle, X, Activity, Wind,
  Users, FileText, RefreshCw, Search, CalendarRange,
} from 'lucide-react';

const MAX_REGISTROS_GRAFICO = 1000;
const FUSO_CLINICA = 'America/Sao_Paulo';

const formatarDataClinica = (valor: string, incluirHora = false) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_CLINICA,
    day: '2-digit',
    month: '2-digit',
    ...(incluirHora ? { year: 'numeric' as const, hour: '2-digit' as const, minute: '2-digit' as const } : { year: '2-digit' as const }),
  }).format(new Date(valor));

// As séries usam tons da marca; o traço também diferencia a segunda série.
const COR_SERIE_PRIMARIA = 'hsl(var(--primary))';
const COR_SERIE_SECUNDARIA = 'hsl(var(--brand-dark))';
const COR_GRADE = 'hsl(var(--border))';
const COR_EIXO = 'hsl(var(--muted-foreground))';
const ESTILO_TOOLTIP = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.75rem',
  boxShadow: 'var(--shadow-md)',
  fontSize: '0.75rem',
} as const;
const ESTILO_ROTULO_TOOLTIP = { color: 'hsl(var(--foreground))', fontWeight: 600 } as const;

type PeriodoChave = '7' | '30' | '90' | 'tudo';
const PERIODOS: { key: PeriodoChave; label: string; dias: number | null }[] = [
  { key: '7', label: '7 dias', dias: 7 },
  { key: '30', label: '30 dias', dias: 30 },
  { key: '90', label: '90 dias', dias: 90 },
  { key: 'tudo', label: 'Tudo', dias: null },
];

type CampoVital = Exclude<keyof VitalSignData, 'id' | 'paciente_id' | 'created_at'>;

// Limites de alerta já existentes no projeto (src/components/clinical/ClinicalSafetyPanel.tsx),
// replicados sem alteração. Sinais sem limite definido no projeto ficam neutros.
const foraDaFaixa = (campo: CampoVital, valor: number | null): boolean => {
  if (valor === null || !Number.isFinite(valor)) return false;
  switch (campo) {
    case 'pressao_sistolica': return valor >= 180 || valor < 90;
    case 'pressao_diastolica': return valor >= 120 || valor < 60;
    case 'frequencia_cardiaca': return valor > 120 || valor < 50;
    case 'temperatura': return valor >= 38 || valor < 35;
    case 'oxigenacao': return valor < 94;
    default: return false;
  }
};

type GraficoChave = 'pressao' | 'fc' | 'peso' | 'o2';

export default function VitaisGraficos() {
  const { profile } = useSupabaseAuth();
  const [selectedPacienteId, setSelectedPacienteId] = useState<string>('');
  const [pacienteSelecionado, setPacienteSelecionado] = useState<PacienteResumo | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoChave>('tudo');
  const [graficoFoco, setGraficoFoco] = useState<GraficoChave | null>(null);
  const pacienteResumoQuery = usePacienteResumo(selectedPacienteId || null);
  const paciente = pacienteResumoQuery.data ?? pacienteSelecionado;
  const nomePaciente = paciente ? (paciente.nome_social || paciente.nome) : null;

  const vitaisQuery = useQuery({
    queryKey: [
      'vitais_historico',
      profile?.clinica_id ?? null,
      profile?.id,
      profile?.roles?.slice().sort().join(',') ?? profile?.role ?? null,
      selectedPacienteId,
    ],
    queryFn: async () => {
      if (!selectedPacienteId) return { registros: [], historicoLimitado: false };
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      const { data: triagensData, error: triagensError, count: triagensCount } = await supabase
        .from('triagens')
        .select(
          'id, paciente_id, agendamento_id, pressao_arterial, frequencia_cardiaca, frequencia_respiratoria, temperatura, peso, altura, imc, saturacao, glicemia, dor_escala, data_hora, created_at',
          { count: 'exact' },
        )
        .eq('paciente_id', selectedPacienteId)
        .eq('clinica_id', profile.clinica_id)
        .order('created_at', { ascending: false })
        .limit(MAX_REGISTROS_GRAFICO);

      if (triagensError) throw triagensError;

      // Prontuários assinados exigem autorização auditada antes da leitura.
      // Enfermagem continua restrita às triagens permitidas pela política RLS.
      const podeLerProntuarios = profile.roles?.some((role) => role === 'admin' || role === 'medico')
        || profile.role === 'admin' || profile.role === 'medico';
      let prontuarios: ProntuarioVitalsRow[] = [];
      let prontuariosCount = 0;
      if (podeLerProntuarios) {
        await autorizarLeituraHistoricoPaciente(selectedPacienteId);
        const { data, error, count } = await supabase
          .from('prontuarios')
          .select('id, paciente_id, agendamento_id, data, created_at, sinais_vitais', { count: 'exact' })
          .eq('paciente_id', selectedPacienteId)
          .eq('clinica_id', profile.clinica_id)
          .order('created_at', { ascending: false })
          .limit(MAX_REGISTROS_GRAFICO);
        if (error) throw error;
        prontuarios = (data || []) as ProntuarioVitalsRow[];
        prontuariosCount = count ?? prontuarios.length;
      }

      const linhasTriagem = (triagensData || []) as TriagemVitalsRow[];
      const registrosCompletos = consolidarHistoricoVitais(linhasTriagem, prontuarios);
      return {
        registros: registrosCompletos.slice(-MAX_REGISTROS_GRAFICO),
        historicoLimitado: historicoVitaisLimitado(
          triagensCount ?? linhasTriagem.length,
          prontuariosCount,
          registrosCompletos.length,
          MAX_REGISTROS_GRAFICO,
        ),
      };
    },
    enabled: !!profile?.clinica_id && !!selectedPacienteId,
  });
  const registrosCarregados = vitaisQuery.data?.registros;
  const vitaisTotais = useMemo(() => registrosCarregados ?? [], [registrosCarregados]);
  const historicoLimitado = vitaisQuery.data?.historicoLimitado ?? false;

  // Filtro por período (sobre o histórico já carregado; não altera a consulta).
  const contagemPorPeriodo = useMemo(() => {
    const agora = Date.now();
    return Object.fromEntries(PERIODOS.map((p) => [
      p.key,
      p.dias === null
        ? vitaisTotais.length
        : vitaisTotais.filter((v) => agora - Date.parse(v.created_at) <= p.dias! * 86_400_000).length,
    ])) as Record<PeriodoChave, number>;
  }, [vitaisTotais]);
  const vitais = useMemo(() => {
    const dias = PERIODOS.find((p) => p.key === periodo)?.dias ?? null;
    if (dias === null) return vitaisTotais;
    const limite = Date.now() - dias * 86_400_000;
    return vitaisTotais.filter((v) => Date.parse(v.created_at) >= limite);
  }, [vitaisTotais, periodo]);

  // Format data for charts
  const chartData = vitais.filter(v => v.created_at && !Number.isNaN(new Date(v.created_at).getTime())).map((v) => ({
    data: formatarDataClinica(v.created_at),
    dataCompleta: v.created_at,
    pressaoSistolica: v.pressao_sistolica,
    pressaoDiastolica: v.pressao_diastolica,
    frequenciaCardiaca: v.frequencia_cardiaca,
    temperatura: v.temperatura,
    peso: v.peso,
    oxigenacao: v.oxigenacao,
    glicemia: v.glicemia,
  }));
  const formatTooltipLabel = (label: unknown, payload: any[]) => {
    const timestamp = payload?.[0]?.payload?.dataCompleta;
    return timestamp
      ? `${formatarDataClinica(timestamp, true).replace(',', ' às')}`
      : String(label ?? '');
  };

  // Calculate statistics
  const calcStats = (values: (number | null)[]): { media: number | null; min: number | null; max: number | null } => {
    const filtered = values.filter((v): v is number => v !== null && Number.isFinite(v));
    if (filtered.length === 0) return { media: null, min: null, max: null };
    return {
      media: filtered.reduce((a, b) => a + b) / filtered.length,
      min: Math.min(...filtered),
      max: Math.max(...filtered),
    };
  };
  const resumoStats = (values: (number | null)[], unit: string, casas = 0) => {
    const s = calcStats(values);
    if (s.media === null || s.min === null || s.max === null) return 'Sem registro no período';
    return `Média ${s.media.toFixed(casas)} · mín ${s.min.toFixed(casas)} · máx ${s.max.toFixed(casas)} ${unit}`;
  };

  // Última medição com valor para cada sinal (independente do período).
  const ultimoRegistro = vitaisTotais.length > 0 ? vitaisTotais[vitaisTotais.length - 1] : null;
  const indicadores = useMemo(() => {
    if (vitaisTotais.length === 0) return [];
    const ultimoValor = (campo: CampoVital): { valor: number | null; em: string | null } => {
      for (let i = vitaisTotais.length - 1; i >= 0; i -= 1) {
        const valor = vitaisTotais[i][campo];
        if (valor !== null && Number.isFinite(valor)) return { valor, em: vitaisTotais[i].created_at };
      }
      return { valor: null, em: null };
    };
    const pa = (() => {
      const sis = ultimoValor('pressao_sistolica');
      const dia = ultimoValor('pressao_diastolica');
      const alterado = foraDaFaixa('pressao_sistolica', sis.valor) || foraDaFaixa('pressao_diastolica', dia.valor);
      return {
        key: 'pressao' as GraficoChave, label: 'Pressão arterial', icon: Heart, unit: 'mmHg',
        texto: sis.valor !== null && dia.valor !== null ? `${sis.valor}/${dia.valor}` : '—',
        em: sis.em ?? dia.em, alterado,
      };
    })();
    const fc = ultimoValor('frequencia_cardiaca');
    const temp = ultimoValor('temperatura');
    const o2 = ultimoValor('oxigenacao');
    const peso = ultimoValor('peso');
    const imc = ultimoValor('imc');
    return [
      pa,
      { key: 'fc' as GraficoChave, label: 'Freq. cardíaca', icon: Activity, unit: 'bpm', texto: fc.valor !== null ? `${fc.valor}` : '—', em: fc.em, alterado: foraDaFaixa('frequencia_cardiaca', fc.valor) },
      { key: null, label: 'Temperatura', icon: Thermometer, unit: '°C', texto: temp.valor !== null ? temp.valor.toFixed(1) : '—', em: temp.em, alterado: foraDaFaixa('temperatura', temp.valor) },
      { key: 'o2' as GraficoChave, label: 'Saturação O₂', icon: Wind, unit: '%', texto: o2.valor !== null ? `${o2.valor}` : '—', em: o2.em, alterado: foraDaFaixa('oxigenacao', o2.valor) },
      { key: 'peso' as GraficoChave, label: 'Peso', icon: Weight, unit: 'kg', texto: peso.valor !== null ? peso.valor.toFixed(1) : '—', em: peso.em, alterado: false },
      { key: null, label: 'IMC', icon: Weight, unit: 'kg/m²', texto: imc.valor !== null ? imc.valor.toFixed(1) : '—', em: imc.em, alterado: false },
    ];
  }, [vitaisTotais]);
  const totalAlterados = indicadores.filter((i) => i.alterado).length;

  const isLoading = vitaisQuery.isLoading;
  const temFiltroPeriodo = periodo !== 'tudo';
  const limparPaciente = () => {
    setSelectedPacienteId('');
    setPacienteSelecionado(null);
    setPeriodo('tudo');
    setGraficoFoco(null);
  };
  const linkProntuario = selectedPacienteId ? `/prontuarios?paciente=${encodeURIComponent(selectedPacienteId)}` : '/prontuarios';

  const descricao = !selectedPacienteId
    ? 'Acompanhe a evolução clínica com medições da triagem e do prontuário.'
    : isLoading
      ? `${nomePaciente ?? 'Paciente selecionado'} · carregando histórico…`
      : vitaisTotais.length === 0
        ? `${nomePaciente ?? 'Paciente selecionado'} · nenhuma medição registrada`
        : [
            nomePaciente ?? 'Paciente selecionado',
            `${vitaisTotais.length} ${vitaisTotais.length === 1 ? 'medição' : 'medições'}`,
            ultimoRegistro ? `última em ${formatarDataClinica(ultimoRegistro.created_at, true).replace(',', ' às')}` : null,
            totalAlterados > 0 ? `${totalAlterados} ${totalAlterados === 1 ? 'sinal alterado' : 'sinais alterados'}` : null,
          ].filter(Boolean).join(' · ');

  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="Não é possível consultar o histórico de sinais vitais até que a sessão carregue a clínica atual." />;
  }

  const classeCardGrafico = (key: GraficoChave) => cn(
    'rounded-2xl border-border/60 shadow-xs transition-all duration-200',
    graficoFoco === key && 'border-primary/50 ring-1 ring-primary/30 shadow-md',
  );
  const CelulaValor = ({ campo, valor, formatar }: { campo: CampoVital; valor: number | null; formatar?: (v: number) => string }) => {
    if (valor === null) return <span className="text-muted-foreground">—</span>;
    const texto = formatar ? formatar(valor) : String(valor);
    return foraDaFaixa(campo, valor)
      ? <Badge variant="outline" className="rounded-full border-destructive/30 bg-destructive/10 px-2 text-[11px] font-semibold tabular-nums text-destructive">{texto}</Badge>
      : <span className="tabular-nums">{texto}</span>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinais vitais"
        description={descricao}
        icon={<Heart />}
        actions={
          <>
            {selectedPacienteId && (
              <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
                <Link to={linkProntuario}><FileText aria-hidden="true" className="h-4 w-4" /> Prontuário</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/pacientes"><Users aria-hidden="true" className="h-4 w-4" /> Pacientes</Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => void vitaisQuery.refetch()}
              disabled={!selectedPacienteId || vitaisQuery.isFetching}
              aria-label="Atualizar sinais vitais"
              title="Atualizar sinais vitais"
            >
              <RefreshCw className={cn('h-4 w-4', vitaisQuery.isFetching && 'animate-spin')} />
            </Button>
          </>
        }
      />

      {/* Seletor de paciente */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Search className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-foreground">Selecionar Paciente</h2>
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <PacienteCombobox
                className="h-10 flex-1 rounded-full"
                value={selectedPacienteId || null}
                onChange={(id, pac) => { setSelectedPacienteId(id); setPacienteSelecionado(pac); setPeriodo('tudo'); setGraficoFoco(null); }}
                placeholder="Buscar paciente por nome, CPF ou telefone..."
              />
              {selectedPacienteId && (
                <Button variant="outline" className="h-10 gap-2 rounded-full" aria-label="Limpar paciente selecionado" onClick={limparPaciente}>
                  <X aria-hidden="true" className="h-4 w-4" />Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedPacienteId ? (
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardContent className="py-12 text-center">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Droplets className="h-7 w-7" />
            </span>
            <p className="font-medium text-foreground">Selecione um paciente para visualizar o histórico</p>
            <p className="mt-1 text-sm text-muted-foreground">As medições ficam organizadas por data e atendimento. Busque acima ou abra o cadastro de pacientes.</p>
            <Button asChild variant="outline" className="mt-4 gap-2 rounded-full">
              <Link to="/pacientes"><Users aria-hidden="true" className="h-4 w-4" /> Ir para Pacientes</Link>
            </Button>
          </CardContent>
        </Card>
      ) : vitaisQuery.isError ? (
        <ErrorState title="Não foi possível carregar os sinais vitais" error={vitaisQuery.error} onRetry={() => void vitaisQuery.refetch()} />
      ) : isLoading ? (
        <div role="status" className="py-12 text-center text-sm text-muted-foreground">Carregando o histórico clínico…</div>
      ) : vitaisTotais.length === 0 ? (
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardContent className="py-12 text-center">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <AlertCircle className="h-7 w-7" />
            </span>
            <p className="font-medium text-foreground">Nenhuma medição encontrada</p>
            <p className="mt-1 text-sm text-muted-foreground">Quando houver sinais vitais na triagem ou no prontuário, eles aparecerão aqui. Registre a próxima medição no prontuário do paciente.</p>
            <Button asChild className="mt-4 gap-2 rounded-full">
              <Link to={linkProntuario}><FileText aria-hidden="true" className="h-4 w-4" /> Abrir prontuário</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {historicoLimitado && (
            <Card className="rounded-2xl border-warning/40 bg-warning/5 shadow-xs">
              <CardContent className="py-3 text-sm text-muted-foreground">
                O histórico excede o limite de visualização de {MAX_REGISTROS_GRAFICO} medições; parte das medições mais antigas pode não aparecer.
              </CardContent>
            </Card>
          )}

          {/* Últimos valores */}
          <section role="group" aria-label="Últimos valores registrados" className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Últimos valores</h2>
              <p className="text-xs text-muted-foreground">
                {totalAlterados > 0
                  ? `${totalAlterados} ${totalAlterados === 1 ? 'sinal fora da faixa de alerta' : 'sinais fora da faixa de alerta'}. Clique para destacar o gráfico.`
                  : 'Nenhum sinal fora da faixa de alerta. Clique para destacar o gráfico.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {indicadores.map((item) => {
                const Icon = item.icon;
                const ativo = item.key !== null && graficoFoco === item.key;
                const corValor = item.alterado ? 'text-destructive' : 'text-foreground';
                const corIcone = item.alterado ? 'text-destructive' : 'text-primary';
                const superficieIcone = item.alterado ? 'bg-destructive/10' : 'bg-primary/10';
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={ativo}
                    disabled={item.key === null}
                    onClick={() => item.key && setGraficoFoco(ativo ? null : item.key)}
                    className={cn(
                      'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      item.key !== null && 'hover:-translate-y-0.5 hover:shadow-md',
                      item.key === null && 'cursor-default',
                      item.alterado && 'border-destructive/30 bg-destructive/5',
                      ativo && 'border-primary/50 ring-1 ring-primary/30',
                    )}
                  >
                    <div className="flex min-h-[96px] flex-col justify-between gap-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', superficieIcone)}>
                          <Icon aria-hidden="true" className={cn('h-5 w-5', corIcone)} />
                        </div>
                        {item.alterado && (
                          <Badge variant="outline" className={cn(
                            'rounded-full text-[10px]',
                            'border-destructive/30 bg-destructive/10 text-destructive',
                          )}>
                            Alterado
                          </Badge>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-xs font-semibold text-foreground">{item.label}</h3>
                        <p className="flex items-baseline gap-1">
                          <span className={cn('text-2xl font-bold tabular-nums', corValor)}>{item.texto}</span>
                          <span className="text-[11px] text-muted-foreground">{item.unit}</span>
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.em ? `em ${formatarDataClinica(item.em, true).replace(',', ' às')}` : 'sem registro'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Período */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarRange aria-hidden="true" className="h-3.5 w-3.5" /> Período
            </span>
            <div role="group" aria-label="Filtrar por período" className="flex flex-wrap items-center gap-1.5">
              {PERIODOS.map((p) => {
                const ativo = periodo === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setPeriodo(p.key)}
                    className={cn(
                      'min-h-10 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      ativo ? 'border-transparent bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    {p.label}
                    <span className={cn('ml-1.5 tabular-nums', ativo ? 'text-white/80' : 'text-muted-foreground/70')}>{contagemPorPeriodo[p.key]}</span>
                  </button>
                );
              })}
              {temFiltroPeriodo && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={() => setPeriodo('tudo')}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
            </div>
            <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {vitais.length} de {vitaisTotais.length} {vitaisTotais.length === 1 ? 'medição' : 'medições'}
            </p>
          </div>

          {vitais.length === 0 ? (
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardContent className="py-12 text-center">
                <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <CalendarRange className="h-7 w-7" />
                </span>
                <p className="font-medium text-foreground">Nenhuma medição no período selecionado</p>
                <p className="mt-1 text-sm text-muted-foreground">Amplie o período para ver as medições anteriores.</p>
                <Button size="sm" variant="outline" className="mt-4 rounded-full" onClick={() => setPeriodo('tudo')}>Limpar filtros</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Gráficos */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Pressão Arterial */}
                <Card className={classeCardGrafico('pressao')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Heart className="h-4 w-4" />
                      </span>
                      Pressão Arterial
                    </CardTitle>
                    <CardDescription>Sistólica e Diastólica ao longo do tempo · {resumoStats(vitais.map((v) => v.pressao_sistolica), 'mmHg')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                        <XAxis dataKey="data" stroke={COR_EIXO} tickLine={false} axisLine={{ stroke: COR_GRADE }} fontSize={11} />
                        <YAxis stroke={COR_EIXO} tickLine={false} axisLine={false} fontSize={11} width={36} />
                        <Tooltip
                          labelFormatter={formatTooltipLabel}
                          contentStyle={ESTILO_TOOLTIP}
                          labelStyle={ESTILO_ROTULO_TOOLTIP}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="pressaoSistolica"
                          stroke={COR_SERIE_PRIMARIA}
                          name="Sistólica (mmHg)"
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--card))' }}
                          activeDot={{ r: 5 }}
                          isAnimationActive={true}
                        />
                        <Line
                          type="monotone"
                          dataKey="pressaoDiastolica"
                          stroke={COR_SERIE_SECUNDARIA}
                          name="Diastólica (mmHg)"
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--card))' }}
                          strokeDasharray="5 4"
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Frequência Cardíaca */}
                <Card className={classeCardGrafico('fc')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <TrendingUp className="h-4 w-4" />
                      </span>
                      Frequência Cardíaca
                    </CardTitle>
                    <CardDescription>Batimentos por minuto · {resumoStats(vitais.map((v) => v.frequencia_cardiaca), 'bpm')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                        <XAxis dataKey="data" stroke={COR_EIXO} tickLine={false} axisLine={{ stroke: COR_GRADE }} fontSize={11} />
                        <YAxis stroke={COR_EIXO} tickLine={false} axisLine={false} fontSize={11} width={36} />
                        <Tooltip
                          labelFormatter={formatTooltipLabel}
                          contentStyle={ESTILO_TOOLTIP}
                          labelStyle={ESTILO_ROTULO_TOOLTIP}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="frequenciaCardiaca"
                          stroke={COR_SERIE_PRIMARIA}
                          name="FC (bpm)"
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--card))' }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Peso */}
                <Card className={classeCardGrafico('peso')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Weight className="h-4 w-4" />
                      </span>
                      Evolução de Peso
                    </CardTitle>
                    <CardDescription>Variação ao longo do tempo · {resumoStats(vitais.map((v) => v.peso), 'kg', 1)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                        <XAxis dataKey="data" stroke={COR_EIXO} tickLine={false} axisLine={{ stroke: COR_GRADE }} fontSize={11} />
                        <YAxis stroke={COR_EIXO} tickLine={false} axisLine={false} fontSize={11} width={36} />
                        <Tooltip
                          cursor={{ fill: 'hsl(var(--muted))' }}
                          labelFormatter={formatTooltipLabel}
                          contentStyle={ESTILO_TOOLTIP}
                          labelStyle={ESTILO_ROTULO_TOOLTIP}
                        />
                        <Bar dataKey="peso" fill={COR_SERIE_PRIMARIA} name="Peso (kg)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Oxigenação e Glicemia */}
                <Card className={classeCardGrafico('o2')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Droplets className="h-4 w-4" />
                      </span>
                      Oxigenação e Glicemia
                    </CardTitle>
                    <CardDescription>Níveis de O2 e glicose · {resumoStats(vitais.map((v) => v.oxigenacao), '%')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                        <XAxis dataKey="data" stroke={COR_EIXO} tickLine={false} axisLine={{ stroke: COR_GRADE }} fontSize={11} />
                        <YAxis stroke={COR_EIXO} tickLine={false} axisLine={false} fontSize={11} width={36} yAxisId="left" />
                        <YAxis stroke={COR_EIXO} tickLine={false} axisLine={false} fontSize={11} width={36} yAxisId="right" orientation="right" />
                        <Tooltip
                          labelFormatter={formatTooltipLabel}
                          contentStyle={ESTILO_TOOLTIP}
                          labelStyle={ESTILO_ROTULO_TOOLTIP}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="oxigenacao"
                          stroke={COR_SERIE_PRIMARIA}
                          name="O2 (%)"
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--card))' }}
                          activeDot={{ r: 5 }}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="glicemia"
                          stroke={COR_SERIE_SECUNDARIA}
                          name="Glicemia (mg/dL)"
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--card))' }}
                          strokeDasharray="5 4"
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Últimos registros em tabela */}
              <Card className="rounded-2xl border-border/60 shadow-xs">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Activity className="h-4 w-4" />
                      </span>
                      <CardTitle className="text-base">Últimos Registros</CardTitle>
                      <Badge variant="outline" className="h-5 rounded-full border-primary/20 bg-primary/5 text-xs tabular-nums text-primary">
                        {Math.min(10, vitais.length)}
                      </Badge>
                    </div>
                    <CardDescription>Detalhes das últimas medições · valores fora da faixa de alerta em destaque</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-xl border border-border/60">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead className="text-right">PA</TableHead>
                            <TableHead className="text-right">FC</TableHead>
                            <TableHead className="text-right">FR</TableHead>
                            <TableHead className="text-right">Temp</TableHead>
                            <TableHead className="text-right">Peso</TableHead>
                            <TableHead className="text-right">IMC</TableHead>
                            <TableHead className="text-right">O2</TableHead>
                            <TableHead className="text-right">Glicemia</TableHead>
                            <TableHead className="text-right">Dor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vitais.slice(-10).reverse().map((v, index) => {
                            const maisRecente = index === 0;
                            return (
                              <TableRow key={v.id} className={cn(maisRecente && 'bg-muted/60')}>
                                <TableCell>
                                  <span className={cn(
                                    'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                                    maisRecente ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                                  )}>
                                    {index + 1}
                                  </span>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-xs">
                                  <span className="flex items-center gap-1.5">
                                    {formatarDataClinica(v.created_at, true)}
                                    {maisRecente && <Badge className="rounded-full border-transparent bg-primary text-[9px] text-primary-foreground">Mais recente</Badge>}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  {v.pressao_sistolica !== null && v.pressao_diastolica !== null ? (
                                    foraDaFaixa('pressao_sistolica', v.pressao_sistolica) || foraDaFaixa('pressao_diastolica', v.pressao_diastolica)
                                      ? <Badge variant="outline" className="rounded-full border-destructive/30 bg-destructive/10 px-2 text-[11px] font-semibold tabular-nums text-destructive">{`${v.pressao_sistolica}/${v.pressao_diastolica}`}</Badge>
                                      : <span className="tabular-nums">{`${v.pressao_sistolica}/${v.pressao_diastolica}`}</span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-right"><CelulaValor campo="frequencia_cardiaca" valor={v.frequencia_cardiaca} /></TableCell>
                                <TableCell className="text-right"><CelulaValor campo="frequencia_respiratoria" valor={v.frequencia_respiratoria} /></TableCell>
                                <TableCell className="text-right"><CelulaValor campo="temperatura" valor={v.temperatura} formatar={(n) => n.toFixed(1)} /></TableCell>
                                <TableCell className="text-right"><CelulaValor campo="peso" valor={v.peso} formatar={(n) => n.toFixed(1)} /></TableCell>
                                <TableCell className="text-right"><CelulaValor campo="imc" valor={v.imc} formatar={(n) => n.toFixed(1)} /></TableCell>
                                <TableCell className="text-right"><CelulaValor campo="oxigenacao" valor={v.oxigenacao} formatar={(n) => `${n}%`} /></TableCell>
                                <TableCell className="text-right"><CelulaValor campo="glicemia" valor={v.glicemia} /></TableCell>
                                <TableCell className="text-right"><CelulaValor campo="dor_escala" valor={v.dor_escala} formatar={(n) => `${n}/10`} /></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
