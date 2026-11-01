import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CircleAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isValidDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';

interface FaturamentoFiltros { tab?: string; buscaLote?: string; statusLote?: string; buscaGlosa?: string; statusGlosa?: string }
interface EstadoDaRota { filtros?: FaturamentoFiltros; restaurarFiltros?: FaturamentoFiltros }
interface LoteRetorno {
  id: string;
  numero_lote: string;
  competencia: string;
  convenio_id: string;
  valor_apresentado: number;
  valor_pago: number;
  valor_conciliado_financeiro: number;
  retorno_em: string | null;
  status: string;
  convenios: { nome: string } | null;
}
interface ResultadoRetorno { success: boolean; repetido?: boolean; status?: string; variacao_financeira?: number; valor_pago?: number; valor_conciliado_financeiro?: number }

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
const STATUS_RETORNO = new Set(['enviado', 'processando', 'pago_parcial', 'pago']);

function lerResultadoRetorno(value: unknown): ResultadoRetorno | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (result.success !== true) return null;
  return {
    success: true,
    repetido: result.repetido === true,
    status: typeof result.status === 'string' ? result.status : undefined,
    variacao_financeira: typeof result.variacao_financeira === 'number' ? result.variacao_financeira : undefined,
    valor_pago: typeof result.valor_pago === 'number' ? result.valor_pago : undefined,
    valor_conciliado_financeiro: typeof result.valor_conciliado_financeiro === 'number' ? result.valor_conciliado_financeiro : undefined,
  };
}

