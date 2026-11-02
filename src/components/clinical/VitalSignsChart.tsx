import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useQuery } from '@tanstack/react-query';

import { ptBR } from 'date-fns/locale';
import { Activity, Heart, Thermometer, Scale, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatVitalMeasurement } from '@/lib/vitalSigns';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { autorizarLeituraHistoricoPaciente } from '@/lib/prontuarioAudit';
import { consolidarHistoricoVitais, type ProntuarioVitalsRow, type TriagemVitalsRow, type VitalSignData } from '@/lib/vitalsHistory';
import { classeTextoNivelVital, classificarSinalVital } from '@/lib/limiaresVitais';

interface VitalSignsChartProps {
  pacienteId: string;
  className?: string;
}

const LIMITE_REGISTROS = 20;
const COR_SERIE_PRIMARIA = 'hsl(var(--primary))';
const COR_SERIE_SECUNDARIA = 'hsl(var(--muted-foreground))';

/**
 * Evolução dos sinais vitais do paciente. Junta triagens e evoluções do
 * prontuário (antes só lia triagens, e o que o médico registrava na consulta
 * não aparecia no gráfico).
 */
export function VitalSignsChart({ pacienteId, className }: VitalSignsChartProps) {
  const { user, profile } = useSupabaseAuth();
  const { data: registrosConsolidados, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['patient-vital-signs', user?.id ?? null, profile?.clinica_id ?? null, pacienteId],
    queryFn: async (): Promise<VitalSignData[]> => {
      const clinicaId = profile!.clinica_id!;
      const { data: triagens, error: erroTriagens } = await supabase
        .from('triagens')
        .select('id, paciente_id, agendamento_id, pressao_arterial, frequencia_cardiaca, frequencia_respiratoria, temperatura, peso, altura, imc, saturacao, glicemia, dor_escala, data_hora, created_at')
        .eq('paciente_id', pacienteId)
        .eq('clinica_id', clinicaId)
        .order('data_hora', { ascending: false })
        .limit(LIMITE_REGISTROS);
      if (erroTriagens) throw erroTriagens;

      // Evoluções exigem a leitura auditada do histórico, como no restante
      // do prontuário; perfis sem acesso clínico seguem só com as triagens.
      const podeLerProntuarios = profile?.roles?.some(role => role === 'admin' || role === 'medico');
      let prontuarios: ProntuarioVitalsRow[] = [];
      if (podeLerProntuarios) {
        await autorizarLeituraHistoricoPaciente(pacienteId);
        const { data, error: erroProntuarios } = await supabase
          .from('prontuarios')
          .select('id, paciente_id, agendamento_id, data, created_at, sinais_vitais')
          .eq('paciente_id', pacienteId)
          .eq('clinica_id', clinicaId)
          .order('created_at', { ascending: false })
          .limit(LIMITE_REGISTROS);
        if (erroProntuarios) throw erroProntuarios;
        prontuarios = (data || []) as ProntuarioVitalsRow[];
      }

      return consolidarHistoricoVitais((triagens || []) as TriagemVitalsRow[], prontuarios).slice(-LIMITE_REGISTROS);
    },
    enabled: !!pacienteId && !!user && !!profile?.clinica_id,
  });
  // Já vem em ordem cronológica, com as medições mais recentes no fim.
  const registros = registrosConsolidados ?? [];

  const chartData = registros.map((r) => ({
    data: format(new Date(r.created_at), 'dd/MM', { locale: ptBR }),
    dataCompleta: format(new Date(r.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
    sistolica: r.pressao_sistolica,
    diastolica: r.pressao_diastolica,
    fc: r.frequencia_cardiaca,
    temperatura: r.temperatura,
    peso: r.peso,
    saturacao: r.oxigenacao,
    fr: r.frequencia_respiratoria,
  }));

  const ultimo = registros[registros.length - 1];
  const pressaoUltima = ultimo && ultimo.pressao_sistolica !== null && ultimo.pressao_diastolica !== null
    ? `${ultimo.pressao_sistolica}/${ultimo.pressao_diastolica}`
    : null;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Sinais vitais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Sinais vitais</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState compact title="Não foi possível carregar os sinais vitais" error={error} onRetry={() => void refetch()} />
        </CardContent>
      </Card>
    );
  }

  if (registros.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Sinais vitais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Nenhuma medição registrada na triagem ou no prontuário deste paciente.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tooltipEstilo = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Evolução de sinais vitais
          <Badge variant="outline" className="ml-auto">
            Últimos {registros.length} registro(s)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {ultimo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Heart aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">PA</p>
                <p className={cn('font-semibold', classeTextoNivelVital(classificarSinalVital('pressao_sistolica', ultimo.pressao_sistolica)))}>
                  {formatVitalMeasurement(pressaoUltima, 'mmHg')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">FC</p>
                <p className={cn('font-semibold', classeTextoNivelVital(classificarSinalVital('frequencia_cardiaca', ultimo.frequencia_cardiaca)))}>
                  {formatVitalMeasurement(ultimo.frequencia_cardiaca, 'bpm')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Thermometer aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Temp</p>
                <p className={cn('font-semibold', classeTextoNivelVital(classificarSinalVital('temperatura', ultimo.temperatura)))}>
                  {formatVitalMeasurement(ultimo.temperatura, '°C')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Scale aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Peso</p>
                <p className="font-semibold">
                  {formatVitalMeasurement(ultimo.peso, 'kg')}
                </p>
              </div>
            </div>
          </div>
        )}

        {chartData.some(d => d.sistolica !== null) && (
          <div>
            <h4 className="text-sm font-medium mb-2">Pressão arterial (mmHg)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" className="text-xs" />
                <YAxis domain={[60, 200]} className="text-xs" />
                <Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.dataCompleta || label} contentStyle={tooltipEstilo} />
                <Legend />
                <Line type="monotone" dataKey="sistolica" name="Sistólica" stroke={COR_SERIE_PRIMARIA} strokeWidth={2} dot={{ fill: COR_SERIE_PRIMARIA }} connectNulls />
                <Line type="monotone" dataKey="diastolica" name="Diastólica" stroke={COR_SERIE_SECUNDARIA} strokeWidth={2} strokeDasharray="5 4" dot={{ fill: COR_SERIE_SECUNDARIA }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartData.some(d => d.fc !== null || d.temperatura !== null) && (
          <div>
            <h4 className="text-sm font-medium mb-2">Frequência cardíaca (bpm) e temperatura (°C)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" className="text-xs" />
                <YAxis yAxisId="left" domain={[40, 140]} className="text-xs" />
                <YAxis yAxisId="right" orientation="right" domain={[35, 40]} className="text-xs" />
                <Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.dataCompleta || label} contentStyle={tooltipEstilo} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="fc" name="FC (bpm)" stroke={COR_SERIE_PRIMARIA} strokeWidth={2} dot={{ fill: COR_SERIE_PRIMARIA }} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="temperatura" name="Temp (°C)" stroke={COR_SERIE_SECUNDARIA} strokeWidth={2} strokeDasharray="5 4" dot={{ fill: COR_SERIE_SECUNDARIA }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartData.some(d => d.peso !== null) && (
          <div>
            <h4 className="text-sm font-medium mb-2">Peso (kg)</h4>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.dataCompleta || label} contentStyle={tooltipEstilo} />
                <Line type="monotone" dataKey="peso" name="Peso" stroke={COR_SERIE_PRIMARIA} strokeWidth={2} dot={{ fill: COR_SERIE_PRIMARIA }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
