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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDateOnly, todayDateOnly } from '@/lib/dateOnly';
import { toast } from 'sonner';

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

      const { data, error } = await (supabase as any).from('predicoes_no_show').select(`
        agendamento_id,paciente_id,probabilidade_no_show,motivos_risco,recomendacoes,updated_at,
        agendamentos!inner(data,hora_inicio,status,pacientes(nome,email,telefone),medicos(nome))
      `).eq('clinica_id', profile.clinica_id).gte('agendamentos.data', todayDateOnly())
        .order('probabilidade_no_show', { ascending: false });
      if (error) throw error;
      const predictions: PredictedNoShow[] = (data || []).map((row: any) => ({
        agendamento_id: row.agendamento_id,
        paciente_id: row.paciente_id,
        paciente_nome: row.agendamentos?.pacientes?.nome || 'Paciente',
        data_agendamento: row.agendamentos?.data,
        hora_inicio: row.agendamentos?.hora_inicio,
        medico_nome: row.agendamentos?.medicos?.nome || 'Médico',
        probabilidade_no_show: Number(row.probabilidade_no_show || 0),
        motivos_risco: row.motivos_risco || [],
        recomendacoes: row.recomendacoes || 'Lembrete padrão',
        telefone: row.agendamentos?.pacientes?.telefone,
        email: row.agendamentos?.pacientes?.email,
      }));

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

  const getRiskColor = (probabilidade: number): string => {
    if (probabilidade >= 0.7) return 'text-destructive';
    if (probabilidade >= 0.4) return 'text-warning';
    return 'text-success';
  };

  const enviarLembrete = async (agendamentoId: string) => {
    const { data, error } = await supabase.rpc('enfileirar_lembrete_risco' as any, {
      p_agendamento_id: agendamentoId,
    });
    if (error) {
      toast.error('Não foi possível enviar o lembrete', { description: error.message });
      return;
    }
    toast.success(data ? 'Lembrete enfileirado' : 'Lembrete já enviado nas últimas 20 horas');
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
        <h1 className="text-3xl font-bold text-foreground">Risco de Falta</h1>
        <p className="text-muted-foreground">
          Score operacional calculado com o histórico real de comparecimento
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
                        {format(parseDateOnly(pred.data_agendamento)!, 'dd/MM/yyyy', {
                          locale: ptBR,
                        })} às {pred.hora_inicio?.slice(0, 5)}{' '}
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
                      <Button size="sm" variant="outline" className="gap-1 text-xs" asChild>
                        <a href={`tel:${pred.telefone.replace(/[^0-9+]/g, '')}`}><Phone className="h-3 w-3" />Ligar</a>
                      </Button>
                    )}
                    {pred.email && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs" asChild>
                        <a href={`mailto:${pred.email}`}><Mail className="h-3 w-3" />Email</a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => enviarLembrete(pred.agendamento_id)}>
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
              <p className="font-semibold mb-1">Como funciona o score?</p>
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
