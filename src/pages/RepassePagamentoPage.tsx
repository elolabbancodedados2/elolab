import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CheckCircle2, CircleAlert, HandCoins, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isValidDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { podePagarRepasse, receitaOrigemQuitada } from '@/lib/repasseWorkflow';

interface RepassePagamento {
  id: string;
  lancamento_id: string;
  valor_repasse: number;
  status: string;
  lancamentos: { status: string } | null;
  medicos: { nome: string | null; crm: string } | null;
}

type FormaPagamento = 'transferencia' | 'pix' | 'dinheiro' | 'credito' | 'debito' | 'cheque';
interface PagamentoPayload {
  p_repasse_id: string;
  p_forma_pagamento: FormaPagamento;
  p_data_pagamento: string;
  p_observacoes: string | null;
}

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

export default function RepassePagamentoPage() {
  const { repasseId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const hoje = todaySaoPauloDateOnly();
  const routeState = location.state as { competencia?: unknown } | null;
  const competencia = typeof routeState?.competencia === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(routeState.competencia)
    ? routeState.competencia
    : hoje.slice(0, 7);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('transferencia');
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [observacao, setObservacao] = useState('');
  const [erroEnvio, setErroEnvio] = useState('');
  const tentativaPendente = useRef<PagamentoPayload | null>(null);

  const repasseQuery = useQuery({
    queryKey: ['repasse-medico-pagamento', profile?.clinica_id ?? null, repasseId],
    enabled: Boolean(user && profile?.clinica_id && repasseId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('repasses_medicos')
        .select('id,lancamento_id,valor_repasse,status,medicos(nome,crm),lancamentos!repasses_medicos_lancamento_id_fkey(status)')
        .eq('id', repasseId)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data as RepassePagamento | null;
    },
  });
  const repasse = repasseQuery.data;
  const origemQuitada = receitaOrigemQuitada(repasse?.lancamentos?.status);
  const podeRegistrar = Boolean(repasse && podePagarRepasse(repasse.status, repasse.lancamentos?.status));
  const medico = repasse?.medicos?.nome || repasse?.medicos?.crm || 'médico';
  const valor = useMemo(() => Number(repasse?.valor_repasse ?? 0), [repasse?.valor_repasse]);

  const pagamentoMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !repasse) throw new Error('Repasse não encontrado nesta clínica. Atualize a lista e tente novamente.');
      if (!isValidDateOnly(dataPagamento) || dataPagamento > hoje) throw new Error('Informe uma data de pagamento válida, igual ou anterior a hoje.');

      const payload = tentativaPendente.current ?? {
        p_repasse_id: repasse.id,
        p_forma_pagamento: formaPagamento,
        p_data_pagamento: dataPagamento,
        p_observacoes: observacao.trim() || null,
      };
      tentativaPendente.current = payload;

      // Reconfere a receita no banco logo antes da escrita: o status da lista pode estar desatualizado.
      const { data: origemAtual, error: origemError } = await (supabase as any).from('lancamentos')
        .select('status')
        .eq('id', repasse.lancamento_id)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (origemError) throw origemError;
      if (!receitaOrigemQuitada(origemAtual?.status)) {
        throw new Error('A receita de origem não está quitada. O repasse não pode ser pago. Atualize a página após revisar a receita.');
      }

      const { data, error } = await (supabase as any).rpc('registrar_pagamento_repasse_medico', payload);
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'O pagamento não foi registrado.');
      return { jaRegistrado: Boolean(data.ja_registrado) };
    },
    onSuccess: async ({ jaRegistrado }) => {
      tentativaPendente.current = null;
      setErroEnvio('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['repasses-medicos'] }),
        queryClient.invalidateQueries({ queryKey: ['repasse-medico-pagamento'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
      ]);
      toast.success(jaRegistrado ? 'O pagamento deste repasse já estava registrado.' : 'Pagamento registrado como despesa no fluxo financeiro.');
      navigate('/repasses-medicos', { replace: true, state: { competencia } });
    },
    onError: (error) => setErroEnvio(mensagemDeErro(error)),
  });

  const voltar = () => navigate('/repasses-medicos', { state: { competencia } });

  if (repasseQuery.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;
  if (repasseQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar o repasse" error={repasseQuery.error} onRetry={() => void repasseQuery.refetch()} /></div>;
  if (!profile?.clinica_id || !repasse) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Repasse não encontrado" icon={<HandCoins />} actions={<Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos repasses</Button>} /><p className="text-sm text-muted-foreground">Este registro não existe ou não está disponível para sua clínica.</p></div>;
  if (!origemQuitada) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 pb-28 sm:pb-8">
    <PageHeader title="Receita de origem não está quitada" description="O pagamento do repasse foi bloqueado porque o recebimento que o originou precisa estar quitado." icon={<CircleAlert />} actions={<Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos repasses</Button>} />
    <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Revise a receita vinculada em Fluxo de Caixa. Depois de corrigir o estado do recebimento, atualize os repasses para tentar novamente.</p></CardContent></Card>
  </div>;
  if (repasse.status !== 'aprovado' && repasse.status !== 'pago') return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 pb-28 sm:pb-8">
    <PageHeader title="Repasse não aprovado" description="Somente um repasse aprovado pode ter o pagamento registrado." icon={<CircleAlert />} actions={<Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos repasses</Button>} />
    <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">O status atual deste repasse é <strong>{repasse.status}</strong>. Atualize a lista e conclua a aprovação antes de registrar o pagamento.</p></CardContent></Card>
  </div>;
  if (repasse.status === 'pago') return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 pb-28 sm:pb-8">
    <PageHeader title="Repasse já pago" description="Este pagamento já consta no fechamento financeiro." icon={<BadgeCheck />} actions={<Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos repasses</Button>} />
    <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Nenhuma nova despesa foi criada.</p></CardContent></Card>
  </div>;

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader
      title="Registrar pagamento do repasse"
      description="Registre um pagamento que já foi realizado ao profissional."
      icon={<HandCoins />}
      actions={<Button variant="outline" onClick={voltar} disabled={pagamentoMutation.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos repasses</Button>}
    />

    <Card>
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle className="text-base">Resumo do repasse</CardTitle><p className="mt-1 text-sm text-muted-foreground">{medico} · receita de origem quitada</p></div>
          <Badge variant="outline" className="gap-1 border-[#A8D5B2] bg-[#EAF5EC] text-[#166534]"><CheckCircle2 className="h-3.5 w-3.5" />Aprovado</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
        <div><p className="text-xs text-muted-foreground">Valor do repasse</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{moeda(valor)}</p></div>
        <div className="rounded-lg border border-[#DFE7F0] bg-[#F5F8FC] p-3 text-sm text-[#172B4D]"><p className="font-medium">Pagamento já realizado?</p><p className="mt-1 text-muted-foreground">O registro criará uma despesa no Fluxo de Caixa.</p><p className="mt-1 font-medium">Nenhuma transferência bancária será iniciada pelo EloLab.</p></div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="text-base">Dados do pagamento realizado</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="repasse-payment-method">Forma de pagamento</Label><Select value={formaPagamento} onValueChange={value => { setFormaPagamento(value as FormaPagamento); setErroEnvio(''); }} disabled={pagamentoMutation.isPending || Boolean(erroEnvio)}><SelectTrigger id="repasse-payment-method" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="transferencia">Transferência</SelectItem><SelectItem value="pix">PIX</SelectItem><SelectItem value="dinheiro">Dinheiro</SelectItem><SelectItem value="credito">Cartão de crédito</SelectItem><SelectItem value="debito">Cartão de débito</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="repasse-payment-date">Data em que foi pago</Label><Input id="repasse-payment-date" type="date" required max={hoje} value={dataPagamento} onChange={event => { setDataPagamento(event.target.value); setErroEnvio(''); }} disabled={pagamentoMutation.isPending || Boolean(erroEnvio)} aria-invalid={!isValidDateOnly(dataPagamento) || dataPagamento > hoje} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="repasse-payment-reference">Referência ou observação (opcional)</Label><Input id="repasse-payment-reference" value={observacao} maxLength={500} placeholder="Ex.: comprovante 12345" onChange={event => { setObservacao(event.target.value); setErroEnvio(''); }} disabled={pagamentoMutation.isPending || Boolean(erroEnvio)} /></div>
        {erroEnvio && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{erroEnvio}</p><p className="mt-1 text-xs">Os dados foram preservados. Tente novamente para confirmar o mesmo registro; a operação é idempotente.</p></div>}
        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={voltar} disabled={pagamentoMutation.isPending}>Cancelar</Button>
          <Button type="button" onClick={() => { setErroEnvio(''); pagamentoMutation.mutate(); }} disabled={!podeRegistrar || !isValidDateOnly(dataPagamento) || dataPagamento > hoje || pagamentoMutation.isPending} className="gap-2">
            {pagamentoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar pagamento realizado
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>;
}
