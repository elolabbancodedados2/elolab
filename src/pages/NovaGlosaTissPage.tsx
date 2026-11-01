import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { mensagemDeErro } from '@/lib/erros';
import { descricaoMotivoGlosa, formatarCompetencia, MOTIVOS_GLOSA_TISS } from '@/lib/tissStatus';

interface FaturamentoFiltros { tab?: string; buscaLote?: string; statusLote?: string; buscaGlosa?: string; statusGlosa?: string }
interface EstadoDaRota { filtros?: FaturamentoFiltros; restaurarFiltros?: FaturamentoFiltros }
interface LoteElegivel { id: string; numero_lote: string; competencia: string; convenio_id: string; valor_apresentado: number; status: string; convenios: { nome: string } | null }
interface GlosaExistente { valor_glosado: number; guia_referencia: string | null }
interface GuiaDoLote { id: string; numero_guia: string; valor_total: number; data_atendimento: string; codigo_procedimento: string }
interface GlosaPayload { p_lote_id: string; p_codigo_glosa: string; p_motivo: string; p_guia_referencia: string | null; p_valor_glosado: number; p_chave_idempotencia: string }
interface ResultadoGlosa { success: boolean; repetido?: boolean; id?: string; total_glosado?: number; saldo_apresentado?: number }

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

function lerResultadoGlosa(value: unknown): ResultadoGlosa | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (result.success !== true) return null;
  return {
    success: true,
    repetido: result.repetido === true,
    id: typeof result.id === 'string' ? result.id : undefined,
    total_glosado: typeof result.total_glosado === 'number' ? result.total_glosado : undefined,
    saldo_apresentado: typeof result.saldo_apresentado === 'number' ? result.saldo_apresentado : undefined,
  };
}

