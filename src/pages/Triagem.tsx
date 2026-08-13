import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Activity, Heart, Scale, Loader2, Search, Thermometer,
  Wind, Droplets, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  ArrowUpRight, User, Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { autoTriagemParaFila, autoNotificarMedico } from '@/lib/workflowAutomation';
import { usePacientes, useAgendamentos } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Manchester Triage Colors ──────────────────────────────
const RISCO = {
  vermelho: {
    label: 'Emergência',
    sublabel: 'Imediato',
    bg: 'bg-red-600 text-white',
    border: 'border-red-500',
    light: 'bg-red-50 border-red-200',
    dot: 'bg-red-500 animate-pulse',
  },
  laranja: {
    label: 'Muito Urgente',
    sublabel: '10 min',
    bg: 'bg-orange-500 text-white',
    border: 'border-orange-400',
    light: 'bg-orange-50 border-orange-200',
    dot: 'bg-orange-500',
  },
  amarelo: {
    label: 'Urgente',
    sublabel: '30 min',
    bg: 'bg-yellow-400 text-yellow-900',
    border: 'border-yellow-400',
    light: 'bg-yellow-50 border-yellow-200',
    dot: 'bg-yellow-400',
  },
  verde: {
    label: 'Pouco Urgente',
    sublabel: '120 min',
    bg: 'bg-green-500 text-white',
    border: 'border-green-400',
    light: 'bg-green-50 border-green-200',
    dot: 'bg-green-500',
  },
  azul: {
    label: 'Não Urgente',
    sublabel: '240 min',
    bg: 'bg-blue-500 text-white',
    border: 'border-blue-400',
    light: 'bg-blue-50 border-blue-200',
    dot: 'bg-blue-400',
  },
};

type Risco = keyof typeof RISCO;

/**
 * A tela pede altura em centímetros, mas registros antigos podem estar em
 * metros (antes da migration 20260728170000 a coluna era DECIMAL(4,2), então
 * só valores em metros cabiam). O limiar de 3 é seguro: ninguém tem 3 cm nem
 * 3 metros. Mesma lógica já usada em Prontuários.
 */
const calcularIMC = (peso: string, altura: string): number | null => {
  const p = parseFloat(peso);
  const a = parseFloat(altura);
  if (!(p > 0) || !(a > 0)) return null;
  const h = a > 3 ? a / 100 : a; // aceita cm e metros
  return parseFloat((p / (h * h)).toFixed(1));
};

