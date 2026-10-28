import { nomeMedico } from '@/lib/formatters';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { format, addDays, differenceInMinutes, differenceInHours, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { PageHeader } from '@/components/PageHeader';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { dadosAoRegistrarColeta, gravarFiltrosWorklist, lerFiltrosWorklist, podeGerenciarLaboratorioPorPapel, podeRegistrarResultado, resumirPendenciasPorSetor, STATUS_COLETA_LABELS, STATUS_COLETA_PENDENTES, type FiltrosWorklist } from '@/lib/laboratorioWorkflow';
import { dateOnlyInTimeZone, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { Link, useSearchParams } from 'react-router-dom';
import { PedidosLaboratorioPanel } from '@/pages/laboratorio/PedidosLaboratorioPanel';
import { GestaoLaboratorioPanel } from '@/pages/laboratorio/GestaoLaboratorioPanel';
import { IndicadoresLaboratorioPanel } from '@/pages/laboratorio/IndicadoresLaboratorioPanel';
import { LaboratorioSubnav } from '@/components/laboratorio/LaboratorioSubnav';

/**
 * Teto da worklist do laboratório.
 *
 * O PostgREST corta em 1.000 linhas por padrão e não avisa. Pedimos um a mais
 * que este teto para detectar o corte e dizer ao operador que existe mais
 * histórico, em vez de deixá-lo achar que a amostra sumiu.
 */
const TETO_WORKLIST = 500;
const FUSO_CLINICA = 'America/Sao_Paulo';

function dataHoraLocalDaClinica(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function dataHoraDaClinicaParaIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const targetWallTime = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), Number(hourText), Number(minuteText));
  const initial = new Date(targetWallTime);
  const clinicParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(initial);
  const part = (type: string) => Number(clinicParts.find(item => item.type === type)?.value || 0);
  const representedWallTime = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  const instant = new Date(targetWallTime - (representedWallTime - targetWallTime));
  const resolved = dataHoraLocalDaClinica(instant);
  return resolved === value ? instant.toISOString() : null;
}

import {
  FlaskConical, Search, Plus, TestTube, ClipboardCheck, AlertTriangle,
  Clock, CheckCircle2, XCircle, Eye, Printer, Tag,
  User, Droplets, MapPin, Package, FileText, Link2, Filter,
  TrendingUp, Activity, Calendar, ArrowRight, Trash2, RotateCcw,
  Download, Zap, Timer, Shield, Loader2, RefreshCw, Phone,
} from 'lucide-react';
import { linkWhatsApp } from '@/lib/whatsapp';

const statusColors: Record<string, string> = {
  pendente: 'border border-[#f1dfb8] bg-[#fff8e8] text-[#8a5b00]',
  coletado: 'border border-[#BFD8EE] bg-[#EEF4FA] text-[#0B5E96]',
  em_analise: 'border border-[#c8eaf1] bg-[#edfbff] text-[#087e98]',
  validado: 'border border-[#ccebdd] bg-[#effaf4] text-[#16734d]',
  liberado: 'border border-[#ccebdd] bg-[#effaf4] text-[#16734d]',
  cancelado: 'border border-[#f1d1d1] bg-[#fff0f0] text-[#a83232]',
  recoleta: 'border border-[#f1dfb8] bg-[#fff8e8] text-[#8a5b00]',
  rejeitada: 'border border-[#f1d1d1] bg-[#fff0f0] text-[#a83232]',
};

const statusLabels = STATUS_COLETA_LABELS;

const PIPELINE_STEPS = ['pendente', 'coletado', 'em_analise', 'validado', 'liberado'];
const LIMITE_PENDENCIAS_SETOR = 2000;

const CONDICOES_AMOSTRA = ['Hemólise', 'Lipemia', 'Icterícia', 'Coagulada', 'Volume insuficiente'];

const SITIOS_COLETA = [
  'Braço direito (veia cubital)', 'Braço esquerdo (veia cubital)',
  'Mão direita', 'Mão esquerda', 'Acesso venoso central',
  'Veia jugular', 'Cateter', 'Outro',
];

const TUBOS = [
  { value: 'EDTA (Roxo)', color: 'bg-purple-500' },
  { value: 'Soro (Amarelo)', color: 'bg-yellow-400' },
  { value: 'Seco (Vermelho)', color: 'bg-red-500' },
  { value: 'Citrato (Azul)', color: 'bg-blue-400' },
  { value: 'Fluoreto (Cinza)', color: 'bg-gray-400' },
  { value: 'Heparina (Verde)', color: 'bg-green-500' },
  { value: 'Coletor Urina', color: 'bg-amber-300' },
  { value: 'Coletor Fezes', color: 'bg-amber-700' },
  { value: 'Swab (Laranja)', color: 'bg-orange-400' },
];

const SLA_WARNING_MINUTES = 120; // 2h
const SLA_CRITICAL_MINUTES = 240; // 4h

function parseNumeroOpcional(valor: unknown): number | null {
  if (valor == null || String(valor).trim() === '') return null;
  const normalizado = String(valor).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}

