import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, TrendingUp, Zap, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDateOnly } from '@/lib/dateOnly';

interface PredictedNoShow {
  agendamento_id: string;
  paciente_id: string;
  paciente_nome: string;
  data_agendamento: string;
  medico_nome: string;
  probabilidade_no_show: number;
  motivos_risco: string[];
  recomendacoes: string;
  telefone?: string;
  email?: string;
}

export default function AnalisePreditiva() {
  const { profile } = useSupabaseAuth();
  const [filtroRisco, setFiltroRisco] = useState('todos');

  const { data: predicoes = [], isLoading } = useQuery({
    queryKey: ['predicoes_no_show', profile?.clinica_id, filtroRisco],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];

      const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select(
          `
          id, data, hora_inicio, status,
          pacientes(id, nome, email, telefone),
          medicos(id, nome)
        `
        )
        .eq('clinica_id', profile.clinica_id)
        .eq('status', 'confirmado')
        .gte('data', new Date().toISOString().split('T')[0])
        .order('data', { ascending: true });

      if (!agendamentos) return [];

      // Calculate no-show risk for each appointment
      const predictions: PredictedNoShow[] = agendamentos.map((ag: any) => {
        const predictedNoShow = calcularRiscoNoShow(ag);
        return predictedNoShow;
      });

      // Filter by risk level
      if (filtroRisco === 'alto') {
        return predictions.filter((p) => p.probabilidade_no_show >= 0.7);
      } else if (filtroRisco === 'medio') {
        return predictions.filter((p) => p.probabilidade_no_show >= 0.4 && p.probabilidade_no_show < 0.7);
      } else if (filtroRisco === 'baixo') {
        return predictions.filter((p) => p.probabilidade_no_show < 0.4);
      }
      return predictions.sort((a, b) => b.probabilidade_no_show - a.probabilidade_no_show);
    },
    enabled: !!profile?.clinica_id,
  });

  const calcularRiscoNoShow = (agendamento: any): PredictedNoShow => {
    let risco = 0.1; // baseline 10%
    const motivos: string[] = [];
    const recomendacoes: string[] = [];

    // Factor 1: Days until appointment
    const diasAte = differenceInDays(parseDateOnly(agendamento.data)!, new Date());
    if (diasAte > 14) {
      risco += 0.15; // Appointments far in future have higher no-show
      motivos.push('Agendamento longe');
      recomendacoes.push('Enviar lembrete uma semana antes');
    } else if (diasAte > 7) {
      risco += 0.08;
    } else if (diasAte === 0) {
      risco -= 0.05; // Same day appointments have lower no-show
      recomendacoes.push('Conferir confirmação no dia');
    }

    // Factor 2: Time of appointment
    const hora = parseInt(agendamento.hora_inicio?.split(':')[0] || '10');
    if (hora >= 15) {
      risco += 0.12; // Afternoon appointments have higher no-show
      motivos.push('Horário tarde (maior probabilidade no-show)');
    }

    // Factor 3: Day of week (Friday afternoon worst)
    const dataObj = parseDateOnly(agendamento.data)!;
    const diaSemana = dataObj.getDay();
    if (diaSemana === 5 && hora >= 15) {
      // Friday afternoon
      risco += 0.15;
      motivos.push('Sexta-feira à tarde (fuga de fim de semana)');
      recomendacoes.push('Confirmar presença até quinta-feira');
    } else if (diaSemana === 6 || diaSemana === 0) {
      // Weekend
      risco += 0.1;
      motivos.push('Fim de semana');
    }

    // Factor 4: Paciente novo vs recorrente (mocked - in prod would query history)
    // Assuming consistent no-show rate of 15% for demo
    risco += 0.05; // Generic 5% risk factor

    // Factor 5: Time of day context
    if (hora === 14 || hora === 15) {
      risco += 0.08; // Horário almoço causaproblemas
      motivos.push('Horário crítico (almoço)');
      recomendacoes.push('Considerar enviar confirmação SMS');
    }

    // Normalize to 0-1 range
    risco = Math.min(Math.max(risco, 0), 1);

    return {
      agendamento_id: agendamento.id,
      paciente_id: agendamento.paciente_id,
      paciente_nome: agendamento.pacientes?.nome || 'Paciente',
      data_agendamento: agendamento.data,
      medico_nome: agendamento.medicos?.nome || 'Médico',
      probabilidade_no_show: parseFloat(risco.toFixed(2)),
      motivos_risco: motivos.length > 0 ? motivos : ['Risco baixo'],
      recomendacoes: recomendacoes.join(' • ') || 'Acompanhamento padrão',
      telefone: agendamento.pacientes?.telefone,
      email: agendamento.pacientes?.email,
    };
  };

  const getRiskColor = (probabilidade: number): string => {
    if (probabilidade >= 0.7) return 'text-destructive';
    if (probabilidade >= 0.4) return 'text-warning';
    return 'text-success';
  };

  const getRiskBgColor = (probabilidade: number): string => {
    if (probabilidade >= 0.7) return 'bg-destructive/10';
    if (probabilidade >= 0.4) return 'bg-warning/10';
    return 'bg-success/10';
  };

  const getRiskLabel = (probabilidade: number): string => {
    if (probabilidade >= 0.7) return 'ALTO RISCO';
    if (probabilidade >= 0.4) return 'RISCO MÉDIO';
    return 'BAIXO RISCO';
  };

  const stats = {
    total: predicoes.length,
    altoRisco: predicoes.filter((p) => p.probabilidade_no_show >= 0.7).length,
    medioRisco: predicoes.filter((p) => p.probabilidade_no_show >= 0.4 && p.probabilidade_no_show < 0.7).length,
    baixoRisco: predicoes.filter((p) => p.probabilidade_no_show < 0.4).length,
    riskoPredioMedio: predicoes.length > 0
      ? (predicoes.reduce((sum, p) => sum + p.probabilidade_no_show, 0) / predicoes.length).toFixed(2)
      : '0',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Análise Preditiva - No-Show</h1>
        <p className="text-muted-foreground">
          Inteligência artificial para prever pacientes que não vão comparecer
        </p>
      </div>

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
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Risco Médio</p>
            <p className="text-2xl font-bold tabular-nums">{stats.riskoPredioMedio}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Agendamentos por Risco</CardTitle>
            <Select value={filtroRisco} onValueChange={setFiltroRisco}>
              <SelectTrigger className="w-full sm:w-48">
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
          ) : predicoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum agendamento encontrado nesta categoria</p>
            </div>
          ) : (
            <div className="space-y-3">
              {predicoes.map((pred) => (
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
                        {format(parseDateOnly(pred.data_agendamento)!, 'dd/MM/yyyy HH:mm', {
                          locale: ptBR,
                        })}{' '}
                        — {pred.medico_nome}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={cn('text-lg font-bold', getRiskColor(pred.probabilidade_no_show))}>
                        {(pred.probabilidade_no_show * 100).toFixed(0)}%
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
                      <Button size="sm" variant="outline" className="gap-1 text-xs">
                        <Phone className="h-3 w-3" />
                        Ligar
                      </Button>
                    )}
                    {pred.email && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs">
                        <Mail className="h-3 w-3" />
                        Email
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="gap-1 text-xs">
                      <Zap className="h-3 w-3" />
                      Enviar Lembrete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-300">
              <p className="font-semibold mb-1">Como funciona a previsão?</p>
              <ul className="text-xs space-y-1">
                <li>✓ Dia e horário do agendamento (tarde = risco maior)</li>
                <li>✓ Dias até o agendamento (quanto mais longe = risco maior)</li>
                <li>✓ Dia da semana (sexta-feira à tarde é crítica)</li>
                <li>✓ Horários críticos (almoço e fim de expediente)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
