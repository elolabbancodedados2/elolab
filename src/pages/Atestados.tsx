import { formatWithDatePreference as format } from '@/lib/datePreference';
import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Eye, Printer, FileText, Loader2, Star,
  Clock, Calendar, AlertTriangle, ShieldCheck, Clipboard,
  BookOpen, X, FileSignature, RefreshCw, MessageCircle, CalendarCheck,
} from 'lucide-react';
import { linkWhatsApp } from '@/lib/whatsapp';
import { addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { gerarAtestado, marcarComoPrevia, openPDF } from '@/lib/pdfGenerator';
import { legendaVariaveisAtestado, substituirVariaveisAtestado } from '@/lib/variaveisAtestado';
import { Skeleton } from '@/components/ui/skeleton';
import { Cid10Search } from '@/components/clinical';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { atestadoTemplateVersionLabel, selectedAtestadoTemplateId } from '@/lib/atestadoTemplateProvenance';
import { registrarAcessoDocumentoClinico } from '@/lib/clinicalDocumentAudit';

interface Atestado {
  id: string;
  tipo: string | null;
  paciente_id: string;
  medico_id: string;
  data_emissao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  dias: number | null;
  motivo: string | null;
  cid: string | null;
  observacoes: string | null;
  modelo_atestado_id?: string | null;
  modelo_atestado_nome?: string | null;
  modelo_atestado_atualizado_em?: string | null;
  created_at: string | null;
  pacientes?: { nome: string; nome_social?: string | null; cpf?: string | null; telefone?: string | null } | null;
}

interface FormDataType {
  tipo: string;
  paciente_id: string;
  medico_id: string;
  data_emissao: string;
  data_inicio: string;
  data_fim: string;
  dias: number | null;
  cid: string;
  incluirCid: boolean;
  motivo: string;
  observacoes: string;
  finalidade: string;
  hora_inicio: string;
  hora_fim: string;
}

const novoFormulario = (today: string): FormDataType => ({
  tipo: 'comparecimento', paciente_id: '', medico_id: '',
  data_emissao: today,
  data_inicio: today, data_fim: '',
  dias: null, cid: '', incluirCid: false, motivo: '',
  observacoes: '', finalidade: '', hora_inicio: '', hora_fim: '',
});

const TIPOS_ATESTADO = [
  { value: 'comparecimento', label: 'Atestado de Comparecimento', icon: Clock },
  { value: 'afastamento', label: 'Atestado Médico (Afastamento)', icon: Calendar },
  { value: 'aptidao', label: 'Atestado de Aptidão Física', icon: ShieldCheck },
  { value: 'acompanhante', label: 'Declaração de Acompanhante', icon: FileText },
];

const getTipoLabelStatic = (tipo: string | null) => TIPOS_ATESTADO.find(t => t.value === tipo)?.label || tipo;

const FINALIDADES_APTIDAO = [
  'Apto para prática de atividades físicas moderadas',
  'Apto para prática de atividades físicas intensas',
  'Apto para concurso público',
  'Apto para atividades laborais',
  'Apto para viagem',
];

type FiltroPeriodoAtestado = 'todos' | 'hoje' | '7d' | '30d' | 'cid';

const diasDesde = (dataEmissao: string | null | undefined, hoje: string): number | null => {
  if (!dataEmissao) return null;
  const inicio = new Date(`${dataEmissao}T12:00:00`).getTime();
  const fim = new Date(`${hoje}T12:00:00`).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  return Math.round((fim - inicio) / 86_400_000);
};

/** Afastamento cujo período inclui a data de hoje. */
const afastamentoVigente = (atestado: Atestado, hoje: string) =>
  atestado.tipo === 'afastamento' && !!atestado.data_inicio && !!atestado.data_fim
  && atestado.data_inicio <= hoje && atestado.data_fim >= hoje;

export default function Atestados({ creationPage = false }: { creationPage?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { certificateId } = useParams();
  const taskPage = creationPage || !!certificateId;
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [searchTerm, setSearchTerm] = useState<string>(() => location.state?.certificateFilters?.search || '');
  const [tipoFiltro, setTipoFiltro] = useState<string>(() => location.state?.certificateFilters?.type || 'todos');
  const [periodoFiltro, setPeriodoFiltro] = useState<FiltroPeriodoAtestado>(() => location.state?.certificateFilters?.period || 'todos');
  // Deep-link: /documentos-clinicos?tab=atestados&paciente=<id> abre a lista já filtrada pelo paciente.
  const [searchParams, setSearchParams] = useSearchParams();
  const pacienteFiltroId = searchParams.get('paciente');
  const agendamentoOrigemId = creationPage ? searchParams.get('agendamento') : null;
  const limparPacienteFiltro = () => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    next.delete('paciente');
    return next;
  }, { replace: true });
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormDataType>(() => novoFormulario(today));
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const formBaselineRef = useRef<FormDataType>(formData);
  const completed = useRef(false);
  const initializedTask = useRef('');
  const [readyFor, setReadyFor] = useState('');
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(formBaselineRef.current);
  const { profile } = useSupabaseAuth();

  const queryClient = useQueryClient();
  const { currentMedico, medicoId, isMedicoOnly, isLoading: loadingCurrentMedico, error: currentMedicoError, refetch: refetchCurrentMedico } = useCurrentMedico();
  const sourceId = certificateId || (creationPage ? searchParams.get('origem') : null);
  const recordQuery = useQuery({
    queryKey: ['atestado-pagina', profile?.clinica_id, profile?.id, sourceId, location.key],
    enabled: !!sourceId && !!profile?.clinica_id && (!isMedicoOnly || !!medicoId),
    queryFn: async () => {
      let query = supabase.from('atestados').select('*, pacientes(nome,nome_social,cpf,telefone)')
        .eq('clinica_id', profile!.clinica_id!).eq('id', sourceId!);
      if (isMedicoOnly) query = query.eq('medico_id', medicoId!);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (data) await registrarAcessoDocumentoClinico('atestado', data.id, 'visualizacao');
      return data as Atestado | null;
    },
    staleTime: Infinity, gcTime: 0, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const selectedAtestado = recordQuery.data;
  const certificateFilters = { search: searchTerm, type: tipoFiltro, period: periodoFiltro };
  const returnTo = /^\/documentos-clinicos(?:\?|$)/.test(location.state?.returnTo || '')
    ? location.state.returnTo : `/documentos-clinicos?tab=atestados${pacienteFiltroId ? `&paciente=${encodeURIComponent(pacienteFiltroId)}` : ''}`;
  const leaveTask = () => navigate(returnTo, { replace: true, state: { certificateFilters } });
  const openTask = (path: string) => {
    const source = taskPage ? returnTo : `${location.pathname}${location.search}`;
    if (!taskPage) navigate(source, { replace: true, state: { certificateFilters } });
    navigate(path, { state: { returnTo: source, certificateFilters } });
  };
  const atestadosQuery = useSupabaseQuery<Atestado>('atestados', {
    select: '*, pacientes(nome,nome_social,cpf,telefone)',
    orderBy: { column: 'created_at', ascending: false },
    filters: [
      ...(profile?.clinica_id ? [{ column: 'clinica_id', operator: 'eq', value: profile.clinica_id }] : []),
      ...(isMedicoOnly && medicoId ? [{ column: 'medico_id', operator: 'eq', value: medicoId }] : []),
    ],
    enabled: !!profile?.clinica_id && (!isMedicoOnly || !!medicoId),
  });
  const medicosQuery = useMedicos();
  const templatesQuery = useQuery({
    queryKey: ['atestados-templates', profile?.clinica_id, profile?.id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('templates_atestado')
        .select('*')
        .or(`clinica_id.eq.${profile!.clinica_id},clinica_id.is.null`)
        .order('nome');
      if (error) throw error;
      return (data || []) as Record<string, any>[];
    },
  });
  const atestados = atestadosQuery.data || [];
  const medicos = medicosQuery.data || [];
  const pacienteSelecionadoQuery = usePacienteResumo(formData.paciente_id);
  const pacienteSelecionado = pacienteSelecionadoQuery.data;
  const templates = templatesQuery.data || [];
  const medicosAtivos = medicos.filter(m => m.ativo !== false);
  const medicosDisponiveis = isMedicoOnly && medicoId
    ? medicosAtivos.filter(m => m.id === medicoId)
    : medicosAtivos;

  const isLoading = (!taskPage && atestadosQuery.isLoading) || medicosQuery.isLoading || loadingCurrentMedico;

  const stats = useMemo(() => ({
    total: atestados.length,
    hoje: atestados.filter(a => a.data_emissao === today).length,
    vigentes: atestados.filter(a => afastamentoVigente(a, today)).length,
    comCid: atestados.filter(a => !!a.cid).length,
    pacientes: new Set(atestados.map(a => a.paciente_id)).size,
    porTipo: Object.fromEntries(TIPOS_ATESTADO.map(t => [t.value, atestados.filter(a => a.tipo === t.value).length])) as Record<string, number>,
  }), [atestados, today]);

  const filteredAtestados = useMemo(() => {
    return atestados.filter(a => {
      if (pacienteFiltroId && a.paciente_id !== pacienteFiltroId) return false;
      if (tipoFiltro !== 'todos' && a.tipo !== tipoFiltro) return false;
      if (periodoFiltro === 'hoje' && a.data_emissao !== today) return false;
      if (periodoFiltro === 'cid' && !a.cid) return false;
      if (periodoFiltro === '7d' || periodoFiltro === '30d') {
        const dias = diasDesde(a.data_emissao, today);
        if (dias === null || dias < 0 || dias > (periodoFiltro === '7d' ? 7 : 30)) return false;
      }
      return pacienteCorresponde(a.pacientes || {}, searchTerm);
    });
  }, [atestados, searchTerm, tipoFiltro, periodoFiltro, pacienteFiltroId, today]);

  const temFiltro = !!searchTerm || tipoFiltro !== 'todos' || periodoFiltro !== 'todos' || !!pacienteFiltroId;
  const limparFiltros = () => {
    setSearchTerm('');
    setTipoFiltro('todos');
    setPeriodoFiltro('todos');
    if (pacienteFiltroId) limparPacienteFiltro();
  };
  const pacienteFiltroNome = pacienteFiltroId
    ? (atestados.find(a => a.paciente_id === pacienteFiltroId)?.pacientes?.nome_social
      || atestados.find(a => a.paciente_id === pacienteFiltroId)?.pacientes?.nome
      || 'selecionado')
    : null;
  const mensagemWhatsApp = (atestado: Atestado) => {
    const nome = String(atestado.pacientes?.nome_social || atestado.pacientes?.nome || '').split(' ')[0];
    const data = atestado.data_emissao ? format(parseDateOnly(atestado.data_emissao)!, 'dd/MM/yyyy') : '';
    const tipo = (getTipoLabelStatic(atestado.tipo) || 'documento').toLowerCase();
    return `Olá${nome ? `, ${nome}` : ''}! Seu ${tipo}${data ? ` emitido em ${data}` : ''} está disponível para retirada na clínica.`;
  };

  // Auto-calculate end date
  const updateDias = (dias: number) => {
    const dataInicio = formData.data_inicio || formData.data_emissao;
    const dataFim = dataInicio ? format(addDays(new Date(dataInicio + 'T12:00'), dias - 1), 'yyyy-MM-dd') : '';
    setFormData(prev => ({ ...prev, dias, data_fim: dataFim }));
  };

  const updateDataInicio = (value: string) => {
    let dataFim = formData.data_fim;
    if (formData.dias && formData.dias > 0) {
      dataFim = format(addDays(new Date(value + 'T12:00'), formData.dias - 1), 'yyyy-MM-dd');
    }
    setFormData(prev => ({ ...prev, data_inicio: value, data_fim: dataFim }));
  };

  const handleNew = () => {
    if (!medicosDisponiveis.length) {
      toast.error('Não há médicos ativos para emitir atestados.');
      return;
    }
    openTask(`/documentos-clinicos/novo-atestado${pacienteFiltroId ? `?paciente=${encodeURIComponent(pacienteFiltroId)}` : ''}`);
  };

  const handleNewWithType = (tipo: string) => {
    if (!medicosDisponiveis.length) {
      toast.error('Não há médicos ativos para emitir atestados.');
      return;
    }
    openTask(`/documentos-clinicos/novo-atestado?tipo=${encodeURIComponent(tipo)}${pacienteFiltroId ? `&paciente=${encodeURIComponent(pacienteFiltroId)}` : ''}`);
  };

  const handleLoadTemplate = (template: Record<string, any>) => {
    const diasDoTemplate = Number(template.dias_afastamento ?? template.diasAfastamento);
    const diasValidos = Number.isInteger(diasDoTemplate) && diasDoTemplate > 0 ? diasDoTemplate : null;
    setFormData(prev => ({
      ...prev,
      tipo: template.tipo || prev.tipo,
      observacoes: template.conteudo || prev.observacoes,
      dias: diasValidos ?? prev.dias,
      cid: template.cid || prev.cid,
      // Um CID salvo no modelo não substitui a autorização expressa do paciente
      // para esta emissão específica.
      incluirCid: false,
    }));
    setSelectedTemplateId(selectedAtestadoTemplateId(template));
    if (diasValidos) updateDias(diasValidos);
    setIsTemplateOpen(false);
    modelTrigger.current?.focus();
    toast.success(`Modelo "${template.nome}" carregado.`);
  };

  // Troca as variáveis do modelo pelo dicionário único (o mesmo do editor de
  // modelos), aceitando também os sinônimos {{paciente}}, {{data}}, {{medico}}…
  const processTemplateText = (text: string): string => {
    const paciente = pacienteSelecionado;
    const medico = medicos.find(m => m.id === formData.medico_id);
    return substituirVariaveisAtestado(text, {
      nome_paciente: paciente?.nome || '_______________',
      cpf_paciente: paciente?.cpf || '_______________',
      data_emissao: formData.data_emissao ? format(new Date(formData.data_emissao + 'T12:00'), 'dd/MM/yyyy') : '__/__/____',
      data_atual: format(parseDateOnly(today)!, 'dd/MM/yyyy'),
      dias: formData.dias?.toString() || '___',
      data_inicio: formData.data_inicio ? format(new Date(formData.data_inicio + 'T12:00'), 'dd/MM/yyyy') : '__/__/____',
      data_fim: formData.data_fim ? format(new Date(formData.data_fim + 'T12:00'), 'dd/MM/yyyy') : '__/__/____',
      hora_inicio: formData.hora_inicio || '__:__',
      hora_fim: formData.hora_fim || '__:__',
      medico_nome: medico?.nome || medico?.crm || '_______________',
      medico_crm: medico?.crm || '_______________',
      cid: formData.incluirCid ? formData.cid || '___' : '___',
    });
  };

  // Comparecimento emitido a partir do atendimento: o horário de chegada vem
  // do check-in da fila e o de saída é a hora atual, ambos editáveis.
  const checkinQuery = useQuery({
    queryKey: ['atestado-checkin', profile?.clinica_id ?? null, agendamentoOrigemId],
    enabled: creationPage && !!agendamentoOrigemId && !!profile?.clinica_id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('fila_atendimento')
        .select('horario_chegada')
        .eq('agendamento_id', agendamentoOrigemId!)
        .eq('clinica_id', profile!.clinica_id!)
        .not('horario_chegada', 'is', null)
        .order('horario_chegada', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.horario_chegada ?? null;
    },
  });
  const horaClinica = (instante: Date) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(instante);
  const checkinDoAtendimento = checkinQuery.data ? new Date(checkinQuery.data) : null;
  const horaCheckin = checkinDoAtendimento && Number.isFinite(checkinDoAtendimento.getTime()) ? horaClinica(checkinDoAtendimento) : null;
  const checkinAplicado = useRef('');

  const handleSave = async (imprimir = false) => {
    if (saveLock.current) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. O atestado não foi salvo.');
      return;
    }
    if (!formData.paciente_id || !formData.medico_id) {
      toast.error('Preencha paciente e médico.');
      return;
    }
    if (pacienteSelecionadoQuery.isFetching) {
      toast.info('Aguarde o carregamento dos dados do paciente.');
      return;
    }
    if (pacienteSelecionadoQuery.isError || !pacienteSelecionado) {
      toast.error('Não foi possível carregar o paciente selecionado.', {
        description: 'Busque o paciente novamente antes de emitir o atestado.',
      });
      return;
    }
    if (formData.tipo === 'afastamento' && (!Number.isInteger(formData.dias) || !formData.dias || formData.dias < 1)) {
      toast.error('Informe a quantidade de dias de afastamento.');
      return;
    }
    if (isMedicoOnly && formData.medico_id !== medicoId) {
      toast.error('Seu perfil só pode emitir documentos em seu próprio nome.');
      return;
    }
    const medicoSelecionado = medicos.find(m => m.id === formData.medico_id);
    if (!medicoSelecionado || medicoSelecionado.ativo === false) {
      toast.error('Médico emissor indisponível', {
        description: 'Selecione um médico ativo da clínica antes de emitir o atestado.',
      });
      return;
    }
    if (formData.tipo === 'aptidao' && (!formData.finalidade || (formData.finalidade === 'custom' && !formData.motivo.trim()))) {
      toast.error('Informe a finalidade do atestado de aptidão.');
      return;
    }
    const isValidDateOnly = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T12:00:00`);
      return !Number.isNaN(date.getTime()) && format(date, 'yyyy-MM-dd') === value;
    };
    const dataEmissaoValida = isValidDateOnly(formData.data_emissao) && formData.data_emissao <= today;
    if (!dataEmissaoValida) {
      toast.error('Informe uma data de emissão válida, igual ou anterior a hoje.');
      return;
    }
    if (formData.tipo === 'afastamento') {
      const inicioValido = isValidDateOnly(formData.data_inicio);
      const fimValido = isValidDateOnly(formData.data_fim);
      if (!inicioValido || !fimValido || formData.data_fim < formData.data_inicio) {
        toast.error('Confira as datas do afastamento.', { description: 'A data final deve ser igual ou posterior à data inicial.' });
        return;
      }
    }
    if (formData.tipo === 'comparecimento' && (!formData.hora_inicio || !formData.hora_fim)) {
      toast.error('Informe o horário de início e fim para atestado de comparecimento.');
      return;
    }
    if (formData.tipo === 'comparecimento' && formData.hora_fim <= formData.hora_inicio) {
      toast.error('O horário final deve ser posterior ao horário inicial.');
      return;
    }

    saveLock.current = true;
    setIsSaving(true);
    try {
      const observacoesProcessadas = processTemplateText(formData.observacoes);

      // Build motivo with extra context
      let motivo = formData.motivo;
      if (formData.tipo === 'comparecimento') {
        motivo = `Esteve presente das ${formData.hora_inicio} às ${formData.hora_fim}. ${motivo}`.trim();
      }
      if (formData.tipo === 'aptidao' && formData.finalidade) {
        const finalidade = formData.finalidade === 'custom' ? formData.motivo.trim() : formData.finalidade;
        motivo = `Finalidade: ${finalidade}.`;
      }

      const { data: emitido, error } = await supabase.from('atestados').insert({
        clinica_id: profile.clinica_id,
        tipo: formData.tipo,
        paciente_id: formData.paciente_id,
        medico_id: formData.medico_id,
        data_emissao: formData.data_emissao,
        data_inicio: formData.tipo === 'afastamento' ? formData.data_inicio : null,
        data_fim: formData.tipo === 'afastamento' ? formData.data_fim : null,
        dias: formData.tipo === 'afastamento' ? formData.dias : null,
        cid: formData.incluirCid ? formData.cid : null,
        motivo,
        observacoes: observacoesProcessadas || null,
        modelo_atestado_id: selectedTemplateId,
        // Emitido a partir do atendimento: fica ligado à consulta de origem.
        ...(agendamentoOrigemId && formData.paciente_id === pacienteFiltroId ? { agendamento_id: agendamentoOrigemId } : {}),
      } as any).select('*, pacientes(nome,nome_social,cpf,telefone)').single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['atestados'] });
      completed.current = true;
      toast.success('Atestado emitido com sucesso.');
      // "Emitir e imprimir": o PDF sai do registro gravado, com a mesma
      // auditoria de impressão do histórico.
      if (imprimir && emitido) await handlePrint(emitido as unknown as Atestado);
      leaveTask();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving atestado:', error);
      toast.error('Erro ao emitir atestado.', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const duplicateForm = (atestado: Atestado): FormDataType => {
    const tipo = atestado.tipo || 'comparecimento';
    const motivoOriginal = atestado.motivo || '';
    const comparecimento = tipo === 'comparecimento'
      ? motivoOriginal.match(/^Esteve presente das (\d{2}:\d{2}) às (\d{2}:\d{2})\.\s*(.*)$/i)
      : null;
    const finalidadeAptidao = tipo === 'aptidao'
      ? (motivoOriginal.match(/^Finalidade:\s*(.*?)\.?$/i)?.[1] || motivoOriginal).trim()
      : '';
    const finalidadePredefinida = FINALIDADES_APTIDAO.includes(finalidadeAptidao);
    return {
      ...novoFormulario(today),
      tipo,
      paciente_id: atestado.paciente_id,
      medico_id: atestado.medico_id || medicoId || '',
      dias: atestado.dias,
      cid: atestado.cid || '',
      // Duplicar o documento não reaproveita a autorização de CID da emissão anterior.
      incluirCid: false,
      motivo: tipo === 'comparecimento'
        ? comparecimento?.[3] || (comparecimento ? '' : motivoOriginal)
        : tipo === 'aptidao'
          ? (finalidadePredefinida ? '' : finalidadeAptidao)
          : motivoOriginal,
      observacoes: atestado.observacoes || '',
      data_emissao: today,
      data_inicio: today,
      data_fim: atestado.dias && atestado.dias > 0 ? format(addDays(new Date(`${today}T12:00`), atestado.dias - 1), 'yyyy-MM-dd') : '',
      finalidade: tipo === 'aptidao'
        ? (finalidadePredefinida ? finalidadeAptidao : finalidadeAptidao ? 'custom' : '')
        : '',
      hora_inicio: comparecimento?.[1] || '',
      hora_fim: comparecimento?.[2] || '',
    };
  };

  const handleDuplicate = (atestado: Atestado) => openTask(`/documentos-clinicos/novo-atestado?origem=${encodeURIComponent(atestado.id)}`);
  const handleView = (atestado: Atestado) => openTask(`/atestados/${atestado.id}`);

  const taskKey = `${location.pathname}${location.search}`;
  useEffect(() => {
    if (!creationPage || loadingCurrentMedico || (isMedicoOnly && currentMedicoError) || (sourceId && !recordQuery.data)) return;
    if (initializedTask.current === taskKey) return;
    initializedTask.current = taskKey;
    completed.current = false;
    const tipo = searchParams.get('tipo');
    const baseline = sourceId && recordQuery.data ? duplicateForm(recordQuery.data) : {
      ...novoFormulario(today), medico_id: medicoId || '', paciente_id: pacienteFiltroId || '',
      tipo: TIPOS_ATESTADO.some(item => item.value === tipo) ? tipo! : 'comparecimento',
    };
    formBaselineRef.current = baseline;
    setFormData(baseline);
    setSelectedTemplateId(null);
    setIsTemplateOpen(false);
    setReadyFor(taskKey);
    // Initialize a task once; query refreshes and editing must not replace its draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationPage, taskKey, loadingCurrentMedico, currentMedicoError, isMedicoOnly, medicoId, sourceId, recordQuery.data]);

  // Preenche o comparecimento com o check-in só uma vez por formulário e só
  // se os horários ainda estiverem vazios (não sobrescreve o que foi digitado).
  useEffect(() => {
    if (!creationPage || readyFor !== taskKey || !horaCheckin || !checkinDoAtendimento || checkinAplicado.current === taskKey) return;
    checkinAplicado.current = taskKey;
    setFormData(prev => {
      if (prev.tipo !== 'comparecimento' || prev.hora_inicio || prev.hora_fim) return prev;
      if (todaySaoPauloDateOnly(checkinDoAtendimento) !== prev.data_emissao) return prev;
      const agora = horaClinica(new Date());
      const next = { ...prev, hora_inicio: horaCheckin, hora_fim: prev.data_emissao === today && agora > horaCheckin ? agora : '' };
      // Valor sugerido pelo sistema não conta como alteração do usuário.
      if (JSON.stringify(prev) === JSON.stringify(formBaselineRef.current)) formBaselineRef.current = next;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationPage, readyFor, taskKey, horaCheckin]);

  const handlePrint = async (atestado: Atestado) => {
    const paciente = atestado.pacientes;
    const medico = medicos.find(m => m.id === atestado.medico_id);
    if (!paciente || !medico) { toast.error('Dados não encontrados.'); return; }
    try {
      const horario = atestado.tipo === 'comparecimento'
        ? atestado.motivo?.match(/das (\d{2}:\d{2}) às (\d{2}:\d{2})/i)
        : null;
      const finalidade = atestado.tipo === 'aptidao'
        ? atestado.motivo?.replace(/^Finalidade:\s*/i, '').replace(/\.$/, '')
        : undefined;
      const motivoAdicional = atestado.tipo === 'comparecimento'
        ? atestado.motivo?.replace(/^Esteve presente das \d{2}:\d{2} às \d{2}:\d{2}\.\s*/i, '')
        : atestado.tipo !== 'aptidao' ? atestado.motivo : null;
      const doc = await gerarAtestado(
        { nome: paciente.nome, cpf: paciente.cpf || '' },
        { nome: medico.nome || medico.crm, crm: medico.crm, especialidade: medico.especialidade || '', crmUf: (medico as any).crm_uf || undefined, rqe: (medico as any).rqe || undefined },
        {
          tipo: atestado.tipo as any,
          dataAtendimento: atestado.data_emissao || '',
          dataEmissao: atestado.data_emissao || undefined,
          dataInicio: atestado.data_inicio || undefined,
          dataFim: atestado.data_fim || undefined,
          horarioInicio: horario?.[1],
          horarioFim: horario?.[2],
          finalidade,
          diasAfastamento: atestado.dias || undefined,
          cid: atestado.cid || undefined,
          observacoes: [motivoAdicional, atestado.observacoes].filter(Boolean).join('\n'),
          versaoModelo: atestadoTemplateVersionLabel(atestado) || undefined,
        }
      );
      await registrarAcessoDocumentoClinico('atestado', atestado.id, 'impressao');
      openPDF(doc);
    } catch (error) {
      toast.error('Não foi possível preparar o atestado para impressão.', { description: mensagemDeErro(error) });
    }
  };

  /**
   * Prévia do PDF com os dados do formulário, antes de emitir. Nada é
   * gravado; o arquivo sai marcado como "PRÉ-VISUALIZAÇÃO".
   */
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  const handlePreview = async () => {
    const medico = medicos.find(m => m.id === formData.medico_id);
    if (!pacienteSelecionado || !medico) {
      toast.error('Selecione o paciente e o médico para pré-visualizar.');
      return;
    }
    setGerandoPrevia(true);
    try {
      const finalidade = formData.tipo === 'aptidao'
        ? (formData.finalidade === 'custom' ? formData.motivo.trim() : formData.finalidade) || undefined
        : undefined;
      const doc = await gerarAtestado(
        { nome: pacienteSelecionado.nome, cpf: pacienteSelecionado.cpf || '' },
        { nome: medico.nome || medico.crm, crm: medico.crm, especialidade: medico.especialidade || '', crmUf: (medico as any).crm_uf || undefined, rqe: (medico as any).rqe || undefined },
        {
          tipo: formData.tipo as any,
          dataAtendimento: formData.data_emissao,
          dataEmissao: formData.data_emissao,
          dataInicio: formData.tipo === 'afastamento' ? formData.data_inicio || undefined : undefined,
          dataFim: formData.tipo === 'afastamento' ? formData.data_fim || undefined : undefined,
          horarioInicio: formData.tipo === 'comparecimento' ? formData.hora_inicio || undefined : undefined,
          horarioFim: formData.tipo === 'comparecimento' ? formData.hora_fim || undefined : undefined,
          finalidade,
          diasAfastamento: formData.tipo === 'afastamento' ? formData.dias || undefined : undefined,
          cid: formData.incluirCid ? formData.cid || undefined : undefined,
          observacoes: [formData.tipo !== 'aptidao' ? formData.motivo : null, processTemplateText(formData.observacoes)].filter(Boolean).join('\n'),
        },
      );
      marcarComoPrevia(doc);
      openPDF(doc);
    } catch (error) {
      toast.error('Não foi possível montar a pré-visualização.', { description: mensagemDeErro(error) });
    } finally {
      setGerandoPrevia(false);
    }
  };

  const getPacienteNome = (paciente?: Atestado['pacientes']) => {
    return (paciente as any)?.nome_social || paciente?.nome || 'Desconhecido';
  };
  const getMedicoNome = (id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `${nomeMedico(m.nome || m.crm)}` : 'Desconhecido';
  };
  const getTipoLabel = (tipo: string | null) => TIPOS_ATESTADO.find(t => t.value === tipo)?.label || tipo;
  const getTipoBadge = (tipo: string | null) => {
    switch (tipo) {
      case 'comparecimento': return 'border-border bg-secondary text-primary';
      case 'afastamento': return 'border-warning/30 bg-warning/10 text-warning';
      case 'aptidao': return 'border-success/30 bg-success/10 text-success';
      case 'acompanhante': return 'border-border bg-muted text-foreground';
      default: return 'border-border bg-muted text-foreground';
    }
  };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (currentMedicoError && isMedicoOnly) return <ErrorState title="Não foi possível confirmar seu vínculo médico" error={currentMedicoError} onRetry={() => void refetchCurrentMedico()} />;
  const atestadoQueries = taskPage ? [medicosQuery] : [atestadosQuery, medicosQuery];
  const failedAtestadoQuery = atestadoQueries.find(query => query.isError);
  if (failedAtestadoQuery) {
    return <ErrorState title="Não foi possível carregar atestados e documentos" error={failedAtestadoQuery.error} onRetry={() => { for (const query of atestadoQueries) void query.refetch(); }} />;
  }
  if (isMedicoOnly && (!medicoId || currentMedico?.ativo === false)) {
    return <ErrorState
      title={currentMedico?.ativo === false ? 'Cadastro médico inativo' : 'Perfil médico sem vínculo'}
      description={currentMedico?.ativo === false
        ? 'Seu cadastro médico foi inativado. Peça ao administrador para revisar seu acesso antes de emitir documentos.'
        : 'Seu usuário não está vinculado a um cadastro médico ativo da clínica. Peça ao administrador para revisar esse vínculo antes de emitir documentos.'}
    />;
  }
  if (sourceId && recordQuery.isError) return <div className="space-y-4">
    <Button variant="outline" onClick={leaveTask}>Voltar aos atestados</Button>
    <ErrorState title="Não foi possível abrir o atestado" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} />
  </div>;
  if (sourceId && recordQuery.isLoading) return <div role="status" className="space-y-4 py-8"><h1 className="text-2xl font-semibold">Abrindo atestado</h1><p>Conferindo acesso e carregando o documento…</p></div>;
  if (sourceId && !recordQuery.data) return <div className="space-y-4">
    <h1 className="text-2xl font-semibold">Atestado indisponível</h1>
    <p>O documento não foi encontrado ou não está disponível para seu perfil nesta clínica.</p>
    <Button variant="outline" onClick={leaveTask}>Voltar aos atestados</Button>
  </div>;
  if (creationPage && !medicosDisponiveis.length) return <div className="space-y-4">
    <h1 className="text-2xl font-semibold">Nenhum médico ativo para emitir</h1>
    <p>Revise o cadastro da equipe antes de emitir um atestado.</p>
    <Button variant="outline" onClick={leaveTask}>Voltar aos atestados</Button>
  </div>;
  if (creationPage && readyFor !== taskKey) return <div role="status" className="py-8">Preparando formulário do atestado…</div>;

  return (
    <div className="space-y-6">
      {creationPage && <UnsavedChangesGuard key={taskKey} completed={completed} dirty={hasUnsavedChanges || selectedTemplateId !== null} busy={isSaving} />}
      {!taskPage && <>
      <PageHeader
        title="Atestados e Documentos"
        description={stats.total > 0
          ? `${stats.total} documento${stats.total === 1 ? '' : 's'} · ${stats.hoje} hoje${stats.vigentes > 0 ? ` · ${stats.vigentes} afastamento${stats.vigentes === 1 ? '' : 's'} em vigor` : ''} · ${stats.pacientes} paciente${stats.pacientes === 1 ? '' : 's'}`
          : 'Emita declarações e atestados com dados conferidos do paciente.'}
        icon={<FileText />}
        actions={(
          <>
            <Badge variant="outline" className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-xs">
              <FileSignature className="h-3.5 w-3.5 text-muted-foreground" />
              Assinatura manual
            </Badge>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/todos-templates"><BookOpen className="h-4 w-4" />Modelos</Link>
            </Button>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void atestadosQuery.refetch()} aria-label="Atualizar atestados" title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleNew}
              className="shrink-0 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
              disabled={!medicosDisponiveis.length}
            >
              <Plus className="h-4 w-4" />Novo Atestado
            </Button>
          </>
        )}
      />

      {!medicosDisponiveis.length && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          Não há médicos ativos para emitir atestados. <Link to="/equipe" className="font-medium underline">Gerenciar equipe</Link>.
        </div>
      )}

      {/* Indicadores por tipo (filtram a lista) */}
      <section role="group" aria-label="Resumo por tipo de documento" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {([
          { key: 'hoje', icon: CalendarCheck, label: 'Hoje', value: stats.hoje, caption: 'emitidos hoje', color: 'text-foreground', surface: 'bg-secondary', escuro: false },
          ...TIPOS_ATESTADO.map(tipo => ({
            key: tipo.value,
            icon: tipo.icon,
            label: tipo.label.replace(/^(Atestado|Declaração) (de |Médico )?/, '').replace(/^\((.*)\)$/, '$1'),
            value: stats.porTipo[tipo.value] ?? 0,
            caption: tipo.value === 'afastamento' && stats.vigentes > 0 ? `${stats.vigentes} em vigor` : 'emitidos',
            color: tipo.value === 'afastamento' ? 'text-warning' : tipo.value === 'aptidao' ? 'text-success' : tipo.value === 'comparecimento' ? 'text-primary' : 'text-foreground',
            surface: tipo.value === 'afastamento' ? 'bg-warning/10' : tipo.value === 'aptidao' ? 'bg-success/10' : tipo.value === 'comparecimento' ? 'bg-primary/10' : 'bg-muted',
            escuro: false,
          })),
        ]).map(s => {
          const Icon = s.icon;
          const ativo = s.key === 'hoje' ? periodoFiltro === 'hoje' : tipoFiltro === s.key;
          const alternar = () => {
            if (s.key === 'hoje') setPeriodoFiltro(ativo ? 'todos' : 'hoje');
            else setTipoFiltro(ativo ? 'todos' : s.key);
          };
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={ativo}
              onClick={alternar}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                s.escuro && 'border-transparent bg-primary text-primary-foreground',
                ativo && !s.escuro && 'border-primary/50 ring-1 ring-primary/30',
                ativo && s.escuro && 'ring-2 ring-primary/60',
              )}
            >
              <div className="flex min-h-[96px] items-center gap-3 p-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}>
                  <Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                    <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                  </div>
                  <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Documentos emitidos */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Documentos Emitidos <span className="text-muted-foreground">({filteredAtestados.length})</span></CardTitle>
              <div className="relative w-full sm:w-80">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar atestados por nome, CPF ou telefone"
                  placeholder="Buscar por nome, CPF ou telefone..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-10 rounded-full pl-9 focus-visible:ring-primary"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Filtrar documentos" className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: 'todos', label: 'Todo o período' },
                  { key: 'hoje', label: 'Hoje' },
                  { key: '7d', label: 'Últimos 7 dias' },
                  { key: '30d', label: 'Últimos 30 dias' },
                  { key: 'cid', label: 'Com CID' },
                ] as const).map(opt => {
                  const ativo = periodoFiltro === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => setPeriodoFiltro(opt.key)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        ativo ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {pacienteFiltroId && (
                  <Badge variant="outline" className="h-8 gap-1 rounded-full border-border pl-3 pr-1 text-xs font-medium text-primary">
                    Paciente: {pacienteFiltroNome}
                    <button
                      type="button"
                      onClick={limparPacienteFiltro}
                      aria-label="Remover filtro de paciente"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {temFiltro && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                    <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                  </Button>
                )}
              </div>
              <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{filteredAtestados.length} de {atestados.length}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="sm:hidden md:table-cell">Médico</TableHead>
                  <TableHead>Detalhes</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAtestados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                        <FileText className="h-7 w-7" />
                      </span>
                      <p className="font-semibold text-foreground">{atestados.length === 0 ? 'Nenhum atestado encontrado' : 'Nenhum resultado para esses filtros'}</p>
                      <p className="mt-1 text-sm">{atestados.length === 0 ? 'Emita o primeiro atestado para o paciente' : 'Ajuste a busca, o tipo ou o período.'}</p>
                      {atestados.length === 0 ? (
                        <Button
                          className="mt-4 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                          onClick={handleNew}
                          disabled={!medicosDisponiveis.length}
                        >
                          <Plus className="h-4 w-4" />Novo Atestado
                        </Button>
                      ) : (
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                          <Button size="sm" variant="outline" className="rounded-full" onClick={limparFiltros}>Limpar filtros</Button>
                          {tipoFiltro !== 'todos' && medicosDisponiveis.length > 0 && (
                            <Button size="sm" className="gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleNewWithType(tipoFiltro)}>
                              <Plus className="h-4 w-4" />Emitir {getTipoLabel(tipoFiltro)}
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAtestados.map(atestado => {
                    const nomePaciente = getPacienteNome(atestado.pacientes);
                    const whatsapp = linkWhatsApp(atestado.pacientes?.telefone, mensagemWhatsApp(atestado));
                    const vigente = afastamentoVigente(atestado, today);
                    return (
                      <TableRow key={atestado.id} className="transition-colors hover:bg-secondary/70">
                        <TableCell className="tabular-nums">{atestado.data_emissao ? format(parseDateOnly(atestado.data_emissao)!, 'dd/MM/yyyy') : '—'}</TableCell>
                        <TableCell><Badge variant="outline" className={cn('rounded-full', getTipoBadge(atestado.tipo))}>{getTipoLabel(atestado.tipo)}</Badge></TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{nomePaciente}</span>
                            {atestado.data_emissao === today && <Badge className="rounded-full border-transparent bg-primary text-xs text-primary-foreground hover:bg-primary">Hoje</Badge>}
                            {vigente && <Badge variant="outline" className="rounded-full border-warning/40 text-xs text-warning">Em vigor</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="sm:hidden md:table-cell">{getMedicoNome(atestado.medico_id)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {atestado.dias && <span className="tabular-nums">{atestado.dias} dia(s)</span>}
                          {atestado.dias && atestado.data_inicio && atestado.data_fim && (
                            <span className="ml-1 text-xs">({format(parseDateOnly(atestado.data_inicio)!, 'dd/MM')} a {format(parseDateOnly(atestado.data_fim)!, 'dd/MM')})</span>
                          )}
                          {atestado.cid && <Badge variant="outline" className="ml-1 rounded-full text-xs">CID: {atestado.cid}</Badge>}
                          {!atestado.dias && !atestado.cid && <span>—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {whatsapp && (
                              <Button aria-label={`Avisar ${nomePaciente} pelo WhatsApp`} asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full text-primary hover:bg-primary/10 hover:text-primary">
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Avisar ${nomePaciente} pelo WhatsApp`} title="Avisar pelo WhatsApp">
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground" onClick={() => handleDuplicate(atestado)} aria-label="Duplicar atestado" title="Duplicar atestado">
                              <Clipboard className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => handleView(atestado)} aria-label="Ver atestado">
                              <Eye className="h-4 w-4" />Ver
                            </Button>
                            <Button className="h-9 gap-1.5 rounded-full bg-primary text-xs text-primary-foreground hover:bg-primary/90" onClick={() => handlePrint(atestado)} aria-label="Imprimir atestado">
                              <Printer className="h-4 w-4" />Imprimir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      </>}
      {creationPage && <section className="mx-auto max-w-5xl space-y-6 pb-6" aria-busy={isSaving}>
          <header className="space-y-3 border-b border-border pb-5">
            <Button variant="ghost" className="-ml-3" onClick={leaveTask} disabled={isSaving}>← Voltar aos atestados</Button>
            <h1 className="text-2xl font-semibold tracking-tight">Emitir Atestado</h1>
            <p className="text-sm text-muted-foreground">Identifique o paciente, confira o tipo de documento e revise o texto antes de emitir.</p>
          </header>

          <fieldset disabled={isSaving} className="min-w-0 space-y-5">
            {/* Tipo + Template */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="min-w-0 basis-60 flex-1 space-y-1.5">
                <Label htmlFor="atestado-tipo" className="text-xs font-medium">Tipo de Documento *</Label>
                <Select value={formData.tipo} onValueChange={v => setFormData({ ...formData, tipo: v })}>
                  <SelectTrigger id="atestado-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_ATESTADO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button ref={modelTrigger} variant="outline" size="sm" aria-expanded={isTemplateOpen} aria-controls="atestado-modelos" onClick={() => setIsTemplateOpen(open => !open)} className="gap-1 flex-shrink-0">
                <Star className="h-3.5 w-3.5" />Modelos
              </Button>
            </div>

            {isTemplateOpen && <section id="atestado-modelos" aria-labelledby="atestado-modelos-title" className="space-y-3 rounded-lg border border-border p-4">
              <h2 id="atestado-modelos-title" className="text-base font-semibold">Modelos de atestado</h2>
          {templatesQuery.isError ? (
            <ErrorState
              compact
              title="Não foi possível carregar os modelos de atestado"
              error={templatesQuery.error}
              onRetry={() => void templatesQuery.refetch()}
            />
          ) : templatesQuery.isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground" role="status">Carregando modelos…</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum modelo cadastrado</p>
              <p className="text-xs mt-1">Cadastre modelos na página de Templates</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                // Botão de verdade (teclado e leitor de tela), em vez de div clicável.
                <button
                  key={t.id}
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handleLoadTemplate(t)}
                  aria-label={`Aplicar modelo ${t.nome}`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{t.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {getTipoLabel(t.tipo)}
                      {(t.dias_afastamento ?? t.diasAfastamento) ? ` • ${t.dias_afastamento ?? t.diasAfastamento} dias` : ''}
                    </span>
                  </span>
                  <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium"><Clipboard className="h-3.5 w-3.5" />Aplicar</span>
                </button>
              ))}
            </div>
          )}
            </section>}

            {/* Paciente + Médico */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="atestado-paciente" className="text-xs font-medium">Paciente *</Label>
                <PacienteCombobox
                  id="atestado-paciente"
                  value={formData.paciente_id}
                  onChange={id => setFormData(prev => ({ ...prev, paciente_id: id }))}
                />
                {pacienteSelecionadoQuery.isFetching && formData.paciente_id && (
                  <p className="text-xs text-muted-foreground" role="status">Carregando dados do paciente…</p>
                )}
                {pacienteSelecionadoQuery.isError && formData.paciente_id && (
                  <ErrorState
                    compact
                    title="Não foi possível carregar o paciente selecionado"
                    error={pacienteSelecionadoQuery.error}
                    onRetry={() => void pacienteSelecionadoQuery.refetch()}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="atestado-medico" className="text-xs font-medium">Médico *</Label>
                <Select value={formData.medico_id} disabled={isMedicoOnly} onValueChange={v => setFormData({ ...formData, medico_id: v })}>
                  <SelectTrigger id="atestado-medico"><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                  <SelectContent>
                    {medicosDisponiveis.map(m => <SelectItem key={m.id} value={m.id}>{m.nome || m.crm} — {m.especialidade || 'CRM: ' + m.crm}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Data de Emissão */}
            <div className="space-y-1.5">
              <Label htmlFor="atestado-data-emissao" className="text-xs font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Data de Emissão
              </Label>
              <Input id="atestado-data-emissao" type="date" max={today} required value={formData.data_emissao} onChange={e => setFormData({ ...formData, data_emissao: e.target.value })} className="w-48" />
            </div>

            <Separator />

            {/* ─── Comparecimento: Horários ─── */}
            {formData.tipo === 'comparecimento' && (
              <div className="space-y-3 bg-primary/5 border border-primary/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Período de Comparecimento *
                </h4>
                <p className="text-xs text-muted-foreground">Obrigatório para validação pelo RH. Informe o horário em que o paciente esteve na clínica.</p>
                {horaCheckin && formData.hora_inicio === horaCheckin && (
                  <p role="status" className="text-xs text-muted-foreground">Chegada preenchida pelo check-in das {horaCheckin}; a saída é a hora atual. Confira antes de emitir.</p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="atestado-hora-inicio" className="text-xs">Horário de Início</Label>
                    <Input id="atestado-hora-inicio" type="time" value={formData.hora_inicio} onChange={e => setFormData({ ...formData, hora_inicio: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="atestado-hora-fim" className="text-xs">Horário de Fim</Label>
                    <Input id="atestado-hora-fim" type="time" value={formData.hora_fim} onChange={e => setFormData({ ...formData, hora_fim: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Afastamento: Dias + Período ─── */}
            {formData.tipo === 'afastamento' && (
              <div className="space-y-3 bg-warning/5 border border-warning/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-warning" />
                  Período de Afastamento *
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="atestado-dias" className="text-xs">Dias de Afastamento *</Label>
                    <Input
                      id="atestado-dias"
                      type="number"
                      min={1}
                      value={formData.dias ?? ''}
                      onChange={e => {
                        const d = Number(e.target.value);
                        if (Number.isInteger(d) && d > 0) updateDias(d);
                        else setFormData(prev => ({ ...prev, dias: null, data_fim: '' }));
                      }}
                      placeholder="Ex: 3"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="atestado-data-inicio" className="text-xs">Data de Início</Label>
                    <Input id="atestado-data-inicio" type="date" value={formData.data_inicio} onChange={e => updateDataInicio(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="atestado-data-fim" className="text-xs">Data de Término (auto)</Label>
                    <Input id="atestado-data-fim" type="date" value={formData.data_fim} readOnly className="bg-muted" />
                  </div>
                </div>
                {formData.dias && formData.data_inicio && formData.data_fim && (
                  <p className="text-xs text-muted-foreground">
                    Afastamento de <strong>{formData.dias} dia(s)</strong>: de{' '}
                    {format(new Date(formData.data_inicio + 'T12:00'), "dd 'de' MMMM", { locale: ptBR })} a{' '}
                    {format(new Date(formData.data_fim + 'T12:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.
                  </p>
                )}
              </div>
            )}

            {/* ─── Aptidão: Finalidade ─── */}
            {formData.tipo === 'aptidao' && (
              <div className="space-y-3 bg-success/5 border border-success/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  Finalidade do Atestado
                </h4>
                <div className="space-y-1.5">
                  <Label htmlFor="atestado-finalidade" className="text-xs">Finalidade / Apto para</Label>
                  <Select value={formData.finalidade} onValueChange={v => setFormData({ ...formData, finalidade: v })}>
                    <SelectTrigger id="atestado-finalidade"><SelectValue placeholder="Selecione a finalidade" /></SelectTrigger>
                    <SelectContent>
                      {FINALIDADES_APTIDAO.map(finalidade => (
                        <SelectItem key={finalidade} value={finalidade}>{finalidade.replace(/^Apto para /, '')}</SelectItem>
                      ))}
                      <SelectItem value="custom">Outro (especificar)</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.finalidade === 'custom' && (
                    <Input
                      aria-label="Especificar finalidade do atestado"
                      placeholder="Descreva a finalidade..."
                      value={formData.motivo}
                      onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            )}

            {/* ─── CID-10 (todos os tipos) ─── */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="incluirCid"
                  checked={formData.incluirCid}
                  onCheckedChange={checked => setFormData({ ...formData, incluirCid: checked as boolean })}
                />
                <Label htmlFor="incluirCid" className="text-sm cursor-pointer">
                  O paciente autorizou expressamente a inclusão do CID-10 neste atestado
                </Label>
              </div>
              {formData.incluirCid && (
                <div className="space-y-1.5 pl-7">
                  <div className="flex items-center gap-2 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    <span>O CID só pode constar no atestado com autorização expressa do paciente (ética médica).</span>
                  </div>
                  <Cid10Search value={formData.cid} onChange={v => setFormData({ ...formData, cid: v })} />
                </div>
              )}
            </div>

            <Separator />

            {/* Motivo */}
            {formData.tipo !== 'aptidao' && (
              <div className="space-y-1.5">
                <Label htmlFor="atestado-motivo" className="text-xs font-medium">Motivo / Justificativa</Label>
                <Input
                  id="atestado-motivo"
                  placeholder="Motivo da emissão do atestado..."
                  value={formData.motivo}
                  onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                />
              </div>
            )}

            {/* Observações / Corpo do Atestado */}
            <div className="space-y-1.5">
              <Label htmlFor="atestado-observacoes" className="text-xs font-medium">Texto do Atestado / Observações</Label>
              <p className="text-[11px] text-muted-foreground">
                Variáveis disponíveis: {legendaVariaveisAtestado()}
              </p>
              <Textarea
                id="atestado-observacoes"
                value={formData.observacoes}
                onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Texto do atestado ou observações adicionais..."
                rows={4}
              />
            </div>

            {/* O sistema NÃO assina o documento. Não há integração com Memed,
                ICP-Brasil ou qualquer provedor: o PDF é montado localmente.
                Dizer o contrário fazia a clínica entregar ao paciente um
                atestado que se declarava assinado e falhava na validação. */}
            <div className="flex items-center gap-3 bg-warning/5 border border-warning/20 rounded-lg p-3">
              <FileSignature className="h-5 w-5 text-warning flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-warning">Este atestado sai sem assinatura digital</p>
                <p className="text-xs text-muted-foreground">
                  Vale como documento assinado de próprio punho depois de impresso e assinado pelo
                  médico. Para assinatura com validade ICP-Brasil, assine o PDF no
                  assinador gov.br antes de entregar.
                </p>
              </div>
            </div>
          </fieldset>

          <footer className="flex flex-wrap justify-end gap-3 border-t border-border py-4">
            <Button variant="outline" onClick={leaveTask} disabled={isSaving}>Voltar aos atestados</Button>
            <Button
              variant="outline"
              onClick={() => { void handlePreview(); }}
              disabled={isSaving || gerandoPrevia || !formData.paciente_id || !formData.medico_id || pacienteSelecionadoQuery.isFetching || pacienteSelecionadoQuery.isError}
              className="gap-2"
            >
              {gerandoPrevia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Pré-visualizar
            </Button>
            <Button
              variant="outline"
              onClick={() => { void handleSave(false); }}
              disabled={isSaving || pacienteSelecionadoQuery.isFetching || !!formData.paciente_id && pacienteSelecionadoQuery.isError}
              className="gap-2"
            >
              <FileSignature className="h-4 w-4" />Emitir
            </Button>
            <Button
              onClick={() => { void handleSave(true); }}
              disabled={isSaving || pacienteSelecionadoQuery.isFetching || !!formData.paciente_id && pacienteSelecionadoQuery.isError}
              className="gap-2"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Emitir e imprimir
            </Button>
          </footer>
      </section>}





      {certificateId && <section className="mx-auto max-w-4xl space-y-6 pb-6">
          <header className="space-y-3 border-b border-border pb-5">
            <Button variant="ghost" className="-ml-3" onClick={leaveTask}>← Voltar aos atestados</Button>
            <h1 className="text-2xl font-semibold tracking-tight">Detalhes do Atestado</h1>
          </header>
          {selectedAtestado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <Badge variant="outline" className={cn('rounded-full', getTipoBadge(selectedAtestado.tipo))}>{getTipoLabel(selectedAtestado.tipo)}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data de Emissão</p>
                  <p className="font-medium">{selectedAtestado.data_emissao ? format(parseDateOnly(selectedAtestado.data_emissao)!, 'dd/MM/yyyy') : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paciente</p>
                  <p className="font-medium">{getPacienteNome(selectedAtestado.pacientes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Médico</p>
                  <p className="font-medium">{getMedicoNome(selectedAtestado.medico_id)}</p>
                </div>
                {selectedAtestado.dias && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Dias de Afastamento</p>
                      <p className="font-medium">{selectedAtestado.dias} dia(s)</p>
                    </div>
                    {selectedAtestado.data_inicio && (
                      <div>
                        <p className="text-xs text-muted-foreground">Período</p>
                        <p className="font-medium text-sm">
                          {format(parseDateOnly(selectedAtestado.data_inicio)!, 'dd/MM/yyyy')}
                          {selectedAtestado.data_fim && ` a ${format(parseDateOnly(selectedAtestado.data_fim)!, 'dd/MM/yyyy')}`}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {selectedAtestado.cid && (
                  <div>
                    <p className="text-xs text-muted-foreground">CID-10</p>
                    <Badge variant="outline">{selectedAtestado.cid}</Badge>
                  </div>
                )}
              </div>
              {selectedAtestado.motivo && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">Motivo</p>
                  <p className="text-sm">{selectedAtestado.motivo}</p>
                </div>
              )}
              {selectedAtestado.observacoes && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedAtestado.observacoes}</p>
                </div>
              )}
              {atestadoTemplateVersionLabel(selectedAtestado) && (
                <div className="border-t pt-3" data-testid="atestado-template-version">
                  <p className="text-xs text-muted-foreground">Modelo de origem</p>
                  <p className="text-sm">{atestadoTemplateVersionLabel(selectedAtestado)}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <FileSignature className="h-3.5 w-3.5" />
                <span>Documento sem assinatura digital — imprima e assine, ou assine o PDF no gov.br</span>
              </div>
            </div>
          )}
          <footer className="flex flex-wrap justify-end gap-3 border-t border-border py-4">
            <Button variant="outline" onClick={leaveTask}>Voltar aos atestados</Button>
            {selectedAtestado && medicosDisponiveis.length > 0 && <Button variant="outline" onClick={() => handleDuplicate(selectedAtestado)}>Duplicar para nova emissão</Button>}
            {selectedAtestado && (
              <Button onClick={() => handlePrint(selectedAtestado)} className="gap-1">
                <Printer className="h-4 w-4" />Imprimir
              </Button>
            )}
          </footer>
      </section>}
    </div>
  );
}
