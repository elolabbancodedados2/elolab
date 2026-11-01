import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileStack, Loader2, Plus, Trash2 } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { buscarDadosBasicosPacientes } from '@/lib/patientBasicData';
import { bloqueiaEnvio, validarLoteTiss, type AutorizacaoValidacao, type GuiaLote, type PendenciaLote } from '@/lib/tissLoteValidacao';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';

interface FaturamentoFiltros { tab?: string; buscaLote?: string; statusLote?: string; buscaGlosa?: string; statusGlosa?: string }
interface EstadoRota { filtros?: FaturamentoFiltros }
interface LoteGuias {
  id: string; numero_lote: string; competencia: string; versao_tiss: string | null; convenio_id: string;
  quantidade_guias: number; valor_apresentado: number; status: string;
  convenios: { nome: string; registro_ans: string | null } | null;
}
interface Autorizacao extends AutorizacaoValidacao { paciente_nome: string | null }
interface GuiaFormulario { numero: string; carteira: string; data: string; codigo: string; tipo: string; autorizacaoId: string; quantidade: string; valor: string }
interface PayloadGuia {
  p_lote_id: string; p_numero_guia: string; p_numero_carteira: string | null; p_paciente_id: string | null;
  p_autorizacao_id: string | null; p_data_atendimento: string; p_codigo_procedimento: string;
  p_tipo_servico: string; p_quantidade: number; p_valor_total: number;
}

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
const tipos = [
  { value: 'consulta', label: 'Consulta' }, { value: 'exame', label: 'Exame' }, { value: 'procedimento', label: 'Procedimento' },
  { value: 'terapia', label: 'Terapia' }, { value: 'internacao', label: 'Internação' },
];
const labelsCampo: Record<string, string> = {
  registro_ans: 'Registro ANS', versao_tiss: 'Versão TISS', numero_lote: 'Número do lote', guias: 'Guias',
  quantidade_guias: 'Quantidade de guias', valor_apresentado: 'Valor apresentado', numero_guia: 'Número da guia',
  numero_carteira: 'Carteira', codigo_procedimento: 'Código TUSS', data_atendimento: 'Data do atendimento',
  autorizacao_id: 'Autorização', autorizacao_status: 'Status da autorização', autorizacao_convenio: 'Convênio da autorização',
  paciente_id: 'Paciente', tipo_servico: 'Serviço faturado',
};
const novoFormulario = (): GuiaFormulario => ({ numero: '', carteira: '', data: '', codigo: '', tipo: 'consulta', autorizacaoId: 'nenhuma', quantidade: '1', valor: '' });
const valorIgual = (guia: GuiaLote, payload: PayloadGuia) => guia.numero_guia === payload.p_numero_guia
  && (guia.numero_carteira || null) === payload.p_numero_carteira && guia.paciente_id === payload.p_paciente_id
  && guia.autorizacao_id === payload.p_autorizacao_id && guia.data_atendimento === payload.p_data_atendimento
  && guia.codigo_procedimento === payload.p_codigo_procedimento && guia.tipo_servico === payload.p_tipo_servico
  && Number(guia.quantidade) === payload.p_quantidade && Number(guia.valor_total) === payload.p_valor_total;