const imcClassification = (imc: number): { label: string; color: string } => {
  if (imc < 18.5) return { label: 'Abaixo do peso', color: 'text-warning' };
  if (imc < 25) return { label: 'Peso normal', color: 'text-success' };
  if (imc < 30) return { label: 'Sobrepeso', color: 'text-warning' };
  return { label: 'Obesidade', color: 'text-destructive' };
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

interface TriagemForm {
  paciente_id: string;
  agendamento_id: string;
  pressao_arterial: string;
  frequencia_cardiaca: string;
  frequencia_respiratoria: string;
  temperatura: string;
  saturacao: string;
  peso: string;
  altura: string;
  queixa_principal: string;
  classificacao_risco: Risco;
  observacoes: string;
  glicemia: string;
  dor_escala: string;
}

const emptyForm: TriagemForm = {
  paciente_id: '', agendamento_id: '',
  pressao_arterial: '', frequencia_cardiaca: '', frequencia_respiratoria: '',
  temperatura: '', saturacao: '', peso: '', altura: '',
  queixa_principal: '', classificacao_risco: 'verde',
  observacoes: '', glicemia: '', dor_escala: '',
};

// ─── Vital Sign Input ──────────────────────────────────────
function VitalInput({ icon: Icon, label, value, onChange, placeholder, unit, color }: {
  icon: any; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string; unit?: string; color?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        <Icon className={cn('h-3.5 w-3.5', color || 'text-muted-foreground')} />
        {label}
      </Label>
      <div className="relative">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 text-sm"
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Risk Badge ────────────────────────────────────────────
function RiscoBadge({ risco, size = 'sm' }: { risco: Risco; size?: 'sm' | 'lg' }) {
  const cfg = RISCO[risco];
  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1', cfg.light, cfg.border)}>
      <span className={cn('rounded-full', size === 'lg' ? 'h-3 w-3' : 'h-2 w-2', cfg.dot)} />
      <span className={cn('font-semibold', size === 'lg' ? 'text-sm' : 'text-xs')}>
        {cfg.label}
        <span className="font-normal ml-1 opacity-70">({cfg.sublabel})</span>
      </span>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function TriagemPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TriagemForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRisco, setFilterRisco] = useState<'todos' | Risco>('todos');

  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: triagens = [], isLoading } = useSupabaseQuery<any>('triagens', {
    orderBy: { column: 'data_hora', ascending: false },
    staleTime: 1000 * 15,
  });
  const { data: pacientes = [] } = usePacientes();
  const { data: agendamentos = [] } = useAgendamentos(today);

  // Realtime subscription for triagens
  React.useEffect(() => {
    const ch = supabase
      .channel('triagem-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'triagens' }, () => {
        queryClient.invalidateQueries({ queryKey: ['triagens'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // Count of agendamentos without triagem today (pending triages)
  const pendingTriagemCount = useMemo(() => {
    const todayAgs = agendamentos.filter((a: any) =>
      ['agendado', 'confirmado', 'aguardando'].includes(a.status || '')
    );
    const triagemAgIds = new Set(triagens.filter((t: any) => t.data_hora?.startsWith(today)).map((t: any) => t.agendamento_id));
    return todayAgs.filter((a: any) => !triagemAgIds.has(a.id)).length;
  }, [agendamentos, triagens, today]);

  const setField = (field: keyof TriagemForm) => (value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleOpenDialog = (pacienteId?: string, agendamentoId?: string) => {
    setFormData({ ...emptyForm, paciente_id: pacienteId || '', agendamento_id: agendamentoId || '' });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.paciente_id || !formData.pressao_arterial) {
      toast.error('Preencha paciente e pressão arterial.'); return;
    }

    // Validate PA format (e.g. "120/80")
    const paMatch = formData.pressao_arterial.match(/^(\d{2,3})\/(\d{2,3})$/);
    if (!paMatch) {
      toast.error('Pressão arterial deve estar no formato SIS/DIA (ex: 120/80).'); return;
    }
    const [, sistolica, diastolica] = paMatch.map(Number);
    if (sistolica < 50 || sistolica > 300 || diastolica < 20 || diastolica > 200) {
      toast.error('Pressão arterial fora da faixa aceitável (SIS: 50-300, DIA: 20-200).'); return;
    }
    if (diastolica >= sistolica) {
      toast.error('A pressão diastólica deve ser menor que a sistólica.'); return;
    }

    // Validate vital signs ranges if provided
    const fc = parseInt(formData.frequencia_cardiaca);
    if (formData.frequencia_cardiaca && (fc < 20 || fc > 300)) {
      toast.error('Frequência cardíaca fora da faixa (20-300 bpm).'); return;
    }
    const fr = parseInt(formData.frequencia_respiratoria);
    if (formData.frequencia_respiratoria && (fr < 4 || fr > 60)) {
      toast.error('Frequência respiratória fora da faixa (4-60 irpm).'); return;
    }
    const temp = parseFloat(formData.temperatura);
    if (formData.temperatura && (temp < 30 || temp > 45)) {
      toast.error('Temperatura fora da faixa (30-45 °C).'); return;
    }
    const sat = parseFloat(formData.saturacao);
    if (formData.saturacao && (sat < 50 || sat > 100)) {
      toast.error('Saturação fora da faixa (50-100%).'); return;
    }
    const peso = parseFloat(formData.peso);
    if (formData.peso && (peso < 0.5 || peso > 500)) {
      toast.error('Peso fora da faixa aceitável (0.5-500 kg).'); return;
    }
    const altura = parseFloat(formData.altura);
    if (formData.altura && (altura < 20 || altura > 250)) {
      toast.error('Altura fora da faixa aceitável (20-250 cm).'); return;
    }
    const glic = parseFloat(formData.glicemia);
    if (formData.glicemia && (glic < 10 || glic > 900)) {
      toast.error('Glicemia fora da faixa (10-900 mg/dL).'); return;
    }
    const dor = parseInt(formData.dor_escala);
    if (formData.dor_escala && (dor < 0 || dor > 10)) {
      toast.error('Escala de dor deve estar entre 0 e 10.'); return;
    }

    setIsSaving(true);
    try {
      const imc = calcularIMC(formData.peso, formData.altura);
      const { error } = await supabase.from('triagens').insert([{
        paciente_id: formData.paciente_id,
        agendamento_id: formData.agendamento_id || null,
        enfermeiro_id: user?.id || '',
        pressao_arterial: formData.pressao_arterial,
        frequencia_cardiaca: parseInt(formData.frequencia_cardiaca) || null,
        frequencia_respiratoria: parseInt(formData.frequencia_respiratoria) || null,
        temperatura: parseFloat(formData.temperatura) || null,
        saturacao: parseFloat(formData.saturacao) || null,
        peso: parseFloat(formData.peso) || null,
        altura: parseFloat(formData.altura) || null,
        imc: imc,
        glicemia: parseFloat(formData.glicemia) || null,
        dor_escala: parseInt(formData.dor_escala) || null,
        queixa_principal: formData.queixa_principal,
        classificacao_risco: formData.classificacao_risco,
        observacoes: formData.observacoes || null,
        data_hora: new Date().toISOString(),
        clinica_id: profile?.clinica_id || null,
      }] as any);
      if (error) throw error;

      // Use centralized workflow automation for triage → queue
      if (formData.agendamento_id) {
        const triagemResult = await autoTriagemParaFila({
          agendamentoId: formData.agendamento_id,
          classificacaoRisco: formData.classificacao_risco,
          clinicaId: profile?.clinica_id,
        });
        if (!triagemResult.success) throw new Error(triagemResult.message);

        // Auto-notify doctor for urgent cases
        if (formData.classificacao_risco === 'vermelho' || formData.classificacao_risco === 'laranja') {
          const ag = agendamentos.find(a => a.id === formData.agendamento_id);
          if (ag) {
            const pac = pacientes.find(p => p.id === formData.paciente_id);
            const notificacaoResult = await autoNotificarMedico({
              medicoId: ag.medico_id,
              pacienteNome: pac?.nome || 'Paciente',
              motivo: `Triagem ${formData.classificacao_risco.toUpperCase()} — PA: ${formData.pressao_arterial}, FC: ${formData.frequencia_cardiaca || '—'}`,
            });
            if (notificacaoResult.success) {
              triagemResult.actions.push(...notificacaoResult.actions);
            } else {
              triagemResult.actions.push(`Aviso: médico não notificado — ${notificacaoResult.message}`);
            }
          }
        }

        toast.success('Triagem registrada!', {
          description: triagemResult.actions.join(' • '),
        });
      } else {
        toast.success('Triagem registrada!');
      }

      queryClient.invalidateQueries({ queryKey: ['triagens'] });
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setIsDialogOpen(false);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getPacienteNome = (id: string) => pacientes.find(p => p.id === id)?.nome ?? '—';

  const triagemHoje = triagens.filter(t => t.data_hora?.startsWith(today));
  const filtered = triagemHoje.filter(t => {
    if (filterRisco !== 'todos' && t.classificacao_risco !== filterRisco) return false;
    if (search.trim()) {
      const nome = getPacienteNome(t.paciente_id).toLowerCase();
      if (!nome.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // Stats per risk level
  const stats = Object.entries(RISCO).map(([key, cfg]) => ({
    risco: key as Risco,
    cfg,
    count: triagemHoje.filter(t => t.classificacao_risco === key).length,
  }));

  // IMC live preview
  const imcLive = formData.peso && formData.altura ? calcularIMC(formData.peso, formData.altura) : null;
  const imcInfo = imcLive ? imcClassification(imcLive) : null;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-header flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            Triagem
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })} • Protocolo Manchester
            {pendingTriagemCount > 0 && (
              <Badge variant="secondary" className="text-xs bg-warning/10 text-warning border-warning/20">
                {pendingTriagemCount} pendente{pendingTriagemCount > 1 ? 's' : ''}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ['triagens'] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4" /> Nova Triagem
          </Button>
        </div>
      </div>

      {/* Risk summary */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-wrap gap-3">
        {stats.filter(s => s.count > 0).map(s => (
          <motion.button key={s.risco} variants={fadeUp}
            onClick={() => setFilterRisco(filterRisco === s.risco ? 'todos' : s.risco)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-all',
              s.cfg.light, s.cfg.border,
              filterRisco === s.risco && 'ring-2 ring-offset-1 ring-current',
            )}>
            <span className={cn('h-3 w-3 rounded-full', s.cfg.dot)} />
            <span className="text-sm font-semibold">{s.cfg.label}</span>
            <span className="text-xl font-bold tabular-nums">{s.count}</span>
          </motion.button>
        ))}
        {triagemHoje.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma triagem registrada hoje</p>
        )}
      </motion.div>

      {/* Filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-64" placeholder="Buscar paciente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filterRisco !== 'todos' && (
          <Button variant="outline" size="sm" onClick={() => setFilterRisco('todos')} className="gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', RISCO[filterRisco].dot)} />
            {RISCO[filterRisco].label}
            <span className="text-muted-foreground">×</span>
          </Button>
        )}
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-48 bg-muted/60 animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Activity className="h-8 w-8 text-primary" />
                </div>
                <p className="font-semibold text-foreground">Nenhuma triagem encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">Registre a primeira triagem do dia</p>
                <Button className="mt-4 gap-2" onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4" /> Registrar Triagem
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Paciente</TableHead>
                    <TableHead>Risco</TableHead>
                    <TableHead className="hidden md:table-cell">PA</TableHead>
                    <TableHead className="hidden md:table-cell">FC</TableHead>
                    <TableHead className="hidden md:table-cell">Temp</TableHead>
                    <TableHead className="hidden lg:table-cell">SpO₂</TableHead>
                    <TableHead className="hidden lg:table-cell">IMC</TableHead>
                    <TableHead>Queixa</TableHead>
                    <TableHead>Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {filtered.map(t => {
                      const risco = t.classificacao_risco as Risco;
                      const cfg = RISCO[risco] ?? RISCO.verde;
                      return (
                        <motion.tr key={t.id}
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                          className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <User className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <span className="font-medium text-sm">{getPacienteNome(t.paciente_id)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5', cfg.light, cfg.border)}>
                              <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
                              <span className="text-xs font-semibold">{cfg.label}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm font-mono">{t.pressao_arterial || '—'}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {t.frequencia_cardiaca ? (
                              <span className={cn('text-sm font-medium', t.frequencia_cardiaca > 100 ? 'text-destructive' : t.frequencia_cardiaca < 60 ? 'text-warning' : 'text-success')}>
                                {t.frequencia_cardiaca} bpm
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {t.temperatura ? (
                              <span className={cn('text-sm font-medium', t.temperatura >= 37.5 ? 'text-destructive' : 'text-success')}>
                                {t.temperatura}°C
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {t.saturacao ? (
                              <span className={cn('text-sm font-medium', t.saturacao < 94 ? 'text-destructive' : t.saturacao < 96 ? 'text-warning' : 'text-success')}>
                                {t.saturacao}%
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">{t.imc ?? '—'}</TableCell>
                          <TableCell className="max-w-[180px]">
                            <p className="text-sm truncate text-muted-foreground">{t.queixa_principal || '—'}</p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {t.data_hora ? format(new Date(t.data_hora), 'HH:mm', { locale: ptBR }) : '—'}
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* New Triage Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Registrar Triagem
            </DialogTitle>
            <DialogDescription>Classifique o risco e registre os sinais vitais do paciente.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Patient & Appointment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                <Select value={formData.paciente_id} onValueChange={setField('paciente_id')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {pacientes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Agendamento</Label>
                <Select value={formData.agendamento_id || '__none__'} onValueChange={v => setFormData(prev => ({ ...prev, agendamento_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {agendamentos.map(ag => <SelectItem key={ag.id} value={ag.id}>
                      {ag.hora_inicio?.slice(0, 5)} — {ag.tipo}
                    </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vital Signs */}
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Sinais Vitais
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <VitalInput icon={Heart} label="Pressão Arterial *" value={formData.pressao_arterial} onChange={setField('pressao_arterial')} placeholder="120/80" unit="mmHg" color="text-destructive" />
                <VitalInput icon={Activity} label="Freq. Cardíaca" value={formData.frequencia_cardiaca} onChange={setField('frequencia_cardiaca')} placeholder="80" unit="bpm" color="text-primary" />
                <VitalInput icon={Wind} label="Freq. Respiratória" value={formData.frequencia_respiratoria} onChange={setField('frequencia_respiratoria')} placeholder="16" unit="irpm" />
                <VitalInput icon={Thermometer} label="Temperatura" value={formData.temperatura} onChange={setField('temperatura')} placeholder="36.5" unit="°C" color={parseFloat(formData.temperatura) >= 37.5 ? 'text-destructive' : 'text-muted-foreground'} />
                <VitalInput icon={Droplets} label="Saturação O₂" value={formData.saturacao} onChange={setField('saturacao')} placeholder="98" unit="%" color={parseFloat(formData.saturacao) < 94 ? 'text-destructive' : 'text-success'} />
                <VitalInput icon={Activity} label="Glicemia" value={formData.glicemia} onChange={setField('glicemia')} placeholder="100" unit="mg/dL" />
              </div>
            </div>

            {/* Anthropometry */}
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5" /> Antropometria
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <VitalInput icon={Scale} label="Peso" value={formData.peso} onChange={setField('peso')} placeholder="70" unit="kg" />
                <VitalInput icon={ArrowUpRight} label="Altura" value={formData.altura} onChange={setField('altura')} placeholder="170" unit="cm" />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">IMC Calculado</Label>
                  <div className="h-9 rounded-md border bg-background px-3 flex items-center">
                    {imcLive ? (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{imcLive}</span>
                        <span className={cn('text-xs', imcInfo?.color)}>{imcInfo?.label}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Classification */}
            <div className="space-y-2">
              <Label>Classificação de Risco (Manchester) *</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(RISCO).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setField('classificacao_risco')(key)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border-2 px-3 py-2 transition-all text-sm font-semibold',
                      formData.classificacao_risco === key
                        ? cn(cfg.bg, 'border-current shadow-md scale-105')
                        : cn(cfg.light, cfg.border, 'hover:scale-102'),
                    )}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full', cfg.dot)} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chief Complaint & Notes */}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label>Queixa Principal *</Label>
                <Input value={formData.queixa_principal} onChange={e => setField('queixa_principal')(e.target.value)} placeholder="Descreva a queixa principal..." />
              </div>
              <div className="space-y-1.5">
                <Label>Dor (0-10)</Label>
                <Input type="number" min="0" max="10" value={formData.dor_escala} onChange={e => setField('dor_escala')(e.target.value)} placeholder="0 = sem dor, 10 = pior dor" />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea value={formData.observacoes} onChange={e => setField('observacoes')(e.target.value)} placeholder="Informações adicionais..." rows={2} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar Triagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
