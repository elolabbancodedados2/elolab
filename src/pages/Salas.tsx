import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import {
  Plus, DoorOpen, Settings, Bed, Loader2, Users, CheckCircle2, XCircle, AlertTriangle,
  Clock, MapPin, Paintbrush, Wrench, Search, Building2, Layers, RefreshCw, ListChecks, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useSalas, useMedicos } from '@/hooks/useSupabaseData';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Database } from '@/integrations/supabase/types';
import { ErrorState } from '@/components/ErrorState';
import { User } from 'lucide-react';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { formatarDataOcupacaoAntiga, summarizeRoomOccupancy } from '@/lib/roomOccupancy';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';

type StatusSala = Database['public']['Enums']['status_sala'];
type EstadoSala = StatusSala | 'reservada';

const STATUS_COLORS: Record<StatusSala, string> = {
  disponivel: 'bg-success',
  ocupado: 'bg-destructive',
  manutencao: 'bg-warning',
  limpeza: 'bg-info',
};

const STATUS_LABELS: Record<StatusSala, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  manutencao: 'Manutenção',
  limpeza: 'Limpeza',
};

const ESTADO_SALA_LABELS: Record<EstadoSala, string> = {
  ...STATUS_LABELS,
  reservada: 'Reservada',
};

const ESTADO_SALA_COLORS: Record<EstadoSala, string> = {
  ...STATUS_COLORS,
  reservada: 'bg-info',
};

const TIPO_LABELS: Record<string, string> = {
  consultorio: 'Consultório',
  exame: 'Sala de Exames',
  procedimento: 'Sala de Procedimentos',
  triagem: 'Triagem',
  espera: 'Sala de Espera',
  leito_enfermaria: 'Leito — Enfermaria',
  leito_apartamento: 'Leito — Apartamento',
  leito_uti: 'Leito — UTI',
  leito_observacao: 'Leito — Observação',
};

const TIPO_ICONS: Record<string, typeof DoorOpen> = {
  consultorio: DoorOpen,
  exame: Settings,
  procedimento: Wrench,
  triagem: CheckCircle2,
  espera: Users,
  leito_enfermaria: Bed,
  leito_apartamento: Bed,
  leito_uti: Bed,
  leito_observacao: Bed,
};

const EQUIPAMENTOS_SUGERIDOS = [
  'Maca', 'Mesa cirúrgica', 'Ultrassom', 'Eletrocardiógrafo', 'Raio-X',
  'Oxigênio', 'Aspirador', 'Ar-condicionado', 'Monitor multiparamétrico',
  'Desfibrilador', 'Laringoscópio', 'Negatoscópio', 'Balança', 'Oftalmoscópio',
];

const CORES = [
  '#1080CA', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];
const NOMES_CORES: Record<string, string> = {
  '#1080CA': 'Azul', '#ef4444': 'Vermelho', '#22c55e': 'Verde',
  '#f59e0b': 'Âmbar', '#8b5cf6': 'Roxo', '#ec4899': 'Rosa',
  '#06b6d4': 'Ciano', '#f97316': 'Laranja', '#14b8a6': 'Turquesa', '#6366f1': 'Índigo',
};

const isLeito = (tipo: string) => tipo.startsWith('leito_');

interface SalaForm {
  nome: string;
  tipo: string;
  capacidade: number;
  status: StatusSala;
  medico_responsavel: string;
  equipamentos: string[];
  setor: string;
  andar: string;
  horario_inicio: string;
  horario_fim: string;
  cor: string;
  genero: string;
  numero_cama: string;
  observacoes: string;
}

const initialForm: SalaForm = {
  nome: '', tipo: 'consultorio', capacidade: 1, status: 'disponivel',
  medico_responsavel: '', equipamentos: [], setor: '', andar: '',
  horario_inicio: '07:00', horario_fim: '19:00', cor: '#1080CA',
  genero: '', numero_cama: '', observacoes: '',
};

