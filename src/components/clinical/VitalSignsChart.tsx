import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
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
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';

interface VitalSignsChartProps {
  pacienteId: string;
  className?: string;
}

interface TriagemData {
  id: string;
  data_hora: string;
  pressao_arterial: string | null;
  frequencia_cardiaca: number | null;
  temperatura: number | null;
  peso: number | null;
  altura: number | null;
  saturacao: number | null;
  frequencia_respiratoria: number | null;
}

export function VitalSignsChart({ pacienteId, className }: VitalSignsChartProps) {
  const { user, profile } = useSupabaseAuth();
  const { data: triagensRecentes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['patient-vital-signs', user?.id ?? null, profile?.clinica_id ?? null, pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('triagens')
        .select('id, data_hora, pressao_arterial, frequencia_cardiaca, temperatura, peso, altura, saturacao, frequencia_respiratoria')
        .eq('paciente_id', pacienteId)
        .eq('clinica_id', profile!.clinica_id!)
        .order('data_hora', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as TriagemData[];
    },
    enabled: !!pacienteId && !!user && !!profile?.clinica_id,
  });
  // O servidor entrega primeiro as mais recentes; inverter preserva a ordem
  // cronológica no gráfico sem sacrificar os dados atuais pelo limite de 20.
  const triagens = [...(triagensRecentes ?? [])].reverse();

  const chartData = triagens?.map((t) => {
    // Parse blood pressure (systolic/diastolic)
    let sistolica = null;
    let diastolica = null;
    if (t.pressao_arterial) {
      const parts = t.pressao_arterial.split('/').map(p => parseInt(p.trim()));
      if (parts.length === 2) {
        sistolica = parts[0];
        diastolica = parts[1];
      }
    }

    return {
      data: format(new Date(t.data_hora || new Date()), 'dd/MM', { locale: ptBR }),
      dataCompleta: format(new Date(t.data_hora || new Date()), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
      sistolica,
      diastolica,
      fc: t.frequencia_cardiaca,
      temperatura: t.temperatura,
      peso: t.peso,
      saturacao: t.saturacao,
      fr: t.frequencia_respiratoria,
    };
  }) || [];

  const lastTriagem = triagens?.[triagens.length - 1];

  const getStatusColor = (value: number | null, type: 'fc' | 'temperatura' | 'saturacao' | 'sistolica') => {
    if (value === null) return 'text-muted-foreground';
    
    switch (type) {
      case 'fc':
        if (value < 60 || value > 100) return 'text-amber-600';
        return 'text-green-600';
      case 'temperatura':
        if (value > 38) return 'text-red-600';
        if (value < 36 || value > 37.5) return 'text-amber-600';
        return 'text-green-600';
      case 'saturacao':
        if (value < 90) return 'text-red-600';
        if (value < 95) return 'text-amber-600';
        return 'text-green-600';
      case 'sistolica':
        if (value > 180 || value < 80) return 'text-red-600';
        if (value > 140 || value < 90) return 'text-amber-600';
        return 'text-green-600';
      default:
        return 'text-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Sinais Vitais
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
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Sinais Vitais</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState compact title="Não foi possível carregar os sinais vitais" error={error} onRetry={() => void refetch()} />
        </CardContent>
      </Card>
    );
  }

  if (triagens.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Sinais Vitais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Nenhuma triagem registrada para este paciente.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Evolução de Sinais Vitais
          <Badge variant="outline" className="ml-auto">
            Últimos {triagens.length} registro(s)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current vitals summary */}
        {lastTriagem && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">PA</p>
                <p className={cn("font-semibold", getStatusColor(
                  lastTriagem.pressao_arterial ? parseInt(lastTriagem.pressao_arterial.split('/')[0]) : null, 
                  'sistolica'
                ))}>
                  {lastTriagem.pressao_arterial || '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-pink-500" />
              <div>
                <p className="text-xs text-muted-foreground">FC</p>
                <p className={cn("font-semibold", getStatusColor(lastTriagem.frequencia_cardiaca, 'fc'))}>
                  {lastTriagem.frequencia_cardiaca || '-'} bpm
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Temp</p>
                <p className={cn("font-semibold", getStatusColor(lastTriagem.temperatura, 'temperatura'))}>
                  {lastTriagem.temperatura || '-'}°C
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Peso</p>
                <p className="font-semibold">
                  {lastTriagem.peso || '-'} kg
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Blood Pressure Chart */}
        {chartData.some(d => d.sistolica !== null) && (
          <div>
            <h4 className="text-sm font-medium mb-2">Pressão Arterial (mmHg)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" className="text-xs" />
                <YAxis domain={[60, 200]} className="text-xs" />
                <Tooltip 
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.dataCompleta || label}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="sistolica" 
                  name="Sistólica"
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--destructive))' }}
                  connectNulls
                />
                <Line 
                  type="monotone" 
                  dataKey="diastolica" 
                  name="Diastólica"
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Heart Rate & Temperature Chart */}
        {chartData.some(d => d.fc !== null || d.temperatura !== null) && (
          <div>
            <h4 className="text-sm font-medium mb-2">Frequência Cardíaca (bpm) e Temperatura (°C)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" className="text-xs" />
                <YAxis yAxisId="left" domain={[40, 140]} className="text-xs" />
                <YAxis yAxisId="right" orientation="right" domain={[35, 40]} className="text-xs" />
                <Tooltip 
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.dataCompleta || label}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="fc" 
                  name="FC (bpm)"
                  stroke="#ec4899" 
                  strokeWidth={2}
                  dot={{ fill: '#ec4899' }}
                  connectNulls
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="temperatura" 
                  name="Temp (°C)"
                  stroke="#f97316" 
                  strokeWidth={2}
                  dot={{ fill: '#f97316' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weight Chart */}
        {chartData.some(d => d.peso !== null) && (
          <div>
            <h4 className="text-sm font-medium mb-2">Peso (kg)</h4>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.dataCompleta || label}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="peso" 
                  name="Peso"
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
