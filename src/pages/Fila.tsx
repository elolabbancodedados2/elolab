import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Play, Check, Loader2, Clock, ArrowUp, ArrowDown,
  Users, CheckCircle2, Bell, XCircle, Stethoscope, AlertTriangle,
  RefreshCw, Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { createAutoBilling } from '@/lib/autoBilling';
import { autoIniciarAtendimento, autoFinalizarAtendimento } from '@/lib/workflowAutomation';
import { useFilaAtendimento, useAgendamentos, usePacientes, useMedicos, useSalas } from '@/hooks/useSupabaseData';
import { useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Helpers ───────────────────────────────────────────────
function calcularEspera(horarioChegada: string | null): string {
  if (!horarioChegada) return '—';
  const mins = Math.floor((Date.now() - new Date(horarioChegada).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

function corEspera(horarioChegada: string | null): string {
  if (!horarioChegada) return 'text-muted-foreground';
  const mins = Math.floor((Date.now() - new Date(horarioChegada).getTime()) / 60000);
  if (mins < 15) return 'text-success';
  if (mins < 30) return 'text-warning';
  return 'text-destructive font-semibold';
}

const STATUS_CONFIG = {
  aguardando: { label: 'Aguardando', color: 'bg-warning/10 text-warning border-warning/20' },
  em_atendimento: { label: 'Em Atendimento', color: 'bg-primary/10 text-primary border-primary/20' },
  finalizado: { label: 'Finalizado', color: 'bg-success/10 text-success border-success/20' },
  chamado: { label: 'Chamado', color: 'bg-info/10 text-info border-info/20' },
};

const PRIORIDADE_CONFIG = {
  normal: { label: 'Normal', dot: 'bg-muted-foreground' },
  preferencial: { label: 'Preferencial', dot: 'bg-warning' },
  urgente: { label: 'Urgente', dot: 'bg-destructive animate-pulse' },
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const cardAnim = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

// ─── Queue Card ────────────────────────────────────────────
function FilaCard({ item, pos, pacienteNome, medicoNome, salaNome, onIniciar, onFinalizar, onChamar, onRemover, now }: {
  item: any; pos: number; pacienteNome: string; medicoNome: string; salaNome: string;
  onIniciar: () => void; onFinalizar: () => void; onChamar: () => void; onRemover: () => void;
  now: number;
}) {
  const status = item.status as keyof typeof STATUS_CONFIG;
  const prioridade = (item.prioridade || 'normal') as keyof typeof PRIORIDADE_CONFIG;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.aguardando;
  const prioCfg = PRIORIDADE_CONFIG[prioridade] ?? PRIORIDADE_CONFIG.normal;

  return (
    <motion.div variants={cardAnim} layout>
      <div className={cn(
        'rounded-2xl border bg-card transition-all duration-200',
        status === 'em_atendimento' && 'border-primary/40 shadow-lg shadow-primary/10 ring-1 ring-primary/20',
        status === 'finalizado' && 'opacity-60',
      )}>
        <div className="flex items-center gap-4 p-4">
          {/* Position badge */}
          <div className={cn(
            'h-12 w-12 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold',
            status === 'em_atendimento' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}>
            {pos}
          </div>

          {/* Patient info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-base truncate">{pacienteNome}</p>
              {prioridade !== 'normal' && (
                <div className="flex items-center gap-1">
                  <span className={cn('h-2 w-2 rounded-full', prioCfg.dot)} />
                  <span className="text-[11px] text-muted-foreground">{prioCfg.label}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Stethoscope className="h-3.5 w-3.5" />
                {medicoNome}
              </span>
              {salaNome !== '-' && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{salaNome}</span>
              )}
            </div>
          </div>

          {/* Timer */}
          <div className="text-right shrink-0 mr-2">
            <p className={cn('text-sm font-medium tabular-nums', corEspera(item.horario_chegada))}>
              <Timer className="h-3.5 w-3.5 inline mr-1" />
              {calcularEspera(item.horario_chegada)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {item.horario_chegada ? format(new Date(item.horario_chegada), 'HH:mm', { locale: ptBR }) : '—'}
            </p>
          </div>

          {/* Status badge */}
          <Badge className={cn('text-xs shrink-0 border', cfg.color)}>{cfg.label}</Badge>
        </div>

        {/* Actions */}
        {status !== 'finalizado' && (
          <div className="flex items-center gap-2 px-4 pb-3 pt-1 border-t border-border/50">
            {status === 'aguardando' && (
              <>
                <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={onChamar}>
                  <Bell className="h-3.5 w-3.5" /> Chamar
                </Button>
                <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs bg-primary" onClick={onIniciar}>
                  <Play className="h-3.5 w-3.5" /> Iniciar
                </Button>
              </>
            )}
            {status === 'chamado' && (
              <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={onIniciar}>
                <Play className="h-3.5 w-3.5" /> Iniciar Atendimento
              </Button>
            )}
            {status === 'em_atendimento' && (
              <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs bg-success text-white hover:bg-success/90" onClick={onFinalizar}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
              </Button>
            )}
            <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs text-destructive ml-auto" onClick={onRemover}>
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function Fila() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState('');
  const [selectedPrioridade, setSelectedPrioridade] = useState('normal');
  const [isSaving, setIsSaving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: fila = [], isLoading: loadingFila } = useFilaAtendimento();
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = useAgendamentos(today);
  const { data: pacientes = [] } = usePacientes();
  const { data: medicos = [] } = useMedicos();
  const { data: salas = [] } = useSalas();

  const isLoading = loadingFila || loadingAgendamentos;

  // Realtime subscription for instant queue updates
  useEffect(() => {
    const channel = supabase
      .channel('fila-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_atendimento' }, () => {
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      })
      .subscribe();

    // Timer update every 30s for wait time display
    const interval = setInterval(() => setNow(Date.now()), 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const agendamentosDisponiveis = agendamentos.filter(ag =>
    ['confirmado', 'agendado', 'aguardando'].includes(ag.status || '') &&
    !fila.some(f => f.agendamento_id === ag.id)
  );

  const filaAtiva = fila
    .filter(f => f.status !== 'finalizado')
    .sort((a, b) => a.posicao - b.posicao);

  const filaFinalizada = fila
    .filter(f => f.status === 'finalizado')
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
    .slice(0, 5);

  const getPacienteNome = (agId: string) => {
    const ag = agendamentos.find(a => a.id === agId) as any;
    return ag?.pacientes?.nome ?? pacientes.find(p => p.id === ag?.paciente_id)?.nome ?? 'Desconhecido';
  };

  const getMedicoNome = (agId: string) => {
    const ag = agendamentos.find(a => a.id === agId) as any;
    const med = ag?.medicos ?? medicos.find(m => m.id === ag?.medico_id);
    return med ? `Dr(a). ${med.nome || med.crm}` : '—';
  };

  const getSalaNome = (salaId: string | null) =>
    salaId ? (salas.find(s => s.id === salaId)?.nome ?? '-') : '-';

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
  };

  const handleAddToFila = async () => {
    if (!selectedAgendamento) { toast.error('Selecione um agendamento.'); return; }

    // Check for duplicate entry in active queue
    const jaExiste = fila.find(
      (f: any) => f.agendamento_id === selectedAgendamento && f.status !== 'finalizado'
    );
    if (jaExiste) {
      toast.error('Este agendamento já está na fila de atendimento.');
      return;
    }

    setIsSaving(true);
    try {
      const maxPos = Math.max(0, ...fila.map(f => f.posicao));
      const { error } = await supabase.from('fila_atendimento').insert({
        agendamento_id: selectedAgendamento,
        posicao: maxPos + 1,
        status: 'aguardando',
        prioridade: selectedPrioridade,
        horario_chegada: new Date().toISOString(),
      });
      if (error) throw error;
      await supabase.from('agendamentos').update({ status: 'aguardando' }).eq('id', selectedAgendamento);
      refresh();
      setIsAddOpen(false);
      setSelectedAgendamento('');
      setSelectedPrioridade('normal');
      toast.success('Paciente adicionado à fila!');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // TTS voice call helper
  const chamarPacienteVoz = (pacienteNome: string, salaNome: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const texto = `Paciente ${pacienteNome}, por favor dirija-se ${salaNome === '-' ? 'à recepção' : `à ${salaNome}`}.`;
    for (let i = 0; i < 2; i++) {
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9;
      utterance.volume = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt-BR')) || voices.find(v => v.lang.startsWith('pt'));
      if (ptVoice) utterance.voice = ptVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  const updateStatus = async (id: string, status: string, agendamentoId?: string) => {
    // Voice call when chamado
    if (status === 'chamado' && agendamentoId) {
      await supabase.from('fila_atendimento').update({ status }).eq('id', id);
      // Also update agendamento status so PainelTV can pick it up
      await supabase.from('agendamentos').update({ status: 'em_atendimento' }).eq('id', agendamentoId);
      const item = fila.find(f => f.id === id);
      const nome = getPacienteNome(agendamentoId);
      const sala = getSalaNome(item?.sala_id ?? null);
      chamarPacienteVoz(nome, sala);
      refresh();
      toast.success('📢 Paciente chamado!');
      return;
    }

    // Use centralized workflow for iniciar/finalizar
    if (status === 'em_atendimento' && agendamentoId) {
      const ag = agendamentos.find(a => a.id === agendamentoId);
      const result = await autoIniciarAtendimento(
        agendamentoId, id, ag?.paciente_id || '', ag?.medico_id || ''
      );
      refresh();
      toast.success('▶ Atendimento iniciado', { description: result.actions.join(' • ') });
      // Navigate to prontuário for the consultation
      if (ag?.paciente_id) {
        navigate(`/prontuarios?paciente=${ag.paciente_id}&agendamento=${agendamentoId}`);
      }
      return;
    }

    if (status === 'finalizado' && agendamentoId) {
      const ag = agendamentos.find(a => a.id === agendamentoId);
      if (ag) {
        const pac = pacientes.find(p => p.id === ag.paciente_id);
        const result = await autoFinalizarAtendimento({
          agendamentoId,
          filaId: id,
          pacienteId: ag.paciente_id,
          pacienteNome: pac?.nome || 'Paciente',
          medicoId: ag.medico_id,
          convenioId: pac?.convenio_id,
          tipoConsulta: ag.tipo,
        });
        refresh();
        toast.success(`✅ Atendimento finalizado — ${pac?.nome || 'Paciente'}`, {
          description: result.actions.join(' • '),
          duration: 8000,
          action: {
            label: 'Abrir Caixa',
            onClick: () => navigate('/caixa'),
          },
        });
        return;
      }
    }

    // Fallback for other statuses
    await supabase.from('fila_atendimento').update({ status }).eq('id', id);
    if (agendamentoId) {
      const agStatus = status === 'em_atendimento' ? 'em_atendimento' : status === 'finalizado' ? 'finalizado' : 'aguardando';
      await supabase.from('agendamentos').update({ status: agStatus }).eq('id', agendamentoId);
    }
    refresh();
  };

  const handleRemover = async (id: string) => {
    const { data, error } = await supabase.from('fila_atendimento').delete().eq('id', id).select('id');
    setRemoveId(null);
    if (error || !data || data.length === 0) {
      toast.error('Não foi possível remover da fila (sem permissão).');
      return;
    }
    refresh();
    toast.info('Paciente removido da fila');
  };

  // Stats
  const stats = {
    aguardando: filaAtiva.filter(f => f.status === 'aguardando').length,
    emAtendimento: filaAtiva.filter(f => f.status === 'em_atendimento' || f.status === 'chamado').length,
    finalizadosHoje: filaFinalizada.length,
    urgentes: filaAtiva.filter(f => f.prioridade === 'urgente').length,
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Fila de Atendimento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })} • Atualiza automaticamente
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => setIsAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Adicionar à Fila
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Aguardando', value: stats.aguardando, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'Em Atendimento', value: stats.emAtendimento, icon: Play, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Finalizados Hoje', value: stats.finalizadosHoje, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Urgentes', value: stats.urgentes, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
        ].map(s => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
            <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon className={cn('h-5 w-5', s.color)} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Queue */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filaAtiva.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-14 w-14 text-muted-foreground/20 mb-4" />
              <p className="font-semibold text-lg">Fila vazia</p>
              <p className="text-sm text-muted-foreground mt-1 mb-6">Nenhum paciente aguardando atendimento</p>
              <Button onClick={() => setIsAddOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" /> Adicionar Paciente
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filaAtiva.map((item, idx) => (
              <FilaCard
                key={item.id}
                item={item}
                pos={idx + 1}
                pacienteNome={getPacienteNome(item.agendamento_id)}
                medicoNome={getMedicoNome(item.agendamento_id)}
                salaNome={getSalaNome(item.sala_id)}
                now={now}
                onChamar={() => updateStatus(item.id, 'chamado', item.agendamento_id)}
                onIniciar={() => updateStatus(item.id, 'em_atendimento', item.agendamento_id)}
                onFinalizar={() => updateStatus(item.id, 'finalizado', item.agendamento_id)}
                onRemover={() => setRemoveId(item.id)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Finalizados do dia */}
      {filaFinalizada.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Finalizados hoje
          </p>
          <div className="space-y-1.5">
            {filaFinalizada.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border px-4 py-2.5 opacity-60 bg-card">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <p className="text-sm font-medium flex-1">{getPacienteNome(item.agendamento_id)}</p>
                <p className="text-xs text-muted-foreground">{getMedicoNome(item.agendamento_id)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add to Queue Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Adicionar à Fila
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Agendamento</Label>
              <Select value={selectedAgendamento} onValueChange={setSelectedAgendamento}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar agendamento..." />
                </SelectTrigger>
                <SelectContent>
                  {agendamentosDisponiveis.length === 0 ? (
                    <SelectItem value="none" disabled>Nenhum agendamento disponível</SelectItem>
                  ) : agendamentosDisponiveis.map(ag => {
                    const pac = pacientes.find(p => p.id === (ag as any).paciente_id);
                    return (
                      <SelectItem key={ag.id} value={ag.id}>
                        {pac?.nome ?? 'Paciente'} — {ag.hora_inicio?.slice(0, 5)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={selectedPrioridade} onValueChange={setSelectedPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="preferencial">Preferencial (idoso/gestante)</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddToFila} disabled={isSaving || !selectedAgendamento} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm removal dialog */}
      <AlertDialog open={!!removeId} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
            <AlertDialogDescription>
              O paciente será removido da fila de atendimento. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeId && handleRemover(removeId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
