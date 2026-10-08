import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, DoorOpen, Settings, Bed, Loader2, Users, CheckCircle2, XCircle,
  Clock, MapPin, Paintbrush, Wrench, Search, Building2, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

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
  horario_inicio: '07:00', horario_fim: '19:00', cor: '#3b82f6',
  genero: '', numero_cama: '', observacoes: '',
};

export default function Salas() {
  const { profile } = useSupabaseAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState<SalaForm>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingSalaId, setUpdatingSalaId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');

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
        .select('id, sala_id, status, agendamento_id, agendamentos(id, paciente_id, medico_id, pacientes(id, nome, nome_social), medicos(id, nome, crm, especialidade))')
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
        cor: sala.cor || '#3b82f6', genero: sala.genero || '', numero_cama: sala.numero_cama || '',
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

  const salasPorTipo: Record<string, any[]> = {};
  for (const sala of filtered) {
    const tipo = (sala as any).tipo || 'consultorio';
    if (!salasPorTipo[tipo]) salasPorTipo[tipo] = [];
    salasPorTipo[tipo].push(sala);
  }

  const getOcupacao = (salaId: string) =>
    (ocupacoes as any[]).filter((item: any) => item.sala_id === salaId);

  const statusEfetivoSala = (sala: any): EstadoSala => {
    const atendimentos = getOcupacao(sala.id);
    if (atendimentos.some((item: any) => item.status === 'em_atendimento')) return 'ocupado';
    if (atendimentos.length > 0) return 'reservada';
    return sala.status;
  };

  const stats = {
    disponivel: (salas as any[]).filter(s => statusEfetivoSala(s) === 'disponivel').length,
    ocupado: (salas as any[]).filter(s => statusEfetivoSala(s) === 'ocupado').length,
    reservada: (salas as any[]).filter(s => statusEfetivoSala(s) === 'reservada').length,
    manutencao: (salas as any[]).filter(s => statusEfetivoSala(s) === 'manutencao').length,
    limpeza: (salas as any[]).filter(s => statusEfetivoSala(s) === 'limpeza').length,
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Salas e Leitos</h1>
          <p className="text-muted-foreground">Gerencie a disponibilidade de espaços físicos</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Sala / Leito
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {([
          { key: 'disponivel' as EstadoSala, icon: CheckCircle2, label: 'Disponíveis' },
          { key: 'reservada' as EstadoSala, icon: Clock, label: 'Reservadas' },
          { key: 'ocupado' as EstadoSala, icon: Users, label: 'Em atendimento' },
          { key: 'manutencao' as EstadoSala, icon: Wrench, label: 'Manutenção' },
          { key: 'limpeza' as EstadoSala, icon: Paintbrush, label: 'Limpeza' },
        ]).map(s => (
          <Card key={s.key} className="kpi-card">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', `${ESTADO_SALA_COLORS[s.key]}/20`)}>
                <div className={cn('h-3 w-3 rounded-full', ESTADO_SALA_COLORS[s.key])} />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats[s.key]}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-64" placeholder="Sala, cama, setor, equipamento..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid by type */}
      {Object.entries(salasPorTipo).map(([tipo, salasDoTipo]) => {
        const Icon = TIPO_ICONS[tipo] || DoorOpen;
        return (
          <Card key={tipo}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className="h-4 w-4" /> {TIPO_LABELS[tipo] || tipo} ({salasDoTipo.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {salasDoTipo.map((sala: any) => {
                  const medicoNome = getMedicoNome(sala.medico_responsavel);
                  const ocupacoesSala = getOcupacao(sala.id);
                  const statusExibido = statusEfetivoSala(sala);
                  return (
                    <Card key={sala.id} className="relative overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-1.5"
                        style={{ backgroundColor: sala.cor || '#3b82f6' }} />
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold flex items-center gap-1.5">
                              {sala.nome}
                              {sala.numero_cama && (
                                <Badge variant="outline" className="text-[10px]">Cama {sala.numero_cama}</Badge>
                              )}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {sala.setor && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                  <Building2 className="h-3 w-3" />{sala.setor}
                                </span>
                              )}
                              {sala.andar && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                  <Layers className="h-3 w-3" />{sala.andar}
                                </span>
                              )}
                              {sala.genero && (
                                <Badge variant="secondary" className="text-[10px]">{sala.genero}</Badge>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <div className={cn('h-2 w-2 rounded-full', ESTADO_SALA_COLORS[statusExibido])} />
                            {ESTADO_SALA_LABELS[statusExibido] || statusExibido}
                          </Badge>
                        </div>

                        {/* Occupation info */}
                        {ocupacoesSala.length > 0 && (
                          <div className={cn(
                            'rounded-lg border p-2.5 space-y-1.5',
                            statusExibido === 'ocupado'
                              ? 'bg-destructive/10 border-destructive/20'
                              : 'bg-info/10 border-info/20',
                          )}>
                            {ocupacoesSala.map((oc: any) => {
                              const ag = oc.agendamentos;
                              const pacNome = ag?.pacientes?.nome_social || ag?.pacientes?.nome;
                              const medNome = ag?.medicos?.nome;
                              const medEsp = ag?.medicos?.especialidade;
                              return (
                                <div key={oc.id} className="flex flex-col gap-0.5">
                                  {pacNome && (
                                    <span className="text-xs font-medium text-foreground flex items-center gap-1">
                                      <User className={cn('h-3 w-3', statusExibido === 'ocupado' ? 'text-destructive' : 'text-info')} />
                                      Paciente: {pacNome}
                                    </span>
                                  )}
                                  {medNome && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Users className="h-3 w-3 text-primary" />
                                      {nomeMedico(medNome)}{medEsp ? ` — ${medEsp}` : ''}
                                    </span>
                                  )}
                                  <Badge variant="secondary" className="text-[9px] w-fit">
                                    {oc.status === 'em_atendimento' ? 'Em atendimento' : oc.status === 'chamado' ? 'Paciente chamado' : 'Aguardando na fila'}
                                  </Badge>
                                </div>
                              );
                            })}
                            <p className="border-t border-border pt-1.5 text-[10px] text-muted-foreground">
                              {statusExibido === 'ocupado'
                                ? 'A sala permanece ocupada até o atendimento ser finalizado ou transferido na Fila.'
                                : 'Esta sala está reservada para o paciente chamado ou aguardando na Fila.'}
                            </p>
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Cap: {sala.capacidade} {medicoNome && `· ${nomeMedico(medicoNome)}`}</p>
                          {sala.horario_inicio && sala.horario_fim && (
                            <p className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />{sala.horario_inicio?.slice(0, 5)} — {sala.horario_fim?.slice(0, 5)}
                            </p>
                          )}
                          {sala.equipamentos && sala.equipamentos.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {sala.equipamentos.slice(0, 3).map((eq: string) => (
                                <Badge key={eq} variant="secondary" className="text-[9px]">{eq}</Badge>
                              ))}
                              {sala.equipamentos.length > 3 && (
                                <span className="text-[9px]">+{sala.equipamentos.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-1.5 pt-1">
                          {statusExibido === 'disponivel' && (
                            <Button size="sm" variant="outline" className="min-h-11 text-xs"
                              onClick={() => handleChangeStatus(sala, 'ocupado')} disabled={updatingSalaId !== null}>
                              {updatingSalaId === sala.id ? 'Salvando...' : 'Ocupar'}
                            </Button>
                          )}
                          {statusExibido === 'ocupado' && ocupacoesSala.length === 0 && (
                            <Button size="sm" variant="outline" className="min-h-11 text-xs"
                              onClick={() => handleChangeStatus(sala, 'limpeza')} disabled={updatingSalaId !== null}>
                              {updatingSalaId === sala.id ? 'Salvando...' : 'Liberar'}
                            </Button>
                          )}
                          {statusExibido === 'limpeza' && (
                            <Button size="sm" variant="outline" className="min-h-11 text-xs gap-1"
                              onClick={() => handleChangeStatus(sala, 'disponivel')} disabled={updatingSalaId !== null}>
                              {updatingSalaId === sala.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paintbrush className="h-3 w-3" />}
                              {updatingSalaId === sala.id ? 'Salvando...' : 'Pronta'}
                            </Button>
                          )}
                          {statusExibido === 'manutencao' && (
                            <Button size="sm" variant="outline" className="min-h-11 text-xs"
                              onClick={() => handleChangeStatus(sala, 'disponivel')} disabled={updatingSalaId !== null}>
                              {updatingSalaId === sala.id ? 'Salvando...' : 'Liberar'}
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-11 w-11 ml-auto" aria-label={`Editar sala ${sala.nome}`}
                            onClick={() => handleOpen(sala)} disabled={updatingSalaId !== null}>
                            <Settings className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <DoorOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">{salas.length === 0 ? 'Nenhuma sala cadastrada' : 'Nenhuma sala corresponde à busca e ao tipo selecionado'}</p>
            <p className="text-sm mt-1">{salas.length === 0 ? 'Cadastre uma sala ou leito para começar.' : 'Limpe a busca e o tipo para ver todas as salas.'}</p>
            {salas.length === 0 ? (
              <Button className="mt-3" size="sm" onClick={() => handleOpen()}>Nova Sala / Leito</Button>
            ) : (
              <Button className="mt-3" size="sm" variant="outline" onClick={() => { setSearch(''); setFilterTipo('todos'); }}>
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
                <Label className="text-xs">Nome *</Label>
                <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Consultório 1, Leito 201..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Label className="text-xs">Setor / Ala</Label>
                  <Input value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))}
                    placeholder="Ala Norte, Bloco B..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Andar</Label>
                  <Input value={form.andar} onChange={e => setForm(p => ({ ...p, andar: e.target.value }))}
                    placeholder="Térreo, 2º Andar..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Capacidade</Label>
                  <Input type="number" min={1} value={form.capacidade}
                    onChange={e => setForm(p => ({ ...p, capacidade: parseInt(e.target.value) || 1 }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v: StatusSala) => setForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <Label className="text-xs">Número da Cama</Label>
                      <Input value={form.numero_cama} onChange={e => setForm(p => ({ ...p, numero_cama: e.target.value }))}
                        placeholder="A1, B2..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Gênero</Label>
                      <Select value={form.genero || '__none__'} onValueChange={v => setForm(p => ({ ...p, genero: v === '__none__' ? '' : v }))}>
                        <SelectTrigger><SelectValue placeholder="Misto" /></SelectTrigger>
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
                  <Label className="text-xs">Horário Início</Label>
                  <Input type="time" value={form.horario_inicio}
                    onChange={e => setForm(p => ({ ...p, horario_inicio: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horário Fim</Label>
                  <Input type="time" value={form.horario_fim}
                    onChange={e => setForm(p => ({ ...p, horario_fim: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Médico / Especialidade</Label>
                  <Select value={form.medico_responsavel || '__none__'}
                    onValueChange={v => setForm(p => ({ ...p, medico_responsavel: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
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
                <Label className="text-xs flex items-center gap-1"><Paintbrush className="h-3 w-3" />Cor de Identificação</Label>
                <div className="flex gap-2 flex-wrap">
                  {CORES.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, cor: c }))}
                      className={cn(
                        'h-7 w-7 rounded-lg border-2 transition-all',
                        form.cor === c ? 'border-foreground scale-110' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
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
