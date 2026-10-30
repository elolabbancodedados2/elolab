import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, History, RefreshCw } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { CAMPOS_TRILHA, formatarValorTrilha } from '@/lib/trilhaLancamento';

type HistoryRow = Database['public']['Functions']['historico_alteracoes_lancamento']['Returns'][number];
type HistoryRouteState = { returnTo?: unknown; returnState?: unknown; rotulos?: unknown };

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function HistoricoLancamentoPage() {
  const { lancamentoId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const routeState = (location.state ?? {}) as HistoryRouteState;
  const returnTo = typeof routeState.returnTo === 'string' && routeState.returnTo.startsWith('/contas')
    ? routeState.returnTo
    : '/contas?tab=pagar';
  const rotulos = routeState.rotulos && typeof routeState.rotulos === 'object'
    ? routeState.rotulos as Record<string, string>
    : {};

  const account = useQuery({
    queryKey: ['conta-pagar-historico-contexto', profile?.clinica_id ?? null, lancamentoId],
    enabled: Boolean(profile?.clinica_id && lancamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('id, descricao, valor, data_vencimento')
        .eq('id', lancamentoId!)
        .eq('clinica_id', profile!.clinica_id!)
        .eq('tipo', 'despesa')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const history = useQuery({
    queryKey: ['historico-lancamento', profile?.clinica_id ?? null, lancamentoId],
    enabled: Boolean(profile?.clinica_id && lancamentoId && account.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('historico_alteracoes_lancamento', { p_lancamento_id: lancamentoId! });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });

  const goBack = () => navigate(returnTo, { state: routeState.returnState });
  const retry = () => {
    void account.refetch().then((result) => {
      if (result.data?.id) void history.refetch();
    });
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 pb-24 sm:px-6 md:pb-6">
      <PageHeader
        title="Histórico de alterações"
        description={account.data
          ? `${account.data.descricao || 'Conta a pagar'} · vencimento, valor, categoria e centro de custo`
          : 'Trilha de auditoria da conta a pagar, com autor e data de cada alteração.'}
        icon={<History />}
        actions={<Button type="button" variant="outline" className="min-h-10 gap-2" onClick={goBack}><ArrowLeft className="h-4 w-4" />Voltar às contas</Button>}
      />

      {account.isLoading && <div role="status" className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>}

      {account.isError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar a conta</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            A trilha não foi consultada. Verifique a conexão e tente novamente.
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={retry}><RefreshCw className="h-4 w-4" />Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}

      {!account.isLoading && !account.isError && !account.data && (
        <Alert>
          <AlertTitle>Conta indisponível</AlertTitle>
          <AlertDescription>Esta conta não existe, não é uma conta a pagar ou não está disponível na clínica ativa.</AlertDescription>
        </Alert>
      )}

      {account.data && (
        <section aria-label="Dados da conta" className="grid gap-3 border-y border-border py-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Descrição</p><p className="mt-1 font-medium">{account.data.descricao || 'Conta a pagar'}</p></div>
          <div><p className="text-xs text-muted-foreground">Valor atual</p><p className="mt-1 font-medium tabular-nums">{formatCurrency(Number(account.data.valor))}</p></div>
          <div><p className="text-xs text-muted-foreground">Vencimento atual</p><p className="mt-1 font-medium">{account.data.data_vencimento ? new Date(`${account.data.data_vencimento}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}</p></div>
        </section>
      )}

      {account.data && history.isLoading && <div role="status" className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-56 w-full" /></div>}

      {account.data && history.isError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o histórico</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            Nenhuma alteração foi feita. Tente carregar a trilha novamente.
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void history.refetch()}><RefreshCw className="h-4 w-4" />Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}

      {account.data && !history.isLoading && !history.isError && history.data?.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma alteração de vencimento, valor, categoria ou centro de custo foi registrada.</p>
      )}

      {account.data && !history.isLoading && !history.isError && (history.data?.length ?? 0) > 0 && (
        <div className="overflow-x-auto border-y border-border">
          <Table>
            <caption className="sr-only">Alterações registradas para esta conta a pagar</caption>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Usuário</TableHead><TableHead>Campo</TableHead><TableHead>Antes</TableHead><TableHead>Depois</TableHead></TableRow></TableHeader>
            <TableBody>{history.data!.map((row, index) => (
              <TableRow key={`${row.alterado_em}-${row.campo}-${index}`}>
                <TableCell className="whitespace-nowrap">{formatDate(row.alterado_em)}</TableCell>
                <TableCell>{row.alterado_por_nome || 'Sistema'}</TableCell>
                <TableCell>{CAMPOS_TRILHA[row.campo] ?? row.campo}</TableCell>
                <TableCell className="tabular-nums">{formatarValorTrilha(row.campo, row.valor_anterior, rotulos)}</TableCell>
                <TableCell className="tabular-nums">{formatarValorTrilha(row.campo, row.valor_novo, rotulos)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
