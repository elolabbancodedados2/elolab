import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, startOfWeek, addDays, isSameDay, parseISO, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, Repeat, Loader2, LayoutList, LayoutGrid, Users, CalendarCheck, AlertTriangle, CalendarDays, LogIn, CheckCircle2, ArrowRightLeft, Bell, Plus, MessageCircle, Search, Filter, Wand2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { createAutoBilling } from '@/lib/autoBilling';
import { autoConfirmarAgendamento, autoCancelarAgendamento, autoMarcarFaltasHoje, autoCheckin } from '@/lib/workflowAutomation';
import { useAgendamentos, usePacientes, useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { AgendaSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyAgendamentos } from '@/components/EmptyState';
import { Database } from '@/integrations/supabase/types';
import { BloqueioAgenda } from '@/components/agenda/BloqueioAgenda';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

type StatusAgendamento = Database['public']['Enums']['status_agendamento'];

// Grade base de horários da agenda (00:00 → 23:30, intervalos de 30min).
// Horários customizados de agendamentos existentes são adicionados dinamicamente
// via useMemo dentro do componente, permitindo qualquer horário livre.
const HORARIOS_BASE: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const STATUS_COLORS: Record<StatusAgendamento, string> = {
  agendado: 'bg-info/10 text-info border-info/20',
  confirmado: 'bg-success/10 text-success border-success/20',
  aguardando: 'bg-warning/10 text-warning border-warning/20',
  em_atendimento: 'bg-primary/10 text-primary border-primary/20',
  finalizado: 'bg-muted text-muted-foreground border-border',
  cancelado: 'bg-destructive/10 text-destructive border-destructive/20',
  faltou: 'bg-warning/15 text-warning border-warning/30',
};

// Color palette for doctors
const MEDICO_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-teal-500',
  'bg-indigo-500', 'bg-orange-500',
];

const MEDICO_BG_COLORS = [
  'bg-blue-50 border-blue-200',
  'bg-emerald-50 border-emerald-200',
  'bg-violet-50 border-violet-200',
  'bg-amber-50 border-amber-200',
  'bg-rose-50 border-rose-200',
  'bg-cyan-50 border-cyan-200',
  'bg-pink-50 border-pink-200',
  'bg-teal-50 border-teal-200',
  'bg-indigo-50 border-indigo-200',
  'bg-orange-50 border-orange-200',
];

const STATUS_LABELS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  em_atendimento: 'Em Atendimento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
};

