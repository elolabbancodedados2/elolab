import { cloneElement, isValidElement, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, FileDown, FileStack, Plus, RefreshCw, ShieldCheck, RotateCcw, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { formatWithDatePreference as format } from '@/lib/datePreference';
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
import { PageHeader } from '@/components/PageHeader';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { RelatorioFaturamentoCompetencia } from '@/components/financeiro/RelatorioFaturamentoCompetencia';
import { ConciliacaoConvenioPorLote } from '@/components/financeiro/ConciliacaoConvenioPorLote';
import { GuiasLoteDialog } from '@/components/financeiro/GuiasLoteDialog';
import { RecursoGlosaDialog, ResumoRecurso, type DocumentoRecurso } from '@/components/financeiro/RecursoGlosaDialog';
import { bloqueiaEnvio, validarLoteTiss, type AutorizacaoValidacao, type GuiaLote } from '@/lib/tissLoteValidacao';
import { buscarDadosBasicosPacientes } from '@/lib/patientBasicData';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const temNoMaximoDuasCasas = (value: number) => Number.isFinite(value)
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
const STATUS_LOTE_COR: Record<string, string> = {
  rascunho: 'border-border bg-muted text-muted-foreground',
  enviado: 'border-[#BFD8EE] bg-[#1080CA]/10 text-[#1080CA]',
  processando: 'border-info/30 bg-info/10 text-info',
  pago_parcial: 'border-warning/30 bg-warning/10 text-warning',
  pago: 'border-success/30 bg-success/10 text-success',
  rejeitado: 'border-destructive/30 bg-destructive/10 text-destructive',
  cancelado: 'border-border bg-muted text-muted-foreground',
};
const STATUS_GLOSA_COR: Record<string, string> = {
  pendente: 'border-warning/30 bg-warning/10 text-warning',
  recurso_preparacao: 'border-info/30 bg-info/10 text-info',
  recurso_enviado: 'border-[#BFD8EE] bg-[#1080CA]/10 text-[#1080CA]',
  aceita: 'border-success/30 bg-success/10 text-success',
  mantida: 'border-destructive/30 bg-destructive/10 text-destructive',
  cancelada: 'border-border bg-muted text-muted-foreground',
};
const PILULAS_LOTE = [
  { value: 'todos', label: 'Todos' }, { value: 'rascunho', label: 'Rascunho' }, { value: 'enviado', label: 'Enviado' },
  { value: 'pago_parcial', label: 'Pago parcial' }, { value: 'pago', label: 'Pago' },
];
const PILULAS_GLOSA = [
  { value: 'todos', label: 'Todas' }, { value: 'pendente', label: 'Pendente' }, { value: 'recurso_preparacao', label: 'Preparando recurso' },
  { value: 'recurso_enviado', label: 'Recurso enviado' }, { value: 'aceita', label: 'Aceita' },
];
const pilulaClasse = (ativo: boolean) => cn(
  'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
  ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-[#DCE6F2] bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
);

const escapeXml = (v: unknown) => String(v ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const novoLoteForm = () => ({ convenio_id: '', competencia: todaySaoPauloDateOnly().slice(0, 7) + '-01', numero_lote: '', quantidade_guias: 0, valor_apresentado: 0 });

export default function FaturamentoConvenios() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [lotOpen, setLotOpen] = useState(false);
  const [glosaOpen, setGlosaOpen] = useState(false);
  const [glosaParaRecurso, setGlosaParaRecurso] = useState<any | null>(null);
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
  const lotesComNomeConvenio = useMemo(() => lotes.map((l: any) => ({ ...l, convenio_nome: l.convenios?.nome ?? 'Convênio sem nome' })), [lotes]);
  const lotesComDivergenciaFinanceira = lotes.filter((lote: any) =>
    Number(lote.valor_pago || 0) !== Number(lote.valor_conciliado_financeiro || 0),
  );
  const lotesParaRegistrarGlosa = lotes.filter((lote: any) => ['enviado', 'processando', 'pago_parcial', 'pago'].includes(lote.status));
  const glosasQuery = useQuery({ queryKey: ['glosas-convenio', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<any>(() => (supabase as any).from('glosas_convenio').select('*,lotes_tiss(numero_lote,convenios(nome))')
      .eq('clinica_id', profile?.clinica_id ?? '').order('created_at', { ascending: false }).order('id', { ascending: true }));
  }});
  const glosas = glosasQuery.data ?? [];
  const guiasQuery = useQuery({ queryKey: ['lote-tiss-guias', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<GuiaLote & { lote_id: string }>(() => supabase.from('lote_tiss_guias').select('*')
      .eq('clinica_id', profile?.clinica_id ?? '').order('created_at', { ascending: true }).order('id', { ascending: true }));
  }});
  const autorizacoesQuery = useQuery({ queryKey: ['autorizacoes-faturamento', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    const autorizacoes = await buscarEmBlocos<AutorizacaoValidacao>(() => supabase.from('autorizacoes_convenio')
      .select('id,status,convenio_id,paciente_id,tipo_servico,data_expiracao,numero_autorizacao')
      .eq('clinica_id', profile?.clinica_id ?? '').order('data_solicitacao', { ascending: false }).order('id', { ascending: true }));
    const pacientes = await buscarDadosBasicosPacientes([...new Set(autorizacoes.map(a => a.paciente_id))]);
    return autorizacoes.map(a => ({ ...a, paciente_nome: pacientes.get(a.paciente_id)?.nome ?? null }));
  }});
  const responsaveisQuery = useQuery({ queryKey: ['responsaveis-financeiro', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    const { data, error } = await supabase.rpc('listar_responsaveis_financeiro');
    if (error) throw error; return data ?? [];
  }});
  const documentosQuery = useQuery({ queryKey: ['glosa-recurso-documentos', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<DocumentoRecurso>(() => supabase.from('glosa_recurso_documentos').select('id,glosa_id,storage_path,file_name,created_at')
      .eq('clinica_id', profile?.clinica_id ?? '').order('created_at', { ascending: true }).order('id', { ascending: true }));
  }});
  const documentosPorGlosa = useMemo(() => {
    const mapa = new Map<string, DocumentoRecurso[]>();
    for (const d of documentosQuery.data ?? []) mapa.set(d.glosa_id, [...(mapa.get(d.glosa_id) ?? []), d]);
    return mapa;
  }, [documentosQuery.data]);
  const guiasPorLote = useMemo(() => {
    const mapa = new Map<string, GuiaLote[]>();
    for (const guia of guiasQuery.data ?? []) mapa.set(guia.lote_id, [...(mapa.get(guia.lote_id) ?? []), guia]);
    return mapa;
  }, [guiasQuery.data]);
  const pendenciasPorLote = useMemo(() => {
    const hoje = todaySaoPauloDateOnly();
    return new Map(lotes.map((lote: any) => [lote.id, validarLoteTiss({
      lote, registroAns: lote.convenios?.registro_ans ?? null, guias: guiasPorLote.get(lote.id) ?? [],
      autorizacoes: autorizacoesQuery.data ?? [], hoje,
    })]));
  }, [lotes, guiasPorLote, autorizacoesQuery.data]);
  // Lote antigo, sem guias, segue o fluxo agregado: o banco também só bloqueia lotes com guias.
  const envioBloqueado = (loteId: string) => (guiasPorLote.get(loteId)?.length ?? 0) > 0 && bloqueiaEnvio(pendenciasPorLote.get(loteId) ?? []);
  const [loteGuias, setLoteGuias] = useState<any | null>(null);
  const loteGlosaSelecionado = lotes.find((lote: any) => lote.id === glosaForm.lote_id);
  const totalGlosadoNoLote = glosas
    .filter((glosa: any) => glosa.lote_id === glosaForm.lote_id && glosa.status !== 'cancelada')
    .reduce((total: number, glosa: any) => total + Number(glosa.valor_glosado || 0), 0);
  const saldoGlosaDisponivel = loteGlosaSelecionado
    ? Math.max(0, Number((Number(loteGlosaSelecionado.valor_apresentado || 0) - totalGlosadoNoLote).toFixed(2)))
    : null;
  const consultasAtingiramLimite = lotes.length >= LIMITE_BUSCA_EM_BLOCOS
    || glosas.length >= LIMITE_BUSCA_EM_BLOCOS;
  const isLoading = conveniosQuery.isLoading || lotesQuery.isLoading || glosasQuery.isLoading || guiasQuery.isLoading || autorizacoesQuery.isLoading;

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

  const glosasEmAberto = glosas.filter((g: any) => ['pendente', 'recurso_preparacao', 'recurso_enviado'].includes(g.status)).length;
  const lotesRascunho = lotes.filter((l: any) => l.status === 'rascunho').length;
  const contarLotes = (status: string) => status === 'todos' ? lotes.length : lotes.filter((l: any) => l.status === status).length;
  const contarGlosas = (status: string) => status === 'todos' ? glosas.length : glosas.filter((g: any) => g.status === status).length;
  const filtroLoteAtivo = !!buscaLote.trim() || statusLote !== 'todos';
  const filtroGlosaAtivo = !!buscaGlosa.trim() || statusGlosa !== 'todos';
  const atualizando = conveniosQuery.isFetching || lotesQuery.isFetching || glosasQuery.isFetching;
  const atualizarTudo = () => { void conveniosQuery.refetch(); void lotesQuery.refetch(); void glosasQuery.refetch(); };

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
      const { data, error } = await (supabase as any).rpc('criar_lote_tiss', {
        p_convenio_id: lotForm.convenio_id,
        p_competencia: lotForm.competencia,
        p_numero_lote: lotForm.numero_lote.trim(),
        p_quantidade_guias: lotForm.quantidade_guias,
        p_valor_apresentado: lotForm.valor_apresentado,
      });
      if (error) throw error;
      if (!data?.success) throw new Error('O banco não confirmou a criação do lote.');
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

  async function updateLot(id: string): Promise<boolean> {
    if (loteEnviandoId) return false;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return false; }
    setLoteEnviandoId(id);
    try {
      const { data, error } = await (supabase as any).rpc('registrar_envio_lote_tiss', { p_lote_id: id });
      if (error) throw error;
      if (!data?.success) throw new Error('O lote já foi alterado. Atualize a lista antes de registrar o envio.');
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
    const statusEsperado: Record<typeof status, string> = {
      recurso_preparacao: glosas.find((item: any) => item.id === id)?.status === 'recurso_preparacao' ? 'recurso_preparacao' : 'pendente',
      recurso_enviado: 'recurso_preparacao',
      aceita: 'recurso_enviado',
      mantida: 'recurso_enviado',
    };
    try {
      const { data, error } = await (supabase as any).rpc('atualizar_glosa_convenio', {
        p_glosa_id: id,
        p_status: status,
        p_recurso_justificativa: status === 'recurso_preparacao' ? String(extra.recurso_justificativa || '') : null,
        p_valor_recuperado: ['aceita', 'mantida'].includes(status) ? Number(extra.valor_recuperado || 0) : null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(`A glosa já mudou de status (${statusEsperado[status]}). Atualize a lista antes de continuar.`);
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
    if (envioBloqueado(lote.id)) {
      toast.error('Corrija as pendências do lote antes de exportar.', { description: 'Cada guia e campo a corrigir está listado na conferência de guias.' });
      setLoteGuias(lote);
      return;
    }
    const guiasXml = (guiasPorLote.get(lote.id) ?? []).map(g => `<guia><numero>${escapeXml(g.numero_guia)}</numero><carteira>${escapeXml(g.numero_carteira)}</carteira><dataAtendimento>${escapeXml(g.data_atendimento)}</dataAtendimento><procedimento>${escapeXml(g.codigo_procedimento)}</procedimento><quantidade>${g.quantidade}</quantidade><valor>${Number(g.valor_total).toFixed(2)}</valor></guia>`).join('');
    const escape = (v: unknown) => String(v ?? '').replace(/[<>&'\"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;' }[c]!));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Resumo operacional EloLab; não é arquivo TISS de transmissão. -->\n<loteOperacional versaoTISS="${escape(lote.versao_tiss)}"><numero>${escape(lote.numero_lote)}</numero><competencia>${escape(lote.competencia)}</competencia><registroANS>${escape(lote.convenios?.registro_ans)}</registroANS><quantidadeGuias>${lote.quantidade_guias}</quantidadeGuias><valorApresentado>${Number(lote.valor_apresentado).toFixed(2)}</valorApresentado>${guiasXml ? `<guias>${guiasXml}</guias>` : ''}</loteOperacional>`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' })); const a = document.createElement('a'); a.href = url; a.download = `resumo-operacional-lote-${lote.numero_lote}.xml`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  if (guiasQuery.isError) return <ErrorState title="Não foi possível carregar as guias dos lotes" error={guiasQuery.error} onRetry={() => void guiasQuery.refetch()} />;
  if (autorizacoesQuery.isError) return <ErrorState title="Não foi possível carregar as autorizações de convênio" error={autorizacoesQuery.error} onRetry={() => void autorizacoesQuery.refetch()} />;
  if (glosasQuery.isError) return <ErrorState title="Não foi possível carregar as glosas" error={glosasQuery.error} onRetry={() => void glosasQuery.refetch()} />;
  if (isLoading) return <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground shadow-xs">Carregando faturamento de convênios…</div>;

  return <div className="space-y-6 pb-8">
    <PageHeader
      title="Faturamento de Convênios"
      description={lotes.length + glosas.length > 0
        ? `${lotes.length} lote(s) · ${lotesRascunho} em rascunho · ${glosasEmAberto} glosa(s) em aberto`
        : 'Lotes TISS, retorno das operadoras, glosas e recursos.'}
      icon={<FileStack />}
      actions={(
        <>
          <Button aria-label="Atualizar faturamento" variant="outline" size="icon" className="rounded-full" onClick={atualizarTudo} disabled={atualizando}>
            <RefreshCw className={cn('h-4 w-4', atualizando && 'animate-spin')} />
          </Button>
          <Button variant="outline" onClick={abrirRegistroGlosa} disabled={lotesParaRegistrarGlosa.length === 0} className="gap-2 rounded-full disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" title={lotesParaRegistrarGlosa.length === 0 ? 'Envie um lote antes de registrar uma glosa' : undefined}><AlertTriangle className="h-4 w-4" />Registrar glosa</Button>
          <Button onClick={abrirNovoLote} disabled={convenios.length === 0} className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"><Plus className="h-4 w-4" />Novo lote</Button>
        </>
      )}
    />
    {lotesComDivergenciaFinanceira.length > 0 && <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><p>{lotesComDivergenciaFinanceira.length} lote(s) têm diferença entre o total recebido e o conciliado no financeiro. Confira lançamentos existentes antes de conciliar, para evitar duplicidade.</p></div>}
    {consultasAtingiramLimite && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning"/><p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros. Os indicadores podem não incluir todos os lotes ou glosas.</p></div>}
    {convenios.length === 0 && <p role="status" className="rounded-2xl border border-[#DCE6F2] bg-[#F3F8FC] p-3 text-sm text-muted-foreground">Cadastre e ative um <Link to="/convenios" className="font-medium text-[#1080CA] underline underline-offset-4">convênio</Link> para criar lotes TISS. Registre glosas depois de marcar um lote como enviado.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      { label: 'Apresentado', legenda: 'lotes enviados à operadora', value: resumo.apresentado, icon: FileStack, cor: '' },
      { label: 'Pago', legenda: 'recebido das operadoras', value: resumo.pago, icon: BadgeCheck, cor: 'bg-success/10 text-success' },
      { label: 'Glosado', legenda: 'glosas não canceladas', value: resumo.glosado, icon: AlertTriangle, cor: 'bg-destructive/10 text-destructive' },
      { label: 'Recuperado', legenda: 'revertido em recurso', value: resumo.recuperado, icon: RotateCcw, cor: 'bg-info/10 text-info' },
    ].map(({ label, legenda, value, icon: Icon, cor }) => {
      const destaque = label === 'Apresentado';
      return <Card key={label} className={cn('h-full rounded-2xl shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md', destaque ? 'border-transparent bg-gradient-primary text-white' : 'border-border/60 bg-card')}><CardContent className="flex items-center gap-3 p-4"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', destaque ? 'bg-white/20 text-white' : cor)}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-lg font-bold tabular-nums sm:text-2xl">{brl(value)}</p><p className={cn('text-[11px]', destaque ? 'text-white/80' : 'text-muted-foreground')}>{label} · {legenda}</p></div></CardContent></Card>;
    })}</div>
    <Tabs defaultValue="lotes"><TabsList className="h-auto flex-wrap rounded-full border border-[#DCE6F2] bg-[#EEF4FA] p-1 [&>button]:rounded-full"><TabsTrigger value="lotes">Lotes ({lotes.length})</TabsTrigger><TabsTrigger value="glosas">Glosas ({glosas.length})</TabsTrigger><TabsTrigger value="conciliacao">Conciliação</TabsTrigger><TabsTrigger value="relatorio">Por competência</TabsTrigger></TabsList>
      <TabsContent value="lotes">
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white"><FileStack className="h-4 w-4" /></span>Lotes registrados</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar lote por número, convênio ou competência" placeholder="Buscar número, convênio ou competência..." value={buscaLote} onChange={event => setBuscaLote(event.target.value)} className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" /></div>
              <Select value={statusLote} onValueChange={setStatusLote}><SelectTrigger aria-label="Filtrar lotes por status" className="h-10 rounded-full sm:w-52"><SelectValue placeholder="Todos os status" /></SelectTrigger><SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem><SelectItem value="rascunho">Rascunho</SelectItem><SelectItem value="enviado">Enviado</SelectItem><SelectItem value="processando">Processando</SelectItem><SelectItem value="pago_parcial">Pago parcial</SelectItem><SelectItem value="pago">Pago</SelectItem><SelectItem value="rejeitado">Rejeitado</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent></Select>
            </div>
            {lotes.length > 0 && <div className="flex flex-wrap items-center gap-2">
              {PILULAS_LOTE.map(p => <button key={p.value} type="button" aria-pressed={statusLote === p.value} onClick={() => setStatusLote(p.value)} className={pilulaClasse(statusLote === p.value)}>{p.label} <span className="tabular-nums opacity-80">{contarLotes(p.value)}</span></button>)}
              {filtroLoteAtivo && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => { setBuscaLote(''); setStatusLote('todos'); }}>Limpar filtros</Button>}
              <p className="ml-auto text-xs tabular-nums text-muted-foreground">Mostrando {lotesFiltrados.length} de {lotes.length} lotes.</p>
            </div>}
            {isLoading ? <p>Carregando…</p> : lotesFiltrados.length === 0 ? <div className="flex flex-col items-center gap-2 py-8 text-center"><span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><FileStack className="h-7 w-7" /></span><p className="text-sm text-muted-foreground">{lotes.length === 0 ? 'Nenhum lote cadastrado. Crie um lote depois de fechar as guias da competência.' : 'Nenhum lote corresponde à busca e aos filtros.'}</p>{lotes.length > 0 && <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setBuscaLote(''); setStatusLote('todos'); }}>Limpar filtros</Button>}</div> : <div className="overflow-hidden rounded-xl border border-border/60"><div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Convênio</TableHead><TableHead>Competência</TableHead><TableHead className="text-right">Apresentado / recebido</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>{lotesFiltrados.map((l: any) => <TableRow key={l.id}>
              <TableCell className="font-medium">{l.numero_lote}<p className="text-[10px] text-muted-foreground">TISS {l.versao_tiss} · {l.quantidade_guias} guias</p></TableCell>
              <TableCell>{l.convenios?.nome}</TableCell>
              <TableCell>{format(new Date(`${l.competencia}T12:00:00`), 'MM/yyyy')}</TableCell>
              <TableCell className="text-right"><span>{brl(l.valor_apresentado)}</span><p className="text-xs text-muted-foreground">Recebido: {brl(l.valor_pago)}</p><p className="text-xs text-muted-foreground">No financeiro: {brl(l.valor_conciliado_financeiro || 0)}</p></TableCell>
              <TableCell><Badge variant="outline" className={cn('whitespace-nowrap rounded-full', STATUS_LOTE_COR[l.status])}>{l.status.replaceAll('_', ' ')}</Badge>{(() => {
                const erros = (pendenciasPorLote.get(l.id) ?? []).filter(p => p.gravidade === 'erro').length;
                return envioBloqueado(l.id) ? <p className="mt-1 text-xs font-medium text-destructive">{erros} pendência(s) a corrigir</p> : null;
              })()}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" onClick={() => setLoteGuias(l)} aria-label={`Conferir guias do lote ${l.numero_lote}`}>Guias ({guiasPorLote.get(l.id)?.length ?? 0})</Button>
                <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs" onClick={() => exportLot(l)} aria-label={`Baixar resumo XML do lote ${l.numero_lote}`} title="Baixar resumo operacional XML (não é arquivo TISS de transmissão)"><FileDown className="mr-1 h-4 w-4" />Baixar resumo XML</Button>
                {l.status === 'rascunho' && <Button size="sm" className="h-9 rounded-full bg-[#1080CA] text-xs text-white hover:bg-[#1080CA] hover:brightness-110" disabled={loteEnviandoId !== null || envioBloqueado(l.id)} title={envioBloqueado(l.id) ? 'Corrija as pendências das guias antes de registrar o envio' : undefined} onClick={() => setLoteParaConfirmarEnvio(l)}>{loteEnviandoId === l.id && <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />}Registrar envio</Button>}
                {['enviado', 'processando', 'pago_parcial', 'pago'].includes(l.status) && <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" onClick={() => abrirRetornoLote(l)}>{l.retorno_em ? 'Atualizar retorno' : 'Registrar retorno'}</Button>}
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table></div></div>}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="glosas"><Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white"><AlertTriangle className="h-4 w-4" /></span>Tratamento de glosas</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar glosa por código, guia, motivo, lote ou convênio" placeholder="Buscar código, guia, motivo, lote ou convênio..." value={buscaGlosa} onChange={event => setBuscaGlosa(event.target.value)} className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" /></div><Select value={statusGlosa} onValueChange={setStatusGlosa}><SelectTrigger aria-label="Filtrar glosas por status" className="h-10 rounded-full sm:w-52"><SelectValue placeholder="Todos os status" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="recurso_preparacao">Preparando recurso</SelectItem><SelectItem value="recurso_enviado">Recurso enviado</SelectItem><SelectItem value="aceita">Aceita</SelectItem><SelectItem value="mantida">Mantida</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem></SelectContent></Select></div>
        {glosas.length > 0 && <div className="flex flex-wrap items-center gap-2">
          {PILULAS_GLOSA.map(p => <button key={p.value} type="button" aria-pressed={statusGlosa === p.value} onClick={() => setStatusGlosa(p.value)} className={pilulaClasse(statusGlosa === p.value)}>{p.label} <span className="tabular-nums opacity-80">{contarGlosas(p.value)}</span></button>)}
          {filtroGlosaAtivo && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => { setBuscaGlosa(''); setStatusGlosa('todos'); }}>Limpar filtros</Button>}
          <p className="ml-auto text-xs tabular-nums text-muted-foreground">Mostrando {glosasFiltradas.length} de {glosas.length} glosas.</p>
        </div>}
        {glosasFiltradas.length > 0 ? <div className="overflow-hidden rounded-xl border border-border/60"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Código / motivo</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Glosado</TableHead><TableHead className="text-right">Recuperado</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{glosasFiltradas.map((g: any) => <TableRow key={g.id}><TableCell><b>{g.codigo_glosa}</b>{g.guia_referencia && <p className="text-xs text-muted-foreground">Guia: {g.guia_referencia}</p>}<p className="max-w-sm text-xs text-muted-foreground">{g.motivo}</p>{g.recurso_justificativa && <p className="mt-1 max-w-sm text-xs text-muted-foreground">Recurso: {g.recurso_justificativa}</p>}<ResumoRecurso glosa={g} responsavel={responsaveisQuery.data?.find(r => r.id === g.recurso_responsavel_id)?.nome} documentos={documentosPorGlosa.get(g.id)?.length ?? 0} /></TableCell><TableCell>{g.lotes_tiss?.numero_lote}<p className="text-[10px]">{g.lotes_tiss?.convenios?.nome}</p></TableCell><TableCell className="text-right">{brl(g.valor_glosado)}</TableCell><TableCell className="text-right">{brl(g.valor_recuperado)}</TableCell><TableCell><Badge variant="outline" className={cn('whitespace-nowrap rounded-full', STATUS_GLOSA_COR[g.status])}>{g.status.replaceAll('_',' ')}</Badge></TableCell><TableCell className="space-x-1 space-y-1">{g.status === 'pendente' && <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={glosaAtualizandoId !== null} onClick={() => setGlosaParaRecurso(g)}>Preparar recurso</Button>}{g.status === 'recurso_preparacao' && <><Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={glosaAtualizandoId !== null} onClick={() => setGlosaParaRecurso(g)}>Revisar recurso</Button><Button size="sm" className="h-9 rounded-full bg-[#1080CA] text-xs text-white hover:bg-[#1080CA] hover:brightness-110" disabled={glosaAtualizandoId !== null || String(g.recurso_justificativa || '').trim().length < 10 || !g.recurso_prazo || !g.recurso_responsavel_id} title={!g.recurso_prazo || !g.recurso_responsavel_id ? 'Defina prazo e responsável antes de enviar' : undefined} onClick={() => void updateGlosa(g.id, 'recurso_enviado')}>Marcar enviado</Button></>}{g.status === 'recurso_enviado' && <Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110" disabled={glosaAtualizandoId !== null} onClick={() => { setGlosaParaRetorno(g); setDecisaoOperadora('aceita'); setValorRecuperado(String(g.valor_glosado)); }}>Registrar retorno</Button>}</TableCell></TableRow>)}</TableBody></Table></div></div> : <div className="flex flex-col items-center gap-2 py-8 text-center"><span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><ShieldCheck className="h-7 w-7" /></span><p className="text-sm text-muted-foreground">{glosas.length === 0 ? 'Nenhuma glosa registrada nesta clínica.' : 'Nenhuma glosa corresponde à busca e aos filtros.'}</p>{glosas.length > 0 && <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setBuscaGlosa(''); setStatusGlosa('todos'); }}>Limpar filtros</Button>}</div>}
      </CardContent></Card></TabsContent>
      <TabsContent value="conciliacao">
        {profile?.clinica_id && <ConciliacaoConvenioPorLote clinicaId={profile.clinica_id} lotes={lotesComNomeConvenio} />}
      </TabsContent>
      <TabsContent value="relatorio">
        <RelatorioFaturamentoCompetencia convenios={convenios} glosas={glosas} lotes={lotesComNomeConvenio} />
      </TabsContent>
    </Tabs>
    <div className="flex items-start gap-2 rounded-2xl border border-[#DCE6F2] bg-[#F3F8FC] p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-[#1080CA]" /><span>O XML é um resumo operacional e este sistema não o transmite à operadora. Valide o arquivo no padrão/XSD exigido e registre o envio somente depois de transmiti-lo pelo canal oficial. O retorno pode ser conciliado com o <Link to="/fluxo-caixa" className="font-medium text-[#1080CA] underline-offset-2 hover:underline">Fluxo de Caixa</Link> pelo formulário. Como o lote não identifica as cobranças individuais, confira lançamentos anteriores antes de confirmar para evitar duplicidade.</span></div>

    <GuiasLoteDialog
      lote={loteGuias}
      guias={loteGuias ? guiasPorLote.get(loteGuias.id) ?? [] : []}
      autorizacoes={(autorizacoesQuery.data ?? []).filter(a => !loteGuias || a.convenio_id === loteGuias.convenio_id || (guiasPorLote.get(loteGuias.id) ?? []).some(g => g.autorizacao_id === a.id))}
      pendencias={loteGuias ? pendenciasPorLote.get(loteGuias.id) ?? [] : []}
      onOpenChange={open => { if (!open) setLoteGuias(null); }}
      onChanged={() => queryClient.invalidateQueries({ queryKey: ['lote-tiss-guias'] })}
    />
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
              void updateLot(loteParaConfirmarEnvio.id).then(salvou => {
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

    <Dialog open={lotOpen} onOpenChange={open => { if (!saving) setLotOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Novo lote TISS</DialogTitle></DialogHeader><fieldset disabled={saving} className="contents"><div className="space-y-3"><Field label="Convênio"><Select value={lotForm.convenio_id} onValueChange={v => setLotForm(f => ({...f,convenio_id:v}))}><SelectTrigger aria-label="Convênio"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{convenios.map((c:any)=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Número do lote"><Input value={lotForm.numero_lote} onChange={e=>setLotForm(f=>({...f,numero_lote:e.target.value}))}/></Field><Field label="Competência"><Input type="month" value={lotForm.competencia.slice(0, 7)} onChange={e=>setLotForm(f=>({...f,competencia:e.target.value ? `${e.target.value}-01` : ''}))}/></Field><Field label="Quantidade de guias"><Input type="number" min="1" value={lotForm.quantidade_guias} onChange={e=>setLotForm(f=>({...f,quantidade_guias:Number(e.target.value)}))}/></Field><Field label="Valor apresentado"><Input type="number" min="0.01" step="0.01" value={lotForm.valor_apresentado} onChange={e=>setLotForm(f=>({...f,valor_apresentado:Number(e.target.value)}))}/></Field></div></div></fieldset><DialogFooter><Button variant="outline" onClick={() => setLotOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={saveLot} disabled={saving}>{saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}Salvar</Button></DialogFooter></DialogContent></Dialog>
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
              <SelectTrigger aria-label="Lote"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
    {profile?.clinica_id && <RecursoGlosaDialog glosa={glosaParaRecurso} clinicaId={profile.clinica_id} responsaveis={responsaveisQuery.data ?? []} documentos={glosaParaRecurso ? documentosPorGlosa.get(glosaParaRecurso.id) ?? [] : []} salvarJustificativa={(id, justificativa) => updateGlosa(id, 'recurso_preparacao', { recurso_justificativa: justificativa })} onClose={() => setGlosaParaRecurso(null)} onChanged={() => Promise.all([queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] }), queryClient.invalidateQueries({ queryKey: ['glosa-recurso-documentos'] })])} />}
    <Dialog open={!!glosaParaRetorno} onOpenChange={open => { if (!open && glosaAtualizandoId === null) setGlosaParaRetorno(null); }}><DialogContent><DialogHeader><DialogTitle>Registrar retorno da operadora</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Glosa {glosaParaRetorno?.codigo_glosa} · valor original {brl(Number(glosaParaRetorno?.valor_glosado || 0))}</p><Field label="Decisão"><Select value={decisaoOperadora} disabled={glosaAtualizandoId !== null} onValueChange={value=>setDecisaoOperadora(value as 'aceita' | 'mantida')}><SelectTrigger aria-label="Decisão"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aceita">Recurso aceito</SelectItem><SelectItem value="mantida">Glosa mantida</SelectItem></SelectContent></Select></Field>{decisaoOperadora === 'aceita' && <Field label="Valor recuperado"><Input type="number" min="0" max={glosaParaRetorno?.valor_glosado || 0} step="0.01" disabled={glosaAtualizandoId !== null} value={valorRecuperado} onChange={e=>setValorRecuperado(e.target.value)} /></Field>}<DialogFooter><Button variant="outline" onClick={()=>setGlosaParaRetorno(null)} disabled={glosaAtualizandoId !== null}>Cancelar</Button><Button onClick={salvarRetornoOperadora} disabled={glosaAtualizandoId !== null}>{glosaAtualizandoId === glosaParaRetorno?.id && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}Registrar decisão</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const controlId = useId();
  const labelId = `${controlId}-label`;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, { id: controlId, 'aria-labelledby': labelId })
    : children;
  return <div className="space-y-1.5"><Label id={labelId} htmlFor={controlId}>{label}</Label>{control}</div>;
}
