 // @ts-nocheck
 import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, Heart, Droplets, Thermometer, Weight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VitalSignData {
  id: string;
  paciente_id: string;
  pressao_sistolica: number | null;
  pressao_diastolica: number | null;
  frequencia_cardiaca: number | null;
  temperatura: number | null;
  peso: number | null;
  altura: number | null;
  imc: number | null;
  oxigenacao: number | null;
  glicemia: number | null;
  created_at: string;
}

export default function VitaisGraficos() {
  const { profile } = useSupabaseAuth();
  const [selectedPacienteId, setSelectedPacienteId] = useState<string>('');

  const { data: pacientes = [], isLoading: loadingPacientes } = useQuery({
    queryKey: ['pacientes_vitais', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data } = await supabase
        .from('pacientes')
        .select('id, nome')
        .eq('clinica_id', profile.clinica_id)
        .order('nome');
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });

  const { data: vitais = [], isLoading: loadingVitais } = useQuery({
    queryKey: ['vitais_historico', selectedPacienteId],
    queryFn: async () => {
      if (!selectedPacienteId) return [];
      const { data } = await supabase
        .from('vitais_historico')
        .select('*')
        .eq('paciente_id', selectedPacienteId)
        .order('created_at', { ascending: true });
      return (data || []) as VitalSignData[];
    },
    enabled: !!selectedPacienteId,
  });

  // Format data for charts
  const chartData = vitais.map((v) => ({
    data: format(parseISO(v.created_at), 'dd/MM', { locale: ptBR }),
    dataCompleta: v.created_at,
    pressaoSistolica: v.pressao_sistolica,
    pressaoDiastolica: v.pressao_diastolica,
    frequenciaCardiaca: v.frequencia_cardiaca,
    temperatura: v.temperatura,
    peso: v.peso,
    oxigenacao: v.oxigenacao,
    glicemia: v.glicemia,
  }));

  // Calculate statistics
  const calcStats = (values: (number | null)[]): { media: number; min: number; max: number } => {
    const filtered = values.filter((v) => v !== null) as number[];
    if (filtered.length === 0) return { media: 0, min: 0, max: 0 };
    return {
      media: filtered.reduce((a, b) => a + b) / filtered.length,
      min: Math.min(...filtered),
      max: Math.max(...filtered),
    };
  };

  const paciente = pacientes.find((p) => p.id === selectedPacienteId);
  const isLoading = loadingPacientes || loadingVitais;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gráficos de Vitais</h1>
        <p className="text-muted-foreground">Histórico de sinais vitais por paciente</p>
      </div>

      {/* Seletor de paciente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Selecionar Paciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPacienteId} onValueChange={setSelectedPacienteId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Escolha um paciente..." />
            </SelectTrigger>
            <SelectContent>
              {pacientes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedPacienteId ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Droplets className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">Selecione um paciente para visualizar seus vitais</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : vitais.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">Nenhum registro de vitais para este paciente</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: 'Pressão Sistólica',
                icon: Heart,
                stats: calcStats(vitais.map((v) => v.pressao_sistolica)),
                unit: 'mmHg',
              },
              {
                label: 'Freq. Cardíaca',
                icon: TrendingUp,
                stats: calcStats(vitais.map((v) => v.frequencia_cardiaca)),
                unit: 'bpm',
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
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">
                      {item.label}
                    </p>
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xl font-bold tabular-nums">
                    {item.stats.media.toFixed(1)} {item.unit}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.stats.min.toFixed(1)} — {item.stats.max.toFixed(1)}
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
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="pressaoSistolica"
                      stroke="#ef4444"
                      name="Sistólica (mmHg)"
                      strokeWidth={2}
                      isAnimationActive={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="pressaoDiastolica"
                      stroke="#f97316"
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
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="frequenciaCardiaca"
                      stroke="#3b82f6"
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
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Bar dataKey="peso" fill="#8b5cf6" name="Peso (kg)" />
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
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="oxigenacao"
                      stroke="#10b981"
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
              <CardDescription>Detalhes dos últimos exames</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Data</th>
                      <th className="text-right py-2 px-2">PA</th>
                      <th className="text-right py-2 px-2">FC</th>
                      <th className="text-right py-2 px-2">Temp</th>
                      <th className="text-right py-2 px-2">Peso</th>
                      <th className="text-right py-2 px-2">IMC</th>
                      <th className="text-right py-2 px-2">O2</th>
                      <th className="text-right py-2 px-2">Glicemia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vitais.slice(-10).reverse().map((v) => (
                      <tr key={v.id} className="border-b hover:bg-muted/50">
                        <td className="text-left py-2 px-2 text-xs">
                          {format(parseISO(v.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </td>
                        <td className="text-right py-2 px-2">
                          {v.pressao_sistolica && v.pressao_diastolica
                            ? `${v.pressao_sistolica}/${v.pressao_diastolica}`
                            : '—'}
                        </td>
                        <td className="text-right py-2 px-2">{v.frequencia_cardiaca || '—'}</td>
                        <td className="text-right py-2 px-2">{v.temperatura ? v.temperatura.toFixed(1) : '—'}</td>
                        <td className="text-right py-2 px-2">{v.peso ? v.peso.toFixed(1) : '—'}</td>
                        <td className="text-right py-2 px-2">{v.imc ? v.imc.toFixed(1) : '—'}</td>
                        <td className="text-right py-2 px-2">{v.oxigenacao ? `${v.oxigenacao}%` : '—'}</td>
                        <td className="text-right py-2 px-2">{v.glicemia || '—'}</td>
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
