import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileDown, FileStack, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
import { isValidDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const temNoMaximoDuasCasas = (value: number) => Number.isFinite(value)
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
const novoLoteForm = () => ({ convenio_id: '', competencia: todaySaoPauloDateOnly().slice(0, 7) + '-01', numero_lote: '', quantidade_guias: 0, valor_apresentado: 0 });

export default function FaturamentoConvenios() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [lotOpen, setLotOpen] = useState(false);
  const [glosaOpen, setGlosaOpen] = useState(false);
  const [glosaParaRecurso, setGlosaParaRecurso] = useState<any | null>(null);
  const [justificativaRecurso, setJustificativaRecurso] = useState('');
  const [glosaParaRetorno, setGlosaParaRetorno] = useState<any | null>(null);
  const [loteParaRetorno, setLoteParaRetorno] = useState<any | null>(null);
  const [decisaoOperadora, setDecisaoOperadora] = useState<'aceita' | 'mantida'>('aceita');
  const [valorRecuperado, setValorRecuperado] = useState('');
  const [valorPagoLote, setValorPagoLote] = useState('');
  const [loteParaConfirmarEnvio, setLoteParaConfirmarEnvio] = useState<any | null>(null);
  const [dataPagamentoLote, setDataPagamentoLote] = useState(() => todaySaoPauloDateOnly());
  const [registrarFinanceiro, setRegistrarFinanceiro] = useState(false);
  const [motivoAjusteLote, setMotivoAjusteLote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingRetornoLote, setSavingRetornoLote] = useState(false);
  const [loteEnviandoId, setLoteEnviandoId] = useState<string | null>(null);
  const [glosaAtualizandoId, setGlosaAtualizandoId] = useState<string | null>(null);
  const glosaAtualizacaoLock = useRef(false);
  const [lotForm, setLotForm] = useState(novoLoteForm);
  const [buscaLote, setBuscaLote] = useState('');
  const [statusLote, setStatusLote] = useState('todos');
  const [buscaGlosa, setBuscaGlosa] = useState('');
  const [statusGlosa, setStatusGlosa] = useState('todos');
  const [glosaForm, setGlosaForm] = useState({ lote_id: '', codigo_glosa: '', motivo: '', guia_referencia: '', valor_glosado: 0 });
  const [chaveGlosa, setChaveGlosa] = useState<string | null>(null);

  const conveniosQuery = useQuery({ queryKey: ['convenios-faturamento', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    const { data, error } = await supabase.from('convenios').select('id,nome,versao_tiss').eq('clinica_id', profile?.clinica_id ?? '').eq('ativo', true).order('nome');
    if (error) throw error; return data ?? [];
  }});
  const convenios = conveniosQuery.data ?? [];
  const lotesQuery = useQuery({ queryKey: ['lotes-tiss', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<any>(() => (supabase as any).from('lotes_tiss').select('*,convenios(nome,registro_ans)')
      .eq('clinica_id', profile?.clinica_id ?? '').order('competencia', { ascending: false }).order('id', { ascending: true }));
  }});
  const lotes = lotesQuery.data ?? [];
  const lotesComDivergenciaFinanceira = lotes.filter((lote: any) =>
    Number(lote.valor_pago || 0) !== Number(lote.valor_conciliado_financeiro || 0),
  );
  const lotesParaRegistrarGlosa = lotes.filter((lote: any) => ['enviado', 'processando', 'pago_parcial', 'pago'].includes(lote.status));
  const glosasQuery = useQuery({ queryKey: ['glosas-convenio', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<any>(() => (supabase as any).from('glosas_convenio').select('*,lotes_tiss(numero_lote,convenios(nome))')
      .eq('clinica_id', profile?.clinica_id ?? '').order('created_at', { ascending: false }).order('id', { ascending: true }));
  }});
  const glosas = glosasQuery.data ?? [];
  const loteGlosaSelecionado = lotes.find((lote: any) => lote.id === glosaForm.lote_id);
  const totalGlosadoNoLote = glosas
    .filter((glosa: any) => glosa.lote_id === glosaForm.lote_id && glosa.status !== 'cancelada')
    .reduce((total: number, glosa: any) => total + Number(glosa.valor_glosado || 0), 0);
  const saldoGlosaDisponivel = loteGlosaSelecionado
    ? Math.max(0, Number((Number(loteGlosaSelecionado.valor_apresentado || 0) - totalGlosadoNoLote).toFixed(2)))
    : null;
  const consultasAtingiramLimite = lotes.length >= LIMITE_BUSCA_EM_BLOCOS
    || glosas.length >= LIMITE_BUSCA_EM_BLOCOS;
  const isLoading = conveniosQuery.isLoading || lotesQuery.isLoading || glosasQuery.isLoading;

  const resumo = useMemo(() => ({
    apresentado: lotes.filter((l: any) => ['enviado', 'processando', 'pago_parcial', 'pago', 'rejeitado'].includes(l.status))
      .reduce((s: number, l: any) => s + Number(l.valor_apresentado || 0), 0),
    pago: lotes.reduce((s: number, l: any) => s + Number(l.valor_pago || 0), 0),
    glosado: glosas.filter((g: any) => g.status !== 'cancelada').reduce((s: number, g: any) => s + Number(g.valor_glosado || 0), 0),
    recuperado: glosas.filter((g: any) => g.status !== 'cancelada').reduce((s: number, g: any) => s + Number(g.valor_recuperado || 0), 0),
  }), [lotes, glosas]);

  const lotesFiltrados = useMemo(() => {
    const termo = buscaLote.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
    return lotes.filter((lote: any) => {
      const texto = [lote.numero_lote, lote.convenios?.nome, lote.competencia, lote.status?.replaceAll('_', ' ')]
        .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
      return (!termo || texto.includes(termo)) && (statusLote === 'todos' || lote.status === statusLote);
    });
  }, [lotes, buscaLote, statusLote]);

  const glosasFiltradas = useMemo(() => {
    const termo = buscaGlosa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
    return glosas.filter((glosa: any) => {
      const texto = [glosa.codigo_glosa, glosa.guia_referencia, glosa.motivo, glosa.lotes_tiss?.numero_lote, glosa.lotes_tiss?.convenios?.nome]
        .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
      return (!termo || texto.includes(termo)) && (statusGlosa === 'todos' || glosa.status === statusGlosa);
    });
  }, [glosas, buscaGlosa, statusGlosa]);

  async function saveLot() {
    if (!profile?.clinica_id) return toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
    if (!lotForm.convenio_id || !lotForm.numero_lote.trim()) return toast.error('Convênio e número do lote são obrigatórios.');
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(lotForm.competencia)) return toast.error('Selecione uma competência válida.');
    if (!Number.isInteger(lotForm.quantidade_guias) || lotForm.quantidade_guias < 1 || !Number.isFinite(lotForm.valor_apresentado) || lotForm.valor_apresentado <= 0) return toast.error('Informe ao menos uma guia e um valor apresentado maior que zero.');
    if (!temNoMaximoDuasCasas(lotForm.valor_apresentado)) return toast.error('O valor apresentado deve ter no máximo duas casas decimais.');
    const convenio: any = convenios.find((c: any) => c.id === lotForm.convenio_id);
    if (!convenio) return toast.error('O convênio selecionado não está disponível. Atualize a tela e tente novamente.');
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('lotes_tiss').insert({ ...lotForm, numero_lote: lotForm.numero_lote.trim(), versao_tiss: convenio.versao_tiss || '04.01.00', clinica_id: profile?.clinica_id });
      if (error) throw error;
      setLotOpen(false); setLotForm(novoLoteForm());
      await queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }); toast.success('Lote criado.');
    } catch (error: any) {
      toast.error('Não foi possível criar o lote.', {
        description: error?.code === '23505'
          ? 'Este número de lote já está cadastrado para o convênio selecionado.'
          : error?.message || 'Verifique os dados e tente novamente.',
      });
    } finally { setSaving(false); }
  }

  async function saveGlosa() {
    if (!profile?.clinica_id) return toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
    if (!glosaForm.lote_id || !glosaForm.codigo_glosa.trim() || !glosaForm.motivo.trim() || glosaForm.valor_glosado <= 0) return toast.error('Preencha lote, código, motivo e valor da glosa.');
    if (![glosaForm.codigo_glosa, glosaForm.motivo].every(value => value.trim())) return toast.error('Informe o código e o motivo da glosa.');
    if (!Number.isFinite(glosaForm.valor_glosado) || glosaForm.valor_glosado <= 0) return toast.error('Informe um valor de glosa maior que zero.');
    if (!temNoMaximoDuasCasas(glosaForm.valor_glosado)) return toast.error('O valor da glosa deve ter no máximo duas casas decimais.');
    const loteSelecionado: any = lotes.find((lote: any) => lote.id === glosaForm.lote_id);
    if (!loteSelecionado) return toast.error('O lote selecionado não está mais disponível. Atualize a tela e tente novamente.');
    if (!['enviado', 'processando', 'pago_parcial', 'pago'].includes(loteSelecionado.status)) {
      return toast.error('A glosa só pode ser registrada depois que o lote for enviado à operadora.');
    }
    const totalJaGlosado = glosas
      .filter((glosa: any) => glosa.lote_id === loteSelecionado.id && glosa.status !== 'cancelada')
      .reduce((total: number, glosa: any) => total + Number(glosa.valor_glosado || 0), 0);
    const saldoDisponivel = Math.max(0, Number((Number(loteSelecionado.valor_apresentado || 0) - totalJaGlosado).toFixed(2)));
    if (glosaForm.valor_glosado > saldoDisponivel) {
      return toast.error('O valor ultrapassa o saldo disponível para glosas neste lote.', {
        description: `Saldo disponível: ${brl(saldoDisponivel)}. Atualize os dados do lote e tente novamente.`,
      });
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('registrar_glosa_convenio', {
        p_lote_id: glosaForm.lote_id,
        p_codigo_glosa: glosaForm.codigo_glosa.trim(),
        p_motivo: glosaForm.motivo.trim(),
        p_guia_referencia: glosaForm.guia_referencia.trim() || null,
        p_valor_glosado: Number(glosaForm.valor_glosado.toFixed(2)),
        p_chave_idempotencia: chaveGlosa,
      });
      if (error) throw error;
      if (!data?.success) throw new Error('O banco não confirmou o registro da glosa.');
      setGlosaOpen(false);
      setGlosaForm({ lote_id: '', codigo_glosa: '', motivo: '', guia_referencia: '', valor_glosado: 0 });
      setChaveGlosa(null);
      await queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] });
      if (data.repetido) toast.info('Esta glosa já havia sido registrada. Nenhuma duplicata foi criada.');
      else toast.success('Glosa registrada.');
    } catch (error: any) {
      toast.error('Não foi possível registrar a glosa.', { description: error?.message });
    } finally { setSaving(false); }
  }

  async function updateLot(id: string, status: string): Promise<boolean> {
    if (loteEnviandoId) return false;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return false; }
    setLoteEnviandoId(id);
    const changes: any = { status };
    if (status === 'enviado') changes.enviado_em = new Date().toISOString();
    try {
      const { data, error } = await (supabase as any).from('lotes_tiss').update(changes).eq('id', id).eq('clinica_id', profile.clinica_id).eq('status', 'rascunho').select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O lote já foi alterado. Atualize a lista antes de registrar o envio.');
      await queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }); toast.success('Envio registrado.');
      return true;
    } catch (error: any) { toast.error('Não foi possível atualizar o lote.', { description: error?.message }); return false; }
    finally { setLoteEnviandoId(null); }
  }

  function abrirRetornoLote(lote: any) {
    setLoteParaRetorno(lote);
    setValorPagoLote(String(lote.valor_pago || 0));
    setDataPagamentoLote(todaySaoPauloDateOnly());
    setRegistrarFinanceiro(false);
    setMotivoAjusteLote('');
  }

  async function salvarRetornoLote() {
    if (!loteParaRetorno) return;
    const valor = Number(valorPagoLote);
    if (!Number.isFinite(valor) || valor < 0 || valor > Number(loteParaRetorno.valor_apresentado)) {
      toast.error('Informe o total recebido entre zero e o valor apresentado no lote.');
      return;
    }
    if (!temNoMaximoDuasCasas(valor)) {
      toast.error('O total recebido deve ter no máximo duas casas decimais.');
      return;
    }
    if (!isValidDateOnly(dataPagamentoLote) || dataPagamentoLote > todaySaoPauloDateOnly()) {
      toast.error('Informe uma data de recebimento válida, igual ou anterior a hoje.');
      return;
    }
    if (valor < Number(loteParaRetorno.valor_pago || 0) && motivoAjusteLote.trim().length < 5) {
      toast.error('Explique a correção do valor recebido (mínimo 5 caracteres).');
      return;
    }
    if (registrarFinanceiro
      && valor < Number(loteParaRetorno.valor_conciliado_financeiro || 0)
      && motivoAjusteLote.trim().length < 5) {
      toast.error('Explique a redução do total já conciliado no financeiro (mínimo 5 caracteres).');
      return;
    }
    setSavingRetornoLote(true);
    try {
      const { data, error } = await (supabase as any).rpc('registrar_retorno_lote_tiss', {
        p_lote_id: loteParaRetorno.id,
        p_valor_pago: Number(valor.toFixed(2)),
        p_motivo_ajuste: motivoAjusteLote.trim() || null,
        p_data_pagamento: dataPagamentoLote,
        p_registrar_financeiro: registrarFinanceiro,
      });
      if (error) throw error;
      if (!data?.success) throw new Error('O retorno não foi confirmado pelo banco.');
      await queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] });
      setLoteParaRetorno(null);
      setValorPagoLote('');
      setMotivoAjusteLote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
        queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }),
      ]);
      if (data.repetido) {
        toast.info('Este total já estava registrado no lote. Nenhum lançamento duplicado foi criado.');
      } else if (Number(data.variacao_financeira || 0) < 0) {
        toast.success('Correção registrada no histórico e no fluxo financeiro.');
      } else if (registrarFinanceiro && Number(data.variacao_financeira || 0) > 0) {
        toast.success(data.status === 'pago'
          ? 'Lote registrado como pago e receita incluída no fluxo financeiro.'
          : 'Pagamento parcial registrado e incluído no fluxo financeiro.');
      } else if (registrarFinanceiro) {
        toast.success('Retorno atualizado; o valor recebido já estava conciliado no financeiro.');
      } else {
        toast.success('Retorno atualizado no lote. Nenhum lançamento financeiro foi criado.');
      }
    } catch (error: any) {
      toast.error('Não foi possível registrar o retorno do lote.', { description: error?.message });
    } finally {
      setSavingRetornoLote(false);
    }
  }

  async function updateGlosa(id: string, status: 'recurso_preparacao' | 'recurso_enviado' | 'aceita' | 'mantida', extra: Record<string, unknown> = {}) {
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return false; }
    if (glosaAtualizacaoLock.current) return false;
    if (status === 'recurso_enviado') {
      const atual = glosas.find((item: any) => item.id === id);
      if (String(atual?.recurso_justificativa || '').trim().length < 10) {
        toast.error('Registre a justificativa antes de marcar o recurso como enviado.');
        return false;
      }
    }
    glosaAtualizacaoLock.current = true;
    setGlosaAtualizandoId(id);
    const changes: any = { status };
    if (status === 'recurso_enviado') changes.recurso_enviado_em = new Date().toISOString();
    if (['aceita', 'mantida'].includes(status)) changes.resolvido_em = new Date().toISOString();
    Object.assign(changes, extra);
    const statusEsperado: Record<typeof status, string> = {
      recurso_preparacao: glosas.find((item: any) => item.id === id)?.status === 'recurso_preparacao' ? 'recurso_preparacao' : 'pendente',
      recurso_enviado: 'recurso_preparacao',
      aceita: 'recurso_enviado',
      mantida: 'recurso_enviado',
    };
    try {
      const { data, error } = await (supabase as any).from('glosas_convenio').update(changes).eq('id', id).eq('clinica_id', profile.clinica_id).eq('status', statusEsperado[status]).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A glosa já mudou de status. Atualize a lista antes de continuar.');
      await queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] });
      toast.success(({ recurso_preparacao: 'Preparação do recurso registrada.', recurso_enviado: 'Recurso marcado como enviado.', aceita: 'Glosa aceita; valor recuperado registrado.', mantida: 'Decisão da operadora registrada.' })[status]);
      return true;
    } catch (error: any) { toast.error('Não foi possível atualizar a glosa.', { description: error?.message }); }
    finally {
      glosaAtualizacaoLock.current = false;
      setGlosaAtualizandoId(null);
    }
    return false;
  }

  async function salvarJustificativaRecurso() {
    if (!glosaParaRecurso) return;
    const justificativa = justificativaRecurso.trim();
    if (justificativa.length < 10) return toast.error('Descreva a justificativa do recurso (mínimo de 10 caracteres).');
    const salvo = await updateGlosa(glosaParaRecurso.id, 'recurso_preparacao', { recurso_justificativa: justificativa });
    if (salvo) { setGlosaParaRecurso(null); setJustificativaRecurso(''); }
  }

  async function salvarRetornoOperadora() {
    if (!glosaParaRetorno) return;
    const valor = decisaoOperadora === 'aceita' ? Number(valorRecuperado) : 0;
    if (decisaoOperadora === 'aceita' && !valorRecuperado.trim()) {
      return toast.error('Informe o valor efetivamente recuperado; use zero se nada foi recuperado.');
    }
    if (!Number.isFinite(valor) || valor < 0 || valor > Number(glosaParaRetorno.valor_glosado)) {
      return toast.error('Informe um valor recuperado entre zero e o valor da glosa.');
    }
    if (!temNoMaximoDuasCasas(valor)) return toast.error('O valor recuperado deve ter no máximo duas casas decimais.');
    const salvo = await updateGlosa(glosaParaRetorno.id, decisaoOperadora, { valor_recuperado: valor });
    if (salvo) { setGlosaParaRetorno(null); setValorRecuperado(''); }
  }

  function exportLot(lote: any) {
    const escape = (v: unknown) => String(v ?? '').replace(/[<>&'\"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;' }[c]!));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<loteOperacional versaoTISS="${escape(lote.versao_tiss)}"><numero>${escape(lote.numero_lote)}</numero><competencia>${escape(lote.competencia)}</competencia><registroANS>${escape(lote.convenios?.registro_ans)}</registroANS><quantidadeGuias>${lote.quantidade_guias}</quantidadeGuias><valorApresentado>${Number(lote.valor_apresentado).toFixed(2)}</valorApresentado></loteOperacional>`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' })); const a = document.createElement('a'); a.href = url; a.download = `lote-${lote.numero_lote}.xml`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function abrirNovoLote() {
    setLotForm(novoLoteForm());
    setLotOpen(true);
  }

  function abrirRegistroGlosa() {
    setGlosaForm({ lote_id: '', codigo_glosa: '', motivo: '', guia_referencia: '', valor_glosado: 0 });
    setChaveGlosa(crypto.randomUUID());
    setGlosaOpen(true);
  }

  if (conveniosQuery.isError) return <ErrorState title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />;
  if (lotesQuery.isError) return <ErrorState title="Não foi possível carregar os lotes TISS" error={lotesQuery.error} onRetry={() => void lotesQuery.refetch()} />;
  if (glosasQuery.isError) return <ErrorState title="Não foi possível carregar as glosas" error={glosasQuery.error} onRetry={() => void glosasQuery.refetch()} />;
  if (isLoading) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Carregando faturamento de convênios…</div>;

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Faturamento de Convênios</h1><p className="text-sm text-muted-foreground">Lotes TISS, retorno das operadoras, glosas e recursos.</p></div>
    {lotesComDivergenciaFinanceira.length > 0 && <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><p>{lotesComDivergenciaFinanceira.length} lote(s) têm diferença entre o total recebido e o conciliado no financeiro. Confira lançamentos existentes antes de conciliar, para evitar duplicidade.</p></div>}
    {consultasAtingiramLimite && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning"/><p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros. Os indicadores podem não incluir todos os lotes ou glosas.</p></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      ['Apresentado', resumo.apresentado], ['Pago', resumo.pago], ['Glosado', resumo.glosado], ['Recuperado', resumo.recuperado],
    ].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{brl(Number(value))}</p></CardContent></Card>)}</div>
    <div className="flex flex-wrap items-center gap-2"><Button onClick={abrirNovoLote} disabled={convenios.length === 0}><Plus className="mr-2 h-4 w-4" />Novo lote</Button><Button variant="outline" onClick={abrirRegistroGlosa} disabled={lotesParaRegistrarGlosa.length === 0} title={lotesParaRegistrarGlosa.length === 0 ? 'Envie um lote antes de registrar uma glosa' : undefined}><AlertTriangle className="mr-2 h-4 w-4" />Registrar glosa</Button>{convenios.length === 0 && <p role="status" className="text-xs text-muted-foreground">Cadastre e ative um convênio para criar lotes TISS.</p>}</div>
    <Tabs defaultValue="lotes"><TabsList><TabsTrigger value="lotes">Lotes ({lotes.length})</TabsTrigger><TabsTrigger value="glosas">Glosas ({glosas.length})</TabsTrigger></TabsList>
      <TabsContent value="lotes">
        <Card>
          <CardHeader><CardTitle className="text-base"><FileStack className="mr-2 inline h-4 w-4" />Lotes registrados</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input aria-label="Buscar lote por número, convênio ou competência" placeholder="Buscar número, convênio ou competência..." value={buscaLote} onChange={event => setBuscaLote(event.target.value)} className="sm:max-w-sm" />
              <Select value={statusLote} onValueChange={setStatusLote}><SelectTrigger aria-label="Filtrar lotes por status" className="sm:w-52"><SelectValue placeholder="Todos os status" /></SelectTrigger><SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem><SelectItem value="rascunho">Rascunho</SelectItem><SelectItem value="enviado">Enviado</SelectItem><SelectItem value="processando">Processando</SelectItem><SelectItem value="pago_parcial">Pago parcial</SelectItem><SelectItem value="pago">Pago</SelectItem><SelectItem value="rejeitado">Rejeitado</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent></Select>
            </div>
            {lotes.length > 0 && <p className="text-xs text-muted-foreground">Mostrando {lotesFiltrados.length} de {lotes.length} lotes.</p>}
            {isLoading ? <p>Carregando…</p> : lotesFiltrados.length === 0 ? <div className="flex flex-col items-center gap-2 py-8 text-center"><p className="text-sm text-muted-foreground">{lotes.length === 0 ? 'Nenhum lote cadastrado. Crie um lote depois de fechar as guias da competência.' : 'Nenhum lote corresponde à busca e aos filtros.'}</p>{lotes.length > 0 && <Button size="sm" variant="outline" onClick={() => { setBuscaLote(''); setStatusLote('todos'); }}>Limpar filtros</Button>}</div> : <Table>
            <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Convênio</TableHead><TableHead>Competência</TableHead><TableHead className="text-right">Apresentado / recebido</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>{lotesFiltrados.map((l: any) => <TableRow key={l.id}>
              <TableCell className="font-medium">{l.numero_lote}<p className="text-[10px] text-muted-foreground">TISS {l.versao_tiss} · {l.quantidade_guias} guias</p></TableCell>
              <TableCell>{l.convenios?.nome}</TableCell>
              <TableCell>{new Date(`${l.competencia}T12:00:00`).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}</TableCell>
              <TableCell className="text-right"><span>{brl(l.valor_apresentado)}</span><p className="text-xs text-muted-foreground">Recebido: {brl(l.valor_pago)}</p><p className="text-xs text-muted-foreground">No financeiro: {brl(l.valor_conciliado_financeiro || 0)}</p></TableCell>
              <TableCell><Badge variant="outline">{l.status.replaceAll('_', ' ')}</Badge></TableCell>
              <TableCell><div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => exportLot(l)} aria-label={`Exportar resumo XML do lote ${l.numero_lote}`}><FileDown className="h-4 w-4" /></Button>
                {l.status === 'rascunho' && <Button size="sm" disabled={loteEnviandoId !== null} onClick={() => setLoteParaConfirmarEnvio(l)}>{loteEnviandoId === l.id && <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />}Registrar envio</Button>}
                {['enviado', 'processando', 'pago_parcial', 'pago'].includes(l.status) && <Button size="sm" variant="outline" onClick={() => abrirRetornoLote(l)}>{l.retorno_em ? 'Atualizar retorno' : 'Registrar retorno'}</Button>}
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table>}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="glosas"><Card><CardHeader><CardTitle className="text-base">Tratamento de glosas</CardTitle></CardHeader><CardContent className="space-y-3 overflow-x-auto">
        <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Buscar glosa por código, guia, motivo, lote ou convênio" placeholder="Buscar código, guia, motivo, lote ou convênio..." value={buscaGlosa} onChange={event => setBuscaGlosa(event.target.value)} className="sm:max-w-sm" /><Select value={statusGlosa} onValueChange={setStatusGlosa}><SelectTrigger aria-label="Filtrar glosas por status" className="sm:w-52"><SelectValue placeholder="Todos os status" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="recurso_preparacao">Preparando recurso</SelectItem><SelectItem value="recurso_enviado">Recurso enviado</SelectItem><SelectItem value="aceita">Aceita</SelectItem><SelectItem value="mantida">Mantida</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem></SelectContent></Select></div>
        {glosas.length > 0 && <p className="text-xs text-muted-foreground">Mostrando {glosasFiltradas.length} de {glosas.length} glosas.</p>}
        {glosasFiltradas.length > 0 ? <Table><TableHeader><TableRow><TableHead>Código / motivo</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Glosado</TableHead><TableHead className="text-right">Recuperado</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{glosasFiltradas.map((g: any) => <TableRow key={g.id}><TableCell><b>{g.codigo_glosa}</b>{g.guia_referencia && <p className="text-xs text-muted-foreground">Guia: {g.guia_referencia}</p>}<p className="max-w-sm text-xs text-muted-foreground">{g.motivo}</p>{g.recurso_justificativa && <p className="mt-1 max-w-sm text-xs text-muted-foreground">Recurso: {g.recurso_justificativa}</p>}</TableCell><TableCell>{g.lotes_tiss?.numero_lote}<p className="text-[10px]">{g.lotes_tiss?.convenios?.nome}</p></TableCell><TableCell className="text-right">{brl(g.valor_glosado)}</TableCell><TableCell className="text-right">{brl(g.valor_recuperado)}</TableCell><TableCell><Badge variant="outline">{g.status.replaceAll('_',' ')}</Badge></TableCell><TableCell className="space-x-1">{g.status === 'pendente' && <Button size="sm" variant="outline" disabled={glosaAtualizandoId !== null} onClick={() => { setGlosaParaRecurso(g); setJustificativaRecurso(g.recurso_justificativa || ''); }}>Preparar recurso</Button>}{g.status === 'recurso_preparacao' && <><Button size="sm" variant="outline" disabled={glosaAtualizandoId !== null} onClick={() => { setGlosaParaRecurso(g); setJustificativaRecurso(g.recurso_justificativa || ''); }}>Revisar justificativa</Button><Button size="sm" disabled={glosaAtualizandoId !== null || String(g.recurso_justificativa || '').trim().length < 10} onClick={() => void updateGlosa(g.id, 'recurso_enviado')}>Marcar enviado</Button></>}{g.status === 'recurso_enviado' && <Button size="sm" disabled={glosaAtualizandoId !== null} onClick={() => { setGlosaParaRetorno(g); setDecisaoOperadora('aceita'); setValorRecuperado(String(g.valor_glosado)); }}>Registrar retorno</Button>}</TableCell></TableRow>)}</TableBody></Table> : <div className="flex flex-col items-center gap-2 py-8 text-center"><p className="text-sm text-muted-foreground">{glosas.length === 0 ? 'Nenhuma glosa registrada nesta clínica.' : 'Nenhuma glosa corresponde à busca e aos filtros.'}</p>{glosas.length > 0 && <Button size="sm" variant="outline" onClick={() => { setBuscaGlosa(''); setStatusGlosa('todos'); }}>Limpar filtros</Button>}</div>}
      </CardContent></Card></TabsContent>
    </Tabs>
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" /><span>O XML é um resumo operacional e este sistema não o transmite à operadora. Valide o arquivo no padrão/XSD exigido e registre o envio somente depois de transmiti-lo pelo canal oficial. O retorno pode ser conciliado com o Fluxo de Caixa pelo formulário. Como o lote não identifica as cobranças individuais, confira lançamentos anteriores antes de confirmar para evitar duplicidade.</span></div>

    <AlertDialog open={!!loteParaConfirmarEnvio} onOpenChange={open => { if (!open && !loteEnviandoId) setLoteParaConfirmarEnvio(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar envio do lote?</AlertDialogTitle>
          <AlertDialogDescription>
            Lote {loteParaConfirmarEnvio?.numero_lote}. O EloLab não transmite este arquivo à operadora. Marque como enviado somente depois de transmitir o lote pelo canal oficial. O XML baixado aqui é um resumo operacional e não substitui a guia TISS.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!loteEnviandoId}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!!loteEnviandoId}
            onClick={event => {
              event.preventDefault();
              if (!loteParaConfirmarEnvio) return;
              void updateLot(loteParaConfirmarEnvio.id, 'enviado').then(salvou => {
                if (salvou) setLoteParaConfirmarEnvio(null);
              });
            }}
          >
            {loteEnviandoId && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            Já enviei pelo canal oficial
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={lotOpen} onOpenChange={open => { if (!saving) setLotOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Novo lote TISS</DialogTitle></DialogHeader><fieldset disabled={saving} className="contents"><div className="space-y-3"><Field label="Convênio"><Select value={lotForm.convenio_id} onValueChange={v => setLotForm(f => ({...f,convenio_id:v}))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{convenios.map((c:any)=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Número do lote"><Input value={lotForm.numero_lote} onChange={e=>setLotForm(f=>({...f,numero_lote:e.target.value}))}/></Field><Field label="Competência"><Input type="month" value={lotForm.competencia.slice(0, 7)} onChange={e=>setLotForm(f=>({...f,competencia:e.target.value ? `${e.target.value}-01` : ''}))}/></Field><Field label="Quantidade de guias"><Input type="number" min="1" value={lotForm.quantidade_guias} onChange={e=>setLotForm(f=>({...f,quantidade_guias:Number(e.target.value)}))}/></Field><Field label="Valor apresentado"><Input type="number" min="0.01" step="0.01" value={lotForm.valor_apresentado} onChange={e=>setLotForm(f=>({...f,valor_apresentado:Number(e.target.value)}))}/></Field></div></div></fieldset><DialogFooter><Button variant="outline" onClick={() => setLotOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={saveLot} disabled={saving}>{saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}Salvar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!loteParaRetorno} onOpenChange={open => { if (!open && !savingRetornoLote) setLoteParaRetorno(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar retorno da operadora</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Lote {loteParaRetorno?.numero_lote} · apresentado {brl(Number(loteParaRetorno?.valor_apresentado || 0))}</p>
        <Field label="Valor total recebido até agora"><Input disabled={savingRetornoLote} type="number" min="0" max={loteParaRetorno?.valor_apresentado || 0} step="0.01" value={valorPagoLote} onChange={event => setValorPagoLote(event.target.value)} /></Field>
        <Field label="Data do retorno ou recebimento"><Input disabled={savingRetornoLote} type="date" max={todaySaoPauloDateOnly()} value={dataPagamentoLote} onChange={event => setDataPagamentoLote(event.target.value)} /></Field>
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input type="checkbox" checked={registrarFinanceiro} onChange={event => setRegistrarFinanceiro(event.target.checked)} className="mt-0.5" disabled={savingRetornoLote} />
          <span>Conciliar a diferença no Fluxo de Caixa. Marque somente depois de conferir que esse valor ainda não foi lançado manualmente.</span>
        </label>
        {registrarFinanceiro && <p className="text-xs text-muted-foreground">Já conciliado: {brl(Number(loteParaRetorno?.valor_conciliado_financeiro || 0))}. O sistema lançará apenas a diferença até o total recebido.</p>}
        {(Number(valorPagoLote) < Number(loteParaRetorno?.valor_pago || 0)
          || (registrarFinanceiro && Number(valorPagoLote) < Number(loteParaRetorno?.valor_conciliado_financeiro || 0)))
          && <Field label="Motivo da correção"><Textarea rows={3} disabled={savingRetornoLote} value={motivoAjusteLote} onChange={event => setMotivoAjusteLote(event.target.value)} placeholder="Explique por que o total será reduzido…" /></Field>}
        <p className="text-xs text-muted-foreground">Informe o total acumulado, não apenas a parcela deste retorno. Para reduzir um valor já registrado, explique o ajuste. Se o total recebido for menor que o apresentado, o lote ficará como pago parcial.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLoteParaRetorno(null)} disabled={savingRetornoLote}>Cancelar</Button>
          <Button onClick={salvarRetornoLote} disabled={savingRetornoLote || !valorPagoLote.trim() || (Number(valorPagoLote) === Number(loteParaRetorno?.valor_pago || 0) && !!loteParaRetorno?.retorno_em && (!registrarFinanceiro || Number(valorPagoLote) === Number(loteParaRetorno?.valor_conciliado_financeiro || 0))) || (Number(valorPagoLote) < Number(loteParaRetorno?.valor_pago || 0) && motivoAjusteLote.trim().length < 5) || (registrarFinanceiro && Number(valorPagoLote) < Number(loteParaRetorno?.valor_conciliado_financeiro || 0) && motivoAjusteLote.trim().length < 5)}>{savingRetornoLote && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Salvar retorno</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={glosaOpen} onOpenChange={open => { if (!saving) setGlosaOpen(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar glosa</DialogTitle></DialogHeader>
        <fieldset disabled={saving} className="contents">
          <div className="space-y-3">
            <Field label="Lote">
              <Select value={glosaForm.lote_id} onValueChange={v => setGlosaForm(f => ({ ...f, lote_id: v, valor_glosado: 0 }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{lotesParaRegistrarGlosa.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.numero_lote} · {l.convenios?.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {saldoGlosaDisponivel !== null && (
              <p className="text-xs text-muted-foreground" role="status">
                Saldo disponível para novas glosas: <span className="font-medium">{brl(saldoGlosaDisponivel)}</span>
                {saldoGlosaDisponivel === 0 && ' · O valor apresentado deste lote já foi totalmente glosado.'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código da glosa"><Input value={glosaForm.codigo_glosa} onChange={e => setGlosaForm(f => ({ ...f, codigo_glosa: e.target.value }))} /></Field>
              <Field label="Guia de referência"><Input value={glosaForm.guia_referencia} onChange={e => setGlosaForm(f => ({ ...f, guia_referencia: e.target.value }))} /></Field>
            </div>
            <Field label="Valor glosado">
              <Input type="number" min="0.01" max={saldoGlosaDisponivel ?? undefined} step="0.01" value={glosaForm.valor_glosado || ''} onChange={e => setGlosaForm(f => ({ ...f, valor_glosado: Number(e.target.value) || 0 }))} />
            </Field>
            <Field label="Motivo"><Textarea value={glosaForm.motivo} onChange={e => setGlosaForm(f => ({ ...f, motivo: e.target.value }))} /></Field>
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => setGlosaOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={saveGlosa} disabled={saving || lotesParaRegistrarGlosa.length === 0 || saldoGlosaDisponivel === 0}>
            {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!glosaParaRecurso} onOpenChange={open => { if (!open && glosaAtualizandoId === null) { setGlosaParaRecurso(null); setJustificativaRecurso(''); } }}><DialogContent><DialogHeader><DialogTitle>{glosaParaRecurso?.status === 'recurso_preparacao' ? 'Revisar recurso' : 'Preparar recurso de glosa'}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Glosa {glosaParaRecurso?.codigo_glosa} · {brl(Number(glosaParaRecurso?.valor_glosado || 0))}</p><Field label="Justificativa do recurso"><Textarea rows={5} disabled={glosaAtualizandoId !== null} value={justificativaRecurso} onChange={e=>setJustificativaRecurso(e.target.value)} placeholder="Descreva por que a cobrança deve ser revista pela operadora…" /></Field><p className="text-xs text-muted-foreground">Registre a justificativa antes de marcar o recurso como enviado.</p><DialogFooter><Button variant="outline" onClick={()=>setGlosaParaRecurso(null)} disabled={glosaAtualizandoId !== null}>Cancelar</Button><Button onClick={salvarJustificativaRecurso} disabled={glosaAtualizandoId !== null || justificativaRecurso.trim().length < 10}>{glosaAtualizandoId === glosaParaRecurso?.id && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}Salvar justificativa</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!glosaParaRetorno} onOpenChange={open => { if (!open && glosaAtualizandoId === null) setGlosaParaRetorno(null); }}><DialogContent><DialogHeader><DialogTitle>Registrar retorno da operadora</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Glosa {glosaParaRetorno?.codigo_glosa} · valor original {brl(Number(glosaParaRetorno?.valor_glosado || 0))}</p><Field label="Decisão"><Select value={decisaoOperadora} disabled={glosaAtualizandoId !== null} onValueChange={value=>setDecisaoOperadora(value as 'aceita' | 'mantida')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aceita">Recurso aceito</SelectItem><SelectItem value="mantida">Glosa mantida</SelectItem></SelectContent></Select></Field>{decisaoOperadora === 'aceita' && <Field label="Valor recuperado"><Input type="number" min="0" max={glosaParaRetorno?.valor_glosado || 0} step="0.01" disabled={glosaAtualizandoId !== null} value={valorRecuperado} onChange={e=>setValorRecuperado(e.target.value)} /></Field>}<DialogFooter><Button variant="outline" onClick={()=>setGlosaParaRetorno(null)} disabled={glosaAtualizandoId !== null}>Cancelar</Button><Button onClick={salvarRetornoOperadora} disabled={glosaAtualizandoId !== null}>{glosaAtualizandoId === glosaParaRetorno?.id && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}Registrar decisão</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
