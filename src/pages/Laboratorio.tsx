import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { format, differenceInMinutes, differenceInHours, isToday, isYesterday, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { pacienteCorresponde } from '@/lib/buscaPaciente';

/**
 * Teto da worklist do laboratório.
 *
 * O PostgREST corta em 1.000 linhas por padrão e não avisa. Pedimos um a mais
 * que este teto para detectar o corte e dizer ao operador que existe mais
 * histórico, em vez de deixá-lo achar que a amostra sumiu.
 */
const TETO_WORKLIST = 500;

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

export default function Laboratorio() {
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
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio'] });
      queryClient.invalidateQueries({ queryKey: ['preview-limpar-fila-lab'] });
      setShowLimparFila(false);
      setLimparMotivo('');
      toast.success(n === 0 ? 'Nada a cancelar' : `${n} coleta(s) cancelada(s)`);
    },
    onError: (e) => toast.error('Não foi possível cancelar em lote', { description: mensagemDeErro(e) }),
  });

  const { data: pacientes } = useQuery({
    queryKey: ['pacientes-lab'],
    queryFn: async () => {
      const { data } = await supabase.from('pacientes').select('id, nome, cpf').order('nome');
      return data || [];
    },
  });

  const { data: medicos } = useQuery({
    queryKey: ['medicos-lab'],
    queryFn: async () => {
      const { data } = await supabase.from('medicos').select('id, nome, crm, especialidade').order('nome');
      return data || [];
    },
  });

  const { data: funcionarios } = useQuery({
    queryKey: ['funcionarios-lab'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome').order('nome');
      return data || [];
    },
  });

  const { data: convenios } = useQuery({
    queryKey: ['convenios-lab'],
    queryFn: async () => {
      const { data } = await supabase.from('convenios').select('id, nome, codigo').eq('ativo', true).order('nome');
      return data || [];
    },
  });

  const { data: examesPendentes } = useQuery({
    queryKey: ['exames-pendentes-lab'],
    queryFn: async () => {
      const { data } = await supabase.from('exames').select('id, tipo_exame, paciente_id, pacientes(nome)')
        .in('status', ['solicitado', 'agendado']).order('data_solicitacao', { ascending: false }).limit(200);
      return data || [];
    },
  });

  const { data: coletas, isLoading } = useQuery({
    queryKey: ['coletas-laboratorio'],
    queryFn: async () => {
      // Sem `.limit()` o PostgREST aplica o teto padrão (1.000 linhas) e corta
      // em silêncio: passado esse ponto, amostras antigas simplesmente somem da
      // worklist sem nenhum aviso, e o técnico conclui que a coleta se perdeu.
      // Pedimos um a mais que o teto justamente para saber se houve corte.
      const { data, error } = await supabase
        .from('coletas_laboratorio')
        .select('*, pacientes(nome, cpf, data_nascimento, sexo), medicos(nome, crm, especialidade)')
        .order('created_at', { ascending: false })
        .limit(TETO_WORKLIST + 1);

      if (error) {
        toast.error('Não foi possível carregar a worklist.', { description: mensagemDeErro(error) });
        throw error;
      }

      const linhas = data || [];
      if (linhas.length > TETO_WORKLIST) {
        toast.warning(`Mostrando as ${TETO_WORKLIST} coletas mais recentes.`, {
          description: 'Há mais registros no histórico. Use os filtros de situação e busca para chegar às amostras antigas.',
          duration: 8000,
        });
        return linhas.slice(0, TETO_WORKLIST);
      }
      return linhas;
    },
  });

  const { data: resultados } = useQuery({
    queryKey: ['resultados-laboratorio', showResultados],
    queryFn: async () => {
      if (!showResultados) return [];
      const { data } = await supabase
        .from('resultados_laboratorio')
        .select('*')
        .eq('coleta_id', showResultados)
        .order('parametro');
      return data || [];
    },
    enabled: !!showResultados,
  });

  const createColeta = useMutation({
    mutationFn: async (form: any) => {
      const payload = { ...form };
      if (!payload.clinica_id && profile?.clinica_id) {
        payload.clinica_id = profile.clinica_id;
      }
      const { error } = await supabase.from('coletas_laboratorio').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio'] });
      queryClient.invalidateQueries({ queryKey: ['exames-pendentes-lab'] });
      toast.success('Coleta registrada com sucesso!');
      setShowNewColeta(false);
    },
    onError: (e) => toast.error('Erro ao registrar coleta', { description: mensagemDeErro(e) }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === 'coletado') updates.data_coleta = new Date().toISOString();
      const { error } = await supabase.from('coletas_laboratorio').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio'] });
      toast.success('Status atualizado');
    },
    // Sem `onError` o botão parecia não fazer nada: o técnico seguia
    // trabalhando com uma coleta pendente sem saber que o update falhou.
    onError: (e) => toast.error('Não foi possível mudar o status da coleta', {
      description: mensagemDeErro(e),
    }),
  });

  const addResultado = useMutation({
    mutationFn: async (form: any) => {
      const { error } = await supabase.from('resultados_laboratorio').insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resultados-laboratorio'] });
      toast.success('Resultado adicionado!');
    },
    onError: (e) => toast.error('Erro ao adicionar resultado', { description: mensagemDeErro(e) }),
  });

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
      if (dateFilter === 'hoje' && c.created_at && !isToday(new Date(c.created_at))) return false;
      if (dateFilter === 'ontem' && c.created_at && !isYesterday(new Date(c.created_at))) return false;
      if (dateFilter === '7dias' && c.created_at && new Date(c.created_at) < subDays(new Date(), 7)) return false;
      return true;
    });
  }, [coletas, search, statusFilter, urgentOnly, dateFilter]);

  // ─── Stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!coletas) return { pendentes: 0, coletados: 0, emAnalise: 0, validados: 0, liberados: 0, cancelados: 0, urgentes: 0, total: 0 };
    const todayItems = coletas.filter((c: any) => c.created_at && isToday(new Date(c.created_at)));
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
  }, [coletas]);

  // SLA tracking
  const slaBreaches = useMemo(() => {
    if (!coletas) return [];
    return coletas.filter((c: any) => {
      if (c.status === 'liberado' || c.status === 'cancelado') return false;
      if (!c.created_at) return false;
      const mins = differenceInMinutes(new Date(), new Date(c.created_at));
      return mins > SLA_CRITICAL_MINUTES;
    });
  }, [coletas]);

  const completionRate = stats.total > 0
    ? Math.round(((stats.liberados + stats.validados) / stats.total) * 100) : 0;

  const getNextStatus = (current: string) => {
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
  const [newColetaForm, setNewColetaForm] = useState({
    paciente_id: '', medico_solicitante_id: '', tipo_amostra: 'sangue',
    tubo: '', observacoes: '', jejum_necessario: false, jejum_horas: 0, urgente: false,
    coletado_por: '', data_coleta: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    exame_id: '', volume_ml: '', condicao_amostra: [] as string[], sitio_coleta: '', lote_insumo: '',
    finalidade: 'diagnostico', indicacao_clinica: '', categoria_exame: '',
    numero_guia: '', material: '', trouxe_material: false, cid: '', procedimento_codigo: '', convenio_id: '', grupo: '',
  });

  const resetColetaForm = () => setNewColetaForm({
    paciente_id: '', medico_solicitante_id: '', tipo_amostra: 'sangue',
    tubo: '', observacoes: '', jejum_necessario: false, jejum_horas: 0, urgente: false,
    coletado_por: user?.id || '', data_coleta: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
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

  const examesFiltrados = examesPendentes?.filter((e: any) =>
    !newColetaForm.paciente_id || e.paciente_id === newColetaForm.paciente_id
  ) || [];

  const [newResultForm, setNewResultForm] = useState({
    parametro: '', resultado: '', unidade: '', valor_referencia_min: '',
    valor_referencia_max: '', valor_referencia_texto: '', metodo: '',
  });

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
                {previewLimpar.data ?? '…'} coleta(s) da sua clínica seriam canceladas.
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
            <Card className={cn('relative border cursor-pointer hover:shadow-md transition-all',
              s.border,
              (statusFilter === s.filter || (s.filter === 'urgente' && urgentOnly)) && 'ring-2 ring-primary'
            )}
              onClick={() => {
                if (s.filter === 'urgente') { setUrgentOnly(!urgentOnly); }
                else { setStatusFilter(statusFilter === s.filter ? 'todos' : s.filter); setDateFilter('hoje'); }
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
                <p className="font-semibold text-foreground">Nenhuma coleta encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">Registre uma nova coleta para começar</p>
                <Button className="mt-4 gap-2" onClick={() => { resetColetaForm(); setShowNewColeta(true); }}>
                  <Plus className="h-4 w-4" /> Nova Coleta
                </Button>
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
                            {coleta.medicos?.nome && <span>• Dr(a). {coleta.medicos.nome}</span>}
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
                              onClick={() => updateStatus.mutate({ id: coleta.id, status: nextStatus })}>
                              <ArrowRight className="h-3 w-3" /> {statusLabels[nextStatus]}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                            onClick={() => setShowResultados(coleta.id)}>
                            <Eye className="h-3 w-3" /> Resultados
                          </Button>
                          {coleta.status !== 'cancelado' && coleta.status !== 'liberado' && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                              onClick={() => updateStatus.mutate({ id: coleta.id, status: 'cancelado' })}>
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
        </TabsContent>

        {/* ─── Pipeline Tab ─── */}
        <TabsContent value="pipeline" className="space-y-4">
          <p className="text-sm text-muted-foreground">Visão Kanban do fluxo laboratorial de hoje</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {PIPELINE_STEPS.map(step => {
              const items = (coletas || []).filter((c: any) =>
                c.status === step && c.created_at && isToday(new Date(c.created_at))
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
                            onClick={() => updateStatus.mutate({ id: c.id, status: nextStep })}>
                            <ArrowRight className="h-2.5 w-2.5" /> {statusLabels[nextStep]}
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
      <Dialog open={showNewColeta} onOpenChange={setShowNewColeta}>
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
            createColeta.mutate({
              paciente_id: newColetaForm.paciente_id,
              medico_solicitante_id: newColetaForm.medico_solicitante_id || null,
              tipo_amostra: newColetaForm.tipo_amostra,
              tubo: newColetaForm.tubo || null,
              observacoes: newColetaForm.observacoes || null,
              jejum_necessario: newColetaForm.jejum_necessario,
              jejum_horas: newColetaForm.jejum_horas || null,
              urgente: newColetaForm.urgente,
              coletado_por: newColetaForm.coletado_por || null,
              data_coleta: newColetaForm.data_coleta ? new Date(newColetaForm.data_coleta).toISOString() : null,
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
          }} className="flex-1 overflow-y-auto space-y-5 pr-2">

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
                <Select value={newColetaForm.paciente_id} onValueChange={v => setNewColetaForm(p => ({ ...p, paciente_id: v, exame_id: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                  <SelectContent>{pacientes?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Médico Solicitante</Label>
                <Select value={newColetaForm.medico_solicitante_id} onValueChange={v => setNewColetaForm(p => ({ ...p, medico_solicitante_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{medicos?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome || `CRM ${m.crm}`} — {m.especialidade || 'Clínico'}</SelectItem>)}</SelectContent>
                </Select>
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
                  <Select value={newColetaForm.convenio_id || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, convenio_id: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Particular" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Particular</SelectItem>
                      {convenios?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome} ({c.codigo})</SelectItem>)}
                    </SelectContent>
                  </Select>
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
              <Select value={newColetaForm.exame_id || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, exame_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum (coleta avulsa)</SelectItem>
                  {examesFiltrados.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.tipo_exame} — {(e as any).pacientes?.nome || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Label className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" />Data e Hora da Coleta</Label>
                <Input type="datetime-local" value={newColetaForm.data_coleta}
                  onChange={e => setNewColetaForm(p => ({ ...p, data_coleta: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1"><User className="h-3 w-3" />Profissional</Label>
                <Select value={newColetaForm.coletado_por || '__none__'} onValueChange={v => setNewColetaForm(p => ({ ...p, coletado_por: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Quem realizou" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    {funcionarios?.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
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
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog Resultados ─── */}
      <Dialog open={!!showResultados} onOpenChange={() => setShowResultados(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Resultados Laboratoriais</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {resultados?.length === 0 && <p className="text-muted-foreground text-center py-4">Nenhum resultado cadastrado</p>}
            {resultados?.map((r: any) => {
              const numResult = parseFloat(r.resultado);
              const isAltered = !isNaN(numResult) && ((r.valor_referencia_min != null && numResult < r.valor_referencia_min) || (r.valor_referencia_max != null && numResult > r.valor_referencia_max));
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
                    paciente_id: coleta?.paciente_id,
                    parametro: newResultForm.parametro,
                    resultado: newResultForm.resultado,
                    unidade: newResultForm.unidade || null,
                    valor_referencia_min: newResultForm.valor_referencia_min ? +newResultForm.valor_referencia_min : null,
                    valor_referencia_max: newResultForm.valor_referencia_max ? +newResultForm.valor_referencia_max : null,
                    valor_referencia_texto: newResultForm.valor_referencia_texto || null,
                    metodo: newResultForm.metodo || null,
                  });
                  setNewResultForm({ parametro: '', resultado: '', unidade: '', valor_referencia_min: '', valor_referencia_max: '', valor_referencia_texto: '', metodo: '' });
                }} className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Parâmetro *</Label><Input value={newResultForm.parametro} onChange={(e) => setNewResultForm(p => ({ ...p, parametro: e.target.value }))} placeholder="Ex: Hemoglobina" /></div>
                  <div><Label className="text-xs">Resultado *</Label><Input value={newResultForm.resultado} onChange={(e) => setNewResultForm(p => ({ ...p, resultado: e.target.value }))} placeholder="Ex: 14.2" /></div>
                  <div><Label className="text-xs">Unidade</Label><Input value={newResultForm.unidade} onChange={(e) => setNewResultForm(p => ({ ...p, unidade: e.target.value }))} placeholder="g/dL" /></div>
                  <div><Label className="text-xs">Método</Label><Input value={newResultForm.metodo} onChange={(e) => setNewResultForm(p => ({ ...p, metodo: e.target.value }))} placeholder="Automatizado" /></div>
                  <div><Label className="text-xs">Ref. Mínimo</Label><Input type="number" step="any" value={newResultForm.valor_referencia_min} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_min: e.target.value }))} /></div>
                  <div><Label className="text-xs">Ref. Máximo</Label><Input type="number" step="any" value={newResultForm.valor_referencia_max} onChange={(e) => setNewResultForm(p => ({ ...p, valor_referencia_max: e.target.value }))} /></div>
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
