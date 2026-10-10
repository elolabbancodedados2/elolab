import { nomeMedico } from '@/lib/formatters';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useMemo, useEffect } from 'react';
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
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { dateOnlyInTimeZone, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { Link } from 'react-router-dom';

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
  Clock, CheckCircle2, XCircle, Eye, Printer, Tag, Barcode,
  User, Droplets, MapPin, Package, FileText, Link2, Filter,
  TrendingUp, Activity, Calendar, ArrowRight, Trash2, RotateCcw,
  Download, Zap, Timer, Shield, Loader2,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  pendente: 'bg-warning/10 text-warning',
  coletado: 'bg-info/10 text-info',
  em_analise: 'bg-accent text-accent-foreground',
  validado: 'bg-success/10 text-success',
  liberado: 'bg-success/10 text-success',
  cancelado: 'bg-destructive/10 text-destructive',
  recoleta: 'bg-warning/10 text-warning',
};

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  coletado: 'Coletado',
  em_analise: 'Em Análise',
  validado: 'Validado',
  liberado: 'Liberado',
  cancelado: 'Cancelado',
  recoleta: 'Recoleta',
};

const PIPELINE_STEPS = ['pendente', 'coletado', 'em_analise', 'validado', 'liberado'];

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
  const [statusFilter, setStatusFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState('hoje');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [showNewColeta, setShowNewColeta] = useState(false);

  // Limpeza de fila em lote: a INOVALAB acumulou 253 coletas em `pendente`
  // vindas de exames que nunca tinham passado pelo laboratório. Sem uma
  // saída em bloco, o técnico teria que cancelar uma a uma.
  const [showLimparFila, setShowLimparFila] = useState(false);
  const [limparDias, setLimparDias] = useState('30');
  const [limparMotivo, setLimparMotivo] = useState('');

  const [showResultados, setShowResultados] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('worklist');
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const [newColetaForm, setNewColetaForm] = useState({
    paciente_id: '', medico_solicitante_id: '', tipo_amostra: 'sangue',
    tubo: '', observacoes: '', jejum_necessario: false, jejum_horas: 0, urgente: false,
    coletado_por: '', data_coleta: dataHoraLocalDaClinica(),
    exame_id: '', volume_ml: '', condicao_amostra: [] as string[], sitio_coleta: '', lote_insumo: '',
    finalidade: 'diagnostico', indicacao_clinica: '', categoria_exame: '',
    numero_guia: '', material: '', trouxe_material: false, cid: '', procedimento_codigo: '', convenio_id: '', grupo: '',
  });

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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

  const examesPendentesQuery = useQuery({
    queryKey: ['exames-pendentes-lab', profile?.clinica_id, user?.id, newColetaForm.paciente_id],
    queryFn: async () => {
      if (!newColetaForm.paciente_id) return { items: [], hasMore: false };
      const { data, error } = await supabase.from('exames').select('id, tipo_exame, paciente_id, pacientes(nome)')
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
    queryKey: ['coletas-laboratorio', profile?.clinica_id, user?.id],
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('coletas_laboratorio')
        .select('*, pacientes(nome, cpf, data_nascimento, sexo), medicos(nome, crm, especialidade)')
        .eq('clinica_id', profile!.clinica_id!);
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
      toast.success('Coleta registrada com sucesso!');
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
        coletado: ['em_analise', 'recoleta'],
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
      if (status === 'coletado') updates.data_coleta = new Date().toISOString();
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
      setNewResultForm({ parametro: '', resultado: '', unidade: '', valor_referencia_min: '', valor_referencia_max: '', valor_referencia_texto: '', metodo: '' });
      toast.success('Resultado adicionado!');
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
      total: todayItems.length,
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
    numero_guia: '', material: '', trouxe_material: false, cid: '', procedimento_codigo: '', convenio_id: '', grupo: '',
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
    valor_referencia_max: '', valor_referencia_texto: '', metodo: '',
  });

  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="O módulo Laboratório só pode carregar dados após identificar a clínica da sessão." />;
  }

  if (coletasQuery.isError) {
    return <ErrorState title="Não foi possível carregar a worklist do laboratório" description="As ações de coleta foram pausadas para evitar atualizar amostras com status desatualizado." error={coletasQuery.error} onRetry={() => void coletasQuery.refetch()} />;
  }

  const filtrarPipeline = (filter: string) => {
    setDateFilter('hoje');
    if (filter === 'urgente') {
      setStatusFilter('todos');
      setUrgentOnly(current => !current);
      return;
    }
    setUrgentOnly(false);
    setStatusFilter(current => current === filter ? 'todos' : filter);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" /> Laboratório
          </h1>
          <p className="text-muted-foreground">Central de gestão laboratorial — worklist, coletas e resultados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowLimparFila(true)}>
            Limpar fila antiga
          </Button>
          <Button onClick={() => { resetColetaForm(); setShowNewColeta(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova Coleta
          </Button>
        </div>
      </div>

      <Dialog open={showLimparFila} onOpenChange={(o) => { setShowLimparFila(o); if (!o) setLimparMotivo(''); }}>
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
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-3">
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
        </motion.div>
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

      {/* ─── Pipeline Visual + KPIs ─── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Pendente', value: stats.pendentes, icon: Clock, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', filter: 'pendente' },
          { label: 'Coletado', value: stats.coletados, icon: TestTube, color: 'text-info', bg: 'bg-info/10', border: 'border-info/30', filter: 'coletado' },
          { label: 'Em Análise', value: stats.emAnalise, icon: Activity, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', filter: 'em_analise' },
          { label: 'Validado', value: stats.validados, icon: Shield, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30', filter: 'validado' },
          { label: 'Liberado', value: stats.liberados, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30', filter: 'liberado' },
          { label: 'Urgentes', value: stats.urgentes, icon: Zap, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', filter: 'urgente' },
        ].map((s, idx) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
            <Card className={cn('relative border cursor-pointer hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              s.border,
              (statusFilter === s.filter || (s.filter === 'urgente' && urgentOnly)) && 'ring-2 ring-primary'
            )}
              role="button"
              tabIndex={0}
              aria-pressed={s.filter === 'urgente' ? urgentOnly : statusFilter === s.filter && dateFilter === 'hoje' && !urgentOnly}
              onClick={() => filtrarPipeline(s.filter)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  filtrarPipeline(s.filter);
                }
              }}>
              <CardContent className="pt-3 pb-2 flex items-center gap-2">
                <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', s.bg)}>
                  <s.icon className={cn('h-4 w-4', s.color)} />
                </div>
                <div>
                  <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Completion bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Taxa de conclusão hoje</p>
            <span className="text-sm font-bold text-primary">{completionRate}%</span>
          </div>
          <Progress value={completionRate} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {stats.liberados + stats.validados} de {stats.total} amostras concluídas
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="worklist" className="gap-1"><ClipboardCheck className="h-3.5 w-3.5" />Worklist</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-1"><Activity className="h-3.5 w-3.5" />Pipeline</TabsTrigger>
        </TabsList>

        {/* ─── Worklist Tab ─── */}
        <TabsContent value="worklist" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar paciente, código ou CPF..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Status</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ontem">Ontem</SelectItem>
                <SelectItem value="7dias">7 dias</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              {filtered.length} resultado(s)
            </Badge>
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
              <Card><CardContent className="py-12 text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <FlaskConical className="h-8 w-8 text-primary" />
                </div>
                <p className="font-semibold text-foreground">
                  {coletasQuery.hasNextPage ? 'Nenhuma coleta encontrada entre os registros carregados' : 'Nenhuma coleta encontrada'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {coletasQuery.hasNextPage
                    ? 'Ajuste os filtros ou carregue coletas anteriores para ampliar a busca.'
                    : 'Ajuste os filtros ou registre uma nova coleta.'}
                </p>
                {!coletasQuery.hasNextPage && (
                  <Button className="mt-4 gap-2" onClick={() => { resetColetaForm(); setShowNewColeta(true); }}>
                    <Plus className="h-4 w-4" /> Nova Coleta
                  </Button>
                )}
              </CardContent></Card>
            ) : (
              filtered.map((coleta: any) => {
                const nextStatus = getNextStatus(coleta.status);
                return (
                  <Card key={coleta.id} className={cn(
                    'transition-all hover:shadow-sm',
                    coleta.urgente && 'border-destructive/50 bg-destructive/5',
                  )}>
                    <CardContent className="py-3 px-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{coleta.pacientes?.nome}</span>
                            <Badge variant="outline" className="font-mono text-[10px] gap-1">
                              <Barcode className="h-3 w-3" />{coleta.codigo_amostra}
                            </Badge>
                            <Badge className={statusColors[coleta.status]}>{statusLabels[coleta.status]}</Badge>
                            {coleta.urgente && <Badge variant="destructive" className="gap-1"><Zap className="h-3 w-3" />Urgente</Badge>}
                            {coleta.jejum_necessario && <Badge variant="outline" className="text-[10px]">Jejum {coleta.jejum_horas}h</Badge>}
                            {(coleta as any).procedimento_codigo && <Badge variant="outline" className="font-mono text-[10px]">{(coleta as any).procedimento_codigo}</Badge>}
                            {(coleta as any).numero_guia && <Badge variant="secondary" className="text-[10px]">Guia: {(coleta as any).numero_guia}</Badge>}
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
                                <Badge key={c} variant="destructive" className="text-[10px]">{c}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {nextStatus && coleta.status !== 'cancelado' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: coleta.id, status: nextStatus, expectedStatus: coleta.status })}>
                              <ArrowRight className="h-3 w-3" /> {statusLabels[nextStatus]}
                            </Button>
                          )}
                          {coleta.status === 'validado' && (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                              <Link to="/laudos-lab"><FileText className="h-3 w-3" />Liberar laudo</Link>
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                            onClick={() => setShowResultados(coleta.id)}>
                            <Eye className="h-3 w-3" /> Resultados
                          </Button>
                          {(coleta.status === 'pendente' || coleta.status === 'recoleta') && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
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
          <p className="text-sm text-muted-foreground">Visão Kanban do fluxo laboratorial de hoje</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
        </TabsContent>
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
                <Barcode className="h-4 w-4 text-primary" />Rastreabilidade
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
                  <Select value={newColetaForm.exame_id || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, exame_id: v === '__none__' ? '' : v }))} disabled={examesFiltrados.length === 0}>
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
                <Barcode className="h-4 w-4" />Registrar Coleta
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
                <div key={r.id} className={cn('p-3 rounded-lg border', isAltered ? 'border-destructive/30 bg-destructive/5' : '')}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{r.parametro}</p>
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
            <Card>
              <CardHeader><CardTitle className="text-sm">Adicionar Resultado</CardTitle></CardHeader>
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
                  });
                }} className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Parâmetro *</Label><Input disabled={addResultado.isPending} value={newResultForm.parametro} onChange={(e) => setNewResultForm(p => ({ ...p, parametro: e.target.value }))} placeholder="Ex: Hemoglobina" /></div>
                  <div><Label className="text-xs">Resultado *</Label><Input disabled={addResultado.isPending} value={newResultForm.resultado} onChange={(e) => setNewResultForm(p => ({ ...p, resultado: e.target.value }))} placeholder="Ex: 14.2" /></div>
                  <div><Label className="text-xs">Unidade</Label><Input disabled={addResultado.isPending} value={newResultForm.unidade} onChange={(e) => setNewResultForm(p => ({ ...p, unidade: e.target.value }))} placeholder="g/dL" /></div>
                  <div><Label className="text-xs">Método</Label><Input disabled={addResultado.isPending} value={newResultForm.metodo} onChange={(e) => setNewResultForm(p => ({ ...p, metodo: e.target.value }))} placeholder="Automatizado" /></div>
                  <div><Label className="text-xs">Ref. Mínimo</Label><Input disabled={addResultado.isPending} type="text" inputMode="decimal" value={newResultForm.valor_referencia_min} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_min: e.target.value }))} placeholder="Opcional" /></div>
                  <div><Label className="text-xs">Ref. Máximo</Label><Input disabled={addResultado.isPending} type="text" inputMode="decimal" value={newResultForm.valor_referencia_max} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_max: e.target.value }))} placeholder="Opcional" /></div>
                  <div className="col-span-2"><Label className="text-xs">Referência textual</Label><Input disabled={addResultado.isPending} value={newResultForm.valor_referencia_texto} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_texto: e.target.value }))} placeholder="Ex: Não reagente" /></div>
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
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
