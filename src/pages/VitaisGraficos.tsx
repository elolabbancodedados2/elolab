import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { ErrorState } from '@/components/ErrorState';
import { autorizarLeituraHistoricoPaciente } from '@/lib/prontuarioAudit';
import { consolidarHistoricoVitais, historicoVitaisLimitado, type ProntuarioVitalsRow, type TriagemVitalsRow } from '@/lib/vitalsHistory';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Heart, Droplets, Thermometer, Weight, AlertCircle, X } from 'lucide-react';

const MAX_REGISTROS_GRAFICO = 1000;
const FUSO_CLINICA = 'America/Sao_Paulo';

const formatarDataClinica = (valor: string, incluirHora = false) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_CLINICA,
    day: '2-digit',
    month: '2-digit',
    ...(incluirHora ? { year: 'numeric' as const, hour: '2-digit' as const, minute: '2-digit' as const } : { year: '2-digit' as const }),
  }).format(new Date(valor));

export default function VitaisGraficos() {
  const { profile } = useSupabaseAuth();
  const [selectedPacienteId, setSelectedPacienteId] = useState<string>('');

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
  const vitais = vitaisQuery.data?.registros ?? [];
  const historicoLimitado = vitaisQuery.data?.historicoLimitado ?? false;

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

  const isLoading = vitaisQuery.isLoading;

  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="Não é possível consultar o histórico de sinais vitais até que a sessão carregue a clínica atual." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-[#eaf4ff] p-3 text-[#1769c2] shadow-sm ring-1 ring-[#d8e8fb]">
          <Heart className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#102a56] md:text-3xl">Sinais vitais</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe a evolução clínica com medições da triagem e do prontuário.</p>
        </div>
      </div>

      {/* Seletor de paciente */}
      <Card className="border-[#dce9f7] bg-gradient-to-r from-white to-[#f3f8ff] shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Selecionar Paciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <PacienteCombobox value={selectedPacienteId || null} onChange={(id) => setSelectedPacienteId(id)} placeholder="Buscar paciente por nome, CPF ou telefone..." />
            {selectedPacienteId && <Button variant="outline" aria-label="Limpar paciente selecionado" onClick={() => setSelectedPacienteId('')}><X className="mr-2 h-4 w-4" />Limpar</Button>}
          </div>
        </CardContent>
      </Card>

      {!selectedPacienteId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf6ff] text-[#2476ce]">
              <Droplets className="h-7 w-7" />
            </div>
            <p className="font-medium text-[#18345f]">Selecione um paciente para visualizar o histórico</p>
            <p className="mt-1 text-sm text-muted-foreground">As medições ficam organizadas por data e atendimento.</p>
          </CardContent>
        </Card>
      ) : vitaisQuery.isError ? (
        <ErrorState title="Não foi possível carregar os sinais vitais" error={vitaisQuery.error} onRetry={() => void vitaisQuery.refetch()} />
      ) : isLoading ? (
        <div role="status" className="py-12 text-center text-sm text-muted-foreground">Carregando o histórico clínico…</div>
      ) : vitais.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf6ff] text-[#2476ce]">
              <AlertCircle className="h-7 w-7" />
            </div>
            <p className="font-medium text-[#18345f]">Nenhuma medição encontrada</p>
            <p className="mt-1 text-sm text-muted-foreground">Quando houver sinais vitais na triagem ou no prontuário, eles aparecerão aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {historicoLimitado && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="py-3 text-sm text-muted-foreground">
                O histórico excede o limite de visualização de {MAX_REGISTROS_GRAFICO} medições; parte das medições mais antigas pode não aparecer.
              </CardContent>
            </Card>
          )}
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              {
                label: 'Pressão Sistólica',
                icon: Heart,
                stats: calcStats(vitais.map((v) => v.pressao_sistolica)),
                unit: 'mmHg',
              },
              {
                label: 'Pressão Diastólica',
                icon: Heart,
                stats: calcStats(vitais.map((v) => v.pressao_diastolica)),
                unit: 'mmHg',
              },
              {
                label: 'Freq. Cardíaca',
                icon: TrendingUp,
                stats: calcStats(vitais.map((v) => v.frequencia_cardiaca)),
                unit: 'bpm',
              },
              {
                label: 'Freq. Respiratória',
                icon: TrendingUp,
                stats: calcStats(vitais.map((v) => v.frequencia_respiratoria)),
                unit: 'irpm',
              },
              {
                label: 'Temperatura',
                icon: Thermometer,
                stats: calcStats(vitais.map((v) => v.temperatura)),
                unit: '°C',
              },
              {
                label: 'Peso',
                icon: Weight,
                stats: calcStats(vitais.map((v) => v.peso)),
                unit: 'kg',
              },
              {
                label: 'IMC',
                icon: Weight,
                stats: calcStats(vitais.map((v) => v.imc)),
                unit: 'kg/m²',
              },
              {
                label: 'Saturação O₂',
                icon: Heart,
                stats: calcStats(vitais.map((v) => v.oxigenacao)),
                unit: '%',
              },
              {
                label: 'Glicemia',
                icon: Droplets,
                stats: calcStats(vitais.map((v) => v.glicemia)),
                unit: 'mg/dL',
              },
              {
                label: 'Dor',
                icon: AlertCircle,
                stats: calcStats(vitais.map((v) => v.dor_escala)),
                unit: '/10',
              },
            ].map((item) => (
              <Card key={item.label} className="border-[#e0eaf5] shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">
                      {item.label}
                    </p>
                    <span className="rounded-lg bg-[#edf6ff] p-1.5 text-[#2878cb]">
                      <item.icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="text-xl font-bold tabular-nums">
                    {item.stats.media === null ? 'Sem registro' : `${item.stats.media.toFixed(1)} ${item.unit}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.stats.min === null || item.stats.max === null ? '—' : `${item.stats.min.toFixed(1)} — ${item.stats.max.toFixed(1)} ${item.unit}`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pressão Arterial */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Pressão Arterial
                </CardTitle>
                <CardDescription>Sistólica e Diastólica ao longo do tempo</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="data" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip
                      labelFormatter={formatTooltipLabel}
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="pressaoSistolica"
                      stroke="#0c1f54"
                      name="Sistólica (mmHg)"
                      strokeWidth={2}
                      isAnimationActive={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="pressaoDiastolica"
                      stroke="#0f7bfd"
                      name="Diastólica (mmHg)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Frequência Cardíaca e Temperatura */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Frequência Cardíaca
                </CardTitle>
                <CardDescription>Batimentos por minuto</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="data" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip
                      labelFormatter={formatTooltipLabel}
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="frequenciaCardiaca"
                      stroke="#50bde3"
                      name="FC (bpm)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Peso */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Weight className="h-4 w-4" />
                  Evolução de Peso
                </CardTitle>
                <CardDescription>Variação ao longo do tempo</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="data" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" />
                    <Tooltip
                      labelFormatter={formatTooltipLabel}
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Bar dataKey="peso" fill="#0f7bfd" name="Peso (kg)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Oxigenação e Glicemia */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Droplets className="h-4 w-4" />
                  Oxigenação e Glicemia
                </CardTitle>
                <CardDescription>Níveis de O2 e glicose</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="data" stroke="var(--muted-foreground)" />
                    <YAxis stroke="var(--muted-foreground)" yAxisId="left" />
                    <YAxis stroke="var(--muted-foreground)" yAxisId="right" orientation="right" />
                    <Tooltip
                      labelFormatter={formatTooltipLabel}
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="oxigenacao"
                      stroke="#22a6a1"
                      name="O2 (%)"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="glicemia"
                      stroke="#f59e0b"
                      name="Glicemia (mg/dL)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Últimos registros em tabela */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Últimos Registros</CardTitle>
              <CardDescription>Detalhes das últimas medições</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Data</th>
                      <th className="text-right py-2 px-2">PA</th>
                      <th className="text-right py-2 px-2">FC</th>
                      <th className="text-right py-2 px-2">FR</th>
                      <th className="text-right py-2 px-2">Temp</th>
                      <th className="text-right py-2 px-2">Peso</th>
                      <th className="text-right py-2 px-2">IMC</th>
                      <th className="text-right py-2 px-2">O2</th>
                      <th className="text-right py-2 px-2">Glicemia</th>
                      <th className="text-right py-2 px-2">Dor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vitais.slice(-10).reverse().map((v) => (
                      <tr key={v.id} className="border-b hover:bg-muted/50">
                        <td className="text-left py-2 px-2 text-xs">
                          {formatarDataClinica(v.created_at, true)}
                        </td>
                        <td className="text-right py-2 px-2">
                          {v.pressao_sistolica !== null && v.pressao_diastolica !== null
                            ? `${v.pressao_sistolica}/${v.pressao_diastolica}`
                            : '—'}
                        </td>
                        <td className="text-right py-2 px-2">{v.frequencia_cardiaca ?? '—'}</td>
                        <td className="text-right py-2 px-2">{v.frequencia_respiratoria ?? '—'}</td>
                        <td className="text-right py-2 px-2">{v.temperatura !== null ? v.temperatura.toFixed(1) : '—'}</td>
                        <td className="text-right py-2 px-2">{v.peso !== null ? v.peso.toFixed(1) : '—'}</td>
                        <td className="text-right py-2 px-2">{v.imc !== null ? v.imc.toFixed(1) : '—'}</td>
                        <td className="text-right py-2 px-2">{v.oxigenacao !== null ? `${v.oxigenacao}%` : '—'}</td>
                        <td className="text-right py-2 px-2">{v.glicemia ?? '—'}</td>
                        <td className="text-right py-2 px-2">{v.dor_escala !== null ? `${v.dor_escala}/10` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