export default function RetornoLoteTissPage() {
  const { loteId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const completed = useRef(false);
  const inicializadoPara = useRef('');
  const tentativaPendente = useRef<{ p_lote_id: string; p_valor_pago: number; p_motivo_ajuste: string | null; p_data_pagamento: string; p_registrar_financeiro: boolean } | null>(null);
  const filtros = (location.state as EstadoDaRota | null)?.filtros;
  const retorno = useMemo(() => ({ pathname: '/faturamento-convenios', state: filtros ? { restaurarFiltros: filtros } : undefined }), [filtros]);
  const [valorRecebido, setValorRecebido] = useState('');
  const [dataRecebimento, setDataRecebimento] = useState(todaySaoPauloDateOnly());
  const [conciliarFinanceiro, setConciliarFinanceiro] = useState(false);
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [erroEnvio, setErroEnvio] = useState('');

  const loteQuery = useQuery({
    queryKey: ['lote-tiss-retorno', profile?.clinica_id ?? null, loteId],
    enabled: !!profile?.clinica_id && !!loteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('lotes_tiss')
        .select('id,numero_lote,competencia,convenio_id,valor_apresentado,valor_pago,valor_conciliado_financeiro,retorno_em,status,convenios(nome)')
        .eq('id', loteId).eq('clinica_id', profile?.clinica_id ?? '').maybeSingle();
      if (error) throw error;
      return data as unknown as LoteRetorno | null;
    },
  });
  const lote = loteQuery.data;
  useEffect(() => {
    if (!lote || inicializadoPara.current === lote.id) return;
    inicializadoPara.current = lote.id;
    setValorRecebido(String(Number(lote.valor_pago || 0)));
    setDataRecebimento(todaySaoPauloDateOnly());
  }, [lote]);

  const valor = Number(valorRecebido);
  const totalAtual = Number(lote?.valor_pago || 0);
  const conciliadoAtual = Number(lote?.valor_conciliado_financeiro || 0);
  const valorValido = Number.isFinite(valor) && valor >= 0 && valor <= Number(lote?.valor_apresentado || 0)
    && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7;
  const precisaMotivo = valor < totalAtual || (conciliarFinanceiro && valor < conciliadoAtual);
  const semAlteracao = !!lote?.retorno_em && valor === totalAtual && (!conciliarFinanceiro || valor === conciliadoAtual);
  const dirty = Boolean(lote && (valor !== totalAtual || dataRecebimento !== todaySaoPauloDateOnly() || conciliarFinanceiro || motivoAjuste.trim()));

  const salvar = useMutation({
    mutationFn: async () => {
      if (!lote || !profile?.clinica_id) throw new Error('Lote não encontrado nesta clínica. Atualize a lista e tente novamente.');
      if (!STATUS_RETORNO.has(lote.status)) throw new Error('O retorno só pode ser registrado para lotes enviados, em processamento ou pagos.');
      if (!valorValido) throw new Error('Informe um total entre zero e o valor apresentado, com no máximo duas casas decimais.');
      if (!isValidDateOnly(dataRecebimento) || dataRecebimento > todaySaoPauloDateOnly()) throw new Error('Informe uma data de recebimento válida, igual ou anterior a hoje.');
      if (precisaMotivo && motivoAjuste.trim().length < 5) throw new Error('Explique a correção do total recebido (mínimo 5 caracteres).');

      const payload = tentativaPendente.current ?? {
        p_lote_id: lote.id,
        p_valor_pago: Number(valor.toFixed(2)),
        p_motivo_ajuste: motivoAjuste.trim() || null,
        p_data_pagamento: dataRecebimento,
        p_registrar_financeiro: conciliarFinanceiro,
      };
      tentativaPendente.current = payload;
      const { data, error } = await supabase.rpc('registrar_retorno_lote_tiss', payload);
      if (error) throw error;
      const resultado = lerResultadoRetorno(data);
      if (!resultado) throw new Error('O retorno não foi confirmado pelo banco. Verifique o lote antes de repetir.');
      return resultado;
    },
    onSuccess: async resultado => {
      completed.current = true;
      tentativaPendente.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
      ]);
      if (resultado.repetido) toast.info('Este total já estava registrado. Nenhum lançamento financeiro duplicado foi criado.');
      else if (Number(resultado.variacao_financeira || 0) < 0) toast.success('Correção registrada no histórico e no fluxo financeiro.');
      else if (conciliarFinanceiro && Number(resultado.variacao_financeira || 0) > 0) toast.success(resultado.status === 'pago'
        ? 'Lote registrado como pago e diferença conciliada no fluxo financeiro.'
        : 'Retorno parcial registrado e diferença conciliada no fluxo financeiro.');
      else if (conciliarFinanceiro) toast.success('Retorno atualizado; o valor já estava conciliado no financeiro.');
      else toast.success('Retorno atualizado no lote. Nenhum lançamento financeiro foi criado.');
      navigate(retorno.pathname, { replace: true, state: retorno.state });
    },
    onError: error => setErroEnvio(mensagemDeErro(error)),
  });

  const voltar = () => navigate(retorno.pathname, { state: retorno.state });
  const enviar = () => { setErroEnvio(''); tentativaPendente.current = null; salvar.mutate(); };

  if (!profile?.clinica_id) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para registrar o retorno do lote." /></div>;
  if (loteQuery.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;
  if (loteQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar o lote" error={loteQuery.error} onRetry={() => void loteQuery.refetch()} /></div>;
  if (!lote) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Lote não encontrado" icon={<CircleAlert />} actions={<Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} /><p className="text-sm text-muted-foreground">Este registro não existe ou não está disponível para sua clínica.</p></div>;
  if (!STATUS_RETORNO.has(lote.status)) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Retorno indisponível" description="Somente lotes enviados, em processamento ou pagos permitem registrar um retorno." icon={<CircleAlert />} actions={<Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} /><Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">O status atual deste lote é <strong>{lote.status.replace(/_/g, ' ')}</strong>. Atualize a listagem após rever o envio ou o cancelamento.</p></CardContent></Card></div>;

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title={lote.retorno_em ? 'Atualizar retorno do lote' : 'Registrar retorno da operadora'} description="Registre o total acumulado confirmado pela operadora e decida se ele também será conciliado no fluxo financeiro." icon={<Banknote />} actions={<Button variant="outline" onClick={voltar} disabled={salvar.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} />
    <Card>
      <CardHeader className="border-b border-border/70"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">Resumo do lote</CardTitle><p className="mt-1 text-sm text-muted-foreground">{lote.convenios?.nome || 'Convênio'} · competência {lote.competencia.slice(0, 7)}</p></div><Badge variant="outline" className="capitalize">{lote.status.replace(/_/g, ' ')}</Badge></div></CardHeader>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Lote</p><p className="mt-1 font-medium">{lote.numero_lote}</p></div><div><p className="text-xs text-muted-foreground">Valor apresentado</p><p className="mt-1 font-medium tabular-nums">{moeda(Number(lote.valor_apresentado))}</p></div><div><p className="text-xs text-muted-foreground">Total recebido registrado</p><p className="mt-1 font-medium tabular-nums">{moeda(totalAtual)}</p></div></CardContent>
    </Card>

    <div role="note" className="rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">Informe o total acumulado, não somente a parcela deste retorno. EloLab não inicia transferências bancárias. A conciliação financeira cria apenas a diferença entre o total informado e o já conciliado.</div>
    <Card>
      <CardHeader><CardTitle className="text-base">Dados do retorno</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="tiss-retorno-total">Valor total recebido até agora (R$)</Label><Input id="tiss-retorno-total" type="number" min="0" max={lote.valor_apresentado} step="0.01" value={valorRecebido} onChange={event => { setValorRecebido(event.target.value); setErroEnvio(''); }} disabled={salvar.isPending || !!erroEnvio} aria-invalid={valorRecebido !== '' && !valorValido} /><p className="text-xs text-muted-foreground">Saldo apresentado: {moeda(Math.max(0, Number(lote.valor_apresentado) - valor))}</p></div>
          <div className="space-y-2"><Label htmlFor="tiss-retorno-data">Data do retorno ou recebimento</Label><Input id="tiss-retorno-data" type="date" max={todaySaoPauloDateOnly()} value={dataRecebimento} onChange={event => { setDataRecebimento(event.target.value); setErroEnvio(''); }} disabled={salvar.isPending || !!erroEnvio} aria-invalid={!isValidDateOnly(dataRecebimento) || dataRecebimento > todaySaoPauloDateOnly()} /></div>
        </div>
        <label htmlFor="tiss-retorno-financeiro" className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"><input id="tiss-retorno-financeiro" type="checkbox" checked={conciliarFinanceiro} onChange={event => { setConciliarFinanceiro(event.target.checked); setErroEnvio(''); }} className="mt-0.5 h-4 w-4 accent-primary" disabled={salvar.isPending || !!erroEnvio} /><span><span className="font-medium">Conciliar a diferença no Fluxo de Caixa</span><span className="mt-1 block text-muted-foreground">Marque após confirmar que o recebimento não foi lançado manualmente. Conciliado até agora: {moeda(conciliadoAtual)}.</span></span></label>
        {conciliarFinanceiro && <p className="rounded-lg border border-border bg-secondary p-3 text-sm">A RPC conciliará {moeda(valor - conciliadoAtual)} de diferença de forma transacional com a atualização do lote.</p>}
        {precisaMotivo && <div className="space-y-2"><Label htmlFor="tiss-retorno-motivo">Motivo da correção</Label><Textarea id="tiss-retorno-motivo" rows={3} maxLength={1000} value={motivoAjuste} onChange={event => { setMotivoAjuste(event.target.value); setErroEnvio(''); }} disabled={salvar.isPending || !!erroEnvio} placeholder="Explique por que o total registrado será reduzido." aria-invalid={motivoAjuste.trim().length > 0 && motivoAjuste.trim().length < 5} /><p className="text-xs text-muted-foreground">Obrigatório ao reduzir valor já recebido ou conciliado; mínimo de 5 caracteres.</p></div>}
        {erroEnvio && <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{erroEnvio}</p><p className="text-xs">Os dados da tentativa foram preservados. Para não repetir com outros valores, confira o lote e o Fluxo de Caixa antes de editar.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" size="sm" onClick={() => { tentativaPendente.current = null; setErroEnvio(''); }}>Editar e conferir</Button><Button size="sm" onClick={() => { setErroEnvio(''); salvar.mutate(); }}>Repetir a mesma tentativa</Button></div></div>}
        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={voltar} disabled={salvar.isPending}>Cancelar</Button><Button type="button" onClick={enviar} disabled={salvar.isPending || !!erroEnvio || !valorValido || !isValidDateOnly(dataRecebimento) || dataRecebimento > todaySaoPauloDateOnly() || (precisaMotivo && motivoAjuste.trim().length < 5) || semAlteracao}>{salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar retorno</Button></div>
      </CardContent>
    </Card>
    <UnsavedChangesGuard dirty={dirty} busy={salvar.isPending} completed={completed} />
  </div>;
}