export default function NovaGlosaTissPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const completed = useRef(false);
  const tentativaPendente = useRef<GlosaPayload | null>(null);
  const chaveIdempotencia = useRef(crypto.randomUUID());
  const filtros = (location.state as EstadoDaRota | null)?.filtros;
  const retorno = useMemo(() => ({ pathname: '/faturamento-convenios', state: filtros ? { restaurarFiltros: filtros } : undefined }), [filtros]);
  const [loteId, setLoteId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guia, setGuia] = useState('');
  const [valorGlosado, setValorGlosado] = useState('');
  const [erroEnvio, setErroEnvio] = useState('');

  const lotesQuery = useQuery({
    queryKey: ['lotes-tiss', 'glosa-nova', profile?.clinica_id ?? null],
    enabled: !!profile?.clinica_id,
    queryFn: async () => buscarEmBlocos<LoteElegivel>(() => supabase.from('lotes_tiss')
      .select('id,numero_lote,competencia,convenio_id,valor_apresentado,status,convenios(nome)')
      .eq('clinica_id', profile?.clinica_id ?? '').in('status', ['enviado', 'processando', 'pago_parcial', 'pago'])
      .order('competencia', { ascending: false }).order('id', { ascending: true })),
  });
  const saldoQuery = useQuery({
    queryKey: ['glosas-convenio', 'saldo', profile?.clinica_id ?? null, loteId],
    enabled: !!profile?.clinica_id && !!loteId,
    queryFn: async () => buscarEmBlocos<GlosaExistente>(() => supabase.from('glosas_convenio')
      .select('valor_glosado,guia_referencia').eq('clinica_id', profile?.clinica_id ?? '').eq('lote_id', loteId).neq('status', 'cancelada')
      .order('id', { ascending: true })),
  });
  const guiasQuery = useQuery({
    queryKey: ['lotes-tiss', 'guias', profile?.clinica_id ?? null, loteId],
    enabled: !!profile?.clinica_id && !!loteId,
    queryFn: async () => buscarEmBlocos<GuiaDoLote>(() => (supabase as any).from('lote_tiss_guias').select('*')
      .eq('clinica_id', profile?.clinica_id ?? '').eq('lote_id', loteId).order('created_at', { ascending: true }).order('id', { ascending: true })),
  });
  const lotes = lotesQuery.data ?? [];
  const lote = lotes.find(item => item.id === loteId);
  const guiasDoLote = guiasQuery.data ?? [];
  const guiaSelecionada = guiasDoLote.find(item => item.numero_guia === guia.trim());
  const totalJaGlosado = (saldoQuery.data ?? []).reduce((total, item) => total + Number(item.valor_glosado || 0), 0);
  const saldoDoLote = lote ? Math.max(0, Number((Number(lote.valor_apresentado || 0) - totalJaGlosado).toFixed(2))) : null;
  // Com uma guia escolhida, a glosa também não pode passar do valor dela (descontadas as glosas já lançadas nela).
  const glosadoNaGuia = guiaSelecionada ? (saldoQuery.data ?? []).filter(item => item.guia_referencia === guiaSelecionada.numero_guia)
    .reduce((total, item) => total + Number(item.valor_glosado || 0), 0) : 0;
  const saldoDaGuia = guiaSelecionada ? Math.max(0, Number((Number(guiaSelecionada.valor_total || 0) - glosadoNaGuia).toFixed(2))) : null;
  const saldoDisponivel = saldoDoLote === null ? null : saldoDaGuia === null ? saldoDoLote : Math.min(saldoDoLote, saldoDaGuia);
  const descricaoCodigo = descricaoMotivoGlosa(codigo);
  const valor = Number(valorGlosado);
  const valorValido = Number.isFinite(valor) && valor > 0 && (saldoDisponivel === null || valor <= saldoDisponivel)
    && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7;
  const dirty = Boolean(loteId || codigo.trim() || motivo.trim() || guia.trim() || valorGlosado.trim());

  const registrar = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !lote || !tentativaPendente.current) throw new Error('Confira o lote e os campos antes de registrar a glosa.');
      const { data, error } = await supabase.rpc('registrar_glosa_convenio', tentativaPendente.current);
      if (error) throw error;
      const resultado = lerResultadoGlosa(data);
      if (!resultado) throw new Error('O banco não confirmou o registro da glosa. Confira a lista antes de tentar novamente.');
      return resultado;
    },
    onSuccess: async resultado => {
      completed.current = true;
      tentativaPendente.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] }),
        queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }),
      ]);
      if (resultado.repetido) toast.info('Esta glosa já estava registrada. Nenhuma duplicata foi criada.');
      else toast.success('Glosa registrada.');
      navigate(retorno.pathname, { replace: true, state: retorno.state });
    },
    onError: error => setErroEnvio(mensagemDeErro(error)),
  });

  function montarPayload(): GlosaPayload | null {
    if (!profile?.clinica_id) { setErroEnvio('Clínica não identificada. Atualize a sessão e tente novamente.'); return null; }
    if (!lote || !loteId) { setErroEnvio('Selecione um lote enviado e disponível na clínica atual.'); return null; }
    if (!codigo.trim() || !motivo.trim() || !valorGlosado.trim() || !valorValido) { setErroEnvio(guiaSelecionada ? 'Informe código, motivo e um valor positivo dentro do saldo da guia.' : 'Informe código, motivo e um valor positivo dentro do saldo disponível.'); return null; }
    if (saldoQuery.isError) { setErroEnvio('Não foi possível conferir o saldo das glosas deste lote. Atualize os dados antes de continuar.'); return null; }
    return {
      p_lote_id: lote.id,
      p_codigo_glosa: codigo.trim(),
      p_motivo: motivo.trim(),
      p_guia_referencia: guia.trim() || null,
      p_valor_glosado: Number(valor.toFixed(2)),
      p_chave_idempotencia: chaveIdempotencia.current,
    };
  }

  function enviar() {
    if (saldoQuery.isLoading) return;
    const payload = montarPayload();
    if (!payload) return;
    tentativaPendente.current = payload;
    setErroEnvio('');
    registrar.mutate();
  }

  function editarTentativa() {
    tentativaPendente.current = null;
    chaveIdempotencia.current = crypto.randomUUID();
    setErroEnvio('');
  }

  const voltar = () => navigate(retorno.pathname, { state: retorno.state });

  if (!profile?.clinica_id) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para registrar glosas." /></div>;
  if (lotesQuery.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;
  if (lotesQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar lotes elegíveis" error={lotesQuery.error} onRetry={() => void lotesQuery.refetch()} /></div>;

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title="Registrar glosa" description="Registre a contestação recebida da operadora vinculada a um lote enviado." icon={<AlertTriangle />} actions={<Button variant="outline" onClick={voltar} disabled={registrar.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} />
    {lotes.length === 0 ? <Card><CardContent className="space-y-3 pt-6"><p className="text-sm text-muted-foreground">Não há lotes enviados com saldo para novas glosas nesta clínica.</p><Button variant="outline" onClick={voltar}>Voltar ao faturamento</Button></CardContent></Card> : <>
      <div role="note" className="rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">O total de glosas não pode passar do valor apresentado no lote. Se duas pessoas registrarem ao mesmo tempo, o EloLab confere de novo antes de gravar.</div>
      <Card>
        <CardHeader className="border-b border-border/70"><CardTitle className="text-base">Identificação da glosa</CardTitle><p className="text-sm text-muted-foreground">Use os dados do demonstrativo de glosa enviado pela operadora.</p></CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-2"><Label htmlFor="tiss-glosa-lote">Lote enviado</Label><Select value={loteId} onValueChange={value => { setLoteId(value); setGuia(''); setErroEnvio(''); }} disabled={registrar.isPending || !!erroEnvio}><SelectTrigger id="tiss-glosa-lote"><SelectValue placeholder="Selecione o lote" /></SelectTrigger><SelectContent>{lotes.map(item => <SelectItem key={item.id} value={item.id}>{item.numero_lote} · {item.convenios?.nome || 'Convênio'} · {formatarCompetencia(item.competencia)}</SelectItem>)}</SelectContent></Select></div>
          {lote && <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Valor apresentado</p><p className="mt-1 font-medium tabular-nums">{moeda(Number(lote.valor_apresentado))}</p></div><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Glosado até agora</p><p className="mt-1 font-medium tabular-nums">{moeda(totalJaGlosado)}</p></div><div className="rounded-lg border border-border bg-secondary p-3"><p className="text-xs text-muted-foreground">{saldoDaGuia !== null ? 'Saldo disponível nesta guia' : 'Saldo disponível para glosas'}</p><p className="mt-1 font-semibold tabular-nums text-foreground">{moeda(saldoDisponivel || 0)}</p></div></div>}
          {saldoQuery.isError && lote && <ErrorState title="Não foi possível conferir o saldo das glosas" error={saldoQuery.error} onRetry={() => void saldoQuery.refetch()} />}
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="tiss-glosa-codigo">Código da glosa</Label><Input id="tiss-glosa-codigo" required list="tiss-motivos-glosa" inputMode="numeric" autoComplete="off" maxLength={10} placeholder="Ex.: 1308" value={codigo} onChange={event => { const novo = event.target.value; setCodigo(novo); const descricao = descricaoMotivoGlosa(novo); if (descricao && !motivo.trim()) setMotivo(descricao); setErroEnvio(''); }} disabled={registrar.isPending || !!erroEnvio} aria-describedby="tiss-glosa-codigo-ajuda" /><datalist id="tiss-motivos-glosa">{MOTIVOS_GLOSA_TISS.map(item => <option key={item.codigo} value={item.codigo}>{item.codigo} · {item.descricao}</option>)}</datalist><p id="tiss-glosa-codigo-ajuda" className="text-xs text-muted-foreground">{descricaoCodigo ?? 'Escolha um motivo da tabela TISS ou digite o código do demonstrativo.'}</p></div><div className="space-y-2"><Label htmlFor="tiss-glosa-guia">Guia de referência (opcional)</Label>{guiasDoLote.length > 0 ? <Select value={guiaSelecionada ? guiaSelecionada.numero_guia : 'nenhuma'} onValueChange={value => { setGuia(value === 'nenhuma' ? '' : value); setErroEnvio(''); }} disabled={registrar.isPending || !!erroEnvio}><SelectTrigger id="tiss-glosa-guia"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nenhuma">Lote inteiro, sem guia específica</SelectItem>{guiasDoLote.map(item => <SelectItem key={item.id} value={item.numero_guia}>Guia {item.numero_guia} · {item.codigo_procedimento} · {moeda(Number(item.valor_total))}</SelectItem>)}</SelectContent></Select> : <Input id="tiss-glosa-guia" value={guia} maxLength={20} onChange={event => { setGuia(event.target.value); setErroEnvio(''); }} disabled={registrar.isPending || !!erroEnvio} />}{guiaSelecionada && <p className="text-xs text-muted-foreground">O valor da glosa fica limitado ao saldo desta guia.</p>}</div></div>
          <div className="space-y-2"><Label htmlFor="tiss-glosa-valor">Valor glosado (R$)</Label><Input id="tiss-glosa-valor" type="number" min="0.01" max={saldoDisponivel ?? undefined} step="0.01" required value={valorGlosado} onChange={event => { setValorGlosado(event.target.value); setErroEnvio(''); }} disabled={registrar.isPending || !!erroEnvio || saldoDisponivel === 0 || saldoQuery.isLoading} aria-invalid={valorGlosado !== '' && !valorValido} /><p className="text-xs text-muted-foreground">Informe um valor maior que zero, com até duas casas decimais e dentro do saldo {guiaSelecionada ? 'da guia' : 'do lote'}.</p></div>
          <div className="space-y-2"><Label htmlFor="tiss-glosa-motivo">Motivo informado pela operadora</Label><Textarea id="tiss-glosa-motivo" rows={4} required maxLength={2000} value={motivo} onChange={event => { setMotivo(event.target.value); setErroEnvio(''); }} disabled={registrar.isPending || !!erroEnvio} /></div>
          {saldoDisponivel === 0 && lote && <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">{saldoDaGuia === 0 ? 'O valor desta guia já foi totalmente glosado.' : 'O valor apresentado já foi totalmente glosado neste lote.'}</p>}
          {erroEnvio && <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{erroEnvio}</p><p className="text-xs">Os dados foram preservados. Repetir a mesma tentativa não cria glosa em dobro; confira a lista antes de editar.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button size="sm" variant="outline" onClick={editarTentativa}>Editar e conferir</Button><Button size="sm" onClick={() => { setErroEnvio(''); registrar.mutate(); }}>Repetir a mesma tentativa</Button></div></div>}
          <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={voltar} disabled={registrar.isPending}>Cancelar</Button><Button type="button" onClick={enviar} disabled={registrar.isPending || !!erroEnvio || !loteId || !codigo.trim() || !motivo.trim() || !valorValido || saldoDisponivel === 0 || saldoQuery.isLoading || saldoQuery.isError}>{registrar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar glosa</Button></div>
        </CardContent>
      </Card>
    </>}
    <UnsavedChangesGuard dirty={dirty} busy={registrar.isPending} completed={completed} />
  </div>;
}
