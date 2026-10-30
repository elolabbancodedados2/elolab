import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, FileCheck2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

interface FaturamentoFiltros { tab?: string; buscaLote?: string; statusLote?: string; buscaGlosa?: string; statusGlosa?: string }
interface EstadoRota { filtros?: FaturamentoFiltros }
interface GlosaRetorno {
  id: string; status: string; codigo_glosa: string; motivo: string; valor_glosado: number; valor_recuperado: number;
  recurso_justificativa: string | null; recurso_prazo: string | null;
  lotes_tiss: { numero_lote: string; convenios: { nome: string } | null } | null;
}
interface PayloadDecisao { status: 'aceita' | 'mantida'; valor: number }

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
const temCentavosValidos = (valor: number) => Number.isFinite(valor) && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7;

export default function RetornoGlosaTissPage() {
  const { glosaId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id ?? '';
  const completed = useRef(false);
  const initializedFor = useRef('');
  const pendingPayload = useRef<PayloadDecisao | null>(null);
  const filtros = (location.state as EstadoRota | null)?.filtros;
  const returnState = filtros ? { restaurarFiltros: filtros } : undefined;
  const retorno = useMemo(() => ({ pathname: '/faturamento-convenios', state: returnState }), [returnState]);
  const [decision, setDecision] = useState<'aceita' | 'mantida'>('aceita');
  const [recoveredAmount, setRecoveredAmount] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const glosaQuery = useQuery({
    queryKey: ['glosa-retorno', clinicId || null, glosaId],
    enabled: !!clinicId && !!glosaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('glosas_convenio')
        .select('id,status,codigo_glosa,motivo,valor_glosado,valor_recuperado,recurso_justificativa,recurso_prazo,lotes_tiss(numero_lote,convenios(nome))')
        .eq('id', glosaId).eq('clinica_id', clinicId).maybeSingle();
      if (error) throw error;
      return data as GlosaRetorno | null;
    },
  });
  const glosa = glosaQuery.data;
  useEffect(() => {
    if (!glosa || initializedFor.current === glosa.id) return;
    initializedFor.current = glosa.id;
    setDecision('aceita');
    setRecoveredAmount(String(Number(glosa.valor_glosado || 0)));
  }, [glosa]);

  const canRegister = glosa?.status === 'recurso_enviado';
  const value = decision === 'aceita' ? Number(recoveredAmount) : 0;
  const dirty = !!glosa && (decision !== 'aceita' || recoveredAmount !== String(Number(glosa.valor_glosado || 0)));

  const save = useMutation({
    mutationFn: async (payload: PayloadDecisao) => {
      if (!glosa || !clinicId) throw new Error('Glosa ou clínica não identificada. Atualize a tela e tente novamente.');
      if (payload.status === 'aceita' && (payload.valor < 0 || payload.valor > Number(glosa.valor_glosado) || !temCentavosValidos(payload.valor))) {
        throw new Error('Informe o valor efetivamente recuperado, entre zero e o valor glosado, com até duas casas decimais.');
      }
      const { data: current, error: readError } = await (supabase as any).from('glosas_convenio')
        .select('status,valor_recuperado').eq('id', glosa.id).eq('clinica_id', clinicId).maybeSingle();
      if (readError) throw readError;
      if (current?.status === payload.status && Number(current.valor_recuperado || 0) === payload.valor) return { repeated: true };
      if (current?.status !== 'recurso_enviado') throw new Error('A glosa já mudou de status. Atualize a lista antes de registrar o retorno.');
      const { data, error } = await (supabase as any).rpc('atualizar_glosa_convenio', {
        p_glosa_id: glosa.id,
        p_status: payload.status,
        p_recurso_justificativa: null,
        p_valor_recuperado: payload.valor,
      });
      if (error) throw error;
      if (!data?.success) throw new Error('A decisão não foi confirmada porque o status da glosa mudou. Atualize antes de continuar.');
      return { repeated: false };
    },
    onSuccess: async ({ repeated }) => {
      pendingPayload.current = null;
      completed.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] }),
        queryClient.invalidateQueries({ queryKey: ['glosa-retorno', clinicId, glosaId] }),
      ]);
      if (repeated) toast.info('Esta decisão já havia sido registrada. Nenhum valor foi duplicado.');
      else toast.success(decision === 'aceita' ? 'Retorno registrado; valor recuperado atualizado.' : 'Decisão registrada; a glosa foi mantida.');
      navigate(retorno.pathname, { replace: true, state: retorno.state });
    },
    onError: error => setErrorMessage(mensagemDeErro(error)),
  });

  function enviar(payload?: PayloadDecisao) {
    const digitado = decision === 'aceita' ? Number(recoveredAmount) : 0;
    if (!glosa || !canRegister) return;
    if (decision === 'aceita' && !recoveredAmount.trim()) return toast.error('Informe o valor efetivamente recuperado; use zero se nada foi recuperado.');
    if (decision === 'aceita' && (digitado < 0 || digitado > Number(glosa.valor_glosado) || !temCentavosValidos(digitado))) {
      return toast.error('Informe um valor entre zero e o valor da glosa, com até duas casas decimais.');
    }
    const attempt = payload ?? { status: decision, valor: digitado };
    pendingPayload.current = attempt;
    setErrorMessage('');
    save.mutate(attempt);
  }

  if (!clinicId) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para registrar o retorno." /></div>;
  if (glosaQuery.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;
  if (glosaQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar a glosa" error={glosaQuery.error} onRetry={() => void glosaQuery.refetch()} /></div>;
  if (!glosa) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Glosa não encontrada" icon={<CircleAlert />} actions={<Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} /><p className="text-sm text-muted-foreground">O registro não existe ou não está disponível para esta clínica.</p></div>;
  if (!canRegister) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Retorno indisponível" description="A decisão da operadora só pode ser registrada depois do envio do recurso." icon={<CircleAlert />} actions={<Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} /><Card><CardContent className="pt-6 text-sm text-muted-foreground">Status atual: <Badge variant="outline" className="capitalize">{glosa.status.replace(/_/g, ' ')}</Badge></CardContent></Card></div>;

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title="Registrar retorno da operadora" description="Registre se a operadora aceitou o recurso e o valor realmente recuperado." icon={<FileCheck2 />} actions={<Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })} disabled={save.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} />
    <Card>
      <CardHeader className="border-b border-border/70"><div><CardTitle className="text-base">Recurso enviado</CardTitle><p className="mt-1 text-sm text-muted-foreground">Lote {glosa.lotes_tiss?.numero_lote ?? '—'} · {glosa.lotes_tiss?.convenios?.nome ?? 'Convênio'}</p></div></CardHeader>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Código da glosa</p><p className="mt-1 font-medium">{glosa.codigo_glosa}</p></div><div><p className="text-xs text-muted-foreground">Valor original</p><p className="mt-1 font-medium tabular-nums">{moeda(Number(glosa.valor_glosado))}</p></div><div><p className="text-xs text-muted-foreground">Prazo registrado</p><p className="mt-1 font-medium">{glosa.recurso_prazo ? glosa.recurso_prazo.split('-').reverse().join('/') : '—'}</p></div><div className="sm:col-span-3"><p className="text-xs text-muted-foreground">Justificativa enviada</p><p className="mt-1 whitespace-pre-wrap text-sm">{glosa.recurso_justificativa || 'Sem justificativa registrada.'}</p></div></CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">Decisão recebida</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <fieldset disabled={save.isPending || !!errorMessage} className="space-y-5">
          <legend className="sr-only">Decisão da operadora</legend>
          <div className="grid gap-3 sm:grid-cols-2"><label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${decision === 'aceita' ? 'border-[#1456C0] bg-[#EAF2FF]' : 'border-border'}`}><input type="radio" name="decisao-operadora" value="aceita" checked={decision === 'aceita'} onChange={() => setDecision('aceita')} className="mt-1 accent-[#1456C0]" /><span><span className="font-medium">Recurso aceito</span><span className="mt-1 block text-sm text-muted-foreground">Informe quanto foi recuperado. Pode ser menor que o valor original.</span></span></label><label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${decision === 'mantida' ? 'border-[#1456C0] bg-[#EAF2FF]' : 'border-border'}`}><input type="radio" name="decisao-operadora" value="mantida" checked={decision === 'mantida'} onChange={() => setDecision('mantida')} className="mt-1 accent-[#1456C0]" /><span><span className="font-medium">Glosa mantida</span><span className="mt-1 block text-sm text-muted-foreground">Registra recuperação de R$ 0,00.</span></span></label></div>
          {decision === 'aceita' && <div className="max-w-sm space-y-2"><Label htmlFor="tiss-glosa-recuperado">Valor efetivamente recuperado (R$)</Label><Input id="tiss-glosa-recuperado" type="number" min="0" max={glosa.valor_glosado} step="0.01" value={recoveredAmount} onChange={event => setRecoveredAmount(event.target.value)} aria-invalid={!!recoveredAmount && (value < 0 || value > Number(glosa.valor_glosado) || !temCentavosValidos(value))} /><p className="text-xs text-muted-foreground">De zero até {moeda(Number(glosa.valor_glosado))}. Não informe valor presumido; use o retorno recebido da operadora.</p></div>}
        </fieldset>
        {errorMessage && <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{errorMessage}</p><p className="text-xs">A decisão e o valor foram preservados. Confira a lista antes de editar; repetir envia os mesmos dados.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button size="sm" variant="outline" onClick={() => { pendingPayload.current = null; setErrorMessage(''); }}>Editar e conferir</Button><Button size="sm" onClick={() => pendingPayload.current && enviar(pendingPayload.current)}>Repetir a mesma decisão</Button></div></div>}
        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })} disabled={save.isPending}>Cancelar</Button><Button onClick={() => enviar()} disabled={save.isPending || !!errorMessage || (decision === 'aceita' && (!recoveredAmount.trim() || value < 0 || value > Number(glosa.valor_glosado) || !temCentavosValidos(value)))}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Registrar decisão</Button></div>
      </CardContent>
    </Card>
    <UnsavedChangesGuard dirty={dirty} busy={save.isPending} completed={completed} />
  </div>;
}
