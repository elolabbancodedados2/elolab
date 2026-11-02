import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { parseDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { dataHoraSP, rotuloForma } from '@/lib/caixaFormatacao';

const moeda = (valor: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0));

interface VendaPdv {
  id: string;
  descricao: string;
  valor_pago: number | string | null;
  forma_pagamento: string | null;
  data: string;
  status: string;
  categoria: string | null;
}

/**
 * Estorno de venda do PDV do caixa. A venda não tem linha em `pagamentos`,
 * então o estorno comum não a alcança: a RPC registra a saída hoje, devolve o
 * estoque e cancela os exames ainda sem laudo, numa transação só.
 */
export default function EstornarVendaPdvPage() {
  const { lancamentoId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const [motivo, setMotivo] = useState('');
  const concluido = useRef(false);
  const returnTo = typeof (location.state as { returnTo?: unknown } | null)?.returnTo === 'string'
    ? (location.state as { returnTo: string }).returnTo
    : '/caixa-diario';

  const vendaQuery = useQuery({
    queryKey: ['venda-pdv-estorno', profile?.clinica_id, lancamentoId],
    enabled: Boolean(profile?.clinica_id && lancamentoId),
    queryFn: async () => {
      const [{ data: venda, error }, { data: marcas, error: erroMarcas }] = await Promise.all([
        supabase.from('lancamentos')
          .select('id, descricao, valor_pago, forma_pagamento, data, status, categoria')
          .eq('id', lancamentoId).eq('clinica_id', profile!.clinica_id!).maybeSingle(),
        (supabase as any).rpc('vendas_pdv_do_caixa', { p_lancamento_ids: [lancamentoId] }),
      ]);
      if (error) throw error;
      if (erroMarcas) throw erroMarcas;
      const marca = (marcas ?? [])[0] as { estornado_em: string | null } | undefined;
      return { venda: venda as VendaPdv | null, ehVenda: Boolean(marca), estornadoEm: marca?.estornado_em ?? null };
    },
  });

  const estornar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('estornar_venda_pdv', { p_lancamento_id: lancamentoId, p_motivo: motivo.trim() });
      if (error) throw error;
      return data as { repetido?: boolean; itens_devolvidos?: number; exames_cancelados?: number; exames_com_laudo?: number };
    },
    onSuccess: async (resultado) => {
      concluido.current = true;
      const partes = [
        resultado?.itens_devolvidos ? `${resultado.itens_devolvidos} produto(s) devolvido(s) ao estoque` : null,
        resultado?.exames_cancelados ? `${resultado.exames_cancelados} exame(s) cancelado(s)` : null,
        resultado?.exames_com_laudo ? `${resultado.exames_com_laudo} exame(s) com laudo mantido(s)` : null,
      ].filter(Boolean);
      toast.success(resultado?.repetido ? 'Esta venda já estava estornada' : 'Venda estornada', { description: partes.join(' • ') || undefined });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] }),
        queryClient.invalidateQueries({ queryKey: ['vendas-pdv-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['estoque'] }),
      ]);
      navigate(returnTo, { replace: true, state: { cashTab: 'hoje' } });
    },
    onError: (erro) => toast.error('Não foi possível estornar a venda', { description: mensagemDeErro(erro) }),
  });

  const venda = vendaQuery.data?.venda;
  const dataVenda = venda?.data ? parseDateOnly(venda.data) : null;
  const motivoValido = motivo.trim().length >= 5;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-24 sm:pb-8">
      <UnsavedChangesGuard dirty={motivo.trim().length > 0} busy={estornar.isPending} completed={concluido} />
      <PageHeader
        title="Estornar venda do caixa"
        description="Registra hoje a saída do valor, devolve os produtos ao estoque e cancela os exames ainda sem laudo."
        icon={<Undo2 />}
        actions={<Button variant="outline" onClick={() => navigate(returnTo)} disabled={estornar.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao caixa</Button>}
      />
      {vendaQuery.isLoading ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-xl border border-border bg-card" />
      ) : vendaQuery.isError ? (
        <ErrorState title="Não foi possível carregar a venda" error={vendaQuery.error} onRetry={() => void vendaQuery.refetch()} />
      ) : !venda || !vendaQuery.data?.ehVenda ? (
        <Card role="status"><CardContent className="p-6 text-sm text-muted-foreground">Este lançamento não é uma venda do caixa desta clínica.</CardContent></Card>
      ) : vendaQuery.data.estornadoEm ? (
        <Card role="status"><CardContent className="p-6 text-sm text-muted-foreground">Esta venda já foi estornada em {dataHoraSP(vendaQuery.data.estornadoEm)}.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Venda</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Descrição</dt><dd className="font-medium">{venda.descricao}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Valor pago</dt><dd className="font-semibold tabular-nums">{moeda(venda.valor_pago)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Forma</dt><dd>{rotuloForma(venda.forma_pagamento)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Data da venda</dt><dd>{dataVenda ? format(dataVenda, 'dd/MM/yyyy') : '—'}</dd></div>
            </dl>
            <div className="space-y-2">
              <Label htmlFor="estorno-venda-motivo">Motivo do estorno *</Label>
              <Textarea id="estorno-venda-motivo" rows={3} maxLength={500} value={motivo} onChange={e => { setMotivo(e.target.value); if (estornar.isError) estornar.reset(); }} disabled={estornar.isPending}
                placeholder="Ex.: venda lançada para o paciente errado" />
              <p className="text-xs text-muted-foreground">Mínimo de 5 caracteres. Fica registrado no lançamento e no histórico.</p>
            </div>
            <p className="rounded-lg border border-border bg-secondary p-3 text-sm">
              A saída de {moeda(venda.valor_pago)} entra no caixa de hoje, na mesma forma de pagamento. O caixa de hoje precisa estar aberto.
            </p>
            {estornar.isError && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Não foi possível estornar a venda. {mensagemDeErro(estornar.error)}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => navigate(returnTo)} disabled={estornar.isPending}>Cancelar</Button>
              <Button variant="destructive" onClick={() => estornar.mutate()} disabled={!motivoValido || estornar.isPending} className="gap-2">
                {estornar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Estornar venda
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
