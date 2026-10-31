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
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
import { Activity, AlertTriangle, ArrowRight, Building2, Users, Calendar, Search, RefreshCw, ServerCrash } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';

type FiltroRapido = 'todas' | 'alertas' | 'sem_uso' | 'trial';

const semUsoRecente = (c: LinhaSaude) => c.ultima_atividade_ha_dias == null || c.ultima_atividade_ha_dias > 7;
const filtrosRapidos: Record<FiltroRapido, { label: string; teste: (c: LinhaSaude) => boolean }> = {
  todas: { label: 'Todas', teste: () => true },
  alertas: { label: 'Com alertas', teste: (c) => scoreAlertas(c) >= 5 },
  sem_uso: { label: 'Sem uso há 7+ dias', teste: semUsoRecente },
  trial: { label: 'Em trial', teste: (c) => c.em_trial },
};

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
  const refreshLock = useRef(false);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<FiltroRapido>('todas');
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
    let lista = (clinicas.data ?? []).filter(filtrosRapidos[filtro].teste);
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
  }, [clinicas.data, search, ordem, filtro]);

  const todas = clinicas.data ?? [];
  const contagem = (f: FiltroRapido) => todas.filter(filtrosRapidos[f].teste).length;
  const temFiltro = search.trim() !== '' || filtro !== 'todas';
  const descricao = clinicas.data
    ? `${todas.length} clínicas · ${contagem('alertas')} com alertas · ${contagem('sem_uso')} sem uso há mais de 7 dias`
    : 'Como o SaaS está agora, e como cada clínica está usando';

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
      <div>
        <PageHeader
          title="Saúde da plataforma"
          icon={<Activity />}
          description={descricao}
          actions={<>
            <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/incidentes"><AlertTriangle className="h-4 w-4" />Incidentes</Link></Button>
            <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/erros"><ServerCrash className="h-4 w-4" />Logs e erros</Link></Button>
            <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => void atualizar()} disabled={refreshing} aria-label="Atualizar">
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </Button>
          </>}
        />
        {dadosAtualizadosEm > 0 && <p className="mt-2 text-xs text-muted-foreground">Indicadores atualizados: {formatarDataHora(new Date(dadosAtualizadosEm).toISOString())} · atualização automática a cada minuto</p>}
      </div>

      <Card className="rounded-2xl border-border/60 shadow-xs">
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
              {integracoes.data.checks.map(check => <div key={check.id} className={cn('rounded-xl border border-border/60 bg-[#F3F8FC]/60 p-3', check.status === 'error' && 'border-destructive/40 bg-destructive/5')}><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{check.nome}</p><Badge variant={check.status === 'error' ? 'destructive' : 'outline'} className={cn('rounded-full', check.status === 'ok' && 'text-success border-success/30', check.status === 'warning' && 'text-warning border-warning/30')}>{check.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{check.detalhe}</p>{check.latencia_ms != null && <p className="mt-1 text-[10px] text-muted-foreground">{check.latencia_ms} ms</p>}</div>)}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">A verificação não retornou serviços para exibir.</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Cards agregados ─── */}
      {agregada.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div>
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
        ].map((c, i) => (
          <Card key={c.label} className={cn('rounded-2xl border-border/60 shadow-xs', i === 0 && 'border-transparent bg-gradient-primary text-white')}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', i === 0 ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary')}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums">{c.valor}</p>
                <p className={cn('text-[11px] font-medium', i === 0 ? 'text-white/80' : 'text-muted-foreground')}>{c.label}</p>
                <p className={cn('text-[10px]', i === 0 ? 'text-white/70' : 'text-muted-foreground/70')}>{c.detalhe}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      {/* ─── Filtro e ordenação ─── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar clínica..." aria-label="Buscar clínica" className="h-10 rounded-full pl-9 focus-visible:ring-primary" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 text-muted-foreground">Ordenar:</span>
            {(['atividade', 'alertas', 'nome'] as const).map((o) => (
              <PilulaFiltro key={o} ativo={ordem === o} onClick={() => setOrdem(o)}>
                {o === 'atividade' ? 'Última atividade' : o === 'alertas' ? 'Mais alertas' : 'Nome'}
              </PilulaFiltro>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(filtrosRapidos) as FiltroRapido[]).map((f) => (
            <PilulaFiltro key={f} ativo={filtro === f} onClick={() => setFiltro(f)}>
              {filtrosRapidos[f].label}{clinicas.data ? ` (${contagem(f)})` : ''}
            </PilulaFiltro>
          ))}
          {temFiltro && (
            <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={() => { setSearch(''); setFiltro('todas'); }}>
              Limpar filtros
            </Button>
          )}
          {clinicas.data && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{filtradas.length} de {todas.length}</span>}
        </div>
      </div>

      {/* ─── Tabela por clínica ─── */}
      {clinicas.isError ? (
        <ErrorState compact error={clinicas.error} onRetry={() => void clinicas.refetch()} />
      ) : clinicas.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}</div>
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhuma clínica"
          description={temFiltro ? 'Ninguém correspondeu ao filtro.' : 'Ainda não há clínicas cadastradas na plataforma.'}
          action={temFiltro ? { label: 'Limpar filtros', onClick: () => { setSearch(''); setFiltro('todas'); } } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtradas.map((c) => (
            <Card key={c.clinica_id} className={cn(
              'rounded-2xl border-border/60 shadow-xs transition-shadow hover:shadow-md',
              c.arquivada && 'opacity-50',
              scoreAlertas(c) >= 5 && 'border-destructive/40',
            )}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{c.clinica_nome}</p>
                      {c.em_trial && <Badge variant="outline" className="rounded-full border-border text-[10px] text-primary">Trial</Badge>}
                      {c.assinatura_status === 'ativa' && <Badge className="rounded-full bg-success/15 text-[10px] text-success hover:bg-success/15">Ativa</Badge>}
                      {c.suspensa && <Badge variant="destructive" className="rounded-full text-[10px]">Suspensa</Badge>}
                      {c.arquivada && <Badge variant="outline" className="rounded-full text-[10px]">Arquivada</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Última atividade: {formatarDias(c.ultima_atividade_ha_dias)} · {c.total_pacientes} pacientes · {c.total_agendamentos_no_mes} agend/mês · {c.audits_no_mes} audits/mês
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="h-9 gap-1 rounded-full text-xs">
                    <Link to="/admin/clinicas">Ver na lista<ArrowRight className="h-3.5 w-3.5" /></Link>
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
    <div className={cn('rounded-xl px-2.5 py-2', tom)} title={ajuda}>
      <p className="text-lg font-bold tabular-nums leading-tight">{valor}</p>
      <p className="text-[10px] font-medium leading-tight opacity-80">{label}</p>
    </div>
  );
}

function PilulaFiltro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-[#DCE6F2] bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