export default function Salas() {
  const { profile } = useSupabaseAuth();
  const hoje = todaySaoPauloDateOnly();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState<SalaForm>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingSalaId, setUpdatingSalaId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterEstado, setFilterEstado] = useState<EstadoSala | 'todos'>('todos');

  const queryClient = useQueryClient();
  const salasQuery = useSalas();
  const { data: salas = [], isLoading } = salasQuery;
  const medicosQuery = useMedicos();
  const { data: medicos = [] } = medicosQuery;

  // Fetch active queue entries with sala_id to show who occupies each room
  const ocupacoesQuery = useQuery({
    queryKey: ['fila_atendimento_salas', profile?.clinica_id],
    queryFn: async () => {
      let query = (supabase as any)
        .from('fila_atendimento')
        .select('id, sala_id, status, agendamento_id, agendamentos(id, data, paciente_id, medico_id, pacientes(id, nome, nome_social), medicos(id, nome, crm, especialidade))')
        .in('status', ['em_atendimento', 'chamado', 'aguardando'])
        .not('sala_id', 'is', null);
      if (profile?.clinica_id) query = query.eq('clinica_id', profile.clinica_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
    refetchInterval: 10000, // auto-refresh every 10s
  });
  const ocupacoes = ocupacoesQuery.data ?? [];

  const filtered = useMemo(() => {
    let list = salas as any[];
    if (filterTipo !== 'todos') list = list.filter(s => s.tipo === filterTipo);
    if (search.trim()) {
      const q = normalizarTexto(search);
      list = list.filter(s => {
        const medico = (medicos as any[]).find(item => item.id === s.medico_responsavel);
        const campos = [
          s.nome, s.setor, s.andar, s.numero_cama, s.tipo, TIPO_LABELS[s.tipo],
          STATUS_LABELS[s.status as StatusSala], s.observacoes,
          ...(Array.isArray(s.equipamentos) ? s.equipamentos : []),
          medico?.nome, medico?.crm, medico?.especialidade,
        ];
        return campos.some(valor => normalizarTexto(String(valor ?? '')).includes(q));
      });
    }
    return list;
  }, [salas, medicos, filterTipo, search]);

  const handleOpen = (sala?: any) => {
    if (sala) {
      setEditingId(sala.id);
      setEditingUpdatedAt(sala.updated_at ?? null);
      setForm({
        nome: sala.nome, tipo: sala.tipo || 'consultorio', capacidade: sala.capacidade || 1,
        status: sala.status || 'disponivel', medico_responsavel: sala.medico_responsavel || '',
        equipamentos: sala.equipamentos || [], setor: sala.setor || '', andar: sala.andar || '',
        horario_inicio: sala.horario_inicio || '07:00', horario_fim: sala.horario_fim || '19:00',
        cor: sala.cor || '#1080CA', genero: sala.genero || '', numero_cama: sala.numero_cama || '',
        observacoes: sala.observacoes || '',
      });
    } else {
      setEditingId(null);
      setEditingUpdatedAt(null);
      setForm(initialForm);
    }
    setIsDialogOpen(true);
  };

  const toggleEquipamento = (eq: string) => {
    setForm(p => ({
      ...p,
      equipamentos: p.equipamentos.includes(eq)
        ? p.equipamentos.filter(e => e !== eq)
        : [...p.equipamentos, eq],
    }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a página e tente novamente.'); return; }
    if (!form.nome.trim()) { toast.error('Nome da sala é obrigatório.'); return; }
    if (!Number.isInteger(form.capacidade) || form.capacidade < 1) {
      toast.error('A capacidade deve ser um número inteiro maior que zero.');
      return;
    }
    if (form.horario_inicio && form.horario_fim && form.horario_fim <= form.horario_inicio) {
      toast.error('O horário de encerramento deve ser posterior ao horário de início.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        capacidade: form.capacidade,
        status: form.status as StatusSala,
        medico_responsavel: form.medico_responsavel || null,
        equipamentos: form.equipamentos.length > 0 ? form.equipamentos : null,
        setor: form.setor || null,
        andar: form.andar || null,
        horario_inicio: form.horario_inicio || null,
        horario_fim: form.horario_fim || null,
        cor: form.cor || null,
        genero: form.genero && form.genero !== '__none__' ? form.genero : null,
        numero_cama: form.numero_cama || null,
        observacoes: form.observacoes || null,
      };

      if (editingId) {
        const salaAtual = (salas as any[]).find(item => item.id === editingId);
        const ocupacaoAtiva = (ocupacoes as any[]).some(item => item.sala_id === editingId);
        if (salaAtual && ocupacaoAtiva && form.status !== 'ocupado' && form.status !== salaAtual.status) {
          throw new Error('Esta sala ainda tem paciente aguardando ou em atendimento. Finalize ou transfira o atendimento antes de alterar o status.');
        }
        let query = supabase.from('salas').update(payload)
          .eq('id', editingId).eq('clinica_id', profile.clinica_id);
        query = editingUpdatedAt ? query.eq('updated_at', editingUpdatedAt) : query.is('updated_at', null);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data) {
          await queryClient.invalidateQueries({ queryKey: ['salas'] });
          throw new Error('Esta sala foi alterada por outra pessoa ou removida. Atualize a lista e confira os dados antes de salvar novamente.');
        }
        toast.success('Sala atualizada!');
      } else {
        const { error } = await supabase.from('salas').insert({ ...payload, clinica_id: profile.clinica_id });
        if (error) throw error;
        toast.success('Sala cadastrada!');
      }
      queryClient.invalidateQueries({ queryKey: ['salas'] });
      setIsDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar sala.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeStatus = async (sala: any, newStatus: StatusSala) => {
    if (updatingSalaId) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a página e tente novamente.'); return; }
    const ocupacaoAtiva = (ocupacoes as any[]).some(item => item.sala_id === sala.id);
    if (ocupacaoAtiva && newStatus !== 'ocupado') {
      toast.error('Não é possível liberar esta sala enquanto houver paciente vinculado.', {
        description: 'Finalize ou transfira o atendimento na Fila antes de marcar a sala para limpeza ou disponibilidade.',
      });
      return;
    }
    setUpdatingSalaId(sala.id);
    try {
      // A mudança operacional de status não deve apagar o responsável fixo da sala.
      const updates: Record<string, unknown> = { status: newStatus };
      const { data, error } = await (supabase as any).from('salas').update(updates)
        .eq('id', sala.id).eq('clinica_id', profile.clinica_id).eq('status', sala.status).select('id').maybeSingle();
      if (error) throw error;
      if (!data) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['salas'] }),
          queryClient.invalidateQueries({ queryKey: ['fila_atendimento_salas'] }),
        ]);
        throw new Error('O status da sala mudou ou o atendimento foi atualizado por outra pessoa. Atualize a tela antes de tentar novamente.');
      }
      queryClient.invalidateQueries({ queryKey: ['salas'] });
      toast.success(`${sala.nome} → ${STATUS_LABELS[newStatus]}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar o estado da sala.');
    } finally {
      setUpdatingSalaId(null);
    }
  };

  const getOcupacao = (salaId: string) =>
    (ocupacoes as any[]).filter((item: any) => item.sala_id === salaId);

  const statusEfetivoSala = (sala: any): EstadoSala => {
    const atendimentos = getOcupacao(sala.id);
    if (atendimentos.some((item: any) => item.status === 'em_atendimento')) return 'ocupado';
    if (atendimentos.length > 0) return 'reservada';
    return sala.status;
  };

  const filtradasPorEstado = filterEstado === 'todos' ? filtered : filtered.filter(s => statusEfetivoSala(s) === filterEstado);
  const temFiltro = search.trim() !== '' || filterTipo !== 'todos' || filterEstado !== 'todos';
  const limparFiltros = () => { setSearch(''); setFilterTipo('todos'); setFilterEstado('todos'); };

  const salasPorTipo: Record<string, any[]> = {};
  for (const sala of filtradasPorEstado) {
    const tipo = (sala as any).tipo || 'consultorio';
    if (!salasPorTipo[tipo]) salasPorTipo[tipo] = [];
    salasPorTipo[tipo].push(sala);
  }

  const stats = {
    disponivel: (salas as any[]).filter(s => statusEfetivoSala(s) === 'disponivel').length,
    ocupado: (salas as any[]).filter(s => statusEfetivoSala(s) === 'ocupado').length,
    reservada: (salas as any[]).filter(s => statusEfetivoSala(s) === 'reservada').length,
    manutencao: (salas as any[]).filter(s => statusEfetivoSala(s) === 'manutencao').length,
    limpeza: (salas as any[]).filter(s => statusEfetivoSala(s) === 'limpeza').length,
  };
  const totalSalas = (salas as any[]).length;
  const emUso = stats.ocupado + stats.reservada;
  const taxaOcupacao = totalSalas > 0 ? Math.round((emUso / totalSalas) * 100) : 0;
  const foraDeOperacao = stats.manutencao + stats.limpeza;
  const refresh = () => {
    void salasQuery.refetch();
    void ocupacoesQuery.refetch();
  };

  if (isLoading || ocupacoesQuery.isLoading || medicosQuery.isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  }
  if (salasQuery.isError) {
    return <ErrorState title="Não foi possível carregar as salas" error={salasQuery.error} onRetry={() => void salasQuery.refetch()} />;
  }
  if (ocupacoesQuery.isError) {
    return <ErrorState title="Não foi possível confirmar a ocupação das salas" description="A tela foi pausada para evitar mostrar uma sala ocupada como disponível." error={ocupacoesQuery.error} onRetry={() => void ocupacoesQuery.refetch()} />;
  }
  if (medicosQuery.isError) {
    return <ErrorState title="Não foi possível carregar os médicos responsáveis" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;
  }

  const getMedicoNome = (id: string | null) => {
    if (!id) return null;
    const m = (medicos as any[]).find(m => m.id === id);
    return m ? (m.nome || `CRM ${m.crm}`) : null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salas e Leitos"
        description={totalSalas > 0
          ? `${totalSalas} espaço${totalSalas === 1 ? '' : 's'} · ${taxaOcupacao}% em uso agora · atualiza a cada 10 s`
          : 'Gerencie a disponibilidade de espaços físicos'}
        icon={<DoorOpen />}
        actions={
          <>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/higiene-salas"><Paintbrush aria-hidden="true" className="h-4 w-4" /> Higienização</Link>
            </Button>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/fila"><ListChecks aria-hidden="true" className="h-4 w-4" /> Ver fila</Link>
            </Button>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={refresh} aria-label="Atualizar salas" title="Atualizar salas">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => handleOpen()} className="shrink-0 gap-2 rounded-full bg-[#111111] text-white shadow-md hover:bg-[#2b2b33]">
              <Plus className="h-4 w-4" /> Nova Sala / Leito
            </Button>
          </>
        }
      />

      {/* Situação agora */}
      <section role="group" aria-label="Situação das salas" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Situação agora</h2>
          <p className="text-xs text-muted-foreground">
            {filterEstado === 'todos' ? 'Clique em um indicador para filtrar as salas.' : `Mostrando apenas ${ESTADO_SALA_LABELS[filterEstado].toLowerCase()}.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {([
            { key: 'ocupado' as EstadoSala, icon: Users, label: 'Em atendimento', caption: 'com paciente agora', color: 'text-[#2ED5E7]', surface: 'bg-white/15', escuro: true },
            { key: 'reservada' as EstadoSala, icon: Clock, label: 'Reservadas', caption: 'paciente chamado ou na fila', color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false },
            { key: 'disponivel' as EstadoSala, icon: CheckCircle2, label: 'Disponíveis', caption: 'prontas para uso', color: 'text-success', surface: 'bg-success/10', escuro: false },
            { key: 'limpeza' as EstadoSala, icon: Paintbrush, label: 'Limpeza', caption: 'aguardando higienização', color: 'text-info', surface: 'bg-info/10', escuro: false },
            { key: 'manutencao' as EstadoSala, icon: Wrench, label: 'Manutenção', caption: 'fora de operação', color: 'text-warning', surface: 'bg-warning/10', escuro: false },
          ]).map(s => {
            const Icon = s.icon;
            const ativo = filterEstado === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFilterEstado(ativo ? 'todos' : s.key)}
                className={cn(
                  'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                  s.escuro && 'border-transparent bg-[#111111] text-white',
                  ativo && !s.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                  ativo && s.escuro && 'ring-2 ring-[#2ED5E7]/60',
                )}
              >
                <div className="flex min-h-[96px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                      <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{stats[s.key]}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {foraDeOperacao > 0 && (
          <p className="text-xs text-muted-foreground">
            {foraDeOperacao} espaço{foraDeOperacao === 1 ? '' : 's'} fora de operação no momento.
            {stats.limpeza > 0 && <> <Link to="/higiene-salas" className="font-medium text-[#1080CA] underline-offset-2 hover:underline">Acompanhar higienização</Link>.</>}
          </p>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar salas, leitos ou equipamentos" className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" placeholder="Sala, cama, setor, equipamento..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger aria-label="Filtrar por tipo de espaço" className="h-10 w-full rounded-full sm:w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {temFiltro && (
          <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtradasPorEstado.length} de {totalSalas} espaço{totalSalas === 1 ? '' : 's'}
        </p>
      </div>

      {/* Grid by type */}
      {Object.entries(salasPorTipo).map(([tipo, salasDoTipo]) => {
        const Icon = TIPO_ICONS[tipo] || DoorOpen;
        return (
          <section key={tipo} aria-labelledby={`salas-tipo-${tipo}`} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                <Icon className="h-4 w-4" />
              </span>
              <h2 id={`salas-tipo-${tipo}`} className="text-base font-semibold text-foreground">{TIPO_LABELS[tipo] || tipo}</h2>
              <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">{salasDoTipo.length}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {salasDoTipo.map((sala: any) => {
                const medicoNome = getMedicoNome(sala.medico_responsavel);
                const ocupacoesSala = getOcupacao(sala.id);
                const resumoOcupacao = summarizeRoomOccupancy(ocupacoesSala.length, sala.capacidade);
                const statusExibido = statusEfetivoSala(sala);
                const capacidade = Math.max(1, Number(sala.capacidade) || 1);
                const percentualOcupado = Math.min(100, Math.round((ocupacoesSala.length / capacidade) * 100));
                return (
                  <Card
                    key={sala.id}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border-border/60 shadow-xs transition-all duration-200',
                      statusExibido === 'ocupado' && 'border-destructive/30 shadow-[0_8px_24px_rgba(239,68,68,0.10)]',
                      statusExibido === 'reservada' && 'border-[#1080CA]/40 ring-1 ring-[#1080CA]/20',
                    )}
                  >
                    <div className="absolute left-0 right-0 top-0 h-1.5" style={{ backgroundColor: sala.cor || '#1080CA' }} />
                    <CardContent className="space-y-3 p-4 pt-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
                            <span className="truncate">{sala.nome}</span>
                            {sala.numero_cama && (
                              <Badge variant="outline" className="rounded-full text-[10px]">Cama {sala.numero_cama}</Badge>
                            )}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {sala.setor && (
                              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                <Building2 aria-hidden="true" className="h-3 w-3" />{sala.setor}
                              </span>
                            )}
                            {sala.andar && (
                              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                <Layers aria-hidden="true" className="h-3 w-3" />{sala.andar}
                              </span>
                            )}
                            {sala.genero && (
                              <Badge variant="secondary" className="rounded-full text-[10px]">{sala.genero}</Badge>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 gap-1 rounded-full text-[10px]',
                            statusExibido === 'ocupado' && 'border-destructive/30 bg-destructive/10 text-destructive',
                            statusExibido === 'reservada' && 'border-[#1080CA]/30 bg-[#1080CA]/10 text-[#1080CA]',
                            statusExibido === 'disponivel' && 'border-success/30 bg-success/10 text-success',
                            statusExibido === 'limpeza' && 'border-info/30 bg-info/10 text-info',
                            statusExibido === 'manutencao' && 'border-warning/40 bg-warning/10 text-warning-foreground',
                          )}
                        >
                          <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', ESTADO_SALA_COLORS[statusExibido])} />
                          {ESTADO_SALA_LABELS[statusExibido] || statusExibido}
                        </Badge>
                      </div>

                      {/* Occupation info */}
                      {ocupacoesSala.length > 0 && (
                        <div className={cn(
                          'space-y-1.5 rounded-xl border p-2.5',
                          statusExibido === 'ocupado'
                            ? 'border-destructive/20 bg-destructive/5'
                            : 'border-[#1080CA]/20 bg-[#F3F8FC]',
                        )}>
                          {ocupacoesSala.map((oc: any) => {
                            const ag = oc.agendamentos;
                            const dataOcupacaoAntiga = formatarDataOcupacaoAntiga(ag?.data, hoje);
                            const pacNome = ag?.pacientes?.nome_social || ag?.pacientes?.nome;
                            const medNome = ag?.medicos?.nome;
                            const medEsp = ag?.medicos?.especialidade;
                            return (
                              <div key={oc.id} className="flex flex-col gap-0.5">
                                {pacNome && (
                                  <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                                    <User aria-hidden="true" className={cn('h-3 w-3', statusExibido === 'ocupado' ? 'text-destructive' : 'text-[#1080CA]')} />
                                    {pacNome}
                                  </span>
                                )}
                                {medNome && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Users aria-hidden="true" className="h-3 w-3 text-[#1080CA]" />
                                    {nomeMedico(medNome)}{medEsp ? ` — ${medEsp}` : ''}
                                  </span>
                                )}
                                <Badge
                                  className={cn(
                                    'w-fit rounded-full border-transparent text-[9px]',
                                    oc.status === 'em_atendimento' ? 'bg-gradient-primary text-white hover:bg-gradient-primary' : 'bg-[#111111] text-white hover:bg-[#111111]',
                                  )}
                                >
                                  {oc.status === 'em_atendimento' ? 'Em atendimento' : oc.status === 'chamado' ? 'Paciente chamado' : 'Aguardando na fila'}
                                </Badge>
                                {dataOcupacaoAntiga && <div className="flex flex-wrap items-center gap-2 text-[10px] text-warning-foreground">
                                  <span>Registro de {dataOcupacaoAntiga}; confira a fila antes de liberar a sala.</span>
                                  <Link className="inline-flex min-h-11 items-center font-medium text-[#1080CA] underline" to="/fila">Abrir fila</Link>
                                </div>}
                              </div>
                            );
                          })}
                          <p className="border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
                            {statusExibido === 'ocupado'
                              ? 'A sala permanece ocupada até o atendimento ser finalizado ou transferido na Fila.'
                              : 'Esta sala está reservada para o paciente chamado ou aguardando na Fila.'}
                          </p>
                        </div>
                      )}

                      {/* Capacity */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span aria-label={`Ocupação monitorada da sala ${sala.nome}: ${resumoOcupacao.label}`}>
                            Ocupação {resumoOcupacao.label}
                          </span>
                          {medicoNome && <span className="truncate pl-2 text-right">{nomeMedico(medicoNome)}</span>}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div
                            className={cn('h-full rounded-full transition-all', resumoOcupacao.overCapacity ? 'bg-destructive' : statusExibido === 'ocupado' ? 'bg-gradient-primary' : 'bg-[#1080CA]')}
                            style={{ width: `${percentualOcupado}%` }}
                          />
                        </div>
                        {resumoOcupacao.overCapacity && (
                          <p role="status" className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                            Revise os vínculos ativos na fila antes de liberar novas posições.
                          </p>
                        )}
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        {sala.horario_inicio && sala.horario_fim && (
                          <p className="flex items-center gap-1">
                            <Clock aria-hidden="true" className="h-3 w-3" />{sala.horario_inicio?.slice(0, 5)} — {sala.horario_fim?.slice(0, 5)}
                          </p>
                        )}
                        {sala.equipamentos && sala.equipamentos.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sala.equipamentos.slice(0, 3).map((eq: string) => (
                              <Badge key={eq} variant="secondary" className="rounded-full text-[9px]">{eq}</Badge>
                            ))}
                            {sala.equipamentos.length > 3 && (
                              <span className="text-[9px]" title={sala.equipamentos.slice(3).join(', ')}>+{sala.equipamentos.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        {statusExibido === 'disponivel' && (
                          <Button size="sm" className="h-9 rounded-full bg-[#111111] px-4 text-xs text-white hover:bg-[#2b2b33]"
                            onClick={() => handleChangeStatus(sala, 'ocupado')} disabled={updatingSalaId !== null}>
                            {updatingSalaId === sala.id ? 'Salvando...' : 'Ocupar'}
                          </Button>
                        )}
                        {statusExibido === 'ocupado' && ocupacoesSala.length === 0 && (
                          <Button size="sm" variant="outline" className="h-9 rounded-full px-4 text-xs"
                            onClick={() => handleChangeStatus(sala, 'limpeza')} disabled={updatingSalaId !== null}>
                            {updatingSalaId === sala.id ? 'Salvando...' : 'Liberar'}
                          </Button>
                        )}
                        {(statusExibido === 'ocupado' || statusExibido === 'reservada') && ocupacoesSala.length > 0 && (
                          <Button asChild size="sm" variant="outline" className="h-9 gap-1 rounded-full border-[#1080CA]/30 px-4 text-xs text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                            <Link to="/fila" aria-label={`Ver ${sala.nome} na fila de atendimento`}>
                              <ListChecks aria-hidden="true" className="h-3 w-3" /> Ver na fila
                            </Link>
                          </Button>
                        )}
                        {statusExibido === 'limpeza' && (
                          <Button asChild size="sm" variant="outline" className="h-9 gap-1 rounded-full px-4 text-xs">
                            <Link to="/higiene-salas" aria-label={`Inspecionar higienização de ${sala.nome}`}>
                              <Paintbrush aria-hidden="true" className="h-3 w-3" />Inspecionar
                            </Link>
                          </Button>
                        )}
                        {statusExibido === 'manutencao' && (
                          <Button size="sm" variant="outline" className="h-9 rounded-full px-4 text-xs"
                            onClick={() => handleChangeStatus(sala, 'disponivel')} disabled={updatingSalaId !== null}>
                            {updatingSalaId === sala.id ? 'Salvando...' : 'Liberar'}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="ml-auto h-9 w-9 rounded-full" aria-label={`Editar sala ${sala.nome}`} title="Editar"
                          onClick={() => handleOpen(sala)} disabled={updatingSalaId !== null}>
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {filtradasPorEstado.length === 0 && (
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardContent className="py-16 text-center text-muted-foreground">
            <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
              <DoorOpen className="h-7 w-7" />
            </span>
            <p className="font-medium text-foreground">{totalSalas === 0 ? 'Nenhuma sala cadastrada' : 'Nenhuma sala corresponde aos filtros'}</p>
            <p className="mt-1 text-sm">{totalSalas === 0 ? 'Cadastre uma sala ou leito para começar.' : 'Limpe a busca, o tipo ou a situação para ver todas as salas.'}</p>
            {totalSalas === 0 ? (
              <Button className="mt-4 rounded-full bg-[#111111] text-white hover:bg-[#2b2b33]" size="sm" onClick={() => handleOpen()}>Nova Sala / Leito</Button>
            ) : (
              <Button className="mt-4 rounded-full" size="sm" variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Form Dialog (Enhanced) ─── */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (open || !isSaving) setIsDialogOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isLeito(form.tipo) ? <Bed className="h-5 w-5 text-primary" /> : <DoorOpen className="h-5 w-5 text-primary" />}
              {editingId ? 'Editar' : 'Nova'} {isLeito(form.tipo) ? 'Leito' : 'Sala'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-2">
            {/* Identificação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sala-nome" className="text-xs">Nome *</Label>
                <Input id="sala-nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Consultório 1, Leito 201..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sala-tipo" className="text-xs">Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger id="sala-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultorio">Consultório</SelectItem>
                    <SelectItem value="exame">Sala de Exames</SelectItem>
                    <SelectItem value="procedimento">Procedimentos</SelectItem>
                    <SelectItem value="triagem">Triagem</SelectItem>
                    <SelectItem value="espera">Sala de Espera</SelectItem>
                    <SelectItem value="leito_enfermaria">Leito — Enfermaria</SelectItem>
                    <SelectItem value="leito_apartamento">Leito — Apartamento</SelectItem>
                    <SelectItem value="leito_uti">Leito — UTI</SelectItem>
                    <SelectItem value="leito_observacao">Leito — Observação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Localização */}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Localização
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sala-setor" className="text-xs">Setor / Ala</Label>
                  <Input id="sala-setor" value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))}
                    placeholder="Ala Norte, Bloco B..." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sala-andar" className="text-xs">Andar</Label>
                  <Input id="sala-andar" value={form.andar} onChange={e => setForm(p => ({ ...p, andar: e.target.value }))}
                    placeholder="Térreo, 2º Andar..." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sala-capacidade" className="text-xs">Capacidade</Label>
                  <Input id="sala-capacidade" type="number" min={1} value={form.capacidade}
                    onChange={e => setForm(p => ({ ...p, capacidade: parseInt(e.target.value) || 1 }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sala-status" className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v: StatusSala) => setForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger id="sala-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Leito-specific */}
            {isLeito(form.tipo) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Bed className="h-4 w-4" /> Dados do Leito
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sala-cama" className="text-xs">Número da Cama</Label>
                      <Input id="sala-cama" value={form.numero_cama} onChange={e => setForm(p => ({ ...p, numero_cama: e.target.value }))}
                        placeholder="A1, B2..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sala-genero" className="text-xs">Gênero</Label>
                      <Select value={form.genero || '__none__'} onValueChange={v => setForm(p => ({ ...p, genero: v === '__none__' ? '' : v }))}>
                        <SelectTrigger id="sala-genero"><SelectValue placeholder="Misto" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Misto</SelectItem>
                          <SelectItem value="Masculino">Masculino</SelectItem>
                          <SelectItem value="Feminino">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Horário + Responsável */}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Horário e Responsável
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sala-horario-inicio" className="text-xs">Horário Início</Label>
                  <Input id="sala-horario-inicio" type="time" value={form.horario_inicio}
                    onChange={e => setForm(p => ({ ...p, horario_inicio: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sala-horario-fim" className="text-xs">Horário Fim</Label>
                  <Input id="sala-horario-fim" type="time" value={form.horario_fim}
                    onChange={e => setForm(p => ({ ...p, horario_fim: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sala-medico" className="text-xs">Médico / Especialidade</Label>
                  <Select value={form.medico_responsavel || '__none__'}
                    onValueChange={v => setForm(p => ({ ...p, medico_responsavel: v === '__none__' ? '' : v }))}>
                    <SelectTrigger id="sala-medico"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (livre)</SelectItem>
                      {(medicos as any[]).map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome || `CRM ${m.crm}`} — {m.especialidade || 'Geral'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Equipamentos */}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Wrench className="h-4 w-4" /> Equipamentos e Recursos
              </h4>
              <div className="flex flex-wrap gap-3">
                {EQUIPAMENTOS_SUGERIDOS.map(eq => (
                  <div key={eq} className="flex items-center gap-1.5">
                    <Checkbox id={`eq-${eq}`} checked={form.equipamentos.includes(eq)}
                      onCheckedChange={() => toggleEquipamento(eq)} />
                    <Label htmlFor={`eq-${eq}`} className="text-xs cursor-pointer">{eq}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Cor + Observações */}
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label id="sala-cor-label" className="text-xs flex items-center gap-1"><Paintbrush className="h-3 w-3" />Cor de Identificação</Label>
                <div role="group" aria-labelledby="sala-cor-label" className="flex gap-2 flex-wrap">
                  {CORES.map(c => (
                    <button key={c} type="button" aria-label={`Selecionar cor ${NOMES_CORES[c] || c}`} aria-pressed={form.cor === c} onClick={() => setForm(p => ({ ...p, cor: c }))}
                      className={cn(
                        'h-7 w-7 rounded-lg border-2 transition-all',
                        form.cor === c ? 'border-foreground scale-110' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sala-observacoes" className="text-xs">Observações</Label>
                <Textarea id="sala-observacoes" value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Instruções de limpeza, restrições..." rows={3} />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
