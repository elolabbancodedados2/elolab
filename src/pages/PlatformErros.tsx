import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Search, ServerCrash, Workflow } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type ClientError = {
  id: string;
  clinica_id: string | null;
  tipo: string;
  mensagem: string;
  origem: string | null;
  rota: string | null;
  release: string | null;
  fingerprint: string | null;
  status: 'open' | 'resolved' | 'ignored';
  created_at: string;
};

type AutomationError = {
  id: string;
  clinica_id: string | null;
  tipo: string;
  nome: string;
  status: string;
  erro_mensagem: string | null;
  created_at: string;
};

type ErrorMetrics = { open: number; frontend24h: number; automation24h: number };

const statusLabel = { open: 'Aberto', resolved: 'Resolvido', ignored: 'Ignorado' };

export default function PlatformErros() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('open');
  const [mostrarMaisAutomacoes, setMostrarMaisAutomacoes] = useState(false);
  const [atualizandoGrupo, setAtualizandoGrupo] = useState<string | null>(null);
  const updateLock = useRef(false);

  const errosCliente = useQuery({
    queryKey: ['platform-client-errors'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_error_events')
        .select('id,clinica_id,tipo,mensagem,origem,rota,release,fingerprint,status,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as ClientError[];
    },
  });

  const errosAutomacao = useQuery({
    queryKey: ['platform-automation-errors'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('automation_logs')
        .select('id,clinica_id,tipo,nome,status,erro_mensagem,created_at')
        .in('status', ['erro', 'parcial'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as AutomationError[];
    },
  });

  const metricas = useQuery({
    queryKey: ['platform-error-metrics'],
    queryFn: async () => {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [open, frontend24h, automation24h] = await Promise.all([
        (supabase as any).from('client_error_events').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        (supabase as any).from('client_error_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
        (supabase as any).from('automation_logs').select('id', { count: 'exact', head: true }).in('status', ['erro', 'parcial']).gte('created_at', since),
      ]);
      const failed = [open, frontend24h, automation24h].find((result) => result.error);
      if (failed?.error) throw failed.error;
      return { open: open.count || 0, frontend24h: frontend24h.count || 0, automation24h: automation24h.count || 0 } as ErrorMetrics;
    },
    refetchInterval: 60_000,
  });

  const grupos = useMemo(() => {
    const agrupados = new Map<string, ClientError[]>();
    for (const erro of errosCliente.data || []) {
      if (filtro !== 'all' && erro.status !== filtro) continue;
      const termo = busca.trim().toLowerCase();
      if (termo && !`${erro.mensagem} ${erro.rota || ''} ${erro.tipo}`.toLowerCase().includes(termo)) continue;
      const fingerprint = erro.fingerprint || `${erro.tipo}:${erro.mensagem}:${erro.rota || ''}`;
      const chave = `${fingerprint}:${erro.status}`;
      agrupados.set(chave, [...(agrupados.get(chave) || []), erro]);
    }
    return [...agrupados.values()].sort(
      (a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime(),
    );
  }, [busca, errosCliente.data, filtro]);

  const atualizarGrupo = async (grupo: ClientError[], status: 'resolved' | 'ignored') => {
    if (updateLock.current || !grupo.length || grupo.some((erro) => erro.status !== 'open')) return;
    updateLock.current = true;
    const ids = grupo.map((erro) => erro.id);
    const groupKey = `${grupo[0].fingerprint || grupo[0].id}:open`;
    setAtualizandoGrupo(groupKey);
    try {
      const { error } = await (supabase as any)
        .from('client_error_events')
        .update({
          status,
          resolved_at: status === 'resolved' ? new Date().toISOString() : null,
          resolved_by: user?.id,
          resolution_note: status === 'ignored' ? 'Ignorado pela administração da plataforma' : 'Resolvido pela administração da plataforma',
        })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} ocorrência(s) atualizada(s)`);
      await queryClient.invalidateQueries({ queryKey: ['platform-client-errors'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-error-metrics'] });
    } catch (error) {
      toast.error('Não foi possível atualizar o grupo.', { description: mensagemDeErro(error) });
    } finally {
      updateLock.current = false;
      setAtualizandoGrupo(null);
    }
  };

  const atualizar = () => {
    void errosCliente.refetch();
    void errosAutomacao.refetch();
    void metricas.refetch();
  };
  const automacoes = errosAutomacao.data || [];
  const automacoesVisiveis = mostrarMaisAutomacoes ? automacoes : automacoes.slice(0, 30);
  const atualizando = errosCliente.isFetching || errosAutomacao.isFetching || metricas.isFetching;
  const temFiltro = busca.trim() !== '' || filtro !== 'open';
  const ocorrenciasFiltradas = grupos.reduce((total, grupo) => total + grupo.length, 0);
  const limparFiltros = () => { setBusca(''); setFiltro('open'); };
  const indicadores = [
    { label: 'Erros abertos', value: metricas.data?.open, icon: ServerCrash, filtra: true },
    { label: 'Frontend nas últimas 24h', value: metricas.data?.frontend24h, icon: Activity, filtra: false },
    { label: 'Falhas e parciais nas últimas 24h', value: metricas.data?.automation24h, icon: Workflow, filtra: false },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs e Erros"
        icon={<ServerCrash />}
        description={metricas.data
          ? `${metricas.data.open} erros abertos · ${metricas.data.frontend24h} no app nas últimas 24h · ${metricas.data.automation24h} falhas de automação nas últimas 24h`
          : 'Incidentes reais do frontend e das automações da plataforma.'}
        actions={<>
          <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/filas"><Workflow className="h-4 w-4" />Filas e webhooks</Link></Button>
          <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/incidentes"><AlertTriangle className="h-4 w-4" />Incidentes</Link></Button>
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={atualizar} disabled={atualizando} aria-label="Atualizar">
            <RefreshCw className={cn('h-4 w-4', atualizando && 'animate-spin')} />
          </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {indicadores.map(({ label, value, icon: Icon, filtra }, i) => {
          const destaque = i === 0;
          const conteudo = (
            <>
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', destaque ? 'bg-white/20 text-white' : 'bg-destructive/10 text-destructive')}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-2xl font-bold tabular-nums">{metricas.isError ? '—' : value ?? '…'}</span>
                <span className={cn('block text-[11px]', destaque ? 'text-white/80' : 'text-muted-foreground')}>{label}</span>
                <span className={cn('block text-[10px]', destaque ? 'text-white/70' : 'text-muted-foreground/70')}>{metricas.isError ? 'indisponível' : 'ocorrências'}</span>
              </span>
            </>
          );
          const classe = cn(
            'flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs',
            destaque && 'col-span-2 border-transparent bg-gradient-primary text-white sm:col-span-1',
          );
          return filtra ? (
            <button key={label} type="button" aria-pressed={filtro === 'open'} onClick={() => setFiltro('open')} className={cn(classe, 'transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>{conteudo}</button>
          ) : (
            <div key={label} className={classe}>{conteudo}</div>
          );
        })}
      </div>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader><CardTitle>Erros do aplicativo</CardTitle><p className="text-sm text-muted-foreground">A lista contém até 500 ocorrências mais recentes; os indicadores acima contam o total correspondente.</p></CardHeader>
        <CardContent className="space-y-3">
          {errosCliente.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : errosCliente.error ? <ErrorState error={errosCliente.error} onRetry={() => { void errosCliente.refetch(); }} /> : <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar mensagem, rota ou tipo" aria-label="Buscar mensagem, rota ou tipo" className="h-10 rounded-full pl-9 focus-visible:ring-primary" />
            </div>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="h-10 w-full rounded-full sm:w-44" aria-label="Filtrar status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
                <SelectItem value="ignored">Ignorados</SelectItem>
              </SelectContent>
            </Select>
            {temFiltro && <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={limparFiltros}>Limpar filtros</Button>}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{ocorrenciasFiltradas} de {errosCliente.data?.length ?? 0} ocorrências</span>
          </div>

          {grupos.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><CheckCircle2 className="h-6 w-6" /></span>
              <p className="font-medium text-foreground">Nenhum erro corresponde aos filtros.</p>
              <p className="max-w-sm text-sm text-muted-foreground">{temFiltro ? 'Ajuste a busca ou o status para ver outras ocorrências.' : 'Não há erros abertos no aplicativo agora.'}</p>
              {temFiltro && <Button variant="outline" className="rounded-full" onClick={limparFiltros}>Limpar filtros</Button>}
            </div>
          ) : grupos.map((grupo) => {
            const erro = grupo[0];
            return (
              <div key={`${erro.fingerprint || erro.id}:${erro.status}`} className={cn('space-y-2 rounded-xl border border-border/60 p-3', erro.status === 'open' && 'border-l-4 border-l-destructive/60')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={erro.status === 'open' ? 'destructive' : 'outline'} className="rounded-full">{statusLabel[erro.status]}</Badge>
                      <Badge variant="outline" className="rounded-full border-border text-primary">{grupo.length} ocorrência(s)</Badge>
                      <span className="text-xs text-muted-foreground">{erro.tipo}</span>
                    </div>
                    <p className="mt-2 break-words text-sm font-medium">{erro.mensagem}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{erro.rota || 'Rota desconhecida'} · {new Date(erro.created_at).toLocaleString('pt-BR')} · release {erro.release || 'não informada'}</p>
                  </div>
                  {erro.status === 'open' && <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={atualizandoGrupo !== null} onClick={() => atualizarGrupo(grupo, 'ignored')}>Ignorar</Button>
                    <Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" disabled={atualizandoGrupo !== null} onClick={() => atualizarGrupo(grupo, 'resolved')}>{atualizandoGrupo === `${erro.fingerprint || erro.id}:open` ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}Resolver</Button>
                  </div>}
                </div>
              </div>
            );
          })}
          </>}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle>Falhas de automação recentes</CardTitle>
          <p className="text-sm text-muted-foreground">Exibindo {automacoesVisiveis.length} de {automacoes.length} falhas carregadas, das até 200 mais recentes.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {errosAutomacao.isLoading ? <Skeleton className="h-32 w-full rounded-xl" /> : errosAutomacao.error ? <ErrorState error={errosAutomacao.error} onRetry={() => { void errosAutomacao.refetch(); }} /> : <>
          {automacoesVisiveis.map((erro) => (
            <div key={erro.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3">
              <div><p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-destructive" />{erro.nome}</p><p className="text-xs text-muted-foreground">{erro.tipo} · clínica {erro.clinica_id || 'não identificada'} · {new Date(erro.created_at).toLocaleString('pt-BR')}</p><p className="mt-1 break-words text-xs">{erro.erro_mensagem || 'Execução parcial sem mensagem'}</p></div>
              <Badge variant={erro.status === 'erro' ? 'destructive' : 'outline'} className="rounded-full">{erro.status}</Badge>
            </div>
          ))}
          {automacoes.length > 30 && <Button variant="outline" size="sm" className="min-h-11 rounded-full" onClick={() => setMostrarMaisAutomacoes((current) => !current)}>{mostrarMaisAutomacoes ? 'Mostrar somente as 30 mais recentes' : `Mostrar mais ${automacoes.length - 30} falhas`}</Button>}
          {automacoes.length === 200 && <p role="status" className="text-xs text-muted-foreground">A consulta atingiu o limite de 200 falhas recentes; registros anteriores não aparecem nesta tela.</p>}
          {!errosAutomacao.data?.length && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><CheckCircle2 className="h-6 w-6" /></span>
              <p className="text-sm text-muted-foreground">Nenhuma falha de automação registrada.</p>
              <Button asChild variant="outline" className="rounded-full"><Link to="/admin/filas">Ver filas e webhooks</Link></Button>
            </div>
          )}
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
