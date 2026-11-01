import React, { useState, useMemo, useCallback, useId, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Activity, Heart, Scale, Loader2, Search, Thermometer,
  Wind, Droplets, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  ArrowUpRight, User, Stethoscope, X, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { PendentesTriagem } from '@/components/triagem/PendentesTriagem';
import { dateOnlyInTimeZone, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { buildTriagensFilters, filtrarAgendamentosAguardandoTriagem, temCheckinAtivo } from '@/lib/triageQueue';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { formatWithDatePreference } from '@/lib/datePreference';

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
// Tons selecionados mantêm os matizes Manchester e contraste AA com rótulos brancos.
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
    bg: 'bg-orange-700 text-white',
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
    bg: 'bg-green-700 text-white',
    border: 'border-green-400',
    light: 'bg-green-50 border-green-200',
    dot: 'bg-green-500',
  },
  azul: {
    label: 'Não Urgente',
    sublabel: '240 min',
    bg: 'bg-blue-700 text-white',
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

const textoDoValor = (valor: unknown) => (valor === null || valor === undefined ? '' : String(valor).replace('.', ','));

/** Ficha gravada → formulário, para corrigir sem redigitar tudo. */
function formDaTriagem(t: any): TriagemForm {
  return {
    paciente_id: t.paciente_id || '',
    agendamento_id: t.agendamento_id || '',
    pressao_arterial: t.pressao_arterial || '',
    frequencia_cardiaca: textoDoValor(t.frequencia_cardiaca),
    frequencia_respiratoria: textoDoValor(t.frequencia_respiratoria),
    temperatura: textoDoValor(t.temperatura),
    saturacao: textoDoValor(t.saturacao),
    peso: textoDoValor(t.peso),
    altura: textoDoValor(t.altura),
    queixa_principal: t.queixa_principal || '',
    classificacao_risco: (t.classificacao_risco || '') as Risco | '',
    observacoes: t.observacoes || '',
    glicemia: textoDoValor(t.glicemia),
    dor_escala: textoDoValor(t.dor_escala),
  };
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
export default function TriagemPage({ creationPage = false }: { creationPage?: boolean }) {
  const { hasAnyRole } = useSupabaseAuth();
  const podeRegistrarTriagem = hasAnyRole(['admin', 'medico', 'enfermagem']);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<TriagemForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const completed = useRef(false);
  const formBaseline = useRef<TriagemForm>(emptyForm);
  const formSeeded = useRef(false);
  const [search, setSearch] = useState('');
  const [filterRisco, setFilterRisco] = useState<'todos' | Risco>('todos');

  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const { isMedicoOnly } = useCurrentMedico();
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  React.useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const inicioDoDia = new Date(`${today}T00:00:00-03:00`).toISOString();
  const proximoDiaUtc = new Date(`${today}T00:00:00Z`);
  proximoDiaUtc.setUTCDate(proximoDiaUtc.getUTCDate() + 1);
  const inicioDoProximoDia = new Date(`${proximoDiaUtc.toISOString().slice(0, 10)}T00:00:00-03:00`).toISOString();
  const agendamentosQuery = useAgendamentos(today);
  const { data: agendamentos = [] } = agendamentosQuery;
  const filaQuery = useSupabaseQuery<any>('fila_atendimento', {
    select: 'id, agendamento_id, status, horario_chegada',
    filters: [
      { column: 'horario_chegada', operator: 'gte', value: inicioDoDia },
      { column: 'horario_chegada', operator: 'lt', value: inicioDoProximoDia },
    ],
    staleTime: 1000 * 15,
  });
  const { data: fila = [] } = filaQuery;
  const agendamentoIdsDoMedico = useMemo(() => agendamentos.map((ag: any) => ag.id), [agendamentos]);
  const triagensQuery = useSupabaseQuery<any>('triagens', {
    select: '*, pacientes(id,nome,nome_social,cpf,telefone,email)',
    orderBy: { column: 'data_hora', ascending: false },
    filters: buildTriagensFilters(inicioDoDia, inicioDoProximoDia, isMedicoOnly, agendamentoIdsDoMedico),
    enabled: !isMedicoOnly || (agendamentosQuery.isSuccess && agendamentoIdsDoMedico.length > 0),
    staleTime: 1000 * 15,
  });
  const triagensAvulsasQuery = useSupabaseQuery<any>('triagens', {
    select: '*, pacientes(id,nome,nome_social,cpf,telefone,email)',
    orderBy: { column: 'data_hora', ascending: false },
    filters: [
      { column: 'data_hora', operator: 'gte', value: inicioDoDia },
      { column: 'data_hora', operator: 'lt', value: inicioDoProximoDia },
      { column: 'enfermeiro_id', operator: 'eq', value: user?.id },
      { column: 'agendamento_id', operator: 'is', value: null },
    ],
    enabled: isMedicoOnly && Boolean(user?.id),
    staleTime: 1000 * 15,
  });
  const triagens = useMemo(() => {
    const registros = [...(triagensQuery.data ?? []), ...(triagensAvulsasQuery.data ?? [])];
    return Array.from(new Map(registros.map((triagem: any) => [triagem.id, triagem])).values());
  }, [triagensQuery.data, triagensAvulsasQuery.data]);
  const isLoading = triagensQuery.isLoading || triagensAvulsasQuery.isLoading;
  const erroTriagens = triagensQuery.isError || triagensAvulsasQuery.isError;
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
    return filtrarAgendamentosAguardandoTriagem(agendamentos, fila, [...jaTriados], today);
  }, [agendamentos, fila, triagens, today]);

  const pendingTriagemCount = aguardandoTriagem.length;

  const setField = (field: keyof TriagemForm) => (value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const origem = searchParams.get('origem');
  // Correção de uma ficha já gravada hoje: mesmos campos, UPDATE no lugar de
  // INSERT. Paciente e agendamento não mudam (o banco também barra).
  const corrigirId = creationPage ? searchParams.get('corrigir') : null;
  const triagemEmCorrecao = corrigirId ? triagens.find((t: any) => t.id === corrigirId) ?? null : null;
  const returnPath = origem === 'fila' ? '/fila' : origem === 'recepcao' ? '/recepcao' : '/fila?tab=triagem';
  const formDirty = JSON.stringify(formData) !== JSON.stringify(formBaseline.current);

  const handleOpenTriagePage = useCallback((pacienteId?: string, agendamentoId?: string, origem: 'fila' | 'recepcao' | 'triagem' = 'triagem') => {
    const params = new URLSearchParams({ origem });
    if (pacienteId) params.set('paciente', pacienteId);
    if (agendamentoId) params.set('agendamento', agendamentoId);
    navigate(`/triagem/nova?${params.toString()}`);
  }, [navigate]);

  React.useEffect(() => {
    if (creationPage) return;
    const pacienteId = searchParams.get('paciente');
    const agendamentoId = searchParams.get('agendamento');
    if (!pacienteId || !agendamentoId) return;

    handleOpenTriagePage(pacienteId, agendamentoId);
  }, [creationPage, searchParams, handleOpenTriagePage]);

  React.useEffect(() => {
    if (!creationPage || formSeeded.current || !corrigirId || !triagemEmCorrecao) return;
    const inicial = formDaTriagem(triagemEmCorrecao);
    setFormData(inicial);
    formBaseline.current = inicial;
    formSeeded.current = true;
  }, [creationPage, corrigirId, triagemEmCorrecao]);

  React.useEffect(() => {
    if (!creationPage || formSeeded.current || corrigirId) return;
    const pacienteId = searchParams.get('paciente') || '';
    const agendamentoId = searchParams.get('agendamento') || '';
    if (agendamentoId && agendamentosQuery.isLoading) return;

    const agendamento = agendamentoId
      ? agendamentos.find((item: any) => item.id === agendamentoId)
      : null;
    const initial = {
      ...emptyForm,
      paciente_id: pacienteId || agendamento?.paciente_id || '',
      agendamento_id: agendamentoId,
    };
    setFormData(initial);
    formBaseline.current = initial;
    formSeeded.current = true;

    if (pacienteId || agendamentoId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('paciente');
      nextParams.delete('agendamento');
      setSearchParams(nextParams, { replace: true });
    }
  }, [creationPage, corrigirId, searchParams, setSearchParams, agendamentos, agendamentosQuery.isLoading]);

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
    if (formData.agendamento_id && !corrigirId) {
      const agendamento = agendamentos.find((a: any) => a.id === formData.agendamento_id);
      if (!agendamento || agendamento.paciente_id !== formData.paciente_id) {
        toast.error('O agendamento selecionado não pertence a este paciente.'); return;
      }
    }
    if (formData.agendamento_id && !corrigirId && (filaQuery.isLoading || filaQuery.isError || !temCheckinAtivo(fila, formData.agendamento_id))) {
      toast.error('O paciente precisa fazer check-in na recepção antes da triagem.'); return;
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
      if (corrigirId) {
        const imcCorrigido = calcularIMC(formData.peso, formData.altura);
        const { data: corrigida, error: erroCorrecao } = await supabase.from('triagens').update({
          pressao_arterial: formData.pressao_arterial,
          frequencia_cardiaca: fc,
          frequencia_respiratoria: fr,
          temperatura: temp,
          saturacao: sat,
          peso,
          altura,
          imc: imcCorrigido,
          glicemia: glic,
          dor_escala: dor,
          queixa_principal: formData.queixa_principal,
          classificacao_risco: formData.classificacao_risco,
          observacoes: formData.observacoes || null,
        } as any).eq('id', corrigirId).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
        if (erroCorrecao) throw erroCorrecao;
        if (!corrigida) throw new Error('A ficha não foi encontrada ou seu perfil não pode alterá-la.');

        // Mudou o risco de um paciente que ainda está na fila: a prioridade acompanha.
        const avisos: string[] = [];
        const riscoMudou = triagemEmCorrecao && triagemEmCorrecao.classificacao_risco !== formData.classificacao_risco;
        if (riscoMudou && formData.agendamento_id && temCheckinAtivo(fila, formData.agendamento_id)) {
          const prioridade = await autoTriagemParaFila({
            agendamentoId: formData.agendamento_id,
            classificacaoRisco: formData.classificacao_risco,
            clinicaId: profile.clinica_id,
          });
          if (!prioridade.success) avisos.push(`A prioridade na fila não foi atualizada (${prioridade.message}).`);
        }
        toast.success('Triagem corrigida', { description: avisos.join(' ') || 'A alteração fica no histórico de auditoria.' });
        queryClient.invalidateQueries({ queryKey: ['triagens'] });
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
        completed.current = true;
        navigate(returnPath, { replace: true });
        return;
      }

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
                clinicaId: profile?.clinica_id || '',
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
      completed.current = true;
      if (creationPage) navigate(returnPath, { replace: true });
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
  const urgentesHoje = stats.filter(s => s.risco === 'vermelho' || s.risco === 'laranja').reduce((total, s) => total + s.count, 0);
  const listaAgendaDisponivel = !erroTriagens && !agendamentosQuery.isError && !filaQuery.isError;
  const carregandoAgenda = isLoading || agendamentosQuery.isLoading || filaQuery.isLoading;
  const temFiltro = filterRisco !== 'todos' || search.trim() !== '';
  const limparFiltros = () => { setSearch(''); setFilterRisco('todos'); };

  const descricao = [
    format(parseDateOnly(today)!, "EEEE, dd 'de' MMMM", { locale: ptBR }),
    'Protocolo Manchester',
    listaAgendaDisponivel && !carregandoAgenda ? `${pendingTriagemCount} aguardando` : null,
    !erroTriagens && !isLoading ? `${triagemHoje.length} triado${triagemHoje.length === 1 ? '' : 's'} hoje` : null,
  ].filter(Boolean).join(' · ');

  // IMC live preview
  const imcLive = formData.peso && formData.altura ? calcularIMC(formData.peso, formData.altura) : null;
  const imcInfo = imcLive ? imcClassification(imcLive) : null;
  const triageFields = (
    <div className="space-y-7">
      <section aria-labelledby="triagem-identificacao" className="space-y-3 border-b border-border pb-6">
        <header>
          <h2 id="triagem-identificacao" className="text-sm font-semibold text-foreground">Paciente e consulta</h2>
          <p className="mt-1 text-xs text-muted-foreground">Vincule o atendimento quando o paciente já fez check-in.</p>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="triagem-paciente">Paciente *</Label>
            <PacienteCombobox
              id="triagem-paciente"
              value={formData.paciente_id}
              disabled={isSaving || !!corrigirId}
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
              const agendamento = v === '__none__' ? null : agendamentos.find((ag: any) => ag.id === v);
              return {
                ...prev,
                agendamento_id: agendamento?.id || '',
                paciente_id: agendamento?.paciente_id || prev.paciente_id,
              };
            })}>
              <SelectTrigger id="triagem-agendamento" disabled={isSaving || !!corrigirId || agendamentosQuery.isLoading || agendamentosQuery.isError}>
                <SelectValue placeholder="Opcional..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {aguardandoTriagem.map(ag => {
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
        {corrigirId && <p className="text-xs text-muted-foreground">Na correção, paciente e agendamento continuam os da ficha original.</p>}
        {!corrigirId && formData.agendamento_id && agendamentosQuery.isSuccess && !agendamentos.some((ag: any) => ag.id === formData.agendamento_id) && (
          <p role="alert" className="text-sm text-destructive">Este agendamento não está mais disponível na agenda de hoje. Atualize ou remova o vínculo antes de continuar.</p>
        )}
      </section>

      <section aria-labelledby="triagem-sinais-vitais" className="space-y-3 border-b border-border pb-6">
        <header>
          <h2 id="triagem-sinais-vitais" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity aria-hidden="true" className="h-4 w-4 text-primary" /> Sinais vitais
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Pressão arterial e queixa principal são obrigatórias.</p>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <VitalInput icon={Heart} label="Pressão Arterial *" value={formData.pressao_arterial} onChange={setField('pressao_arterial')} placeholder="120/80" unit="mmHg" color="text-destructive" inputMode="text" />
          <VitalInput icon={Activity} label="Freq. Cardíaca" value={formData.frequencia_cardiaca} onChange={setField('frequencia_cardiaca')} placeholder="80" unit="bpm" color="text-primary" />
          <VitalInput icon={Wind} label="Freq. Respiratória" value={formData.frequencia_respiratoria} onChange={setField('frequencia_respiratoria')} placeholder="16" unit="irpm" />
          <VitalInput icon={Thermometer} label="Temperatura" value={formData.temperatura} onChange={setField('temperatura')} placeholder="36,5" unit="°C" color={parseValorClinico(formData.temperatura) >= 37.5 ? 'text-destructive' : 'text-muted-foreground'} />
          <VitalInput icon={Droplets} label="Saturação O₂" value={formData.saturacao} onChange={setField('saturacao')} placeholder="98" unit="%" color={parseValorClinico(formData.saturacao) < 94 ? 'text-destructive' : 'text-success'} inputMode="numeric" />
          <VitalInput icon={Activity} label="Glicemia" value={formData.glicemia} onChange={setField('glicemia')} placeholder="100" unit="mg/dL" />
        </div>
      </section>

      <section aria-labelledby="triagem-antropometria" className="space-y-3 border-b border-border pb-6">
        <header>
          <h2 id="triagem-antropometria" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Scale aria-hidden="true" className="h-4 w-4 text-primary" /> Antropometria
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">O IMC é calculado automaticamente a partir do peso e da altura.</p>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <VitalInput icon={Scale} label="Peso" value={formData.peso} onChange={setField('peso')} placeholder="70" unit="kg" />
          <VitalInput icon={ArrowUpRight} label="Altura" value={formData.altura} onChange={setField('altura')} placeholder="170" unit="cm" />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">IMC calculado</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3" aria-live="polite">
              {imcLive ? <span className="text-sm font-semibold">{imcLive} <span className={cn('ml-1 text-xs font-normal', imcInfo?.color)}>{imcInfo?.label}</span></span> : <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="triagem-risco" className="space-y-3 border-b border-border pb-6">
        <header>
          <h2 id="triagem-risco" className="text-sm font-semibold text-foreground">Classificação de risco (Manchester) *</h2>
          <p className="mt-1 text-xs text-muted-foreground">Selecione a prioridade clínica definida pelo profissional.</p>
        </header>
        <div role="group" aria-labelledby="triagem-risco" className="flex flex-wrap gap-2">
          {Object.entries(RISCO).map(([key, cfg]) => (
            <button
              type="button"
              key={key}
              aria-pressed={formData.classificacao_risco === key}
              onClick={() => setField('classificacao_risco')(key)}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                formData.classificacao_risco === key
                  ? cn(cfg.bg, 'border-current ring-2 ring-current ring-offset-1')
                  : cn(cfg.light, cfg.border, 'hover:border-current'),
              )}
            >
              <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', cfg.dot)} />
              {cfg.label}
              <span className="text-[11px] font-normal opacity-80">({cfg.sublabel})</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="triagem-queixa-heading" className="space-y-3">
        <header>
          <h2 id="triagem-queixa-heading" className="text-sm font-semibold text-foreground">Queixa e observações</h2>
          <p className="mt-1 text-xs text-muted-foreground">Registre o relato informado e as observações necessárias para o atendimento.</p>
        </header>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="triagem-queixa">Queixa principal *</Label>
            <Input id="triagem-queixa" value={formData.queixa_principal} onChange={e => setField('queixa_principal')(e.target.value)} placeholder="Descreva a queixa principal..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="triagem-dor">Dor (0–10)</Label>
            <Input id="triagem-dor" type="number" min="0" max="10" value={formData.dor_escala} onChange={e => setField('dor_escala')(e.target.value)} placeholder="0 = sem dor, 10 = pior dor" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="triagem-observacoes">Observações</Label>
            <Textarea id="triagem-observacoes" value={formData.observacoes} onChange={e => setField('observacoes')(e.target.value)} placeholder="Informações adicionais..." rows={3} />
          </div>
        </div>
      </section>
    </div>
  );

  if (creationPage) {
    return (
      <div className="space-y-6 pb-8">
        <UnsavedChangesGuard dirty={formDirty} busy={isSaving} completed={completed} />
        <PageHeader
          title={corrigirId ? 'Corrigir triagem' : 'Nova triagem'}
          description={corrigirId ? 'Ajuste os dados da ficha registrada hoje. A alteração fica no histórico de auditoria.' : 'Classifique o risco e registre os sinais vitais do paciente.'}
          icon={<Activity />}
          actions={<Button asChild variant="outline" className="gap-2 rounded-full"><Link to={returnPath}><Stethoscope aria-hidden="true" className="h-4 w-4" /> Voltar à fila</Link></Button>}
        />
        {agendamentosQuery.isError && <ErrorState compact title="Não foi possível carregar os agendamentos de hoje" description="A seleção de uma triagem vinculada está pausada até a agenda ser atualizada." error={agendamentosQuery.error} onRetry={() => void agendamentosQuery.refetch()} />}
        {filaQuery.isError && <ErrorState compact title="Não foi possível confirmar o check-in" description="Atualize a fila antes de registrar uma triagem vinculada a um agendamento." error={filaQuery.error} onRetry={() => void filaQuery.refetch()} />}
        {erroTriagens && <ErrorState compact title="Não foi possível conferir duplicidade de triagem" description="A gravação fica bloqueada até que os registros existentes possam ser consultados." error={triagensQuery.error || triagensAvulsasQuery.error} onRetry={() => { void triagensQuery.refetch(); void triagensAvulsasQuery.refetch(); }} />}
        <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="space-y-6">
          <div className="max-w-5xl rounded-xl border border-border bg-card px-4 py-5 sm:px-6">
            {triageFields}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="rounded-full" disabled={isSaving} onClick={() => navigate(returnPath)}>Cancelar</Button>
            <Button type="submit" disabled={!podeRegistrarTriagem || isSaving || erroTriagens || (!!corrigirId && !triagemEmCorrecao) || (!corrigirId && !!formData.agendamento_id && (agendamentosQuery.isLoading || agendamentosQuery.isError || filaQuery.isLoading || filaQuery.isError))} className="gap-2 rounded-full bg-primary text-primary-foreground shadow-none hover:bg-primary/90">
              {isSaving && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {corrigirId ? 'Salvar correção' : 'Registrar triagem'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Triagem"
        description={(
          <>
            <span className="hidden min-[400px]:inline">{descricao}</span>
            <span className="min-[400px]:hidden">
              {formatWithDatePreference(parseDateOnly(today)!, 'dd/MM', { locale: ptBR })}
              {listaAgendaDisponivel && !carregandoAgenda ? ` · ${pendingTriagemCount} aguardando` : ''}
              {!erroTriagens && !isLoading ? ` · ${triagemHoje.length} triados` : ''}
              {' · Manchester'}
            </span>
          </>
        )}
        icon={<Activity />}
        className="sm:items-center"
        actions={(
          <>
            <Button asChild variant="outline" className="gap-2 rounded-full">
              <Link to="/fila"><Stethoscope className="h-4 w-4" /> Fila de atendimento</Link>
            </Button>
            <Button
              aria-label="Atualizar triagens"
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={() => {
                void triagensQuery.refetch();
                void triagensAvulsasQuery.refetch();
                void agendamentosQuery.refetch();
                void filaQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {podeRegistrarTriagem && <Button className="gap-2 rounded-lg bg-primary text-primary-foreground shadow-none hover:bg-primary/90" onClick={() => handleOpenTriagePage()}>
              <Plus className="h-4 w-4" /> Nova Triagem
            </Button>}
          </>
        )}
      />

      {/* ─── Fila da enfermagem ───
          Quem chegou e ainda não foi triado, com o botão que abre a ficha já
          apontando para o paciente certo. */}
      {agendamentosQuery.isError && (
        <ErrorState compact title="Não foi possível carregar os agendamentos de hoje" description="A lista de pacientes aguardando triagem está indisponível. Atualize antes de registrar uma triagem vinculada à agenda." error={agendamentosQuery.error} onRetry={() => void agendamentosQuery.refetch()} />
      )}
      {erroTriagens && (
        <ErrorState compact title="Não foi possível carregar as triagens registradas" description="A lista de pacientes pendentes e os totais por risco podem estar incompletos." error={triagensQuery.error || triagensAvulsasQuery.error} onRetry={() => { void triagensQuery.refetch(); void triagensAvulsasQuery.refetch(); }} />
      )}
      {filaQuery.isError && (
        <ErrorState compact title="Não foi possível confirmar a chegada dos pacientes" description="A lista de triagem foi pausada para evitar atender quem ainda não fez check-in." error={filaQuery.error} onRetry={() => void filaQuery.refetch()} />
      )}
      {!erroTriagens && triagens.length >= MAX_LINHAS_AUTO && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A consulta de hoje atingiu o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} triagens. Os totais por risco e a lista podem estar incompletos.</p>
        </div>
      )}

      {listaAgendaDisponivel && (
        <PendentesTriagem
          loading={carregandoAgenda}
          appointments={aguardandoTriagem}
          onTriage={(pacienteId, agendamentoId) => handleOpenTriagePage(pacienteId, agendamentoId, 'triagem')}
        />
      )}

      {/* Indicadores do dia */}
      <section aria-label="Indicadores da triagem" className="grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="min-w-0 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Aguardando triagem</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span aria-live="polite" className="text-2xl font-semibold tabular-nums text-foreground">{listaAgendaDisponivel && !carregandoAgenda ? pendingTriagemCount : '—'}</span>
            <span className="text-xs text-muted-foreground">com check-in e sem triagem</span>
          </p>
        </div>
        <button
          type="button"
          aria-pressed={filterRisco === 'todos'}
          onClick={() => setFilterRisco('todos')}
          className={cn('min-w-0 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset', filterRisco === 'todos' && 'bg-primary/5')}
        >
          <span className="block text-xs font-medium text-muted-foreground">Triados hoje</span>
          <span className="mt-1 flex items-baseline gap-2">
            <span aria-live="polite" className="text-2xl font-semibold tabular-nums text-foreground">{erroTriagens || isLoading ? '—' : triagemHoje.length}</span>
            <span className="text-xs text-muted-foreground">todas as classificações</span>
          </span>
        </button>
        <div className="min-w-0 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Urgentes</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span aria-live="polite" className={cn('text-2xl font-semibold tabular-nums', urgentesHoje > 0 ? 'text-destructive' : 'text-foreground')}>{erroTriagens || isLoading ? '—' : urgentesHoje}</span>
            <span className="text-xs text-muted-foreground">emergência e muito urgente</span>
          </p>
        </div>
      </section>

      {/* Lista de triagens do dia */}
      <Card className="rounded-xl border-border shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 w-full rounded-lg pl-9 focus-visible:ring-primary" placeholder="Buscar paciente..." aria-label="Buscar triagem por paciente" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {!erroTriagens && !isLoading && (
              <p className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
                {filtered.length} de {triagemHoje.length}
              </p>
            )}
          </div>

          {/* Filtro por classificação (cores do protocolo Manchester) */}
          {!erroTriagens && (
            <div role="group" aria-label="Filtrar por classificação de risco" className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={filterRisco === 'todos'}
                onClick={() => setFilterRisco('todos')}
                className={cn(
                  'h-9 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  filterRisco === 'todos'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                )}
              >
                Todos <span className="ml-1 tabular-nums">{triagemHoje.length}</span>
              </button>
              {stats.map(s => (
                <button
                  type="button"
                  key={s.risco}
                  aria-pressed={filterRisco === s.risco}
                  onClick={() => setFilterRisco(filterRisco === s.risco ? 'todos' : s.risco)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    filterRisco === s.risco ? cn(s.cfg.bg, 'border-transparent') : cn(s.cfg.light, s.cfg.border),
                    s.count === 0 && filterRisco !== s.risco && 'opacity-60',
                  )}
                >
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', filterRisco === s.risco ? 'bg-current' : s.cfg.dot)} />
                  {s.cfg.label}
                  <span className="tabular-nums">{s.count}</span>
                </button>
              ))}
              {temFiltro && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
            </div>
          )}

          {erroTriagens ? (
            <p className="py-6 text-sm text-muted-foreground">Os registros não foram exibidos porque a consulta falhou. Use o aviso acima para tentar novamente.</p>
          ) : isLoading ? (
            <div className="space-y-3">
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Activity aria-hidden="true" className="h-5 w-5" />
              </div>
              {triagemHoje.length === 0 ? (
                <>
                  <p className="font-semibold text-foreground">Nenhuma triagem registrada hoje</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pendingTriagemCount > 0
                      ? 'Os pacientes aguardando triagem estão listados acima, em ordem de horário.'
                      : 'Os registros aparecerão aqui depois de salvar uma triagem.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-foreground">Nenhuma triagem corresponde à busca e aos filtros</p>
                  <Button className="mt-4 gap-2 rounded-full" variant="outline" onClick={limparFiltros}>
                    <X aria-hidden="true" className="h-4 w-4" /> Limpar filtros
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Paciente</TableHead>
                    <TableHead>Risco</TableHead>
                    <TableHead className="hidden md:table-cell">PA</TableHead>
                    <TableHead className="hidden md:table-cell">FC</TableHead>
                    <TableHead className="hidden md:table-cell">Temp</TableHead>
                    <TableHead className="hidden lg:table-cell">SpO₂</TableHead>
                    <TableHead className="hidden lg:table-cell">IMC</TableHead>
                    <TableHead>Queixa</TableHead>
                    <TableHead>Hora</TableHead>
                    {podeRegistrarTriagem && <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(t => {
                    const risco = t.classificacao_risco as Risco;
                    const cfg = RISCO[risco] ?? RISCO.verde;
                    return (
                      <TableRow key={t.id} className="border-b border-border/40 transition-colors hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="font-medium text-sm">{getPacienteNome(t)}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground md:hidden">
                            <span>PA: <strong className="text-foreground">{t.pressao_arterial || '—'}</strong></span>
                            <span>FC: <strong className="text-foreground">{t.frequencia_cardiaca ? `${t.frequencia_cardiaca} bpm` : '—'}</strong></span>
                            <span>Temp: <strong className="text-foreground">{t.temperatura ? `${t.temperatura}°C` : '—'}</strong></span>
                            <span>SpO₂: <strong className="text-foreground">{t.saturacao ? `${t.saturacao}%` : '—'}</strong></span>
                            <span>IMC: <strong className="text-foreground">{t.imc ?? '—'}</strong></span>
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
                        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {horaDaClinica(t.data_hora)}
                        </TableCell>
                        {podeRegistrarTriagem && (
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5 rounded-full text-xs">
                              <Link to={`/triagem/nova?corrigir=${t.id}&origem=triagem`} aria-label={`Corrigir triagem de ${getPacienteNome(t)}`}>
                                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />Corrigir
                              </Link>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