export default function GuiasLoteTissPage() {
  const { loteId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id ?? '';
  const completed = useRef(false);
  const filtros = (location.state as EstadoRota | null)?.filtros;
  const returnState = filtros ? { restaurarFiltros: filtros } : undefined;
  const goBack = () => navigate('/faturamento-convenios', { state: returnState });
  const [form, setForm] = useState(novoFormulario);
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GuiaLote | null>(null);
  const addAttempt = useRef<PayloadGuia | null>(null);

  const loteQuery = useQuery({
    queryKey: ['lote-tiss-guias-workspace', clinicId || null, loteId], enabled: !!clinicId && !!loteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('lotes_tiss')
        .select('id,numero_lote,competencia,versao_tiss,convenio_id,quantidade_guias,valor_apresentado,status,convenios(nome,registro_ans)')
        .eq('id', loteId).eq('clinica_id', clinicId).maybeSingle();
      if (error) throw error;
      return data as LoteGuias | null;
    },
  });
  const guiasQuery = useQuery({
    queryKey: ['lote-tiss-guias', clinicId || null, loteId], enabled: !!clinicId && !!loteId,
    queryFn: async () => buscarEmBlocos<GuiaLote>(() => (supabase as any).from('lote_tiss_guias').select('*')
      .eq('clinica_id', clinicId).eq('lote_id', loteId).order('created_at', { ascending: true }).order('id', { ascending: true })),
  });
  const autorizacoesQuery = useQuery({
    queryKey: ['autorizacoes-faturamento', clinicId || null], enabled: !!clinicId,
    queryFn: async () => {
      const rows = await buscarEmBlocos<AutorizacaoValidacao>(() => (supabase as any).from('autorizacoes_convenio')
        .select('id,status,convenio_id,paciente_id,tipo_servico,data_expiracao,numero_autorizacao')
        .eq('clinica_id', clinicId).order('data_solicitacao', { ascending: false }).order('id', { ascending: true }));
      const patients = await buscarDadosBasicosPacientes([...new Set(rows.map(row => row.paciente_id))]);
      return rows.map(row => ({ ...row, paciente_nome: patients.get(row.paciente_id)?.nome ?? null })) as Autorizacao[];
    },
  });

  const lote = loteQuery.data;
  const guias = guiasQuery.data ?? [];
  const autorizacoes = (autorizacoesQuery.data ?? []).filter(item => !lote || item.convenio_id === lote.convenio_id || guias.some(guia => guia.autorizacao_id === item.id));
  const authorization = autorizacoes.find(item => item.id === form.autorizacaoId);
  const pending: PendenciaLote[] = useMemo(() => lote ? validarLoteTiss({
    lote, registroAns: lote.convenios?.registro_ans ?? null, guias, autorizacoes,
    hoje: todaySaoPauloDateOnly(),
  }) : [], [lote, guias, autorizacoes]);
  const errors = pending.filter(item => item.gravidade === 'erro');
  const totalGuias = guias.reduce((sum, guia) => sum + Number(guia.valor_total || 0), 0);
  const editavel = lote?.status === 'rascunho';
  const loading = loteQuery.isLoading || guiasQuery.isLoading || autorizacoesQuery.isLoading;
  const valor = Number(form.valor);
  const quantidade = Number(form.quantidade);
  const formValido = !!form.numero.trim() && !!form.data && /^\d{8}$/.test(form.codigo.trim())
    && Number.isInteger(quantidade) && quantidade > 0 && Number.isFinite(valor) && valor > 0
    && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7;
  const dirtyForm = !!(form.numero.trim() || form.carteira.trim() || form.data || form.codigo.trim() || form.autorizacaoId !== 'nenhuma' || form.quantidade !== '1' || form.valor.trim());

  const atualizarGuias = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['lote-tiss-guias', clinicId, loteId] }),
    queryClient.invalidateQueries({ queryKey: ['lote-tiss-guias'] }),
    queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }),
  ]);

  async function adicionar(payload?: PayloadGuia) {
    if (!lote || !editavel || adding) return;
    const tentativa = payload ?? {
      p_lote_id: lote.id,
      p_numero_guia: form.numero.trim(),
      p_numero_carteira: form.carteira.trim() || null,
      p_paciente_id: authorization?.paciente_id ?? null,
      p_autorizacao_id: authorization?.id ?? null,
      p_data_atendimento: form.data,
      p_codigo_procedimento: form.codigo.trim(),
      p_tipo_servico: form.tipo,
      p_quantidade: quantidade,
      p_valor_total: Number(valor.toFixed(2)),
    };
    if (!payload && !formValido) return toast.error('Confira os campos obrigatórios, a quantidade e o valor da guia.');
    addAttempt.current = tentativa;
    setAdding(true);
    setAddError('');
    try {
      const { data: existing, error: lookupError } = await (supabase as any).from('lote_tiss_guias')
        .select('*').eq('clinica_id', clinicId).eq('lote_id', lote.id).eq('numero_guia', tentativa.p_numero_guia).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        if (valorIgual(existing as GuiaLote, tentativa)) {
          addAttempt.current = null;
          setForm(novoFormulario());
          await atualizarGuias();
          toast.info('A inclusão desta guia já havia sido concluída.');
          return;
        }
        throw new Error('Este número de guia já existe no lote com dados diferentes. Confira a lista antes de editar.');
      }
      const { data, error } = await (supabase as any).rpc('adicionar_guia_lote_tiss', tentativa);
      if (error) throw error;
      if (!data?.success) throw new Error('O banco não confirmou a inclusão. Confira o lote antes de repetir.');
      addAttempt.current = null;
      setForm(novoFormulario());
      await atualizarGuias();
      toast.success('Guia incluída no lote.');
    } catch (error) {
      setAddError(mensagemDeErro(error));
    } finally { setAdding(false); }
  }

  async function remover() {
    const target = deleteTarget;
    if (!target || deletingId) return;
    setDeletingId(target.id);
    setDeleteError('');
    try {
      const { data: existing, error: lookupError } = await (supabase as any).from('lote_tiss_guias')
        .select('id').eq('clinica_id', clinicId).eq('lote_id', loteId).eq('id', target.id).maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) {
        setDeleteTarget(null);
        await atualizarGuias();
        toast.info('A remoção desta guia já havia sido concluída.');
        return;
      }
      const { error } = await (supabase as any).rpc('remover_guia_lote_tiss', { p_guia_id: target.id });
      if (error) throw error;
      setDeleteTarget(null);
      await atualizarGuias();
      toast.success('Guia removida do rascunho.');
    } catch (error) {
      setDeleteError(mensagemDeErro(error));
    } finally { setDeletingId(null); }
  }

  if (!clinicId) return <div className="mx-auto w-full max-w-5xl px-4 py-6"><ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para conferir guias." /></div>;
  if (loading) return <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div>;
  if (loteQuery.isError) return <div className="mx-auto w-full max-w-5xl px-4 py-6"><ErrorState title="Não foi possível carregar o lote" error={loteQuery.error} onRetry={() => void loteQuery.refetch()} /></div>;
  if (guiasQuery.isError) return <div className="mx-auto w-full max-w-5xl px-4 py-6"><ErrorState title="Não foi possível carregar as guias" error={guiasQuery.error} onRetry={() => void guiasQuery.refetch()} /></div>;
  if (autorizacoesQuery.isError) return <div className="mx-auto w-full max-w-5xl px-4 py-6"><ErrorState title="Não foi possível carregar as autorizações" error={autorizacoesQuery.error} onRetry={() => void autorizacoesQuery.refetch()} /></div>;
  if (!lote) return <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6"><PageHeader title="Lote não encontrado" icon={<FileStack />} actions={<Button variant="outline" onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} /><p className="text-sm text-muted-foreground">O registro não existe ou não está disponível para esta clínica.</p></div>;

  return <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title={`Conferir guias · ${lote.numero_lote}`} description="Revise os dados e as autorizações vinculadas antes de exportar o resumo ou registrar o envio." icon={<FileStack />} actions={<Button variant="outline" onClick={goBack} disabled={adding || !!deletingId}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} />
    <Card>
      <CardHeader className="border-b border-border/70"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">Resumo e consistência</CardTitle><p className="mt-1 text-sm text-muted-foreground">{lote.convenios?.nome ?? 'Convênio'} · competência {lote.competencia.slice(0, 7)}</p></div><Badge variant="outline" className="capitalize">{lote.status.replace(/_/g, ' ')}</Badge></div></CardHeader>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Guias registradas</p><p className="mt-1 font-semibold tabular-nums">{guias.length} <span className="font-normal text-muted-foreground">/ {lote.quantidade_guias}</span></p></div><div><p className="text-xs text-muted-foreground">Valor das guias</p><p className="mt-1 font-semibold tabular-nums">{moeda(totalGuias)}</p></div><div><p className="text-xs text-muted-foreground">Valor apresentado</p><p className="mt-1 font-semibold tabular-nums">{moeda(Number(lote.valor_apresentado))}</p></div><div><p className="text-xs text-muted-foreground">Pendências que bloqueiam envio</p><p className={`mt-1 font-semibold tabular-nums ${errors.length ? 'text-destructive' : 'text-success-foreground'}`}>{errors.length}</p></div></CardContent>
    </Card>
    <section aria-label="Validação do lote" className={`rounded-xl border p-4 ${errors.length ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-secondary'}`}>
      {pending.length === 0 ? <p className="flex items-center gap-2 text-sm text-success-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Lote consistente: nenhuma correção pendente.</p> : <ul className="space-y-2">{pending.map((item, index) => <li key={`${item.guiaId}-${item.campo}-${index}`} className="flex items-start gap-2 text-sm"><AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${item.gravidade === 'erro' ? 'text-destructive' : 'text-warning'}`} /><span><b>{item.numeroGuia ? `Guia ${item.numeroGuia}` : 'Lote'} · {labelsCampo[item.campo] ?? item.campo}</b>{item.gravidade === 'aviso' && ' (aviso)'}: {item.mensagem}</span></li>)}</ul>}
    </section>
    <Card>
      <CardHeader><CardTitle className="text-base">Guias vinculadas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {guias.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma guia cadastrada neste lote.</p> : <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Guia / carteira</TableHead><TableHead>Atendimento</TableHead><TableHead>Procedimento</TableHead><TableHead>Autorização</TableHead><TableHead className="text-right">Valor</TableHead>{editavel && <TableHead><span className="sr-only">Ações</span></TableHead>}</TableRow></TableHeader><TableBody>{guias.map(guia => {
          const auth = autorizacoes.find(item => item.id === guia.autorizacao_id);
          const guideErrors = pending.filter(item => item.guiaId === guia.id && item.gravidade === 'erro').length;
          return <TableRow key={guia.id}><TableCell className="font-medium">{guia.numero_guia}<p className="text-xs text-muted-foreground">Carteira {guia.numero_carteira || '—'}</p>{guideErrors > 0 && <Badge variant="outline" className="mt-1 rounded-full border-destructive/40 text-destructive">{guideErrors} a corrigir</Badge>}</TableCell><TableCell>{guia.data_atendimento.split('-').reverse().join('/')}</TableCell><TableCell>{guia.codigo_procedimento}<p className="text-xs text-muted-foreground">{tipos.find(type => type.value === guia.tipo_servico)?.label ?? guia.tipo_servico} · {guia.quantidade}x</p></TableCell><TableCell>{auth ? `${auth.numero_autorizacao || 'sem número'} · ${auth.paciente_nome || 'Paciente'} · ${auth.status}` : guia.autorizacao_id ? 'Não encontrada' : '—'}</TableCell><TableCell className="text-right tabular-nums">{moeda(Number(guia.valor_total))}</TableCell>{editavel && <TableCell><Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-destructive" aria-label={`Remover guia ${guia.numero_guia}`} disabled={adding || !!deletingId} onClick={() => { setDeleteError(''); setDeleteTarget(guia); }}><Trash2 className="h-4 w-4" /></Button></TableCell>}</TableRow>;
        })}</TableBody></Table></div>}
        {!editavel && <p className="text-xs text-muted-foreground">O lote já foi enviado; suas guias estão disponíveis apenas para consulta.</p>}
      </CardContent>
    </Card>
    {editavel && <Card>
      <CardHeader><CardTitle className="text-base">Incluir guia</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <fieldset disabled={adding || !!addError} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2"><Label htmlFor="lote-guia-numero">Número da guia</Label><Input id="lote-guia-numero" maxLength={20} value={form.numero} onChange={event => setForm(current => ({ ...current, numero: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="lote-guia-carteira">Carteira do beneficiário</Label><Input id="lote-guia-carteira" maxLength={40} value={form.carteira} onChange={event => setForm(current => ({ ...current, carteira: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="lote-guia-data">Data do atendimento</Label><Input id="lote-guia-data" type="date" value={form.data} onChange={event => setForm(current => ({ ...current, data: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="lote-guia-tuss">Código TUSS</Label><Input id="lote-guia-tuss" inputMode="numeric" maxLength={8} value={form.codigo} onChange={event => setForm(current => ({ ...current, codigo: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="lote-guia-tipo">Serviço faturado</Label><Select value={form.tipo} onValueChange={value => setForm(current => ({ ...current, tipo: value }))}><SelectTrigger id="lote-guia-tipo"><SelectValue /></SelectTrigger><SelectContent>{tipos.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2 lg:col-span-2"><Label htmlFor="lote-guia-autorizacao">Autorização</Label><Select value={form.autorizacaoId} onValueChange={value => setForm(current => ({ ...current, autorizacaoId: value }))}><SelectTrigger id="lote-guia-autorizacao"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nenhuma">Sem autorização</SelectItem>{autorizacoes.map(item => <SelectItem key={item.id} value={item.id}>{item.numero_autorizacao || 'Sem número'} · {item.paciente_nome || 'Paciente'} · {item.tipo_servico} · {item.status}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Paciente e convênio são obtidos da autorização selecionada.</p></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="lote-guia-quantidade">Quantidade</Label><Input id="lote-guia-quantidade" type="number" min="1" step="1" value={form.quantidade} onChange={event => setForm(current => ({ ...current, quantidade: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="lote-guia-valor">Valor (R$)</Label><Input id="lote-guia-valor" type="number" min="0.01" step="0.01" value={form.valor} onChange={event => setForm(current => ({ ...current, valor: event.target.value }))} /></div></div>
        </fieldset>
        {addError && <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{addError}</p><p className="text-xs">Os dados foram preservados. A repetição consulta a guia pelo número no lote antes de gravar novamente.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button size="sm" variant="outline" onClick={() => { addAttempt.current = null; setAddError(''); }}>Editar e conferir</Button><Button size="sm" onClick={() => addAttempt.current && void adicionar(addAttempt.current)}>Repetir a mesma inclusão</Button></div></div>}
        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={goBack} disabled={adding || !!deletingId}>Voltar</Button><Button onClick={() => void adicionar()} disabled={adding || !!addError || !formValido}>{adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Incluir guia</Button></div>
      </CardContent>
    </Card>}
    {lote.status === 'rascunho' && errors.length > 0 && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">O registro de envio permanece bloqueado enquanto houver pendências críticas. Revise cada guia e a autorização vinculada antes de voltar ao faturamento.</p>}
    <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deletingId) { setDeleteTarget(null); setDeleteError(''); } }}>
    </AlertDialog>
    <div className="sr-only" aria-live="polite">{bloqueiaEnvio(pending) ? `${errors.length} pendências impedem o envio` : 'Nenhuma pendência crítica impede o envio'}</div>
    <UnsavedChangesGuard dirty={dirtyForm} busy={adding || !!deletingId} completed={completed} />
  </div>;
}
