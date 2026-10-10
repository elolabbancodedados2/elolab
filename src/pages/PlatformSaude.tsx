/**
 * Dashboard de saúde do SaaS para a dona.
 *
 * Duas perguntas que este painel responde:
 *   1. Como o SaaS está no total? (topo: cards agregados)
 *   2. Como cada clínica está? (tabela: uma linha por clínica com
 *      alertas coloridos quando algum indicador estoura o normal)
 *
 * Consome:
 *   - view `platform_saude_agregada` (topo)
 *   - RPC `platform_get_clinicas_saude` (tabela)
 *
 * Ambos criados na migration 20260817210000. Acesso restrito a
 * `is_platform_admin` — a RPC recusa por dentro; a rota exige
 * `superAdminOnly` no menu.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle, Building2, Users, Calendar, Search, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

interface LinhaSaude {
  clinica_id: string;
  clinica_nome: string;
  assinatura_status: string;
  em_trial: boolean;
  plano_nome: string;
  suspensa: boolean;
  arquivada: boolean;
  ultima_atividade: string | null;
  ultima_atividade_ha_dias: number | null;
  agendamentos_em_atendimento: number;
  coletas_esquecidas: number;
  exames_solicitados_ha_7d: number;
  contas_a_receber_vencidas: number;
  contas_a_receber_valor: number;
  total_pacientes: number;
  total_agendamentos_no_mes: number;
  audits_no_mes: number;
}

/** Retorna a variante do badge por severidade do indicador. */
function tomAlerta(n: number, atencao: number, critico: number): string {
  if (n >= critico) return 'bg-destructive/10 text-destructive';
  if (n >= atencao) return 'bg-warning/10 text-warning';
  if (n > 0) return 'bg-muted text-muted-foreground';
  return 'bg-success/5 text-success/70';
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataHora(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'horário indisponível' : date.toLocaleString('pt-BR');
}

function formatarDias(dias: number | null): string {
  if (dias == null) return 'nunca usou';
  if (dias === 0) return 'hoje';
  if (dias === 1) return '1 dia';
  return `${dias} dias`;
}

export default function PlatformSaude() {
  const { isPlatformAdmin } = useSupabaseAuth();
  const navigate = useNavigate();
  const refreshLock = useRef(false);
  const [search, setSearch] = useState('');
  const [ordem, setOrdem] = useState<'atividade' | 'alertas' | 'nome'>('atividade');

  const agregada = useQuery({
    queryKey: ['platform-saude-agregada'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_saude_agregada' as never).select('*').maybeSingle();
      if (error) throw error;
      return data as unknown as {
        total_clinicas: number;
        clinicas_ativas: number;
        clinicas_em_trial: number;
        clinicas_arquivadas: number;
        total_pacientes: number;
        agendamentos_no_mes: number;
        audits_ultimos_7d: number;
      } | null;
    },
    enabled: isPlatformAdmin,
    refetchInterval: 60_000,
  });

  const clinicas = useQuery({
    queryKey: ['platform-saude-clinicas'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_get_clinicas_saude');
      if (error) throw error;
      return (data ?? []) as LinhaSaude[];
    },
    enabled: isPlatformAdmin,
    refetchInterval: 60_000,
  });

  const integracoes = useQuery({
    queryKey: ['platform-integration-health'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('integration-health');
      if (error) throw error;
      return data as { checked_at: string; overall: string; checks: Array<{ id: string; nome: string; status: 'ok'|'warning'|'error'; detalhe: string; latencia_ms?: number }> };
    },
    enabled: isPlatformAdmin,
    refetchInterval: 60_000,
  });

  const refreshing = agregada.isFetching || clinicas.isFetching || integracoes.isFetching;
  const dadosAtualizadosEm = Math.max(agregada.dataUpdatedAt, clinicas.dataUpdatedAt);
  const atualizarDiagnostico = async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      await integracoes.refetch();
    } finally {
      refreshLock.current = false;
    }
  };
  const atualizar = async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      await Promise.all([agregada.refetch(), clinicas.refetch(), integracoes.refetch()]);
    } finally {
      refreshLock.current = false;
    }
  };

  const filtradas = useMemo(() => {
    const busca = search.trim().toLowerCase();
    let lista = clinicas.data ?? [];
    if (busca) {
      lista = lista.filter(c => c.clinica_nome.toLowerCase().includes(busca));
    }
    if (ordem === 'nome') {
      lista = [...lista].sort((a, b) => a.clinica_nome.localeCompare(b.clinica_nome));
    } else if (ordem === 'alertas') {
      lista = [...lista].sort((a, b) => scoreAlertas(b) - scoreAlertas(a));
    }
    // 'atividade' vem já ordenado pela RPC
    return lista;
  }, [clinicas.data, search, ordem]);

  if (!isPlatformAdmin) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Acesso restrito"
        description="Este painel é da administração do SaaS."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Saúde da plataforma
          </h1>
          <p className="text-muted-foreground">Como o SaaS está agora, e como cada clínica está usando</p>
          {dadosAtualizadosEm > 0 && <p className="mt-1 text-xs text-muted-foreground">Indicadores atualizados: {formatarDataHora(new Date(dadosAtualizadosEm).toISOString())} · atualização automática a cada minuto</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => void atualizar()} disabled={refreshing}>
          <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrações e serviços</CardTitle>
          {integracoes.data?.checked_at && <p className="text-xs text-muted-foreground">Última verificação: {formatarDataHora(integracoes.data.checked_at)}</p>}
        </CardHeader>
        <CardContent>
          {integracoes.isLoading ? (
            <p role="status" className="py-4 text-sm text-muted-foreground">Verificando integrações e serviços…</p>
          ) : integracoes.isError ? (
            <ErrorState compact title="Não foi possível executar o diagnóstico das integrações" error={integracoes.error} onRetry={() => void atualizarDiagnostico()} />
          ) : integracoes.data?.checks?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {integracoes.data.checks.map(check => <div key={check.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{check.nome}</p><Badge variant={check.status === 'error' ? 'destructive' : 'outline'} className={cn(check.status === 'ok' && 'text-success border-success/30', check.status === 'warning' && 'text-warning border-warning/30')}>{check.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{check.detalhe}</p>{check.latencia_ms != null && <p className="mt-1 text-[10px] text-muted-foreground">{check.latencia_ms} ms</p>}</div>)}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">A verificação não retornou serviços para exibir.</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Cards agregados ─── */}
      {agregada.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24" />)}</div>
      ) : agregada.isError ? (
        <ErrorState error={agregada.error} onRetry={() => void agregada.refetch()} />
      ) : agregada.data && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Building2, label: 'Assinaturas ativas', valor: agregada.data?.clinicas_ativas ?? 0,
            detalhe: `${agregada.data?.total_clinicas ?? 0} total · ${agregada.data?.clinicas_em_trial ?? 0} em trial` },
          { icon: Users, label: 'Pacientes', valor: agregada.data?.total_pacientes ?? 0, detalhe: 'em todo o SaaS' },
          { icon: Calendar, label: 'Agendamentos no mês', valor: agregada.data?.agendamentos_no_mes ?? 0, detalhe: 'total no banco, inclusive clínicas arquivadas' },
          { icon: Activity, label: 'Auditoria 7d', valor: agregada.data?.audits_ultimos_7d ?? 0,
            detalhe: 'ações registradas na última semana' },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{c.valor}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{c.label}</p>
                <p className="text-[10px] text-muted-foreground/70">{c.detalhe}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      {/* ─── Filtro e ordenação ─── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar clínica..." className="pl-9" />
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground mr-1">Ordenar:</span>
          {(['atividade', 'alertas', 'nome'] as const).map((o) => (
            <Button key={o} size="sm" variant={ordem === o ? 'default' : 'outline'}
              className="h-7 text-xs" onClick={() => setOrdem(o)}>
              {o === 'atividade' ? 'Última atividade' : o === 'alertas' ? 'Mais alertas' : 'Nome'}
            </Button>
          ))}
        </div>
      </div>

      {/* ─── Tabela por clínica ─── */}
      {clinicas.isError ? (
        <ErrorState compact error={clinicas.error} onRetry={() => void clinicas.refetch()} />
      ) : clinicas.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhuma clínica" description="Ninguém correspondeu ao filtro." />
      ) : (
        <div className="space-y-2">
          {filtradas.map((c) => (
            <Card key={c.clinica_id} className={cn(
              'hover:shadow-md transition-shadow',
              c.arquivada && 'opacity-50',
              scoreAlertas(c) >= 5 && 'border-destructive/40',
            )}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{c.clinica_nome}</p>
                      {c.em_trial && <Badge variant="secondary" className="text-[10px]">Trial</Badge>}
                      {c.assinatura_status === 'ativa' && <Badge className="text-[10px] bg-success/15 text-success">Ativa</Badge>}
                      {c.suspensa && <Badge variant="destructive" className="text-[10px]">Suspensa</Badge>}
                      {c.arquivada && <Badge variant="outline" className="text-[10px]">Arquivada</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Última atividade: {formatarDias(c.ultima_atividade_ha_dias)} · {c.total_pacientes} pacientes · {c.total_agendamentos_no_mes} agend/mês · {c.audits_no_mes} audits/mês
                    </p>
                  </div>
                  <Button size="sm" variant="outline"
                    onClick={() => navigate('/admin/clinicas')}>
                    Ver na lista
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                  <IndicadorCelula label="Atendimento aberto"
                    valor={c.agendamentos_em_atendimento}
                    tom={tomAlerta(c.agendamentos_em_atendimento, 1, 5)}
                    ajuda="Agora — deveria zerar no fim do expediente" />
                  <IndicadorCelula label="Coletas esquecidas"
                    valor={c.coletas_esquecidas}
                    tom={tomAlerta(c.coletas_esquecidas, 5, 30)}
                    ajuda=">15 dias em pendente/coletado/em análise" />
                  <IndicadorCelula label="Exames sem coleta há 7d"
                    valor={c.exames_solicitados_ha_7d}
                    tom={tomAlerta(c.exames_solicitados_ha_7d, 5, 30)}
                    ajuda="Solicitados e nunca movimentaram" />
                  <IndicadorCelula label={`Contas vencidas · ${formatarBRL(Number(c.contas_a_receber_valor) || 0)}`}
                    valor={c.contas_a_receber_vencidas}
                    tom={tomAlerta(c.contas_a_receber_vencidas, 3, 20)}
                    ajuda="Receita em aberto com vencimento passado" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** Somatório grosseiro de severidade para ordenação por "mais alertas". */
function scoreAlertas(c: LinhaSaude): number {
  return c.agendamentos_em_atendimento
    + c.coletas_esquecidas
    + c.exames_solicitados_ha_7d
    + c.contas_a_receber_vencidas
    + (c.ultima_atividade_ha_dias == null || c.ultima_atividade_ha_dias > 7 ? 10 : 0);
}

interface IndicadorProps {
  label: string;
  valor: number;
  tom: string;
  ajuda: string;
}

function IndicadorCelula({ label, valor, tom, ajuda }: IndicadorProps) {
  return (
    <div className={cn('rounded-lg px-2.5 py-2', tom)} title={ajuda}>
      <p className="text-lg font-bold tabular-nums leading-tight">{valor}</p>
      <p className="text-[10px] font-medium leading-tight opacity-80">{label}</p>
    </div>
  );
}
