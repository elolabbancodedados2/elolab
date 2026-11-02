import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Repeat, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useConfirmacao } from '@/hooks/useConfirmacao';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference } from '@/lib/datePreference';
import { formatarMoeda } from '@/lib/dinheiro';
import { mensagemDeErro } from '@/lib/erros';
import { invalidarFinanceiro } from '@/lib/invalidarFinanceiro';
import { rotuloCategoriaCadastro, rotuloFrequencia } from '@/lib/financeiroRotulos';
import { seriesRecorrentes, type LancamentoRecorrente } from '@/lib/recorrencias';
import { cn } from '@/lib/utils';

const dataBr = (valor: string | null) => {
  const data = valor ? parseDateOnly(valor) : null;
  return data ? formatWithDatePreference(data, 'dd/MM/yyyy') : '—';
};

/** Contas recorrentes da clínica: próximo vencimento, valor e encerramento da série. */
export default function RecorrenciasFinanceiras() {
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmar, dialogo] = useConfirmacao();
  const [encerrando, setEncerrando] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['recorrencias-financeiras', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      // As ocorrências antigas também entram, para contar a série inteira.
      const [marcadas, ocorrencias] = await Promise.all([
        buscarEmBlocos<LancamentoRecorrente>(() => supabase.from('lancamentos')
          .select('id, tipo, descricao, valor, categoria, fornecedor, status, data_vencimento, frequencia_recorrencia, recorrencia_origem_id, recorrente')
          .eq('clinica_id', clinicaId!).eq('recorrente', true).order('id')),
        buscarEmBlocos<LancamentoRecorrente>(() => supabase.from('lancamentos')
          .select('id, tipo, descricao, valor, categoria, fornecedor, status, data_vencimento, frequencia_recorrencia, recorrencia_origem_id, recorrente')
          .eq('clinica_id', clinicaId!).not('recorrencia_origem_id', 'is', null).order('id')),
      ]);
      return [...new Map([...marcadas, ...ocorrencias].map(l => [l.id, l] as const)).values()];
    },
  });
  const series = useMemo(() => seriesRecorrentes(query.data ?? []), [query.data]);
  const hoje = todaySaoPauloDateOnly();
  const totalMensal = series.filter(s => s.atual.tipo === 'despesa').reduce((t, s) => t + s.totalMensalEstimado, 0);

  const encerrar = async (serie: (typeof series)[number]) => {
    const ok = await confirmar({
      titulo: 'Encerrar recorrência',
      descricao: `"${serie.atual.descricao}" deixa de gerar novas contas. ${serie.emAberto ? 'A conta em aberto continua na lista de contas a pagar.' : 'Nenhuma conta já criada é apagada.'}`,
      confirmar: 'Encerrar recorrência',
      variante: 'warning',
    });
    if (!ok || !clinicaId) return;
    setEncerrando(serie.atual.id);
    try {
      const { data, error } = await supabase.from('lancamentos')
        .update({ recorrente: false })
        .eq('id', serie.atual.id).eq('clinica_id', clinicaId).eq('recorrente', true)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('A recorrência já foi alterada. Atualize a lista.');
      toast.success('Recorrência encerrada.');
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setEncerrando(null);
      void invalidarFinanceiro(queryClient);
    }
  };

  const novaConta = <Button onClick={() => navigate('/contas/pagar/nova', { state: { returnTo: '/contas?tab=pagar' } })} className="gap-2"><Plus aria-hidden="true" className="h-4 w-4" />Nova conta recorrente</Button>;

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Contas recorrentes"
        description={series.length ? `${series.length} ${series.length === 1 ? 'série ativa' : 'séries ativas'} · cerca de ${formatarMoeda(totalMensal)} por mês em despesas` : 'Despesas que se repetem e geram a próxima conta ao serem pagas.'}
        icon={<Repeat />}
        actions={novaConta}
      />
      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : query.isError ? (
        <ErrorState title="Não foi possível carregar as recorrências" error={query.error} onRetry={() => void query.refetch()} />
      ) : series.length === 0 ? (
        <EmptyState icon={Repeat} title="Nenhuma conta recorrente" description="Ao cadastrar uma conta a pagar, marque “despesa recorrente” para que a próxima seja criada quando esta for paga." />
      ) : (
        <ul aria-label="Séries recorrentes" className="space-y-2">
          {series.map(serie => {
            const vencida = serie.emAberto && !!serie.proximoVencimento && serie.proximoVencimento < hoje;
            return (
              <li key={serie.atual.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words font-semibold text-foreground">{serie.atual.descricao}</p>
                    <Badge variant="outline">{rotuloFrequencia(serie.atual.frequencia_recorrencia)}</Badge>
                    {serie.atual.tipo === 'receita' && <Badge variant="outline">Receita</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[serie.atual.fornecedor, rotuloCategoriaCadastro(serie.atual.tipo === 'receita' ? 'receita' : 'despesa', serie.atual.categoria), `${serie.ocorrencias} ${serie.ocorrencias === 1 ? 'ocorrência' : 'ocorrências'}`].filter(Boolean).join(' · ')}
                  </p>
                  <p className={cn('mt-1 text-sm', vencida ? 'font-medium text-destructive' : 'text-foreground')}>
                    {serie.emAberto ? `Em aberto, vence em ${dataBr(serie.proximoVencimento)}` : `Próxima conta prevista para ${dataBr(serie.proximoVencimento)}`}
                    {' · '}<span className="font-semibold tabular-nums">{formatarMoeda(serie.atual.valor)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {serie.emAberto && serie.atual.tipo === 'despesa' && (
                    <Button variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" aria-label={`Editar ${serie.atual.descricao}`}
                      onClick={() => navigate(`/contas/pagar/${serie.atual.id}/editar`, { state: { returnTo: '/contas?tab=pagar' } })}>
                      <Pencil aria-hidden="true" className="h-4 w-4" />Editar
                    </Button>
                  )}
                  <Button variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" disabled={encerrando === serie.atual.id}
                    aria-label={`Encerrar recorrência de ${serie.atual.descricao}`} onClick={() => void encerrar(serie)}>
                    <StopCircle aria-hidden="true" className="h-4 w-4" />Encerrar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {dialogo}
    </div>
  );
}