const RECURRENCE_OPTIONS = {
  none: 'Não repetir',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

interface RecurrenceConfig {
  type: 'none' | 'weekly' | 'biweekly' | 'monthly';
  occurrences: number;
}

interface FormData {
  id?: string;
  data?: string;
  hora_inicio?: string;
  hora_fim?: string;
  paciente_id?: string;
  medico_id?: string;
  tipo?: string;
  status?: StatusAgendamento;
  observacoes?: string;
}

export default function Agenda() {
  const { clinicaId } = useSupabaseAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedMedico, setSelectedMedico] = useState<string>('todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>({});
  const [recurrence, setRecurrence] = useState<RecurrenceConfig>({ type: 'none', occurrences: 4 });
  const [isSaving, setIsSaving] = useState(false);
  const [isRemarkMode, setIsRemarkMode] = useState(false);
  const [draggedAg, setDraggedAg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'day' | 'month'>('grid');
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmFaltaOpen, setConfirmFaltaOpen] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientData, setNewPatientData] = useState({ nome: '', telefone: '', cpf: '' });
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [espFilter, setEspFilter] = useState<string>('');
  // New: advanced filters
  const [searchPaciente, setSearchPaciente] = useState('');
  const [statusFilters, setStatusFilters] = useState<StatusAgendamento[]>([]);
  const [tipoFilters, setTipoFilters] = useState<string[]>([]);
  const [convenioFilters, setConvenioFilters] = useState<string[]>([]);
  // Waitlist offer after cancellation
  const [waitlistDialogOpen, setWaitlistDialogOpen] = useState(false);
  const [freedSlot, setFreedSlot] = useState<{ data: string; hora: string; medico_id: string | null; tipo: string | null } | null>(null);
  const [waitlistCandidates, setWaitlistCandidates] = useState<any[]>([]);
  const [isPromoting, setIsPromoting] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = useAgendamentos();
  const { data: pacientes = [], isLoading: loadingPacientes } = usePacientes();
  const { data: medicos = [], isLoading: loadingMedicos } = useMedicos();
  const { data: bloqueios = [] } = useSupabaseQuery<{
    id: string; medico_id: string; data_inicio: string; data_fim: string;
    hora_inicio: string | null; hora_fim: string | null; dia_inteiro: boolean; motivo: string | null; tipo: string;
  }>('bloqueios_agenda');
  const { data: convenios = [] } = useSupabaseQuery<{ id: string; nome: string }>('convenios');
  const { medicoId, isMedicoOnly } = useCurrentMedico();

  const isLoading = loadingAgendamentos || loadingPacientes || loadingMedicos;

  const handleQuickCreatePatient = async () => {
    if (!newPatientData.nome.trim()) return;
    setIsSavingPatient(true);
    try {
      const insertData = {
        nome: newPatientData.nome.trim(),
        ...(newPatientData.telefone.trim() && { telefone: newPatientData.telefone.trim() }),
        ...(newPatientData.cpf.trim() && { cpf: newPatientData.cpf.trim() }),
        ...(clinicaId && { clinica_id: clinicaId }),
      };

      const { data, error } = await supabase
        .from('pacientes')
        .insert(insertData)
        .select('id')
        .single();

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      setFormData(prev => ({ ...prev, paciente_id: data.id }));
      setShowNewPatientForm(false);
      setNewPatientData({ nome: '', telefone: '', cpf: '' });
      toast.success(`Paciente "${newPatientData.nome}" cadastrado!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar';
      toast.error(msg);
    } finally {
      setIsSavingPatient(false);
    }
  };

  // Send WhatsApp notification (best-effort, non-blocking)
  const sendWhatsAppNotification = async (agendamentoId: string, action: string) => {
    try {
      await supabase.functions.invoke('whatsapp-notifications', {
        body: { action, agendamento_id: agendamentoId },
      });
    } catch (err) {
      // WhatsApp is optional - don't block the flow
      if (import.meta.env.DEV) console.log('WhatsApp notification skipped:', err);
    }
  };

  // Auto-set filter to own doctor when logged in as medico-only
  useEffect(() => {
    if (isMedicoOnly && medicoId) {
      setSelectedMedico(medicoId);
    }
  }, [isMedicoOnly, medicoId]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentWeek, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentWeek]);

  const filteredAgendamentos = useMemo(() => {
    return agendamentos.filter((ag) => {
      // If medico-only user, always filter by own medico_id
      if (isMedicoOnly && medicoId && ag.medico_id !== medicoId) return false;
      if (!isMedicoOnly && selectedMedico !== 'todos' && ag.medico_id !== selectedMedico) return false;
      if (statusFilters.length > 0 && !statusFilters.includes(ag.status as StatusAgendamento)) return false;
      if (tipoFilters.length > 0 && !tipoFilters.includes(ag.tipo || '')) return false;
      if (convenioFilters.length > 0) {
        const p = pacientes.find(pp => pp.id === ag.paciente_id);
        if (!p?.convenio_id || !convenioFilters.includes(p.convenio_id)) return false;
      }
      if (searchPaciente.trim()) {
        const p = pacientes.find(pp => pp.id === ag.paciente_id);
        const q = searchPaciente.trim().toLowerCase();
        const hit = (p?.nome || '').toLowerCase().includes(q) || (p?.cpf || '').includes(q) || (p?.telefone || '').includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [agendamentos, selectedMedico, isMedicoOnly, medicoId, statusFilters, tipoFilters, convenioFilters, searchPaciente, pacientes]);

  const activeFiltersCount = statusFilters.length + tipoFilters.length + convenioFilters.length + (searchPaciente.trim() ? 1 : 0);

  // Horários exibidos na grade: base 00:00→23:30 (30min) + qualquer horário
  // customizado presente em agendamentos, permitindo agendar livremente.
  const HORARIOS = useMemo(() => {
    const set = new Set<string>(HORARIOS_BASE);
    for (const ag of filteredAgendamentos) {
      const h = ag.hora_inicio?.slice(0, 5);
      if (h) set.add(h);
    }
    return Array.from(set).sort();
  }, [filteredAgendamentos]);

  // Stats do dia atual
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const agendamentosHoje = filteredAgendamentos.filter(a => a.data === hoje);
  const statsHoje = {
    total: agendamentosHoje.length,
    confirmados: agendamentosHoje.filter(a => a.status === 'confirmado').length,
    finalizados: agendamentosHoje.filter(a => a.status === 'finalizado').length,
    cancelados: agendamentosHoje.filter(a => a.status === 'cancelado').length,
    aguardando: agendamentosHoje.filter(a => a.status === 'aguardando' || a.status === 'agendado').length,
  };

  const isSlotBlocked = (data: Date, hora: string) => {
    const dataStr = format(data, 'yyyy-MM-dd');
    return bloqueios.some(b => {
      if (selectedMedico !== 'todos' && b.medico_id !== selectedMedico) return false;
      if (dataStr < b.data_inicio || dataStr > b.data_fim) return false;
      if (b.dia_inteiro) return true;
      if (b.hora_inicio && b.hora_fim) return hora >= b.hora_inicio && hora < b.hora_fim;
      return false;
    });
  };

  const getAgendamentoForSlot = (data: Date, hora: string) => {
    const dataStr = format(data, 'yyyy-MM-dd');
    return filteredAgendamentos.find(
      (ag) => ag.data === dataStr && (ag.hora_inicio === hora || ag.hora_inicio?.slice(0, 5) === hora)
    );
  };

  // ─── Drag & Drop to reschedule ─────────────────────────
  const handleDragStart = (e: React.DragEvent, agId: string) => {
    e.dataTransfer.setData('text/plain', agId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedAg(agId);
  };

  const handleDrop = async (e: React.DragEvent, data: Date, hora: string) => {
    e.preventDefault();
    setDraggedAg(null);
    const agId = e.dataTransfer.getData('text/plain');
    if (!agId) return;
    if (isSlotBlocked(data, hora)) { toast.error('Horário bloqueado'); return; }
    const existing = getAgendamentoForSlot(data, hora);
    if (existing && existing.id !== agId) { toast.error('Horário já ocupado'); return; }
    const ag = filteredAgendamentos.find(a => a.id === agId);
    if (!ag) return;
    if (ag.status === 'finalizado' || ag.status === 'cancelado') {
      toast.error('Não é possível mover agendamentos finalizados/cancelados');
      return;
    }
    const newDate = format(data, 'yyyy-MM-dd');
    if (ag.data === newDate && ag.hora_inicio?.slice(0, 5) === hora) return; // same slot
    const { error } = await supabase.from('agendamentos')
      .update({ data: newDate, hora_inicio: hora } as any)
      .eq('id', agId);
    if (error) { toast.error('Erro ao reagendar: ' + error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    toast.success(`Reagendado para ${format(data, 'dd/MM', { locale: ptBR })} às ${hora}`);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleSlotClick = (data: Date, hora: string) => {
    if (isSlotBlocked(data, hora)) {
      toast.error('Este horário está bloqueado');
      return;
    }
    const existing = getAgendamentoForSlot(data, hora);
    if (existing) {
      setFormData({
        id: existing.id,
        data: existing.data,
        hora_inicio: existing.hora_inicio,
        hora_fim: existing.hora_fim || undefined,
        paciente_id: existing.paciente_id,
        medico_id: existing.medico_id,
        tipo: existing.tipo || 'consulta',
        status: (existing.status || 'agendado') as StatusAgendamento,
        observacoes: existing.observacoes || '',
      });
      setRecurrence({ type: 'none', occurrences: 4 });
      setIsRemarkMode(false);
    } else {
      setFormData({
        data: format(data, 'yyyy-MM-dd'),
        hora_inicio: hora,
        hora_fim: HORARIOS[HORARIOS.indexOf(hora) + 1] || '18:30',
        tipo: 'consulta',
        status: 'agendado' as StatusAgendamento,
        medico_id: isMedicoOnly && medicoId ? medicoId : (selectedMedico !== 'todos' ? selectedMedico : undefined),
      });
      setRecurrence({ type: 'none', occurrences: 4 });
      setIsRemarkMode(false);
    }
    setIsFormOpen(true);
  };

  const generateRecurringDates = (startDate: string, config: RecurrenceConfig): string[] => {
    if (config.type === 'none') return [startDate];

    const dates: string[] = [];
    let currentDate = parseISO(startDate);

    for (let i = 0; i < config.occurrences; i++) {
      dates.push(format(currentDate, 'yyyy-MM-dd'));
      
      switch (config.type) {
        case 'weekly':
          currentDate = addWeeks(currentDate, 1);
          break;
        case 'biweekly':
          currentDate = addWeeks(currentDate, 2);
          break;
        case 'monthly':
          currentDate = addMonths(currentDate, 1);
          break;
      }
    }

    return dates;
  };

  const handleSave = async () => {
    const tipo = formData.tipo || 'consulta';
    const requiresMedico = ['consulta', 'retorno', 'checkup', 'avaliacao', 'procedimento', 'cirurgia', 'triagem'].includes(tipo);

    if (!formData.paciente_id) {
      toast.error('Selecione o paciente.');
      return;
    }
    if (requiresMedico && !formData.medico_id) {
      toast.error('Selecione o médico para este tipo de agendamento.');
      return;
    }
    if (!formData.data || !formData.hora_inicio) {
      toast.error('Data e horário de início são obrigatórios.');
      return;
    }
    // Validate time order
    if (formData.hora_fim && formData.hora_inicio >= formData.hora_fim) {
      toast.error('O horário de fim deve ser após o horário de início.');
      return;
    }

    // Validate duration (máximo 2 horas)
    if (formData.hora_fim) {
      const [horaI, minI] = formData.hora_inicio.split(':').map(Number);
      const [horaF, minF] = formData.hora_fim.split(':').map(Number);
      const duracao = (horaF * 60 + minF) - (horaI * 60 + minI);
      if (duracao > 120) {
        toast.error('Duração máxima é 2 horas por consulta.');
        return;
      }
    }

    // Validate not scheduling in the past (only for new appointments)
    if (!formData.id) {
      const hoje = format(new Date(), 'yyyy-MM-dd');
      const agora = format(new Date(), 'HH:mm');
      if (formData.data < hoje || (formData.data === hoje && formData.hora_inicio < agora)) {
        toast.error('Não é possível agendar no passado.');
        return;
      }
    }

    // Check for scheduling conflicts (only when medico is set)
    if (formData.medico_id) {
      const conflito = agendamentos.find(ag =>
        ag.medico_id === formData.medico_id &&
        ag.data === formData.data &&
        ag.status !== 'cancelado' &&
        ag.id !== formData.id &&
        ag.hora_inicio < (formData.hora_fim || formData.hora_inicio) &&
        ag.hora_fim > formData.hora_inicio
      );
      if (conflito) {
        toast.error('Já existe um agendamento conflitante neste horário para este médico.');
        return;
      }
    }

    setIsSaving(true);

    try {
      // Normalize hora to HH:mm:ss for consistent DB storage
      const normalizeTime = (t: string | undefined) => {
        if (!t) return t;
        return t.length === 5 ? `${t}:00` : t;
      };

      if (formData.id) {
        // Update existing
        const { error } = await supabase
          .from('agendamentos')
          .update({
            paciente_id: formData.paciente_id,
            medico_id: formData.medico_id || null,
            data: formData.data!,
            hora_inicio: normalizeTime(formData.hora_inicio)!,
            hora_fim: normalizeTime(formData.hora_fim),
            tipo: formData.tipo,
            status: formData.status,
            observacoes: formData.observacoes,
            clinica_id: clinicaId,
          } as any)
          .eq('id', formData.id);

        if (error) throw error;

        // Send email + WhatsApp confirmation if status changed to confirmado
        if (formData.status === 'confirmado') {
          try {
            await supabase.functions.invoke('appointment-confirmation', {
              body: { agendamento_id: formData.id }
            });
          } catch (e) {
            if (import.meta.env.DEV) console.log('Confirmation notification skipped:', e);
          }
        }

        // When finalized, auto-generate billing and notify
        if (formData.status === 'finalizado') {
          const paciente = pacientes.find(p => p.id === formData.paciente_id);
          const nomePaciente = paciente?.nome || 'Paciente';

          await createAutoBilling({
            agendamentoId: formData.id!,
            pacienteId: formData.paciente_id!,
            pacienteNome: nomePaciente,
            convenioId: paciente?.convenio_id,
            tipoConsulta: formData.tipo,
          });

          toast.success(`Consulta finalizada — ${nomePaciente}`, {
            description: 'Cobrança gerada! Clique para abrir o Caixa.',
            duration: 8000,
            action: {
              label: 'Abrir Caixa',
              onClick: () => navigate('/caixa'),
            },
          });
        } else {
          toast.success('Agendamento atualizado com sucesso!');
        }
      } else {
        // Create new (possibly recurring)
        const dates = generateRecurringDates(formData.data!, recurrence);

        // Validate recurring appointments
        if (dates.length > 12) {
          toast.error('Máximo 12 agendamentos recorrentes permitido');
          setIsSaving(false);
          return;
        }

        // Validate each date for conflicts and valid dates
        const validationErrors: string[] = [];
        for (let i = 0; i < dates.length; i++) {
          const date = dates[i];

          // Check if date is in the past
          const hoje = format(new Date(), 'yyyy-MM-dd');
          const agora = format(new Date(), 'HH:mm');
          if (date < hoje || (date === hoje && formData.hora_inicio < agora)) {
            validationErrors.push(`Data ${format(parseISO(date), 'dd/MM')} já passou`);
            continue;
          }

          // Check for conflicts (only if medico is set)
          if (formData.medico_id) {
            const conflito = agendamentos.find(ag =>
              ag.medico_id === formData.medico_id &&
              ag.data === date &&
              ag.status !== 'cancelado' &&
              ag.hora_inicio < (formData.hora_fim || formData.hora_inicio) &&
              ag.hora_fim > formData.hora_inicio
            );
            if (conflito) {
              validationErrors.push(`${format(parseISO(date), 'dd/MM')} - Conflito de horário`);
            }
          }
        }

        if (validationErrors.length > 0) {
          toast.error(`${validationErrors.length} problema(s) encontrado(s)`, {
            description: validationErrors.slice(0, 3).join('; ') + (validationErrors.length > 3 ? '...' : '')
          });
          setIsSaving(false);
          return;
        }

        const newAgendamentos = dates.map(date => ({
          paciente_id: formData.paciente_id!,
          medico_id: formData.medico_id || null,
          data: date,
          hora_inicio: normalizeTime(formData.hora_inicio)!,
          hora_fim: normalizeTime(formData.hora_fim),
          tipo: formData.tipo,
          status: formData.status as StatusAgendamento,
          observacoes: formData.observacoes,
          clinica_id: clinicaId,
        } as any));

        const { data: inserted, error } = await supabase
          .from('agendamentos')
          .insert(newAgendamentos)
          .select('id');

        if (error) throw error;
        
        // Send email + WhatsApp confirmation + schedule reminder for each new appointment
        if (inserted) {
          for (const ag of inserted) {
            // Send confirmation if status is confirmado
            if (formData.status === 'confirmado') {
              try {
                await supabase.functions.invoke('appointment-confirmation', {
                  body: { agendamento_id: ag.id }
                });
              } catch (e) {
                if (import.meta.env.DEV) console.log('Confirmation notification skipped:', e);
              }
            }
          }
          // Schedule reminder notification (24h before) — best effort
          try {
            const paciente = pacientes.find(p => p.id === formData.paciente_id);
            for (let i = 0; i < inserted.length; i++) {
              const agDate = newAgendamentos[i];
              const reminderDate = new Date(`${agDate.data}T${agDate.hora_inicio}`);
              reminderDate.setHours(reminderDate.getHours() - 24);
              
              await supabase.from('notification_queue').insert({
                tipo: 'whatsapp',
                conteudo: `Lembrete: você tem consulta amanhã às ${agDate.hora_inicio?.slice(0, 5)} na clínica. Paciente: ${paciente?.nome || 'Paciente'}`,
                destinatario_nome: paciente?.nome || '',
                destinatario_telefone: paciente?.telefone || '',
                destinatario_id: formData.paciente_id,
                agendado_para: reminderDate.toISOString(),
                status: 'pendente',
                dados_extras: { agendamento_id: inserted[i].id, tipo: 'lembrete_consulta' },
              });
            }
          } catch (e) {
            // Reminder is non-blocking
            if (import.meta.env.DEV) console.log('Reminder scheduling skipped:', e);
          }
        }

        const count = dates.length;
        toast.success(
          count > 1 
            ? `${count} agendamentos criados com sucesso!` 
            : 'Agendamento criado com sucesso!'
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setIsFormOpen(false);
      setRecurrence({ type: 'none', occurrences: 4 });
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error saving agendamento:', error);
      const msg = error?.message || error?.details || 'Erro ao salvar agendamento.';
      toast.error(msg.includes('row-level security') ? 'Sem permissão para esta ação. Verifique seu perfil de acesso.' : msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;

    setIsSaving(true);
    try {
      // Capture slot info BEFORE deletion for waitlist offer
      const slot = {
        data: formData.data || '',
        hora: formData.hora_inicio || '',
        medico_id: formData.medico_id || null,
        tipo: formData.tipo || null,
      };
      const result = await autoCancelarAgendamento({
        agendamentoId: formData.id,
        motivo: 'cancelado',
      });

      if (!result.success) throw new Error(result.message);
      
      toast.success('Agendamento cancelado!', { description: result.actions.join(' • ') });
      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setIsFormOpen(false);

      // Try to fill freed slot from waitlist
      try {
        const medicoInfo = slot.medico_id ? medicos.find(m => m.id === slot.medico_id) : null;
        const especialidade = medicoInfo?.especialidade || null;
        let q = supabase
          .from('lista_espera')
          .select('*, pacientes(nome, telefone)')
          .eq('status', 'aguardando')
          .order('prioridade', { ascending: false })
          .order('data_cadastro', { ascending: true })
          .limit(10);
        if (especialidade) q = q.eq('especialidade', especialidade);
        const { data: candidates } = await q;
        if (candidates && candidates.length > 0) {
          setFreedSlot(slot);
          setWaitlistCandidates(candidates);
          setWaitlistDialogOpen(true);
        }
      } catch (e) {
        if (import.meta.env.DEV) console.log('Waitlist lookup skipped:', e);
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error cancelling agendamento:', error);
      toast.error('Erro ao cancelar agendamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const promoteFromWaitlist = async (candidate: any) => {
    if (!freedSlot) return;
    setIsPromoting(candidate.id);
    try {
      const { error: insErr } = await supabase.from('agendamentos').insert({
        paciente_id: candidate.paciente_id,
        medico_id: freedSlot.medico_id || candidate.medico_id || null,
        data: freedSlot.data,
        hora_inicio: freedSlot.hora,
        tipo: freedSlot.tipo || 'consulta',
        status: 'agendado',
        observacoes: `Promovido da lista de espera. Motivo original: ${candidate.motivo || '-'}`,
        clinica_id: clinicaId || null,
      });
      if (insErr) throw insErr;
      await supabase.from('lista_espera').update({ status: 'agendado' }).eq('id', candidate.id);
      toast.success(`${candidate.pacientes?.nome || 'Paciente'} agendado no horário liberado!`);
      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      await queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
      setWaitlistDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao promover paciente da lista de espera.');
    } finally {
      setIsPromoting(null);
    }
  };

  // Suggest next free slot for the selected doctor on formData.data
  const suggestNextSlot = () => {
    if (!formData.data || !formData.medico_id) {
      toast.info('Selecione data e médico primeiro.');
      return;
    }
    const busy = new Set(
      agendamentos
        .filter(a => a.data === formData.data && a.medico_id === formData.medico_id && a.status !== 'cancelado' && a.id !== formData.id)
        .map(a => (a.hora_inicio || '').slice(0, 5))
    );
    // Try 30-min slots from 07:00 to 20:00
    for (let h = 7; h < 20; h++) {
      for (const m of [0, 30]) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const slot = `${hh}:${mm}`;
        if (!busy.has(slot)) {
          setFormData({ ...formData, hora_inicio: slot });
          toast.success(`Próximo horário livre: ${slot}`);
          return;
        }
      }
    }
    toast.warning('Nenhum horário livre encontrado neste dia.');
  };

  const sendWhatsAppConfirmation = async (agendamentoId?: string) => {
    const id = agendamentoId || formData.id;
    if (!id) return;
    try {
      await sendWhatsAppNotification(id, 'send_appointment_confirmation');
      toast.success('Confirmação enviada por WhatsApp!');
    } catch (e: any) {
      toast.error('Não foi possível enviar a confirmação.');
    }
  };

  const getPacienteNome = (id: string) => pacientes.find((p) => p.id === id)?.nome || 'Desconhecido';
  const getMedicoNome = (id: string | null) => {
    if (!id) return '';
    const medico = medicos.find((m) => m.id === id);
    return medico ? `Dr(a). ${medico.nome || medico.crm}` : 'Desconhecido';
  };

  // Doctor color mapping
  const medicoColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    medicos.forEach((m, i) => { map[m.id] = i % MEDICO_COLORS.length; });
    return map;
  }, [medicos]);

  const getMedicoColor = (medicoId: string) => MEDICO_COLORS[medicoColorMap[medicoId] ?? 0];
  const getMedicoBgColor = (medicoId: string) => MEDICO_BG_COLORS[medicoColorMap[medicoId] ?? 0];

  // Monthly calendar data
  const monthDays = useMemo(() => {
    const ms = startOfMonth(currentWeek);
    const me = endOfMonth(currentWeek);
    const ds = eachDayOfInterval({ start: ms, end: me });
    const sd = getDay(ms);
    const pb = (sd === 0 ? 6 : sd - 1);
    const paddedStart = Array.from({ length: pb }, (_, i) => addDays(ms, -(pb - i)));
    const tc = Math.ceil((paddedStart.length + ds.length) / 7) * 7;
    const pa = tc - paddedStart.length - ds.length;
    const paddedEnd = Array.from({ length: pa }, (_, i) => addDays(me, i + 1));
    return [...paddedStart, ...ds, ...paddedEnd];
  }, [currentWeek]);

  if (isLoading) {
    return <AgendaSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Agenda</h1>
          <p className="text-muted-foreground">Gerencie os agendamentos da clínica</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMedico} onValueChange={setSelectedMedico}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por médico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os médicos</SelectItem>
              {medicos.map((medico) => (
                <SelectItem key={medico.id} value={medico.id}>
                  {medico.nome || medico.crm} - {medico.especialidade || 'Geral'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => {
            setFormData({
              data: format(new Date(), 'yyyy-MM-dd'),
              hora_inicio: '08:00',
              hora_fim: '08:30',
              tipo: 'consulta',
              status: 'agendado' as StatusAgendamento,
              medico_id: isMedicoOnly && medicoId ? medicoId : (selectedMedico !== 'todos' ? selectedMedico : undefined),
            });
            setRecurrence({ type: 'none', occurrences: 4 });
            setIsRemarkMode(false);
            setIsFormOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

      {agendamentos.length === 0 && pacientes.length === 0 ? (
        <EmptyAgendamentos onAdd={() => {
          if (pacientes.length === 0 || medicos.length === 0) {
            toast.info('Primeiro cadastre pacientes e médicos para criar agendamentos.');
            return;
          }
          setFormData({
            data: format(new Date(), 'yyyy-MM-dd'),
            hora_inicio: '08:00',
            hora_fim: '08:30',
            tipo: 'consulta',
            status: 'agendado' as StatusAgendamento,
            medico_id: isMedicoOnly && medicoId ? medicoId : undefined,
          });
          setRecurrence({ type: 'none', occurrences: 4 });
          setIsRemarkMode(false);
          setIsFormOpen(true);
        }} />
      ) : (
        <>
          {/* Stats do dia */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Consultas hoje', value: statsHoje.total, color: 'text-primary', bg: 'bg-primary/10', icon: CalendarCheck },
              { label: 'Confirmados', value: statsHoje.confirmados, color: 'text-green-600', bg: 'bg-green-500/10', icon: Users },
              { label: 'Aguardando', value: statsHoje.aguardando, color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock },
              { label: 'Finalizados', value: statsHoje.finalizados, color: 'text-muted-foreground', bg: 'bg-muted', icon: CalendarCheck },
              { label: 'Cancelados/Faltas', value: statsHoje.cancelados + agendamentosHoje.filter(a => a.status === 'faltou').length, color: 'text-destructive', bg: 'bg-destructive/10', icon: AlertTriangle },
            ].map(s => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
                  <p className="text-[10px] text-muted-foreground font-medium leading-tight">{s.label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Quick status actions for today's appointments */}
          {agendamentosHoje.filter(a => a.status === 'agendado').length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-700 font-medium">
                {agendamentosHoje.filter(a => a.status === 'agendado').length} agendamento(s) ainda não confirmado(s) hoje
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-500/10"
                onClick={async () => {
                  const ids = agendamentosHoje.filter(a => a.status === 'agendado').map(a => a.id);
                  let count = 0;
                  for (const id of ids) {
                    const r = await autoConfirmarAgendamento(id);
                    if (r.success) count++;
                  }
                  toast.success(`${count} agendamento(s) confirmado(s) com notificações!`);
                  queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
                }}
              >
                Confirmar todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-500/10"
                onClick={async () => {
                  const result = await autoMarcarFaltasHoje();
                  if (result.success) {
                    toast.success(result.message, { description: result.actions.join(' • ') });
                    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
                  }
                }}
              >
                Marcar faltas
              </Button>
            </motion.div>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <Button variant="outline" size="icon" onClick={() => {
                    if (viewMode === 'month') setCurrentWeek(subMonths(currentWeek, 1));
                    else if (viewMode === 'day') setCurrentWeek(addDays(currentWeek, -1));
                    else setCurrentWeek(subWeeks(currentWeek, 1));
                  }}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="text-lg">
                    {viewMode === 'month'
                      ? format(currentWeek, "MMMM 'de' yyyy", { locale: ptBR })
                      : viewMode === 'day'
                      ? format(currentWeek, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                      : `${format(weekDays[0], "dd 'de' MMMM", { locale: ptBR })} — ${format(weekDays[6], "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
                  </CardTitle>
                  <Button variant="outline" size="icon" onClick={() => {
                    if (viewMode === 'month') setCurrentWeek(addMonths(currentWeek, 1));
                    else if (viewMode === 'day') setCurrentWeek(addDays(currentWeek, 1));
                    else setCurrentWeek(addWeeks(currentWeek, 1));
                  }}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-9 w-40 text-sm"
                    value={format(currentWeek, 'yyyy-MM-dd')}
                    onChange={e => e.target.value && setCurrentWeek(parseISO(e.target.value))}
                  />
                  <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())}>
                    Hoje
                  </Button>
                  <div className="flex rounded-lg border overflow-hidden">
                    <Button
                      variant={viewMode === 'day' ? 'default' : 'ghost'}
                      size="icon"
                      className="h-9 w-9 rounded-none border-0"
                      onClick={() => setViewMode('day')}
                      title="Visão do dia"
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="icon"
                      className="h-9 w-9 rounded-none border-0 border-l"
                      onClick={() => setViewMode('grid')}
                      title="Visão semanal"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="icon"
                      className="h-9 w-9 rounded-none border-0 border-l"
                      onClick={() => setViewMode('list')}
                      title="Lista"
                    >
                      <LayoutList className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'month' ? 'default' : 'ghost'}
                      size="icon"
                      className="h-9 w-9 rounded-none border-0 border-l"
                      onClick={() => setViewMode('month')}
                      title="Visão mensal"
                    >
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Doctor color legend */}
                {selectedMedico === 'todos' && medicos.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap px-1 mt-2">
                    <span className="text-[10px] text-muted-foreground font-medium">Médicos:</span>
                    {medicos.slice(0, 8).map((m) => (
                      <span key={m.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className={cn('h-2 w-2 rounded-full', getMedicoColor(m.id))} />
                        {(m.nome || m.crm).split(' ')[0]}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ─── Advanced filter bar ─── */}
              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border/40">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar paciente, CPF ou telefone..."
                    value={searchPaciente}
                    onChange={(e) => setSearchPaciente(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Filter className="h-3.5 w-3.5" />
                      Filtros
                      {activeFiltersCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{activeFiltersCount}</Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs font-semibold">Status</Label>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {(Object.keys(STATUS_LABELS) as StatusAgendamento[]).map(s => (
                            <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
                              <Checkbox
                                checked={statusFilters.includes(s)}
                                onCheckedChange={(c) => setStatusFilters(prev => c ? [...prev, s] : prev.filter(x => x !== s))}
                              />
                              {STATUS_LABELS[s]}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">Tipo</Label>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {['consulta','retorno','avaliacao','checkup','procedimento','cirurgia','triagem','coleta','exame','enfermagem','vacina','curativo','outro'].map(t => (
                            <label key={t} className="flex items-center gap-2 text-xs cursor-pointer capitalize">
                              <Checkbox
                                checked={tipoFilters.includes(t)}
                                onCheckedChange={(c) => setTipoFilters(prev => c ? [...prev, t] : prev.filter(x => x !== t))}
                              />
                              {t}
                            </label>
                          ))}
                        </div>
                      </div>
                      {convenios.length > 0 && (
                        <div>
                          <Label className="text-xs font-semibold">Convênio</Label>
                          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                            {convenios.map(c => (
                              <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                <Checkbox
                                  checked={convenioFilters.includes(c.id)}
                                  onCheckedChange={(v) => setConvenioFilters(prev => v ? [...prev, c.id] : prev.filter(x => x !== c.id))}
                                />
                                {c.nome}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {activeFiltersCount > 0 && (
                        <Button size="sm" variant="ghost" className="w-full gap-1.5"
                          onClick={() => { setStatusFilters([]); setTipoFilters([]); setConvenioFilters([]); setSearchPaciente(''); }}
                        >
                          <X className="h-3.5 w-3.5" /> Limpar filtros
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {activeFiltersCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {filteredAgendamentos.length} resultado(s)
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {viewMode === 'month' ? (
                /* ─── Month View ─── */
                <div className="p-2">
                  <div className="grid grid-cols-7 gap-px mb-1">
                    {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                      <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-px">
                    {monthDays.map((day, idx) => {
                      const isCurrentMonth = isSameMonth(day, currentWeek);
                      const isToday_ = isSameDay(day, new Date());
                      const dayStr = format(day, 'yyyy-MM-dd');
                      const dayAgs = filteredAgendamentos.filter(a => a.data === dayStr);
                      return (
                        <div
                          key={idx}
                          className={cn(
                            'min-h-[80px] rounded-lg border p-1 transition-colors cursor-pointer hover:bg-muted/30',
                            !isCurrentMonth && 'opacity-30',
                            isToday_ && 'ring-2 ring-primary/40 bg-primary/5',
                          )}
                          onClick={() => {
                            setCurrentWeek(day);
                            setViewMode('day');
                          }}
                        >
                          <p className={cn(
                            'text-xs font-medium mb-0.5',
                            isToday_ ? 'text-primary font-bold' : 'text-muted-foreground',
                          )}>
                            {format(day, 'd')}
                          </p>
                          <div className="space-y-0.5">
                            {dayAgs.slice(0, 3).map(ag => (
                              <div key={ag.id} className={cn(
                                'text-[9px] leading-tight px-1 py-0.5 rounded truncate border',
                                selectedMedico === 'todos' && medicos.length > 1
                                  ? getMedicoBgColor(ag.medico_id)
                                  : STATUS_COLORS[ag.status as StatusAgendamento || 'agendado'],
                              )}>
                                <span className="font-medium">{ag.hora_inicio?.slice(0, 5)}</span>{' '}
                                {getPacienteNome(ag.paciente_id).split(' ')[0]}
                              </div>
                            ))}
                            {dayAgs.length > 3 && (
                              <p className="text-[9px] text-muted-foreground text-center">+{dayAgs.length - 3} mais</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : viewMode === 'day' ? (
                /* ─── Day View ─── */
                <div className="divide-y">
                  {/* Quick weekday nav */}
                  <div className="p-3 bg-muted/20 border-b flex items-center gap-1 overflow-x-auto">
                    {weekDays.map(d => {
                      const isSelected = isSameDay(d, currentWeek);
                      const dayAgCount = filteredAgendamentos.filter(a => a.data === format(d, 'yyyy-MM-dd')).length;
                      return (
                        <button
                          key={d.toISOString()}
                          onClick={() => setCurrentWeek(d)}
                          className={cn(
                            'flex flex-col items-center px-3 py-2 rounded-lg transition-all min-w-[52px]',
                            isSelected ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted',
                            isSameDay(d, new Date()) && !isSelected && 'ring-1 ring-primary/40',
                          )}
                        >
                          <span className="text-[10px] uppercase font-medium">{format(d, 'EEE', { locale: ptBR })}</span>
                          <span className="text-lg font-bold">{format(d, 'dd')}</span>
                          {dayAgCount > 0 && (
                            <span className={cn('text-[9px] font-medium', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                              {dayAgCount} ag.
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {HORARIOS.map(hora => {
                    const agendamento = getAgendamentoForSlot(currentWeek, hora);
                    const blocked = isSlotBlocked(currentWeek, hora);
                    return (
                      <div
                        key={hora}
                        className={cn(
                          'flex items-stretch min-h-[72px] transition-colors',
                          blocked ? 'bg-muted/40' : 'hover:bg-muted/20 cursor-pointer',
                          draggedAg && !blocked && 'hover:bg-primary/10',
                        )}
                        onClick={() => !blocked && handleSlotClick(currentWeek, hora)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, currentWeek, hora)}
                      >
                        <div className="w-20 flex-shrink-0 flex items-center justify-center border-r bg-muted/20 text-sm font-medium text-muted-foreground">
                          {hora}
                        </div>
                        <div className="flex-1 p-2">
                          {blocked && !agendamento && (
                            <div className="rounded-lg p-3 bg-muted text-muted-foreground/60 border border-dashed border-muted-foreground/20 h-full flex items-center justify-center text-sm">
                              Bloqueado
                            </div>
                          )}
                          {agendamento && (
                            <motion.div
                              initial={{ opacity: 0, x: -5 }}
                              animate={{ opacity: 1, x: 0 }}
                              draggable={agendamento.status !== 'finalizado' && agendamento.status !== 'cancelado'}
                              onDragStart={(e) => handleDragStart(e as any, agendamento.id)}
                              onDragEnd={() => setDraggedAg(null)}
                              className={cn(
                                'rounded-lg p-3 border',
                                STATUS_COLORS[agendamento.status || 'agendado'],
                                agendamento.status !== 'finalizado' && agendamento.status !== 'cancelado' && 'cursor-grab active:cursor-grabbing',
                                draggedAg === agendamento.id && 'opacity-40',
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-semibold text-sm">{getPacienteNome(agendamento.paciente_id)}</p>
                                  <p className="text-xs opacity-75">{agendamento.medico_id ? getMedicoNome(agendamento.medico_id) : (agendamento.tipo || 'Agendamento')}</p>
                                </div>
                                <Badge className={cn('text-[10px]', STATUS_COLORS[agendamento.status || 'agendado'])}>
                                  {STATUS_LABELS[agendamento.status as StatusAgendamento || 'agendado']}
                                </Badge>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'list' ? (
                <div className="divide-y">
                  {filteredAgendamentos
                    .filter(a => a.data >= format(weekDays[0], 'yyyy-MM-dd') && a.data <= format(weekDays[6], 'yyyy-MM-dd'))
                    .sort((a, b) => `${a.data}${a.hora_inicio}`.localeCompare(`${b.data}${b.hora_inicio}`))
                    .map(ag => (
                      <motion.div key={ag.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => handleSlotClick(parseISO(ag.data), ag.hora_inicio || '08:00')}
                      >
                        <div className="w-16 text-center shrink-0">
                          <p className="text-xs text-muted-foreground">{format(parseISO(ag.data), 'EEE', { locale: ptBR })}</p>
                          <p className="font-bold text-sm">{format(parseISO(ag.data), 'dd/MM')}</p>
                        </div>
                        <div className={cn('w-2 h-10 rounded-full shrink-0',
                          selectedMedico === 'todos' && medicos.length > 1
                            ? getMedicoColor(ag.medico_id)
                            : ag.status === 'confirmado' ? 'bg-success' :
                              ag.status === 'cancelado' ? 'bg-destructive' :
                              ag.status === 'finalizado' ? 'bg-muted-foreground' :
                              ag.status === 'em_atendimento' ? 'bg-purple-500' : 'bg-info'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{getPacienteNome(ag.paciente_id)}</p>
                          <p className="text-xs text-muted-foreground truncate">{getMedicoNome(ag.medico_id)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">{ag.hora_inicio?.slice(0,5)}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[ag.status as StatusAgendamento || 'agendado']}`}>
                            {STATUS_LABELS[ag.status as StatusAgendamento || 'agendado']}
                          </span>
                        </div>
                      </motion.div>
                    ))
                  }
                  {filteredAgendamentos.filter(a => a.data >= format(weekDays[0], 'yyyy-MM-dd') && a.data <= format(weekDays[6], 'yyyy-MM-dd')).length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CalendarCheck className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Nenhum agendamento esta semana</p>
                    </div>
                  )}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Header with days */}
                  <div className="grid grid-cols-8 border-b bg-muted/50">
                    <div className="p-2 text-center text-sm font-medium text-muted-foreground border-r">
                      Horário
                    </div>
                    {weekDays.map((day) => (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'p-2 text-center border-r last:border-r-0',
                          isSameDay(day, new Date()) && 'bg-primary/10'
                        )}
                      >
                        <p className="text-sm font-medium">{format(day, 'EEE', { locale: ptBR })}</p>
                        <p
                          className={cn(
                            'text-lg',
                            isSameDay(day, new Date()) && 'text-primary font-bold'
                          )}
                        >
                          {format(day, 'dd')}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Time slots */}
                  <div className="divide-y">
                    {HORARIOS.map((hora) => (
                      <div key={hora} className="grid grid-cols-8">
                        <div className="p-2 text-center text-sm text-muted-foreground border-r bg-muted/30">
                          {hora}
                        </div>
                        {weekDays.map((day) => {
                          const agendamento = getAgendamentoForSlot(day, hora);
                          const blocked = isSlotBlocked(day, hora);
                          return (
                            <div
                              key={`${day.toISOString()}-${hora}`}
                              className={cn(
                                'p-1 border-r last:border-r-0 min-h-[60px] transition-colors',
                                blocked 
                                  ? 'bg-muted/60 cursor-not-allowed' 
                                  : 'cursor-pointer hover:bg-muted/30',
                                isSameDay(day, new Date()) && !blocked && 'bg-primary/5',
                                draggedAg && !blocked && 'hover:bg-primary/10 hover:ring-1 hover:ring-primary/30',
                              )}
                              onClick={() => handleSlotClick(day, hora)}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, day, hora)}
                            >
                              {blocked && !agendamento && (
                                <div className="rounded p-1.5 text-xs bg-muted text-muted-foreground/60 border border-dashed border-muted-foreground/20 h-full flex items-center justify-center">
                                  <span className="text-[10px]">Bloqueado</span>
                                </div>
                              )}
                              {agendamento && (
                                <div
                                  draggable={agendamento.status !== 'finalizado' && agendamento.status !== 'cancelado'}
                                  onDragStart={(e) => handleDragStart(e, agendamento.id)}
                                  onDragEnd={() => setDraggedAg(null)}
                                  className={cn(
                                    'rounded p-1.5 text-xs border relative',
                                    STATUS_COLORS[agendamento.status || 'agendado'],
                                    agendamento.status !== 'finalizado' && agendamento.status !== 'cancelado' && 'cursor-grab active:cursor-grabbing',
                                    draggedAg === agendamento.id && 'opacity-40',
                                  )}
                                >
                                  <p className="font-medium truncate">
                                    {getPacienteNome(agendamento.paciente_id)}
                                  </p>
                                  <p className="truncate opacity-75">
                                    {getMedicoNome(agendamento.medico_id)}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}
            </CardContent>
          </Card>

          {/* Legenda */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <Badge key={key} className={cn('text-xs', STATUS_COLORS[key as StatusAgendamento])}>
                {label}
              </Badge>
            ))}
          </div>
          {/* Bloqueios de Horário */}
          <BloqueioAgenda medicoIdFilter={selectedMedico !== 'todos' ? selectedMedico : undefined} />
        </>
      )}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setIsRemarkMode(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {formData.id ? 'Editar Agendamento' : 'Novo Agendamento'}
            </DialogTitle>
            <DialogDescription>Preencha os dados do agendamento.</DialogDescription>
          </DialogHeader>

          {/* ─── Quick Actions Bar (existing appointments only) ─── */}
          {formData.id && formData.status !== 'cancelado' && formData.status !== 'faltou' && formData.status !== 'finalizado' && (
            <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground font-medium w-full mb-1">Ações rápidas:</span>
              
              {(formData.status === 'agendado') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-success border-success/30 hover:bg-success/10 gap-1.5"
                  disabled={isSaving}
                  onClick={async () => {
                    if (!formData.id) return;
                    setIsSaving(true);
                    const result = await autoConfirmarAgendamento(formData.id);
                    if (result.success) {
                      toast.success('Consulta confirmada!', { description: result.actions.join(' • ') });
                      sendWhatsAppNotification(formData.id, 'send_appointment_confirmation');
                      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
                      setFormData(prev => ({ ...prev, status: 'confirmado' as StatusAgendamento }));
                    }
                    setIsSaving(false);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirmar
                </Button>
              )}

              {(formData.status === 'agendado' || formData.status === 'confirmado') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-primary border-primary/30 hover:bg-primary/10 gap-1.5"
                  disabled={isSaving}
                  onClick={async () => {
                    if (!formData.id) return;
                    setIsSaving(true);
                    const result = await autoCheckin(formData.id);
                    if (result.success) {
                      toast.success('Check-in realizado!', { description: result.actions.join(' • ') });
                      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
                      setIsFormOpen(false);
                      navigate('/recepcao');
                    } else {
                      toast.info(result.message);
                    }
                    setIsSaving(false);
                  }}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Check-in
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="text-accent-foreground border-accent hover:bg-accent/50 gap-1.5"
                disabled={isSaving}
                onClick={() => {
                  setIsRemarkMode(true);
                  toast.info('Altere a data e horário e clique em Salvar.');
                }}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Remarcar
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/10 gap-1.5"
                disabled={isSaving}
                onClick={() => sendWhatsAppConfirmation()}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </Button>
            </div>
          )}

          <div className="space-y-4 py-4">
            {/* ─── Tipo do Agendamento (primeiro, pois controla o fluxo) ─── */}
            <div className="space-y-2">
              <Label className="font-semibold">Tipo de Agendamento *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(v) => {
                  const needsMedico = ['consulta', 'retorno', 'checkup', 'avaliacao', 'procedimento', 'cirurgia', 'triagem'].includes(v);
                  setFormData({
                    ...formData,
                    tipo: v,
                    // Clear medico if switching to a type that doesn't require one
                    ...((!needsMedico && formData.medico_id) ? {} : {}),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consulta">🩺 Consulta Médica</SelectItem>
                  <SelectItem value="retorno">🔄 Retorno</SelectItem>
                  <SelectItem value="avaliacao">📋 Avaliação</SelectItem>
                  <SelectItem value="checkup">✅ Check-up</SelectItem>
                  <SelectItem value="procedimento">💉 Procedimento</SelectItem>
                  <SelectItem value="cirurgia">🔪 Cirurgia</SelectItem>
                  <SelectItem value="triagem">🏥 Triagem</SelectItem>
                  <SelectItem value="coleta">🧪 Coleta Laboratorial</SelectItem>
                  <SelectItem value="exame">🔬 Exame</SelectItem>
                  <SelectItem value="enfermagem">👩‍⚕️ Atendimento Enfermagem</SelectItem>
                  <SelectItem value="vacina">💊 Vacinação</SelectItem>
                  <SelectItem value="curativo">🩹 Curativo</SelectItem>
                  <SelectItem value="outro">📌 Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ─── Data e Horário ─── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                {isRemarkMode || !formData.id ? (
                  <Input
                    type="date"
                    value={formData.data || ''}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded">
                    <Clock className="h-4 w-4" />
                    {formData.data && format(parseISO(formData.data), "dd/MM/yyyy")}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                {isRemarkMode || !formData.id ? (
                  <div className="flex gap-1">
                    <Input
                      type="time"
                      step={60}
                      value={formData.hora_inicio || ''}
                      onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                    />
                    <Button type="button" variant="outline" size="icon" title="Sugerir próximo horário livre" onClick={suggestNextSlot}>
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded">
                    <Clock className="h-4 w-4" />
                    {formData.hora_inicio}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Paciente ─── */}
            <div className="space-y-2">
              <Label>Paciente *</Label>
              {!showNewPatientForm ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={formData.paciente_id}
                      onValueChange={(v) => setFormData({ ...formData, paciente_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o paciente" />
                      </SelectTrigger>
                      <SelectContent>
                        {pacientes.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome} {p.cpf ? `(${p.cpf})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewPatientForm(true)}
                    title="Cadastrar novo paciente"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-primary">Novo Paciente</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowNewPatientForm(false);
                          setNewPatientData({ nome: '', telefone: '', cpf: '' });
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Input
                        placeholder="Nome completo *"
                        value={newPatientData.nome}
                        onChange={(e) => setNewPatientData({ ...newPatientData, nome: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Telefone"
                        value={newPatientData.telefone}
                        onChange={(e) => setNewPatientData({ ...newPatientData, telefone: e.target.value })}
                      />
                      <Input
                        placeholder="CPF"
                        value={newPatientData.cpf}
                        onChange={(e) => setNewPatientData({ ...newPatientData, cpf: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={!newPatientData.nome.trim() || isSavingPatient}
                      onClick={handleQuickCreatePatient}
                    >
                      {isSavingPatient ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                      Cadastrar e Selecionar
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ─── Médico / Especialidade — Fluxo adaptativo por tipo ─── */}
            {(() => {
              const tipo = formData.tipo || 'consulta';
              const requiresMedico = ['consulta', 'retorno', 'checkup', 'avaliacao', 'procedimento', 'cirurgia', 'triagem'].includes(tipo);
              const isLabType = ['coleta', 'exame'].includes(tipo);
              const isNursingType = ['enfermagem', 'vacina', 'curativo'].includes(tipo);

              if (requiresMedico) {
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Especialidade <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                      <Select
                        value={espFilter || '__todas__'}
                        onValueChange={(esp) => {
                          if (esp === '__todas__') {
                            setEspFilter('');
                          } else {
                            setEspFilter(esp);
                            const firstDoc = medicos.find(m => m.ativo !== false && (m.especialidade || 'Clínico Geral') === esp);
                            setFormData({ ...formData, medico_id: firstDoc?.id || '' });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todas as especialidades" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__todas__">Todas as especialidades</SelectItem>
                          {(() => {
                            const espSet = new Set<string>();
                            medicos.filter(m => m.ativo !== false).forEach(m => espSet.add(m.especialidade || 'Clínico Geral'));
                            return Array.from(espSet).sort().map(esp => (
                              <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Médico *</Label>
                      <Select
                        value={formData.medico_id || ''}
                        onValueChange={(v) => setFormData({ ...formData, medico_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o médico" />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const filtered = espFilter
                              ? medicos.filter(m => m.ativo !== false && (m.especialidade || 'Clínico Geral') === espFilter)
                              : medicos.filter(m => m.ativo !== false);
                            return filtered.map(m => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nome || m.crm} {!espFilter && m.especialidade ? `(${m.especialidade})` : ''}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              }

              if (isLabType) {
                return (
                  <div className="space-y-3 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🧪</span>
                      <Label className="font-medium text-emerald-700">
                        {tipo === 'coleta' ? 'Coleta Laboratorial' : 'Exame'}
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Médico Solicitante (opcional)</Label>
                      <Select
                        value={formData.medico_id || '__none__'}
                        onValueChange={(v) => setFormData({ ...formData, medico_id: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Sem médico solicitante —</SelectItem>
                          {medicos.filter(m => m.ativo !== false).map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.nome || m.crm} {m.especialidade ? `(${m.especialidade})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Para coletas e exames, o médico é opcional (solicitante). A gestão completa da coleta pode ser feita em Laboratório &gt; Mapa de Coleta.
                    </p>
                  </div>
                );
              }

              if (isNursingType) {
                return (
                  <div className="space-y-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">👩‍⚕️</span>
                      <Label className="font-medium text-blue-700">Atendimento de Enfermagem</Label>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Médico Responsável (opcional)</Label>
                      <Select
                        value={formData.medico_id || '__none__'}
                        onValueChange={(v) => setFormData({ ...formData, medico_id: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Sem médico responsável —</SelectItem>
                          {medicos.filter(m => m.ativo !== false).map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.nome || m.crm}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              }

              // "outro" type - optional medico
              return (
                <div className="space-y-2">
                  <Label>Médico (opcional)</Label>
                  <Select
                    value={formData.medico_id || '__none__'}
                    onValueChange={(v) => setFormData({ ...formData, medico_id: v === '__none__' ? '' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Nenhum —</SelectItem>
                      {medicos.filter(m => m.ativo !== false).map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome || m.crm}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}

            {/* ─── Status ─── */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v as StatusAgendamento })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recurrence - only show for new appointments */}
            {!formData.id && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Agendamento Recorrente</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Frequência</Label>
                    <Select
                      value={recurrence.type}
                      onValueChange={(v) => setRecurrence({ ...recurrence, type: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RECURRENCE_OPTIONS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {recurrence.type !== 'none' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Repetições</Label>
                      <Input
                        type="number"
                        min={2}
                        max={52}
                        value={recurrence.occurrences}
                        onChange={(e) => setRecurrence({ ...recurrence, occurrences: parseInt(e.target.value) || 4 })}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes || ''}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder={
                  formData.tipo === 'coleta' ? 'Ex: Hemograma completo, jejum de 12h...' :
                  formData.tipo === 'exame' ? 'Ex: Raio-X tórax, ultrassom...' :
                  formData.tipo === 'vacina' ? 'Ex: Vacina antigripal, lote...' :
                  'Observações sobre o atendimento...'
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {formData.id && formData.status !== 'cancelado' && formData.status !== 'faltou' && formData.status !== 'finalizado' && (
              <Button
                variant="outline"
                className="text-warning border-warning/30 hover:bg-warning/10"
                disabled={isSaving}
                onClick={() => setConfirmFaltaOpen(true)}
              >
                Faltou
              </Button>
            )}
            {formData.id && formData.status !== 'cancelado' && formData.status !== 'faltou' && formData.status !== 'finalizado' && (
              <Button variant="destructive" disabled={isSaving} onClick={() => setConfirmCancelOpen(true)}>
                Cancelar Consulta
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
              Fechar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Cancel Dialog */}
      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Consulta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar este agendamento? O paciente da lista de espera poderá ser convocado automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Falta Dialog */}
      <AlertDialog open={confirmFaltaOpen} onOpenChange={setConfirmFaltaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar Falta</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que o paciente não compareceu à consulta? Esta ação será registrada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={async () => {
                if (!formData.id) return;
                setIsSaving(true);
                const result = await autoCancelarAgendamento({ agendamentoId: formData.id, motivo: 'faltou' });
                toast.success('Falta registrada!', { description: result.actions.join(' • ') });
                queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
                setIsFormOpen(false);
                setIsSaving(false);
                setConfirmFaltaOpen(false);
              }}
            >
              Sim, registrar falta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