export default function Laboratorio() {
  const [agora, setAgora] = useState(() => new Date());
  const [search, setSearch] = useState('');
  // Filtros na URL: sobrevivem à atualização da worklist, ao recarregar e ao voltar de outra tela.
  const [searchParams, setSearchParams] = useSearchParams();
  const filtrosWorklist = lerFiltrosWorklist(searchParams);
  const { status: statusFilter, setor: setorFilter, periodo: dateFilter, urgente: urgentOnly } = filtrosWorklist;
  const atualizarFiltros = (patch: Partial<FiltrosWorklist>) =>
    setSearchParams(atual => gravarFiltrosWorklist(atual, { ...lerFiltrosWorklist(atual), ...patch }), { replace: true });
  const setStatusFilter = (status: string) => atualizarFiltros({ status });
  const setSetorFilter = (setor: string) => atualizarFiltros({ setor });
  const setDateFilter = (periodo: string) => atualizarFiltros({ periodo });
  const [showNewColeta, setShowNewColeta] = useState(false);

  // Limpeza de fila em lote: a INOVALAB acumulou 253 coletas em `pendente`
  // vindas de exames que nunca tinham passado pelo laboratório. Sem uma
  // saída em bloco, o técnico teria que cancelar uma a uma.
  const [showLimparFila, setShowLimparFila] = useState(false);
  const [limparDias, setLimparDias] = useState('30');
  const [limparMotivo, setLimparMotivo] = useState('');

  const [showResultados, setShowResultados] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('worklist');
  const worklistTabRef = useRef<HTMLButtonElement>(null);
  const focusWorklistAfterFilter = useRef(false);
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const podeGerenciarLaboratorio = podeGerenciarLaboratorioPorPapel(profile?.roles);
  const [newColetaForm, setNewColetaForm] = useState({
    paciente_id: '', medico_solicitante_id: '', tipo_amostra: 'sangue',
    tubo: '', observacoes: '', jejum_necessario: false, jejum_horas: 0, urgente: false,
    coletado_por: '', data_coleta: dataHoraLocalDaClinica(),
    exame_id: '', volume_ml: '', condicao_amostra: [] as string[], sitio_coleta: '', lote_insumo: '',
    finalidade: 'diagnostico', indicacao_clinica: '', categoria_exame: '',
    numero_guia: '', material: '', trouxe_material: false, cid: '', procedimento_codigo: '', convenio_id: '', grupo: '', setor_id: '',
  });

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab !== 'worklist' || !focusWorklistAfterFilter.current) return;
    focusWorklistAfterFilter.current = false;
    worklistTabRef.current?.focus();
  }, [activeTab]);

  const previewLimpar = useQuery({
    queryKey: ['preview-limpar-fila-lab', profile?.clinica_id, limparDias],
    enabled: !!profile?.clinica_id && showLimparFila && Number(limparDias) >= 1,
    queryFn: async () => {
      const dias = Number(limparDias);
      const corte = new Date(Date.now() - dias * 86400_000).toISOString();
      const { count, error } = await supabase
        .from('coletas_laboratorio')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', profile!.clinica_id!)
        .eq('status', 'pendente')
        .lt('created_at', corte);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const limparFila = useMutation({
    mutationFn: async () => {
      if (!podeGerenciarLaboratorio) throw new Error('Seu perfil não pode limpar a fila do laboratório.');
      const dias = Number(limparDias);
      if (!Number.isFinite(dias) || dias < 1) throw new Error('Informe dias >= 1');
      if (!limparMotivo || limparMotivo.trim().length < 5) throw new Error('Motivo mínimo 5 caracteres');
      const { data, error } = await supabase
        .rpc('cancelar_coletas_pendentes_antigas', { p_dias: dias, p_motivo: limparMotivo.trim() });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio', profile?.clinica_id] });
      queryClient.invalidateQueries({ queryKey: ['preview-limpar-fila-lab'] });
      setShowLimparFila(false);
      setLimparMotivo('');
      toast.success(n === 0 ? 'Nada a cancelar' : `${n} coleta(s) cancelada(s)`);
    },
    onError: (e) => toast.error('Não foi possível cancelar em lote', { description: mensagemDeErro(e) }),
  });


  const medicosQuery = useQuery({
    queryKey: ['medicos-lab', profile?.clinica_id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('medicos').select('id, nome, crm, especialidade').eq('clinica_id', profile!.clinica_id!).order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const medicos = medicosQuery.data;

  const funcionariosQuery = useQuery({
    queryKey: ['funcionarios-lab', profile?.clinica_id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nome').eq('clinica_id', profile!.clinica_id!).order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const funcionarios = funcionariosQuery.data;

  const conveniosQuery = useQuery({
    queryKey: ['convenios-lab', profile?.clinica_id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('convenios').select('id, nome, codigo').eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const convenios = conveniosQuery.data;

  const setoresQuery = useQuery({
    queryKey: ['lab-setores-worklist', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorio_setores')
        .select('id, nome').eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });

  const examesPendentesQuery = useQuery({
    queryKey: ['exames-pendentes-lab', profile?.clinica_id, user?.id, newColetaForm.paciente_id],
    queryFn: async () => {
      if (!newColetaForm.paciente_id) return { items: [], hasMore: false };
      const { data, error } = await (supabase as any).from('exames').select('id, tipo_exame, paciente_id, pacientes(nome), tipo_exames_catalog(setor_id)')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('paciente_id', newColetaForm.paciente_id)
        .in('status', ['solicitado', 'agendado'])
        .order('data_solicitacao', { ascending: false })
        .order('id', { ascending: true })
        .limit(201);
      if (error) throw error;
      const pedidos = data ?? [];
      return { items: pedidos.slice(0, 200), hasMore: pedidos.length > 200 };
    },
    enabled: !!profile?.clinica_id && showNewColeta && !!newColetaForm.paciente_id,
  });

  const coletasQuery = useInfiniteQuery({
    queryKey: ['coletas-laboratorio', profile?.clinica_id, user?.id, setorFilter],
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      let query = (supabase as any)
        .from('coletas_laboratorio')
        .select('*, pacientes(nome, cpf, data_nascimento, sexo, telefone), medicos(nome, crm, especialidade), laboratorio_setores(nome)')
        .eq('clinica_id', profile!.clinica_id!);
      if (setorFilter !== 'todos') query = query.eq('setor_id', setorFilter);
      if (pageParam) {
        // Paginação por cursor: várias amostras podem ter o mesmo created_at,
        // então o id também desempata para não pular nem repetir registros.
        query = query.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(TETO_WORKLIST + 1);
      if (error) throw error;
      const linhas = data ?? [];
      return { items: linhas.slice(0, TETO_WORKLIST), hasMore: linhas.length > TETO_WORKLIST };
    },
    getNextPageParam: (ultimaPagina) => {
      if (!ultimaPagina.hasMore || ultimaPagina.items.length === 0) return undefined;
      const ultimaColeta = ultimaPagina.items[ultimaPagina.items.length - 1];
      return { created_at: ultimaColeta.created_at, id: ultimaColeta.id };
    },
    enabled: !!profile?.clinica_id,
  });
  const coletas = coletasQuery.data?.pages.flatMap(pagina => pagina.items);
  const isLoading = coletasQuery.isLoading;

  // Mesmo prefixo da worklist: as invalidações após cada ação também recontam as pendências.
  const pendenciasSetorQuery = useQuery({
    queryKey: ['coletas-laboratorio', profile?.clinica_id, 'pendencias-setor'],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('coletas_laboratorio')
        .select('setor_id, urgente')
        .eq('clinica_id', profile!.clinica_id!)
        .in('status', [...STATUS_COLETA_PENDENTES])
        .limit(LIMITE_PENDENCIAS_SETOR + 1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const pendenciasPorSetor = useMemo(
    () => resumirPendenciasPorSetor((pendenciasSetorQuery.data ?? []).slice(0, LIMITE_PENDENCIAS_SETOR), setoresQuery.data ?? []),
    [pendenciasSetorQuery.data, setoresQuery.data],
  );

  const resultadosQuery = useQuery({
    queryKey: ['resultados-laboratorio', profile?.clinica_id, user?.id, showResultados],
    queryFn: async () => {
      if (!showResultados) return [];
      const { data: coleta, error: coletaError } = await supabase.from('coletas_laboratorio')
        .select('id')
        .eq('id', showResultados)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (coletaError) throw coletaError;
      if (!coleta) throw new Error('Amostra não encontrada na clínica atual.');
      const { data, error } = await supabase
        .from('resultados_laboratorio')
        .select('*')
        .eq('coleta_id', showResultados)
        .order('parametro');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id && !!showResultados,
  });
  const perfilCatalogoQuery = useQuery({
    queryKey: ['lab-perfil-catalogo-coleta', profile?.clinica_id, showResultados],
    enabled: !!profile?.clinica_id && !!showResultados,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('coletas_laboratorio')
        .select('exames(tipo_exame, tipo_exames_catalog(nome, unidade_padrao, referencia_min, referencia_max, referencia_texto, metodo_padrao))')
        .eq('clinica_id', profile!.clinica_id).eq('id', showResultados).maybeSingle();
      if (error) throw error;
      const exame = Array.isArray(data?.exames) ? data.exames[0] : data?.exames;
      const catalogo = Array.isArray(exame?.tipo_exames_catalog) ? exame.tipo_exames_catalog[0] : exame?.tipo_exames_catalog;
      return catalogo ? { ...catalogo, nome: catalogo.nome || exame?.tipo_exame || '' } : null;
    },
  });
  const resultados = resultadosQuery.data;

  const createColeta = useMutation({
    mutationFn: async (form: any) => {
      if (!profile?.clinica_id || !user?.id) throw new Error('Usuário ou clínica não identificados.');
      if (form.exame_id) {
        const { data: coletaExistente, error: erroConsulta } = await supabase
          .from('coletas_laboratorio')
          .select('id')
          .eq('clinica_id', profile.clinica_id)
          .eq('exame_id', form.exame_id)
          .limit(1)
          .maybeSingle();
        if (erroConsulta) throw erroConsulta;
        if (coletaExistente) {
          throw new Error('Este pedido já possui uma coleta. Localize a amostra existente na worklist para continuar o atendimento.');
        }
      }
      const payload = { ...form, clinica_id: profile.clinica_id };
      const { error } = await supabase.from('coletas_laboratorio').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio', profile?.clinica_id] });
      queryClient.invalidateQueries({ queryKey: ['exames-pendentes-lab', profile?.clinica_id] });
      toast.success('Coleta registrada com sucesso');
      setShowNewColeta(false);
    },
    onError: (e) => toast.error('Erro ao registrar coleta', { description: mensagemDeErro(e) }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, expectedStatus }: { id: string; status: string; expectedStatus: string }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const allowedNext: Record<string, string[]> = {
        pendente: ['coletado', 'cancelado'],
        recoleta: ['coletado', 'cancelado'],
        coletado: ['em_analise'],
        em_analise: ['validado'],
      };
      if (!allowedNext[expectedStatus]?.includes(status)) throw new Error('Esta transição de status não é permitida. Atualize a worklist.');
      if (status === 'validado') {
        // A validação precisa registrar a autoria de quem conferiu os resultados
        // na mesma transação que avança o status. Uma leitura seguida de update
        // direto contornava esse registro e permitia divergência entre telas.
        const { error } = await (supabase as any).rpc('validar_coleta_laboratorio', {
          p_coleta_id: id,
        });
        if (error) throw error;
        return;
      }
      const updates: Record<string, unknown> = { status };
      if (status === 'coletado') Object.assign(updates, dadosAoRegistrarColeta(new Date(), profile.id));
      const { data, error } = await (supabase as any).from('coletas_laboratorio').update(updates)
        .eq('id', id).eq('clinica_id', profile.clinica_id).eq('status', expectedStatus).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A coleta mudou de status ou não pertence à clínica atual. Atualize a worklist.');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio', profile?.clinica_id] });
      toast.success(variables.status === 'validado' ? 'Coleta validada e conferência registrada' : 'Status atualizado');
    },
    // Sem `onError` o botão parecia não fazer nada: o técnico seguia
    // trabalhando com uma coleta pendente sem saber que o update falhou.
    onError: (e) => toast.error('Não foi possível mudar o status da coleta', {
      description: mensagemDeErro(e),
    }),
  });

  const addResultado = useMutation({
    mutationFn: async (form: any) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!String(form.parametro ?? '').trim() || !String(form.resultado ?? '').trim()) {
        throw new Error('Informe o parâmetro e o resultado da análise.');
      }
      const referenciaMinima = parseNumeroOpcional(form.valor_referencia_min);
      const referenciaMaxima = parseNumeroOpcional(form.valor_referencia_max);
      if ([referenciaMinima, referenciaMaxima].some(valor => valor !== null && !Number.isFinite(valor))) {
        throw new Error('Os valores de referência precisam ser numéricos.');
      }
      if (referenciaMinima !== null && referenciaMaxima !== null && referenciaMinima > referenciaMaxima) {
        throw new Error('O valor de referência mínimo não pode ser maior que o máximo.');
      }
      const { data: coleta, error: coletaError } = await supabase.from('coletas_laboratorio')
        .select('id, paciente_id, status')
        .eq('id', form.coleta_id)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (coletaError) throw coletaError;
      if (!coleta || !['coletado', 'em_analise'].includes(coleta.status)) {
        throw new Error('Só é possível registrar resultado em uma amostra coletada que ainda esteja em análise.');
      }
      const { error } = await supabase.from('resultados_laboratorio').insert({
        ...form,
        parametro: String(form.parametro).trim(),
        resultado: String(form.resultado).trim(),
        valor_referencia_min: referenciaMinima,
        valor_referencia_max: referenciaMaxima,
        paciente_id: coleta.paciente_id,
        clinica_id: profile.clinica_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resultados-laboratorio', profile?.clinica_id] });
      setNewResultForm({ parametro: '', resultado: '', unidade: '', valor_referencia_min: '', valor_referencia_max: '', valor_referencia_texto: '', metodo: '', critico: false });
      toast.success('Resultado adicionado');
    },
    onError: (e) => toast.error('Erro ao adicionar resultado', { description: mensagemDeErro(e) }),
  });

  const hojeNaClinica = todaySaoPauloDateOnly(agora);
  const ontemNaClinica = format(addDays(parseDateOnly(hojeNaClinica)!, -1), 'yyyy-MM-dd');

  // ─── Filtering with date ─────────────────────────────────
  const filtered = useMemo(() => {
    if (!coletas) return [];
    return coletas.filter((c: any) => {
      // Search
      if (search.trim()) {
        // O código da amostra é específico do laboratório; paciente segue a
        // mesma regra das outras telas (sem acento, CPF sem máscara).
        const codigo = c.codigo_amostra?.toLowerCase().includes(search.trim().toLowerCase());
        const paciente = c.pacientes && pacienteCorresponde(c.pacientes, search);
        if (!codigo && !paciente) return false;
      }
      // Status
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      // Urgent
      if (urgentOnly && !c.urgente) return false;
      // Date
      const diaCriacao = c.created_at ? dateOnlyInTimeZone(new Date(c.created_at), FUSO_CLINICA) : null;
      if (dateFilter === 'hoje' && diaCriacao !== hojeNaClinica) return false;
      if (dateFilter === 'ontem' && diaCriacao !== ontemNaClinica) return false;
      if (dateFilter === '7dias' && c.created_at && new Date(c.created_at) < subDays(agora, 7)) return false;
      return true;
    });
  }, [coletas, search, statusFilter, urgentOnly, dateFilter, hojeNaClinica, ontemNaClinica, agora]);

  // ─── Stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!coletas) return { pendentes: 0, coletados: 0, emAnalise: 0, validados: 0, liberados: 0, cancelados: 0, urgentes: 0, total: 0 };
    const todayItems = coletas.filter((c: any) => c.created_at && dateOnlyInTimeZone(new Date(c.created_at), FUSO_CLINICA) === hojeNaClinica);
    return {
      pendentes: todayItems.filter((c: any) => c.status === 'pendente').length,
      coletados: todayItems.filter((c: any) => c.status === 'coletado').length,
      emAnalise: todayItems.filter((c: any) => c.status === 'em_analise').length,
      validados: todayItems.filter((c: any) => c.status === 'validado').length,
      liberados: todayItems.filter((c: any) => c.status === 'liberado').length,
      cancelados: todayItems.filter((c: any) => c.status === 'cancelado').length,
      urgentes: todayItems.filter((c: any) => c.urgente).length,
      total: todayItems.filter((c: any) => c.status !== 'cancelado').length,
    };
  }, [coletas, hojeNaClinica]);

  // SLA tracking
  const slaBreaches = useMemo(() => {
    if (!coletas) return [];
    return coletas.filter((c: any) => {
      if (c.status === 'liberado' || c.status === 'cancelado') return false;
      if (!c.created_at) return false;
      const mins = differenceInMinutes(agora, new Date(c.created_at));
      return mins > SLA_CRITICAL_MINUTES;
    });
  }, [coletas, agora]);

  const completionRate = stats.total > 0
    ? Math.round(((stats.liberados + stats.validados) / stats.total) * 100) : 0;

  const getNextStatus = (current: string) => {
    // A liberação dos resultados passa pelo módulo Laudos: lá cada resultado
    // é conferido, publicado e notificado; não deve haver atalho pelo pipeline.
    if (current === 'validado') return null;
    const idx = PIPELINE_STEPS.indexOf(current);
    return idx >= 0 && idx < PIPELINE_STEPS.length - 1 ? PIPELINE_STEPS[idx + 1] : null;
  };

  const getSLAColor = (created: string) => {
    const mins = differenceInMinutes(new Date(), new Date(created));
    if (mins > SLA_CRITICAL_MINUTES) return 'text-destructive';
    if (mins > SLA_WARNING_MINUTES) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getSLALabel = (created: string) => {
    const mins = differenceInMinutes(new Date(), new Date(created));
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    return `${h}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`;
  };

  // ─── Form state ──────────────────────────────────────────
  const resetColetaForm = () => setNewColetaForm({
    paciente_id: '', medico_solicitante_id: '', tipo_amostra: 'sangue',
    tubo: '', observacoes: '', jejum_necessario: false, jejum_horas: 0, urgente: false,
    coletado_por: user?.id || '', data_coleta: dataHoraLocalDaClinica(),
    exame_id: '', volume_ml: '', condicao_amostra: [], sitio_coleta: '', lote_insumo: '',
    finalidade: 'diagnostico', indicacao_clinica: '', categoria_exame: '',
    numero_guia: '', material: '', trouxe_material: false, cid: '', procedimento_codigo: '', convenio_id: '', grupo: '', setor_id: '',
  });

  const toggleCondicao = (cond: string) => {
    setNewColetaForm(prev => ({
      ...prev,
      condicao_amostra: prev.condicao_amostra.includes(cond)
        ? prev.condicao_amostra.filter(c => c !== cond)
        : [...prev.condicao_amostra, cond],
    }));
  };

  const examesFiltrados = examesPendentesQuery.data?.items ?? [];

  const [newResultForm, setNewResultForm] = useState({
    parametro: '', resultado: '', unidade: '', valor_referencia_min: '',
    valor_referencia_max: '', valor_referencia_texto: '', metodo: '', critico: false,
  });

  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="O módulo Laboratório só pode carregar dados após identificar a clínica da sessão." />;
  }

  if (coletasQuery.isError) {
    return <ErrorState title="Não foi possível carregar a worklist do laboratório" description="As ações de coleta foram pausadas para evitar atualizar amostras com status desatualizado." error={coletasQuery.error} onRetry={() => void coletasQuery.refetch()} />;
  }

  const filtrarPipeline = (filter: string) => {
    focusWorklistAfterFilter.current = true;
    setActiveTab('worklist');
    if (filter === 'urgente') {
      atualizarFiltros({ periodo: 'hoje', status: 'todos', urgente: !urgentOnly });
      return;
    }
    atualizarFiltros({ periodo: 'hoje', urgente: false, status: statusFilter === filter ? 'todos' : filter });
  };
  const limparFiltrosWorklist = () => { setSearch(''); atualizarFiltros({ status: 'todos', setor: 'todos', periodo: 'hoje', urgente: false }); };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratório"
        description={stats.total > 0
          ? `${stats.total} amostra${stats.total === 1 ? '' : 's'} hoje · ${stats.pendentes} pendente${stats.pendentes === 1 ? '' : 's'} · ${stats.urgentes} urgente${stats.urgentes === 1 ? '' : 's'}`
          : 'Central de gestão laboratorial — worklist, coletas e resultados'}
        icon={<FlaskConical />}
        actions={
          <>
            {podeGerenciarLaboratorio && (
              <Button variant="outline" className="rounded-full gap-2" onClick={() => setShowLimparFila(true)}>
                Limpar fila antiga
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => void coletasQuery.refetch()}
              aria-label="Atualizar worklist"
              title="Atualizar worklist"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => { resetColetaForm(); setShowNewColeta(true); }}
              className="rounded-full gap-2 bg-gradient-primary text-white shadow-md hover:brightness-110"
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> Nova coleta
            </Button>
          </>
        }
      />

      <LaboratorioSubnav />

      {/* ─── Indicator strip ─── */}
      <section aria-label="Indicadores do laboratório hoje">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
          {[
            { label: 'Urgentes', value: stats.urgentes, icon: Zap, filter: 'urgente', escuro: true },
            { label: 'Pendentes', value: stats.pendentes, icon: Clock, filter: 'pendente', escuro: false, color: 'text-warning', bg: 'bg-warning/10' },
            { label: 'Em análise', value: stats.emAnalise, icon: Activity, filter: 'em_analise', escuro: false, color: 'text-[#1080CA]', bg: 'bg-[#1080CA]/10' },
            { label: 'Validados', value: stats.validados, icon: CheckCircle2, filter: 'validado', escuro: false, color: 'text-success', bg: 'bg-success/10' },
            { label: 'Liberados', value: stats.liberados, icon: Download, filter: 'liberado', escuro: false, color: 'text-success', bg: 'bg-success/10' },
          ].map((s) => {
            const isActive = s.filter === 'urgente'
              ? urgentOnly
              : statusFilter === s.filter && dateFilter === 'hoje' && !urgentOnly;
            return (
              <button
                key={s.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => filtrarPipeline(s.filter)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card p-3 shadow-xs text-left transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA] focus-visible:ring-offset-2',
                  s.escuro && 'border-transparent bg-gradient-primary text-white',
                  !s.escuro && isActive && 'ring-2 ring-[#1080CA]',
                  s.escuro && isActive && 'ring-2 ring-[#1080CA]',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.escuro ? 'bg-white/15' : s.bg)}>
                    <s.icon className={cn('h-5 w-5', s.escuro ? 'text-white' : s.color)} />
                  </div>
                  <div>
                    <p className={cn('text-2xl font-bold tabular-nums', s.escuro ? 'text-white' : s.color)}>{s.value}</p>
                    <p className={cn('text-[11px]', s.escuro ? 'text-white/70' : 'text-muted-foreground')}>{s.label}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Hero: próxima coleta urgente/pendente ─── */}
      {(() => {
        if (!coletas) return null;
        const proximo = coletas.find((c: any) => c.status === 'pendente' && c.urgente)
          || coletas.find((c: any) => c.status === 'pendente');
        if (!proximo) return null;
        const whatsLink = linkWhatsApp(
          (proximo as any).pacientes?.telefone,
          `Olá ${(proximo as any).pacientes?.nome ?? ''}, sua coleta está pendente no laboratório.`,
        );
        return (
          <div className="rounded-2xl border border-[#1080CA]/30 bg-card p-4 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-[#1080CA] font-medium">
                    {(proximo as any).urgente ? 'Urgente — Próxima a coletar' : 'Próxima coleta pendente'}
                  </p>
                  <p className="text-lg font-bold truncate">{(proximo as any).pacientes?.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {(proximo as any).tipo_amostra}
                    {(proximo as any).tubo && ` · ${(proximo as any).tubo}`}
                    {(proximo as any).medicos?.nome && ` · ${nomeMedico((proximo as any).medicos.nome)}`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                {whatsLink && (
                  <Button asChild size="sm" variant="outline" className="h-9 rounded-full text-xs gap-1">
                    <a href={whatsLink} target="_blank" rel="noopener noreferrer">
                      <Phone className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-full text-xs gap-1"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ id: (proximo as any).id, status: 'coletado', expectedStatus: (proximo as any).status })}
                >
                  <ArrowRight className="h-3.5 w-3.5" /> Registrar coleta
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Cross-links ─── */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-9 rounded-full text-xs gap-2">
          <Link to="/exames"><TestTube className="h-3.5 w-3.5" /> Exames</Link>
        </Button>
        <Button asChild variant="outline" className="h-9 rounded-full text-xs gap-2">
          <Link to="/mapa-coleta"><MapPin className="h-3.5 w-3.5" /> Mapa de Coleta</Link>
        </Button>
        <Button asChild variant="outline" className="h-9 rounded-full text-xs gap-2">
          <Link to="/laudos-lab"><FileText className="h-3.5 w-3.5" /> Laudos Lab</Link>
        </Button>
        <Button asChild variant="outline" className="h-9 rounded-full text-xs gap-2">
          <Link to="/guias-externas"><Download className="h-3.5 w-3.5" /> Guias Externas</Link>
        </Button>
      </div>

      <Dialog open={showLimparFila && podeGerenciarLaboratorio} onOpenChange={(o) => { setShowLimparFila(o); if (!o) setLimparMotivo(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar coletas pendentes antigas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="limpar-dias">A partir de quantos dias em "pendente"?</Label>
              <Input id="limpar-dias" type="number" min={1} value={limparDias}
                onChange={(e) => setLimparDias(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                {previewLimpar.isError ? <ErrorState compact title="Não foi possível calcular o impacto" error={previewLimpar.error} onRetry={() => void previewLimpar.refetch()} /> : `${previewLimpar.data ?? '…'} coleta(s) da sua clínica seriam canceladas.`}
              </p>
            </div>
            <div>
              <Label htmlFor="limpar-motivo">Motivo (obrigatório, aparece na auditoria)</Label>
              <Textarea id="limpar-motivo" value={limparMotivo}
                onChange={(e) => setLimparMotivo(e.target.value)}
                placeholder="Ex.: Limpeza de fila — material nunca coletado, dados migrados de sistema anterior." />
            </div>
            <p className="text-xs text-muted-foreground">
              Só coletas em <strong>pendente</strong> serão afetadas. Coletado, em análise, validado
              e liberado ficam intactos — eles significam que material físico existe.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimparFila(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => limparFila.mutate()}
              disabled={limparFila.isPending || !previewLimpar.data || limparMotivo.trim().length < 5}>
              {limparFila.isPending ? 'Cancelando…' : `Cancelar ${previewLimpar.data ?? 0} coleta(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SLA Breach Alert */}
      {slaBreaches.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">
              {slaBreaches.length} amostra(s) excedem o SLA de {SLA_CRITICAL_MINUTES / 60}h
            </p>
            <p className="text-xs text-muted-foreground">
              Pacientes: {slaBreaches.slice(0, 3).map((c: any) => c.pacientes?.nome).join(', ')}
              {slaBreaches.length > 3 && ` +${slaBreaches.length - 3}`}
            </p>
          </div>
        </div>
      )}

      {coletasQuery.hasNextPage && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Há mais coletas além das {coletas?.length ?? TETO_WORKLIST} carregadas. Os indicadores e a taxa de conclusão usam somente os registros carregados.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => void coletasQuery.fetchNextPage()}
            disabled={coletasQuery.isFetchingNextPage}
          >
            {coletasQuery.isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            {coletasQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar mais registros'}
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="max-w-full overflow-x-auto md:overflow-visible">
          <TabsList aria-label="Seções do laboratório" className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 md:w-full md:flex-wrap">
            <TabsTrigger ref={worklistTabRef} value="worklist" className="gap-1"><ClipboardCheck className="h-3.5 w-3.5" />Worklist</TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-1"><Activity className="h-3.5 w-3.5" />Pipeline</TabsTrigger>
            <TabsTrigger value="pedidos" className="gap-1"><TestTube className="h-3.5 w-3.5" />Pedidos</TabsTrigger>
            {podeGerenciarLaboratorio && <TabsTrigger value="gestao" className="gap-1"><Package className="h-3.5 w-3.5" />Gestão do laboratório</TabsTrigger>}
            <TabsTrigger value="indicadores" className="gap-1"><Activity className="h-3.5 w-3.5" />Indicadores</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Worklist Tab ─── */}
        <TabsContent value="worklist" className="space-y-4">
          {/* Filters */}
          <div data-testid="lab-worklist-filters" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Buscar coletas por paciente, código ou CPF"
                  placeholder="Buscar paciente, código ou CPF..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-full pl-10 focus-visible:ring-[#1080CA]"
                />
              </div>
              <Select value={setorFilter} onValueChange={setSetorFilter}>
                <SelectTrigger className="h-10 rounded-full w-44"><SelectValue placeholder="Todos os setores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os setores</SelectItem>
                  {(setoresQuery.data ?? []).map((setor) => <SelectItem key={setor.id} value={setor.id}>{setor.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-10 rounded-full w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="ontem">Ontem</SelectItem>
                  <SelectItem value="7dias">7 dias</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <span data-testid="lab-result-count" className="ml-auto text-xs text-muted-foreground tabular-nums">
                {filtered.length} de {coletas?.length ?? 0}
              </span>
            </div>
            {pendenciasPorSetor.length > 0 && (
              <div role="group" aria-label="Pendências por setor" className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#1080CA]">Em aberto por setor</span>
                {pendenciasPorSetor.map((pendencia) => {
                  const rotulo = `${pendencia.nome}: ${pendencia.total} pendente${pendencia.total === 1 ? '' : 's'}${pendencia.urgentes > 0 ? `, ${pendencia.urgentes} urgente${pendencia.urgentes === 1 ? '' : 's'}` : ''}`;
                  const conteudo = (
                    <>
                      {pendencia.nome}
                      <span className="tabular-nums font-semibold">{pendencia.total}</span>
                      {pendencia.urgentes > 0 && <span className="inline-flex items-center gap-0.5 text-destructive"><Zap className="h-3 w-3" aria-hidden="true" />{pendencia.urgentes}</span>}
                    </>
                  );
                  if (!pendencia.id) {
                    return <span key="sem-setor" aria-label={rotulo} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-[#BFD8EE] px-3 text-xs text-muted-foreground">{conteudo}</span>;
                  }
                  const ativo = setorFilter === pendencia.id;
                  return (
                    <button
                      key={pendencia.id}
                      type="button"
                      aria-pressed={ativo}
                      aria-label={rotulo}
                      onClick={() => setSetorFilter(ativo ? 'todos' : pendencia.id!)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                        ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm [&_.text-destructive]:text-white' : 'border-[#DCE6F2] bg-background text-foreground hover:border-[#9CC7EC]',
                      )}
                    >
                      {conteudo}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Pill status filters */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: 'todos', label: 'Todos' },
                ...Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v })),
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={statusFilter === value && !urgentOnly}
                  onClick={() => atualizarFiltros({ urgente: false, status: value })}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs transition-colors',
                    statusFilter === value && !urgentOnly
                      ? 'border-transparent bg-gradient-primary text-white shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={urgentOnly}
                onClick={() => filtrarPipeline('urgente')}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs gap-1 inline-flex items-center transition-colors',
                  urgentOnly
                    ? 'border-transparent bg-destructive text-white shadow-sm'
                    : 'border-destructive/40 text-destructive hover:border-destructive',
                )}
              >
                <Zap className="h-3 w-3" /> Urgentes
              </button>
              {(search.trim() || statusFilter !== 'todos' || setorFilter !== 'todos' || dateFilter !== 'hoje' || urgentOnly) && (
                <button
                  type="button"
                  onClick={limparFiltrosWorklist}
                  className="h-8 rounded-full border border-border px-3 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <XCircle className="h-3 w-3" /> Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* Coletas list */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <Card key={i}><CardContent className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-5 w-20 bg-muted/60 animate-pulse rounded" />
                      <div className="flex-1" />
                      <div className="h-7 w-24 bg-muted animate-pulse rounded" />
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card className="rounded-2xl border-border/60">
                <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                    <FlaskConical className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {search.trim() || statusFilter !== 'todos' || setorFilter !== 'todos' || urgentOnly
                        ? 'Nenhuma coleta corresponde aos filtros'
                        : coletasQuery.hasNextPage ? 'Nenhuma coleta nesta página' : 'Nenhuma coleta neste período'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {coletasQuery.hasNextPage
                        ? 'Carregue mais registros para ampliar a busca ou ajuste os filtros aplicados.'
                        : 'Amplie o período para consultar outras coletas ou registre uma nova coleta.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      className="rounded-full gap-2 bg-gradient-primary text-white shadow-md hover:brightness-110"
                      onClick={coletasQuery.hasNextPage
                        ? () => void coletasQuery.fetchNextPage()
                        : dateFilter !== 'todos'
                          ? () => setDateFilter('todos')
                          : () => { resetColetaForm(); setShowNewColeta(true); }}
                    >
                      {coletasQuery.hasNextPage ? 'Carregar mais registros' : dateFilter !== 'todos' ? 'Ver todos os períodos' : <><Plus className="h-4 w-4" />Nova coleta</>}
                    </Button>
                    {(search.trim() || statusFilter !== 'todos' || setorFilter !== 'todos' || dateFilter !== 'hoje' || urgentOnly) && (
                      <Button
                        variant="outline"
                        className="rounded-full gap-2"
                        onClick={limparFiltrosWorklist}
                      >
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              filtered.map((coleta: any) => {
                const nextStatus = getNextStatus(coleta.status);
                const whatsLink = linkWhatsApp(
                  coleta.pacientes?.telefone,
                  `Olá ${coleta.pacientes?.nome ?? ''}, sua amostra laboratorial (${coleta.codigo_amostra ?? ''}) está em andamento.`,
                );
                return (
                  <Card key={coleta.id} className={cn(
                    'rounded-2xl border-border/60 shadow-xs transition-all hover:shadow-md',
                    coleta.urgente && 'border-destructive/50 bg-destructive/5',
                  )}>
                    <CardContent className="py-3 px-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{coleta.pacientes?.nome}</span>
                            <Badge variant="outline" className="rounded-full font-mono text-[10px] gap-1">
                              <Tag className="h-3 w-3" />{coleta.codigo_amostra}
                            </Badge>
                            <Badge className={cn(statusColors[coleta.status], 'rounded-full')}>{statusLabels[coleta.status]}</Badge>
                            {coleta.laboratorio_setores?.nome && <Badge variant="secondary" className="rounded-full">{coleta.laboratorio_setores.nome}</Badge>}
                            {coleta.urgente && <Badge variant="destructive" className="rounded-full gap-1"><Zap className="h-3 w-3" />Urgente</Badge>}
                            {coleta.jejum_necessario && <Badge variant="outline" className="rounded-full text-[10px]">Jejum {coleta.jejum_horas}h</Badge>}
                            {(coleta as any).procedimento_codigo && <Badge variant="outline" className="rounded-full font-mono text-[10px]">{(coleta as any).procedimento_codigo}</Badge>}
                            {(coleta as any).numero_guia && <Badge variant="secondary" className="rounded-full text-[10px]">Guia: {(coleta as any).numero_guia}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span>{coleta.tipo_amostra}</span>
                            {(coleta as any).material && <span>• {(coleta as any).material}</span>}
                            {coleta.tubo && <span>• {coleta.tubo}</span>}
                            {coleta.volume_ml && <span>• {coleta.volume_ml}mL</span>}
                            {coleta.sitio_coleta && <span>• {coleta.sitio_coleta}</span>}
                            {coleta.medicos?.nome && <span>• {nomeMedico(coleta.medicos.nome)}</span>}
                            {(coleta as any).cid && <span>• CID: {(coleta as any).cid}</span>}
                            {coleta.created_at && (
                              <span className={cn('flex items-center gap-1', getSLAColor(coleta.created_at))}>
                                <Timer className="h-3 w-3" />{getSLALabel(coleta.created_at)}
                              </span>
                            )}
                          </div>
                          {coleta.condicao_amostra?.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {coleta.condicao_amostra.map((c: string) => (
                                <Badge key={c} variant="destructive" className="rounded-full text-[10px]">{c}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {nextStatus && coleta.status !== 'cancelado' && (
                            <Button size="sm" variant="outline" className="h-9 rounded-full text-xs gap-1"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: coleta.id, status: nextStatus, expectedStatus: coleta.status })}>
                              <ArrowRight className="h-3 w-3" /> {statusLabels[nextStatus]}
                            </Button>
                          )}
                          {coleta.status === 'validado' && (
                            <Button asChild size="sm" variant="outline" className="h-9 rounded-full text-xs gap-1">
                              <Link to="/laudos-lab"><FileText className="h-3 w-3" />Liberar laudo</Link>
                            </Button>
                          )}
                          {whatsLink && (
                            <Button asChild size="sm" variant="outline" className="h-9 rounded-full text-xs gap-1">
                              <a href={whatsLink} target="_blank" rel="noopener noreferrer">
                                <Phone className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs gap-1"
                            onClick={() => setShowResultados(coleta.id)}>
                            <Eye className="h-3 w-3" /> Resultados
                          </Button>
                          {(coleta.status === 'pendente' || coleta.status === 'recoleta') && (
                            <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs text-destructive"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: coleta.id, status: 'cancelado', expectedStatus: coleta.status })}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {coletasQuery.hasNextPage && (
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/20 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {coletas?.length ?? 0} coletas carregadas. Há registros anteriores que ainda não entraram na busca.
              </p>
              <Button
                variant="outline"
                onClick={() => void coletasQuery.fetchNextPage()}
                disabled={coletasQuery.isFetchingNextPage}
                className="gap-2"
              >
                {coletasQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {coletasQuery.isFetchingNextPage ? 'Carregando...' : 'Carregar coletas anteriores'}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ─── Pipeline Tab ─── */}
        <TabsContent value="pipeline" className="space-y-4">
          <section aria-labelledby="lab-pipeline-summary-title" className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="lab-pipeline-summary-title" className="text-base font-semibold">Resumo de hoje</h2>
                <p className="text-sm text-muted-foreground">
                  {stats.total > 0 ? 'Selecione um indicador para abrir a Worklist filtrada.' : 'Nenhuma amostra ativa ou concluída hoje.'}
                </p>
              </div>
              {stats.total > 0 && (
                <p className="text-sm text-muted-foreground">Conclusão: <span className="font-semibold text-primary">{completionRate}%</span> · {stats.liberados + stats.validados} de {stats.total} amostras</p>
              )}
            </div>
            {stats.total > 0 && <Progress value={completionRate} className="h-2" />}
            <div data-testid="lab-pipeline-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                { label: 'Pendente', value: stats.pendentes, icon: Clock, color: 'text-warning', bg: 'bg-warning/10', filter: 'pendente' },
                { label: 'Coletado', value: stats.coletados, icon: TestTube, color: 'text-info', bg: 'bg-info/10', filter: 'coletado' },
                { label: 'Em Análise', value: stats.emAnalise, icon: Activity, color: 'text-[#1080CA]', bg: 'bg-[#1080CA]/10', filter: 'em_analise' },
                { label: 'Validado', value: stats.validados, icon: Shield, color: 'text-success', bg: 'bg-success/10', filter: 'validado' },
                { label: 'Liberado', value: stats.liberados, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', filter: 'liberado' },
                { label: 'Urgentes', value: stats.urgentes, icon: Zap, color: 'text-destructive', bg: 'bg-destructive/10', filter: 'urgente' },
              ].map((s) => (
                <div key={s.label}>
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded-2xl border border-border/60 bg-card shadow-xs transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA] focus-visible:ring-offset-2',
                      (statusFilter === s.filter || (s.filter === 'urgente' && urgentOnly)) && 'ring-2 ring-[#1080CA]',
                    )}
                    aria-pressed={s.filter === 'urgente' ? urgentOnly : statusFilter === s.filter && dateFilter === 'hoje' && !urgentOnly}
                    onClick={() => filtrarPipeline(s.filter)}
                  >
                    <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.bg)}>
                        <s.icon className={cn('h-4 w-4', s.color)} />
                      </div>
                      <div className="text-left">
                        <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
                        <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </section>
          {stats.total === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card py-12 flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                <Activity className="h-7 w-7" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Nenhuma amostra no fluxo hoje</p>
                <p className="text-sm text-muted-foreground mt-1">Registre uma coleta para iniciar o acompanhamento das etapas laboratoriais.</p>
              </div>
              <Button
                className="rounded-full gap-2 bg-gradient-primary text-white shadow-md hover:brightness-110"
                onClick={() => { resetColetaForm(); setShowNewColeta(true); }}
              >
                <Plus className="h-4 w-4" /> Registrar coleta
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Visão Kanban do fluxo laboratorial de hoje</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {PIPELINE_STEPS.map(step => {
              const items = (coletas || []).filter((c: any) =>
                c.status === step && c.created_at && dateOnlyInTimeZone(new Date(c.created_at), FUSO_CLINICA) === hojeNaClinica
              );
              const nextStep = getNextStatus(step);
              return (
                <Card key={step} className="min-h-[200px]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('h-2.5 w-2.5 rounded-full',
                          step === 'pendente' && 'bg-yellow-500',
                          step === 'coletado' && 'bg-blue-500',
                          step === 'em_analise' && 'bg-purple-500',
                          step === 'validado' && 'bg-green-500',
                          step === 'liberado' && 'bg-emerald-500',
                        )} />
                        {statusLabels[step]}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>
                    ) : items.map((c: any) => (
                      <div key={c.id} className={cn(
                        'rounded-lg border p-2 space-y-1 text-xs',
                        c.urgente && 'border-destructive/50 bg-destructive/5'
                      )}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{c.pacientes?.nome}</span>
                          {c.urgente && <Zap className="h-3 w-3 text-destructive shrink-0" />}
                        </div>
                        <p className="text-muted-foreground font-mono text-[10px]">{c.codigo_amostra}</p>
                        <p className="text-muted-foreground">{c.tipo_amostra} {c.tubo && `· ${c.tubo}`}</p>
                        {nextStep && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] w-full gap-1"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: c.id, status: nextStep, expectedStatus: c.status })}>
                            <ArrowRight className="h-2.5 w-2.5" /> {statusLabels[nextStep]}
                          </Button>
                        )}
                        {c.status === 'validado' && (
                          <Button asChild size="sm" variant="outline" className="h-6 text-[10px] w-full gap-1">
                            <Link to="/laudos-lab"><FileText className="h-2.5 w-2.5" />Liberar laudo</Link>
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="pedidos" className="space-y-4">
          <PedidosLaboratorioPanel />
        </TabsContent>
        {podeGerenciarLaboratorio && <TabsContent value="gestao" className="space-y-4"><GestaoLaboratorioPanel /></TabsContent>}
        <TabsContent value="indicadores" className="space-y-4"><IndicadoresLaboratorioPanel /></TabsContent>
      </Tabs>

      {/* ─── Dialog Nova Coleta ─── */}
      <Dialog open={showNewColeta} onOpenChange={open => {
        if (open || !createColeta.isPending) setShowNewColeta(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5 text-primary" />
              Nova Coleta de Amostra
              <Badge variant="outline" className="ml-auto text-[10px] gap-1"><Tag className="h-3 w-3" />ID Automático</Badge>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (!newColetaForm.paciente_id) { toast.error('Selecione o paciente.'); return; }
            if (medicosQuery.isLoading || funcionariosQuery.isLoading || conveniosQuery.isLoading) {
              toast.info('Aguarde o carregamento das listas de profissionais e convênios.');
              return;
            }
            if (medicosQuery.isError || funcionariosQuery.isError || conveniosQuery.isError) {
              toast.error('Não foi possível confirmar os dados auxiliares da coleta.', {
                description: 'Atualize as listas de médicos, profissionais e convênios antes de salvar para evitar um vínculo incorreto.',
              });
              return;
            }
            const dataColetaIso = dataHoraDaClinicaParaIso(newColetaForm.data_coleta);
            if (!dataColetaIso) {
              toast.error('Informe uma data e horário válidos para a coleta.');
              return;
            }
            if (new Date(dataColetaIso).getTime() > Date.now()) {
              toast.error('A coleta não pode ser registrada no futuro.', {
                description: 'Este formulário registra uma amostra já coletada. Para uma coleta futura, mantenha o pedido como pendente até a realização.',
              });
              return;
            }
            if (!newColetaForm.coletado_por) {
              toast.error('Informe o profissional que realizou a coleta.');
              return;
            }
            createColeta.mutate({
              paciente_id: newColetaForm.paciente_id,
              medico_solicitante_id: newColetaForm.medico_solicitante_id || null,
              tipo_amostra: newColetaForm.tipo_amostra,
              tubo: newColetaForm.tubo || null,
              observacoes: newColetaForm.observacoes || null,
              jejum_necessario: newColetaForm.jejum_necessario,
              jejum_horas: newColetaForm.jejum_horas || null,
              urgente: newColetaForm.urgente,
              status: 'coletado',
              coletado_por: newColetaForm.coletado_por || null,
              data_coleta: dataColetaIso,
              exame_id: newColetaForm.exame_id && newColetaForm.exame_id !== '__none__' ? newColetaForm.exame_id : null,
              volume_ml: newColetaForm.volume_ml ? parseFloat(newColetaForm.volume_ml) : null,
              condicao_amostra: newColetaForm.condicao_amostra.length > 0 ? newColetaForm.condicao_amostra : null,
              sitio_coleta: newColetaForm.sitio_coleta && newColetaForm.sitio_coleta !== '__none__' ? newColetaForm.sitio_coleta : null,
              lote_insumo: newColetaForm.lote_insumo || null,
              finalidade: newColetaForm.finalidade || 'diagnostico',
              indicacao_clinica: newColetaForm.indicacao_clinica || null,
              categoria_exame: newColetaForm.categoria_exame || null,
              numero_guia: newColetaForm.numero_guia || null,
              material: newColetaForm.material || null,
              trouxe_material: newColetaForm.trouxe_material,
              cid: newColetaForm.cid || null,
              procedimento_codigo: newColetaForm.procedimento_codigo || null,
              convenio_id: newColetaForm.convenio_id && newColetaForm.convenio_id !== '__none__' ? newColetaForm.convenio_id : null,
              grupo: newColetaForm.grupo || null,
            } as any);
          }} className="flex-1 overflow-y-auto pr-2" aria-busy={createColeta.isPending}>
            <fieldset disabled={createColeta.isPending} className="space-y-5 border-0 p-0">

            {/* Rastreabilidade */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />Rastreabilidade
              </h4>
              <p className="text-xs text-muted-foreground">Código gerado automaticamente ao salvar.</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Lote do Insumo (tubo/agulha)</Label>
                <Input value={newColetaForm.lote_insumo}
                  onChange={e => setNewColetaForm(p => ({ ...p, lote_insumo: e.target.value }))}
                  placeholder="Ex: LOT-2026-03-ABC123" />
              </div>
            </div>

            {/* Paciente + Médico */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Paciente *</Label>
                <PacienteCombobox value={newColetaForm.paciente_id} onChange={v => setNewColetaForm(p => ({ ...p, paciente_id: v, exame_id: '' }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Médico Solicitante</Label>
                {medicosQuery.isError ? (
                  <ErrorState compact title="Não foi possível carregar os médicos" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />
                ) : (
                  <Select value={newColetaForm.medico_solicitante_id} onValueChange={v => setNewColetaForm(p => ({ ...p, medico_solicitante_id: v }))} disabled={medicosQuery.isLoading}>
                    <SelectTrigger><SelectValue placeholder={medicosQuery.isLoading ? 'Carregando…' : 'Selecione...'} /></SelectTrigger>
                    <SelectContent>{medicos?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome || `CRM ${m.crm}`} — {m.especialidade || 'Clínico'}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Dados da Solicitação (estilo WEBLIS) */}
            <div className="bg-muted/30 border rounded-lg p-4 space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />Dados da Solicitação
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Convênio</Label>
                  {conveniosQuery.isError ? (
                    <ErrorState compact title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />
                  ) : (
                    <Select value={newColetaForm.convenio_id || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, convenio_id: v === '__none__' ? '' : v }))} disabled={conveniosQuery.isLoading}>
                      <SelectTrigger><SelectValue placeholder={conveniosQuery.isLoading ? 'Carregando…' : 'Particular'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Particular</SelectItem>
                        {convenios?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome} ({c.codigo})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nº da Guia</Label>
                  <Input value={newColetaForm.numero_guia}
                    onChange={e => setNewColetaForm(p => ({ ...p, numero_guia: e.target.value }))}
                    placeholder="Ex: 2600015029" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">CID-10</Label>
                  <Input value={newColetaForm.cid}
                    onChange={e => setNewColetaForm(p => ({ ...p, cid: e.target.value }))}
                    placeholder="Ex: E11, D50" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Código do Procedimento</Label>
                  <Input value={newColetaForm.procedimento_codigo}
                    onChange={e => setNewColetaForm(p => ({ ...p, procedimento_codigo: e.target.value.toUpperCase() }))}
                    placeholder="Ex: COL, HDL, HEM" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Grupo</Label>
                  <Input value={newColetaForm.grupo}
                    onChange={e => setNewColetaForm(p => ({ ...p, grupo: e.target.value.toUpperCase() }))}
                    placeholder="Ex: CTF, HEM" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Material</Label>
                  <Select value={newColetaForm.material || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, material: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informado</SelectItem>
                      <SelectItem value="SORO">Soro</SelectItem>
                      <SelectItem value="PLASMA">Plasma</SelectItem>
                      <SelectItem value="SANGUE_TOTAL">Sangue Total</SelectItem>
                      <SelectItem value="URINA">Urina</SelectItem>
                      <SelectItem value="FEZES">Fezes</SelectItem>
                      <SelectItem value="LIQUOR">Líquor</SelectItem>
                      <SelectItem value="ESCARRO">Escarro</SelectItem>
                      <SelectItem value="SECRECAO">Secreção</SelectItem>
                      <SelectItem value="SWAB">Swab</SelectItem>
                      <SelectItem value="OUTRO">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newColetaForm.trouxe_material} onCheckedChange={v => setNewColetaForm(p => ({ ...p, trouxe_material: !!v }))} />
                <Label className="text-sm flex items-center gap-1"><Package className="h-3.5 w-3.5" />Trouxe Material</Label>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Setor responsável</Label>
                <Select value={newColetaForm.setor_id || '__none__'} onValueChange={value => setNewColetaForm(p => ({ ...p, setor_id: value === '__none__' ? '' : value }))}>
                  <SelectTrigger><SelectValue placeholder="Sem setor definido" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">Sem setor definido</SelectItem>{(setoresQuery.data ?? []).map(setor => <SelectItem key={setor.id} value={setor.id}>{setor.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Vincular a Exame */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1"><Link2 className="h-3 w-3" />Vincular a Pedido de Exame</Label>
              {!newColetaForm.paciente_id ? (
                <p className="text-xs text-muted-foreground">Selecione o paciente para localizar os pedidos em aberto.</p>
              ) : examesPendentesQuery.isLoading ? (
                <p role="status" className="text-xs text-muted-foreground">Buscando pedidos de exame do paciente…</p>
              ) : examesPendentesQuery.isError ? (
                <ErrorState compact title="Não foi possível carregar os pedidos deste paciente" error={examesPendentesQuery.error} onRetry={() => void examesPendentesQuery.refetch()} />
              ) : (
                <>
                  <Select value={newColetaForm.exame_id || '__none__'} onValueChange={v => { const exame = examesFiltrados.find((item: any) => item.id === v); const catalogo = Array.isArray(exame?.tipo_exames_catalog) ? exame.tipo_exames_catalog[0] : exame?.tipo_exames_catalog; setNewColetaForm(p => ({ ...p, exame_id: v === '__none__' ? '' : v, setor_id: v === '__none__' ? p.setor_id : (catalogo?.setor_id || p.setor_id) })); }} disabled={examesFiltrados.length === 0}>
                    <SelectTrigger><SelectValue placeholder={examesFiltrados.length ? 'Opcional' : 'Nenhum pedido em aberto'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (coleta avulsa)</SelectItem>
                      {examesFiltrados.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.tipo_exame} — {(e as any).pacientes?.nome || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {examesPendentesQuery.data?.hasMore && (
                    <p role="status" className="text-xs text-warning-foreground">A lista atingiu 200 pedidos em aberto; os mais antigos podem não aparecer neste seletor.</p>
                  )}
                </>
              )}
            </div>

            {/* Finalidade + Categoria do Exame */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" />Para quê é o exame? *</Label>
                <Select value={newColetaForm.finalidade} onValueChange={v => setNewColetaForm(p => ({ ...p, finalidade: v }))}>
                  <SelectTrigger><SelectValue placeholder="Finalidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                    <SelectItem value="checkup">Check-up / Rotina</SelectItem>
                    <SelectItem value="pre_operatorio">Pré-operatório</SelectItem>
                    <SelectItem value="acompanhamento">Acompanhamento de tratamento</SelectItem>
                    <SelectItem value="controle">Controle periódico</SelectItem>
                    <SelectItem value="urgencia">Urgência / Emergência</SelectItem>
                    <SelectItem value="pre_natal">Pré-natal</SelectItem>
                    <SelectItem value="admissional">Admissional / Periódico</SelectItem>
                    <SelectItem value="retorno">Retorno / Reavaliação</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Categoria do Exame</Label>
                <Select value={newColetaForm.categoria_exame || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, categoria_exame: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    <SelectItem value="hematologia">Hematologia</SelectItem>
                    <SelectItem value="bioquimica">Bioquímica</SelectItem>
                    <SelectItem value="hormonal">Hormonal</SelectItem>
                    <SelectItem value="imunologia">Imunologia / Sorologia</SelectItem>
                    <SelectItem value="microbiologia">Microbiologia</SelectItem>
                    <SelectItem value="urinanalise">Urinálise</SelectItem>
                    <SelectItem value="coagulacao">Coagulação</SelectItem>
                    <SelectItem value="parasitologia">Parasitologia</SelectItem>
                    <SelectItem value="toxicologia">Toxicologia</SelectItem>
                    <SelectItem value="genetica">Genética / Molecular</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Indicação Clínica */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Indicação Clínica</Label>
              <Input value={newColetaForm.indicacao_clinica}
                onChange={e => setNewColetaForm(p => ({ ...p, indicacao_clinica: e.target.value }))}
                placeholder="Ex: Suspeita de anemia, controle glicêmico, investigação tireoidiana..." />
            </div>

            <Separator />

            {/* Data/Hora + Profissional */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" />Data e Hora da Coleta (horário da clínica)</Label>
                <Input type="datetime-local" value={newColetaForm.data_coleta}
                  onChange={e => setNewColetaForm(p => ({ ...p, data_coleta: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1"><User className="h-3 w-3" />Profissional</Label>
                {funcionariosQuery.isError ? (
                  <ErrorState compact title="Não foi possível carregar os profissionais" error={funcionariosQuery.error} onRetry={() => void funcionariosQuery.refetch()} />
                ) : (
                  <Select value={newColetaForm.coletado_por || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, coletado_por: v === '__none__' ? '' : v }))} disabled={funcionariosQuery.isLoading}>
                    <SelectTrigger><SelectValue placeholder={funcionariosQuery.isLoading ? 'Carregando…' : 'Quem realizou'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informado</SelectItem>
                      {funcionarios?.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <Separator />

            {/* Amostra */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Amostra</Label>
                <Select value={newColetaForm.tipo_amostra} onValueChange={v => setNewColetaForm(p => ({ ...p, tipo_amostra: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['sangue', 'urina', 'fezes', 'escarro', 'secreção', 'líquor', 'outro'].map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tubo</Label>
                <Select value={newColetaForm.tubo || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, tubo: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione</SelectItem>
                    {TUBOS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">
                          <span className={`h-3 w-2 rounded-sm ${t.color}`} />{t.value}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Droplets className="h-3 w-3" />Volume (mL)</Label>
                <Input type="number" step="0.1" min="0" value={newColetaForm.volume_ml}
                  onChange={e => setNewColetaForm(p => ({ ...p, volume_ml: e.target.value }))} placeholder="Ex: 5" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" />Sítio de Coleta</Label>
                <Select value={newColetaForm.sitio_coleta || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, sitio_coleta: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Local" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    {SITIOS_COLETA.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Condições */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Condições da Amostra</Label>
              <div className="flex flex-wrap gap-3">
                {CONDICOES_AMOSTRA.map(cond => (
                  <div key={cond} className="flex items-center gap-1.5">
                    <Checkbox id={`cond-${cond}`} checked={newColetaForm.condicao_amostra.includes(cond)}
                      onCheckedChange={() => toggleCondicao(cond)} />
                    <Label htmlFor={`cond-${cond}`} className="text-xs cursor-pointer">{cond}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Jejum + Urgência */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox checked={newColetaForm.jejum_necessario} onCheckedChange={v => setNewColetaForm(p => ({ ...p, jejum_necessario: !!v }))} />
                <Label className="text-sm">Jejum necessário</Label>
              </div>
              {newColetaForm.jejum_necessario && (
                <div className="flex items-center gap-2">
                  <Input type="number" className="w-20" value={newColetaForm.jejum_horas}
                    onChange={e => setNewColetaForm(p => ({ ...p, jejum_horas: +e.target.value }))} />
                  <span className="text-sm text-muted-foreground">horas</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox checked={newColetaForm.urgente} onCheckedChange={v => setNewColetaForm(p => ({ ...p, urgente: !!v }))} />
                <Label className="text-sm text-destructive font-medium">Urgente</Label>
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea value={newColetaForm.observacoes} onChange={e => setNewColetaForm(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Instruções especiais..." rows={2} />
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowNewColeta(false)}>Cancelar</Button>
              <Button type="submit" disabled={!newColetaForm.paciente_id || createColeta.isPending} className="gap-1">
                {createColeta.isPending && <Clock className="h-4 w-4 animate-spin" />}
                <TestTube className="h-4 w-4" />Registrar Coleta
              </Button>
            </DialogFooter>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog Resultados ─── */}
      <Dialog open={!!showResultados} onOpenChange={() => setShowResultados(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Resultados Laboratoriais</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {resultadosQuery.isLoading && <p role="status" className="text-muted-foreground text-center py-4">Carregando resultados…</p>}
            {resultadosQuery.isError && (
              <ErrorState compact title="Não foi possível carregar os resultados desta amostra" error={resultadosQuery.error} onRetry={() => void resultadosQuery.refetch()} />
            )}
            {!resultadosQuery.isLoading && !resultadosQuery.isError && resultados?.length === 0 && <p className="text-muted-foreground text-center py-4">Nenhum resultado cadastrado</p>}
            {resultados?.map((r: any) => {
              const textoResultado = String(r.resultado ?? '').trim();
              const numeroNormalizado = textoResultado.includes(',')
                ? textoResultado.replace(/\./g, '').replace(',', '.')
                : textoResultado;
              const numResult = textoResultado ? Number(numeroNormalizado) : Number.NaN;
              const isAltered = Number.isFinite(numResult) && ((r.valor_referencia_min != null && numResult < r.valor_referencia_min) || (r.valor_referencia_max != null && numResult > r.valor_referencia_max));
              return (
                <div key={r.id} className={cn('p-3 rounded-lg border', (isAltered || r.critico) ? 'border-destructive/30 bg-destructive/5' : '')}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="flex items-center gap-2 font-medium">{r.parametro}{r.critico && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Crítico</Badge>}</p>
                      {r.metodo && <p className="text-xs text-muted-foreground">Método: {r.metodo}</p>}
                    </div>
                    <div className="text-right">
                      <p className={cn('text-lg font-bold', isAltered && 'text-destructive')}>
                        {r.resultado} {r.unidade}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ref: {r.valor_referencia_texto || `${r.valor_referencia_min ?? '-'} a ${r.valor_referencia_max ?? '-'} ${r.unidade || ''}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add resultado form */}
            {podeRegistrarResultado(coletas?.find((c: any) => c.id === showResultados)?.status) ? <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle className="text-sm">Adicionar Resultado</CardTitle><p className="mt-1 text-xs text-muted-foreground">Informe resultado e referência definidos para este método.</p></div>{perfilCatalogoQuery.data && <Button type="button" size="sm" variant="outline" disabled={perfilCatalogoQuery.isLoading || addResultado.isPending} onClick={() => setNewResultForm(current => ({ ...current, unidade: perfilCatalogoQuery.data?.unidade_padrao || current.unidade, valor_referencia_min: perfilCatalogoQuery.data?.referencia_min == null ? current.valor_referencia_min : String(perfilCatalogoQuery.data.referencia_min), valor_referencia_max: perfilCatalogoQuery.data?.referencia_max == null ? current.valor_referencia_max : String(perfilCatalogoQuery.data.referencia_max), valor_referencia_texto: perfilCatalogoQuery.data?.referencia_texto || current.valor_referencia_texto, metodo: perfilCatalogoQuery.data?.metodo_padrao || current.metodo }))}>Usar perfil do exame</Button>}</CardHeader>
              <CardContent>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!showResultados) return;
                  // O botão não era desabilitado durante a mutation: dois
                  // cliques por impaciência inseriam o mesmo parâmetro duas
                  // vezes na coleta, e o laudo saía com a linha repetida.
                  if (addResultado.isPending) return;
                  const coleta = coletas?.find((c: any) => c.id === showResultados);
                  addResultado.mutate({
                    coleta_id: showResultados,
                    clinica_id: profile?.clinica_id,
                    paciente_id: coleta?.paciente_id,
                    parametro: newResultForm.parametro,
                    resultado: newResultForm.resultado,
                    unidade: newResultForm.unidade || null,
                    valor_referencia_min: newResultForm.valor_referencia_min,
                    valor_referencia_max: newResultForm.valor_referencia_max,
                    valor_referencia_texto: newResultForm.valor_referencia_texto || null,
                    metodo: newResultForm.metodo || null,
                    critico: newResultForm.critico,
                  });
                }} className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="lab-resultado-parametro" className="text-xs">Parâmetro *</Label><Input id="lab-resultado-parametro" disabled={addResultado.isPending} value={newResultForm.parametro} onChange={(e) => setNewResultForm(p => ({ ...p, parametro: e.target.value }))} placeholder="Ex: Hemoglobina" /></div>
                  <div><Label htmlFor="lab-resultado-valor" className="text-xs">Resultado *</Label><Input id="lab-resultado-valor" disabled={addResultado.isPending} value={newResultForm.resultado} onChange={(e) => setNewResultForm(p => ({ ...p, resultado: e.target.value }))} placeholder="Ex: 14.2" /></div>
                  <div><Label htmlFor="lab-resultado-unidade" className="text-xs">Unidade</Label><Input id="lab-resultado-unidade" disabled={addResultado.isPending} value={newResultForm.unidade} onChange={(e) => setNewResultForm(p => ({ ...p, unidade: e.target.value }))} placeholder="g/dL" /></div>
                  <div><Label htmlFor="lab-resultado-metodo" className="text-xs">Método</Label><Input id="lab-resultado-metodo" disabled={addResultado.isPending} value={newResultForm.metodo} onChange={(e) => setNewResultForm(p => ({ ...p, metodo: e.target.value }))} placeholder="Automatizado" /></div>
                  <div><Label htmlFor="lab-resultado-ref-min" className="text-xs">Ref. Mínimo</Label><Input id="lab-resultado-ref-min" disabled={addResultado.isPending} type="text" inputMode="decimal" value={newResultForm.valor_referencia_min} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_min: e.target.value }))} placeholder="Opcional" /></div>
                  <div><Label htmlFor="lab-resultado-ref-max" className="text-xs">Ref. Máximo</Label><Input id="lab-resultado-ref-max" disabled={addResultado.isPending} type="text" inputMode="decimal" value={newResultForm.valor_referencia_max} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_max: e.target.value }))} placeholder="Opcional" /></div>
                  <div className="col-span-2"><Label htmlFor="lab-resultado-ref-texto" className="text-xs">Referência textual</Label><Input id="lab-resultado-ref-texto" disabled={addResultado.isPending} value={newResultForm.valor_referencia_texto} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_texto: e.target.value }))} placeholder="Ex: Não reagente" /></div>
                  <div className="col-span-2 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3"><Checkbox id="resultado-critico" checked={newResultForm.critico} disabled={addResultado.isPending} onCheckedChange={(checked) => setNewResultForm(p => ({ ...p, critico: checked === true }))} /><div><Label htmlFor="resultado-critico" className="cursor-pointer text-sm font-medium">Resultado crítico</Label><p className="text-xs text-muted-foreground">Sinaliza para revisão prioritária conforme o protocolo da clínica.</p></div></div>
                  <div className="col-span-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newResultForm.parametro || !newResultForm.resultado || addResultado.isPending}
                      className="gap-2"
                    >
                      {addResultado.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Adicionar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card> : (
              <div role="status" className="rounded-xl border border-info/30 bg-info/10 p-4 text-sm text-info">
                A amostra não está mais aberta para lançamento. Isso preserva a conferência e a trilha de auditoria do resultado.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
