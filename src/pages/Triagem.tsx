import React, { useState, useMemo, useCallback, useId, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { MAX_LINHAS_AUTO, useAgendamentos } from '@/hooks/useSupabaseData';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { canalUnico } from '@/lib/realtimeCanal';
import { ErrorState } from '@/components/ErrorState';
import { dateOnlyInTimeZone, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';

const FUSO_CLINICA = 'America/Sao_Paulo';

const ocorreuNaDataDaClinica = (dataHora: string | null | undefined, data: string) => {
  if (!dataHora) return false;
  const instante = new Date(dataHora);
  return Number.isFinite(instante.getTime()) && dateOnlyInTimeZone(instante, FUSO_CLINICA) === data;
};

const horaDaClinica = (dataHora: string | null | undefined) => {
  if (!dataHora) return '—';
  const instante = new Date(dataHora);
  if (!Number.isFinite(instante.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_CLINICA,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instante);
};

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
const parseValorClinico = (valor: string): number => {
  const normalizado = valor.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
};

const calcularIMC = (peso: string, altura: string): number | null => {
  const p = parseValorClinico(peso);
  const a = parseValorClinico(altura);
  if (!(p > 0) || !(a > 0)) return null;
  const h = a > 3 ? a / 100 : a; // aceita cm e metros
  const imc = p / (h * h);
  return Number.isFinite(imc) ? Number(imc.toFixed(1)) : null;
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
  classificacao_risco: Risco | '';
  observacoes: string;
  glicemia: string;
  dor_escala: string;
}

const emptyForm: TriagemForm = {
  paciente_id: '', agendamento_id: '',
  pressao_arterial: '', frequencia_cardiaca: '', frequencia_respiratoria: '',
  temperatura: '', saturacao: '', peso: '', altura: '',
  queixa_principal: '', classificacao_risco: '',
  observacoes: '', glicemia: '', dor_escala: '',
};

// ─── Vital Sign Input ──────────────────────────────────────
function VitalInput({ icon: Icon, label, value, onChange, placeholder, unit, color, inputMode = 'decimal' }: {
  icon: any; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string; unit?: string; color?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const inputId = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="flex items-center gap-1.5 text-xs">
        <Icon className={cn('h-3.5 w-3.5', color || 'text-muted-foreground')} />
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TriagemForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const [search, setSearch] = useState('');
  const [filterRisco, setFilterRisco] = useState<'todos' | Risco>('todos');

  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  React.useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const inicioDoDia = new Date(`${today}T00:00:00-03:00`).toISOString();
  const proximoDiaUtc = new Date(`${today}T00:00:00Z`);
  proximoDiaUtc.setUTCDate(proximoDiaUtc.getUTCDate() + 1);
  const inicioDoProximoDia = new Date(`${proximoDiaUtc.toISOString().slice(0, 10)}T00:00:00-03:00`).toISOString();
  const triagensQuery = useSupabaseQuery<any>('triagens', {
    select: '*, pacientes(id,nome,nome_social,cpf,telefone,email)',
    orderBy: { column: 'data_hora', ascending: false },
    filters: [
      { column: 'data_hora', operator: 'gte', value: inicioDoDia },
      { column: 'data_hora', operator: 'lt', value: inicioDoProximoDia },
    ],
    staleTime: 1000 * 15,
  });
  const { data: triagens = [], isLoading, isError: erroTriagens } = triagensQuery;
  const agendamentosQuery = useAgendamentos(today);
  const { data: agendamentos = [] } = agendamentosQuery;
  const pacienteBuscaId = searchParams.get('buscarPaciente');
  const pacienteBuscaQuery = usePacienteResumo(pacienteBuscaId);

  // Realtime subscription for triagens
  React.useEffect(() => {
    const ch = supabase
      .channel(canalUnico('triagem-realtime'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'triagens' }, () => {
        queryClient.invalidateQueries({ queryKey: ['triagens'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  /**
   * A lista de trabalho da enfermagem: quem chegou hoje e ainda não foi triado.
   *
   * Antes isto era só um número, e um número que contava até quem nem tinha
   * chegado. Agora é a lista, com o nome e o horário, e o botão que abre a
   * ficha já preenchida — a enfermeira não precisa procurar o paciente.
   *
   * Vale mesmo onde `clinicas.exigir_triagem` está desligado: a clínica pode
   * triar sem que o sistema bloqueie a consulta.
   */
  const aguardandoTriagem = useMemo(() => {
    const jaTriados = new Set(
      triagens
        .filter((t: any) => ocorreuNaDataDaClinica(t.data_hora, today))
        .map((t: any) => t.agendamento_id)
    );
    return agendamentos
      .filter((a: any) =>
        a.data === today &&
        ['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'pago'].includes(a.status || '') &&
        a.exige_triagem !== false &&
        !jaTriados.has(a.id)
      )
      .sort((a: any, b: any) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
  }, [agendamentos, triagens, today]);

  const pendingTriagemCount = aguardandoTriagem.length;

  const setField = (field: keyof TriagemForm) => (value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleOpenDialog = useCallback((pacienteId?: string, agendamentoId?: string) => {
    setFormData({ ...emptyForm, paciente_id: pacienteId || '', agendamento_id: agendamentoId || '' });
    setIsDialogOpen(true);
  }, []);

  React.useEffect(() => {
    const pacienteId = searchParams.get('paciente');
    const agendamentoId = searchParams.get('agendamento');
    if (!pacienteId || !agendamentoId) return;

    handleOpenDialog(pacienteId, agendamentoId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('paciente');
    nextParams.delete('agendamento');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, handleOpenDialog]);

  React.useEffect(() => {
    if (!pacienteBuscaId || (!pacienteBuscaQuery.isSuccess && !pacienteBuscaQuery.isError)) return;

    const paciente = pacienteBuscaQuery.data;
    if (paciente) {
      setSearch(paciente.nome_social || paciente.nome || paciente.cpf || '');
    } else if (pacienteBuscaQuery.isError) {
      toast.error('Não foi possível carregar o paciente para a busca.');
    } else {
      toast.warning('Paciente não encontrado nesta clínica.');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('buscarPaciente');
    setSearchParams(nextParams, { replace: true });
  }, [pacienteBuscaId, pacienteBuscaQuery.data, pacienteBuscaQuery.isError, pacienteBuscaQuery.isSuccess, searchParams, setSearchParams]);

  const handleSave = async () => {
    if (saveLock.current) return;
    if (!formData.paciente_id || !formData.pressao_arterial || !formData.queixa_principal.trim()) {
      toast.error('Preencha paciente, pressão arterial e queixa principal.'); return;
    }
    if (!formData.classificacao_risco) {
      toast.error('Selecione a classificação de risco antes de registrar a triagem.'); return;
    }
    if (!user?.id || !profile?.clinica_id) {
      toast.error('Sua sessão clínica não está pronta. Atualize a página e tente novamente.'); return;
    }
    if (formData.agendamento_id) {
      const agendamento = agendamentos.find((a: any) => a.id === formData.agendamento_id);
      if (!agendamento || agendamento.paciente_id !== formData.paciente_id) {
        toast.error('O agendamento selecionado não pertence a este paciente.'); return;
      }
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

    // Number('abc') vira NaN; sem testar isso, texto invalido era salvo como NULL.
    const parseOptionalNumber = (value: string) => value.trim() ? parseValorClinico(value) : null;
    const fc = parseOptionalNumber(formData.frequencia_cardiaca);
    if (Number.isNaN(fc) || (fc !== null && (!Number.isInteger(fc) || fc < 20 || fc > 300))) {
      toast.error('Frequência cardíaca fora da faixa (20-300 bpm).'); return;
    }
    const fr = parseOptionalNumber(formData.frequencia_respiratoria);
    if (Number.isNaN(fr) || (fr !== null && (!Number.isInteger(fr) || fr < 4 || fr > 60))) {
      toast.error('Frequência respiratória fora da faixa (4-60 irpm).'); return;
    }
    const temp = parseOptionalNumber(formData.temperatura);
    if (Number.isNaN(temp) || (temp !== null && (temp < 30 || temp > 45))) {
      toast.error('Temperatura fora da faixa (30-45 °C).'); return;
    }
    const sat = parseOptionalNumber(formData.saturacao);
    if (Number.isNaN(sat) || (sat !== null && (sat < 50 || sat > 100))) {
      toast.error('Saturação fora da faixa (50-100%).'); return;
    }
    const peso = parseOptionalNumber(formData.peso);
    if (Number.isNaN(peso) || (peso !== null && (peso < 0.5 || peso > 500))) {
      toast.error('Peso fora da faixa aceitável (0.5-500 kg).'); return;
    }
    const altura = parseOptionalNumber(formData.altura);
    if (Number.isNaN(altura) || (altura !== null && (altura < 20 || altura > 250))) {
      toast.error('Altura fora da faixa aceitável (20-250 cm).'); return;
    }
    const glic = parseOptionalNumber(formData.glicemia);
    if (Number.isNaN(glic) || (glic !== null && (glic < 10 || glic > 900))) {
      toast.error('Glicemia fora da faixa (10-900 mg/dL).'); return;
    }
    const dor = parseOptionalNumber(formData.dor_escala);
    if (Number.isNaN(dor) || (dor !== null && (!Number.isInteger(dor) || dor < 0 || dor > 10))) {
      toast.error('Escala de dor deve estar entre 0 e 10.'); return;
    }

    saveLock.current = true;
    setIsSaving(true);
    try {
      if (formData.agendamento_id) {
        const { data: triagemExistente, error: erroTriagemExistente } = await supabase
          .from('triagens')
          .select('id')
          .eq('clinica_id', profile.clinica_id)
          .eq('agendamento_id', formData.agendamento_id)
          .limit(1)
          .maybeSingle();
        if (erroTriagemExistente) throw erroTriagemExistente;
        if (triagemExistente) {
          toast.error('Este agendamento já tem uma triagem registrada.', {
            description: 'Atualize a lista e abra o registro existente antes de criar outra ficha.',
          });
          return;
        }
      }

      const imc = calcularIMC(formData.peso, formData.altura);
      const { error } = await supabase.from('triagens').insert([{
        paciente_id: formData.paciente_id,
        agendamento_id: formData.agendamento_id || null,
        enfermeiro_id: user?.id || '',
        pressao_arterial: formData.pressao_arterial,
        frequencia_cardiaca: fc,
        frequencia_respiratoria: fr,
        temperatura: temp,
        saturacao: sat,
        peso,
        altura,
        imc: imc,
        glicemia: glic,
        dor_escala: dor,
        queixa_principal: formData.queixa_principal,
        classificacao_risco: formData.classificacao_risco,
        observacoes: formData.observacoes || null,
        data_hora: new Date().toISOString(),
        clinica_id: profile?.clinica_id || null,
      }] as any).select('id').single();
      if (error) throw error;

      const acoesComplementares: string[] = [];
      const avisosComplementares: string[] = [];

      // O registro clínico já está salvo. Falhas nas etapas operacionais
      // seguintes devem virar um aviso recuperável, não um erro que sugira
      // repetir a triagem e gere registros clínicos duplicados.
      if (formData.agendamento_id) {
        let filaAtualizada = false;
        try {
          const triagemResult = await autoTriagemParaFila({
            agendamentoId: formData.agendamento_id,
            classificacaoRisco: formData.classificacao_risco,
            clinicaId: profile?.clinica_id,
          });
          if (!triagemResult.success) throw new Error(triagemResult.message);
          acoesComplementares.push(...triagemResult.actions);
          filaAtualizada = true;
        } catch (error) {
          const detalhe = error instanceof Error ? error.message : 'Erro desconhecido';
          avisosComplementares.push(`A fila não foi atualizada (${detalhe}). Verifique a Fila de Atendimento.`);
        }

        // Auto-notify doctor for urgent cases. A falha no aviso não desfaz a
        // triagem nem a entrada na fila, que já foram registradas.
        if (filaAtualizada && (formData.classificacao_risco === 'vermelho' || formData.classificacao_risco === 'laranja')) {
          try {
            const ag = agendamentos.find(a => a.id === formData.agendamento_id);
            if (ag) {
              const pac = (ag as any).pacientes;
              const notificacaoResult = await autoNotificarMedico({
                medicoId: ag.medico_id,
                pacienteNome: pac?.nome_social || pac?.nome || 'Paciente',
                motivo: `Triagem ${formData.classificacao_risco.toUpperCase()} — PA: ${formData.pressao_arterial}, FC: ${formData.frequencia_cardiaca || '—'}`,
              });
              if (notificacaoResult.success) {
                acoesComplementares.push(...notificacaoResult.actions);
              } else {
                avisosComplementares.push(`Médico não notificado: ${notificacaoResult.message}.`);
              }
            }
          } catch (error) {
            const detalhe = error instanceof Error ? error.message : 'Erro desconhecido';
            avisosComplementares.push(`Médico não notificado: ${detalhe}.`);
          }
        }
      }

      toast.success('Triagem registrada!', {
        description: [...acoesComplementares, ...avisosComplementares].join(' • ') || undefined,
        duration: avisosComplementares.length ? 10000 : 5000,
      });

      queryClient.invalidateQueries({ queryKey: ['triagens'] });
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setIsDialogOpen(false);
    } catch (e: any) {
      if (e?.code === '23505' && (
        e?.constraint === 'triagem_agendamento_unico' ||
        String(e?.message || '').includes('já possui uma triagem')
      )) {
        toast.error('Este agendamento já tem uma triagem registrada.', {
          description: 'Atualize a lista e abra o registro existente para evitar uma ficha duplicada.',
        });
      } else {
        toast.error('Erro: ' + e.message);
      }
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const getPacienteNome = (triagem: any) =>
    triagem.pacientes?.nome_social || triagem.pacientes?.nome || '—';

  const triagemHoje = triagens.filter(t => ocorreuNaDataDaClinica(t.data_hora, today));
  const filtered = triagemHoje.filter(t => {
    if (filterRisco !== 'todos' && t.classificacao_risco !== filterRisco) return false;
    if (search.trim()) {
      // Antes comparava só o nome, com toLowerCase e sem acento: quem chegasse
      // com o documento na mão e digitasse o CPF não achava ninguém na fila de
      // triagem, embora achasse na recepção. Mesma regra em todas as telas.
      if (!t.pacientes || !pacienteCorresponde(t.pacientes, search)) return false;
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
            {format(parseDateOnly(today)!, "EEEE, dd 'de' MMMM", { locale: ptBR })} • Protocolo Manchester
            {!erroTriagens && !agendamentosQuery.isError && pendingTriagemCount > 0 && (
              <Badge variant="secondary" className="text-xs bg-warning/10 text-warning border-warning/20">
                {pendingTriagemCount} pendente{pendingTriagemCount > 1 ? 's' : ''}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            aria-label="Atualizar triagens"
            variant="outline"
            size="icon"
            onClick={() => {
              void triagensQuery.refetch();
              void agendamentosQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4" /> Nova Triagem
          </Button>
        </div>
      </div>

      {/* ─── Fila da enfermagem ───
          Quem chegou e ainda não foi triado, com o botão que abre a ficha já
          apontando para o paciente certo. */}
      {agendamentosQuery.isError && (
        <ErrorState compact title="Não foi possível carregar os agendamentos de hoje" description="A lista de pacientes aguardando triagem está indisponível. Atualize antes de registrar uma triagem vinculada à agenda." error={agendamentosQuery.error} onRetry={() => void agendamentosQuery.refetch()} />
      )}
      {erroTriagens && (
        <ErrorState compact title="Não foi possível carregar as triagens registradas" description="A lista de pacientes pendentes e os totais por risco podem estar incompletos." error={triagensQuery.error} onRetry={() => void triagensQuery.refetch()} />
      )}
      {!erroTriagens && triagens.length >= MAX_LINHAS_AUTO && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A consulta de hoje atingiu o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} triagens. Os totais por risco e a lista podem estar incompletos.</p>
        </div>
      )}

      {!erroTriagens && !agendamentosQuery.isError && aguardandoTriagem.length > 0 && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 space-y-2">
          <p className="text-xs font-medium text-info flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" />
            {aguardandoTriagem.length === 1
              ? '1 paciente aguardando triagem'
              : `${aguardandoTriagem.length} pacientes aguardando triagem`}
          </p>
          <div className="space-y-1.5 pt-1">
            {aguardandoTriagem.slice(0, 12).map((ag: any) => {
              const pac = (ag as any).pacientes;
              return (
                <div key={ag.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pac?.nome_social || pac?.nome || 'Paciente'}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {String(ag.hora_inicio).slice(0, 5)} · {ag.tipo || 'consulta'}
                    </p>
                  </div>
                  <Button
                    size="sm" className="h-7 gap-1 text-xs shrink-0"
                    onClick={() => handleOpenDialog(ag.paciente_id, ag.id)}
                  >
                    <Activity className="h-3 w-3" /> Triar
                  </Button>
                </div>
              );
            })}
            {aguardandoTriagem.length > 12 && (
              <p className="px-3 text-[10px] text-muted-foreground">
                e mais {aguardandoTriagem.length - 12}…
              </p>
            )}
          </div>
        </div>
      )}

      {/* Risk summary */}
      {!erroTriagens && <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-wrap gap-3">
        {stats.filter(s => s.count > 0).map(s => (
          <motion.button key={s.risco} variants={fadeUp}
            onClick={() => setFilterRisco(filterRisco === s.risco ? 'todos' : s.risco)}
            aria-pressed={filterRisco === s.risco}
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
        {triagemHoje.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">Nenhuma triagem registrada hoje</p>
        )}
      </motion.div>}

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
            {erroTriagens ? (
              <p className="p-6 text-sm text-muted-foreground">Os registros não foram exibidos porque a consulta falhou. Use o aviso acima para tentar novamente.</p>
            ) : isLoading ? (
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
                {triagemHoje.length === 0 ? (
                  <>
                    <p className="font-semibold text-foreground">Nenhuma triagem registrada hoje</p>
                    <p className="text-sm text-muted-foreground mt-1">Registre a primeira triagem do dia</p>
                    <Button className="mt-4 gap-2" onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4" /> Registrar Triagem
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-foreground">Nenhuma triagem corresponde à busca e aos filtros</p>
                    <Button className="mt-4" variant="outline" onClick={() => { setSearch(''); setFilterRisco('todos'); }}>
                      Limpar filtros
                    </Button>
                  </>
                )}
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
                              <span className="font-medium text-sm">{getPacienteNome(t)}</span>
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
                            {horaDaClinica(t.data_hora)}
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
      <Dialog open={isDialogOpen} onOpenChange={open => {
        if (open || !isSaving) setIsDialogOpen(open);
      }}>
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
                <Label htmlFor="triagem-paciente">Paciente *</Label>
                <PacienteCombobox
                  id="triagem-paciente"
                  value={formData.paciente_id}
                  disabled={isSaving}
                  placeholder="Buscar por nome, CPF ou telefone..."
                  onChange={(pacienteId) => setFormData(prev => {
                    const agendamentoAtual = agendamentos.find((ag: any) => ag.id === prev.agendamento_id);
                    return {
                      ...prev,
                      paciente_id: pacienteId,
                      agendamento_id: agendamentoAtual && agendamentoAtual.paciente_id !== pacienteId
                        ? ''
                        : prev.agendamento_id,
                    };
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="triagem-agendamento">Agendamento</Label>
                <Select value={formData.agendamento_id || '__none__'} onValueChange={v => setFormData(prev => {
                  const agendamento = v === '__none__'
                    ? null
                    : agendamentos.find((ag: any) => ag.id === v);
                  return {
                    ...prev,
                    agendamento_id: agendamento?.id || '',
                    paciente_id: agendamento?.paciente_id || prev.paciente_id,
                  };
                })}>
                  <SelectTrigger id="triagem-agendamento" disabled={isSaving || agendamentosQuery.isLoading || agendamentosQuery.isError}><SelectValue placeholder="Opcional..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {agendamentos.map(ag => {
                      const pacienteAgendamento = (ag as any).pacientes;
                      const medicoAgendamento = (ag as any).medicos;
                      return <SelectItem key={ag.id} value={ag.id}>
                        {ag.hora_inicio?.slice(0, 5)} — {pacienteAgendamento?.nome_social || pacienteAgendamento?.nome || 'Paciente'}
                        {' · '}{ag.tipo || 'consulta'}
                        {medicoAgendamento && ` · ${medicoAgendamento.nome || medicoAgendamento.crm}`}
                      </SelectItem>;
                    })}
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
                <VitalInput icon={Heart} label="Pressão Arterial *" value={formData.pressao_arterial} onChange={setField('pressao_arterial')} placeholder="120/80" unit="mmHg" color="text-destructive" inputMode="text" />
                <VitalInput icon={Activity} label="Freq. Cardíaca" value={formData.frequencia_cardiaca} onChange={setField('frequencia_cardiaca')} placeholder="80" unit="bpm" color="text-primary" />
                <VitalInput icon={Wind} label="Freq. Respiratória" value={formData.frequencia_respiratoria} onChange={setField('frequencia_respiratoria')} placeholder="16" unit="irpm" />
                <VitalInput icon={Thermometer} label="Temperatura" value={formData.temperatura} onChange={setField('temperatura')} placeholder="36,5" unit="°C" color={parseValorClinico(formData.temperatura) >= 37.5 ? 'text-destructive' : 'text-muted-foreground'} />
                <VitalInput icon={Droplets} label="Saturação O₂" value={formData.saturacao} onChange={setField('saturacao')} placeholder="98" unit="%" color={parseValorClinico(formData.saturacao) < 94 ? 'text-destructive' : 'text-success'} inputMode="numeric" />
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
                    type="button"
                    key={key}
                    aria-pressed={formData.classificacao_risco === key}
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
                    {/* Prazo-alvo do protocolo: o enfermeiro classifica com o
                        relógio na mão, não decorado. */}
                    <span className="text-[11px] font-normal opacity-80">
                      ({cfg.sublabel})
                    </span>
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
            <Button variant="outline" disabled={isSaving} onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving || erroTriagens || (!!formData.agendamento_id && (agendamentosQuery.isLoading || agendamentosQuery.isError))} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar Triagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
