import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit, Trash2, Eye, Tag, Link, Loader2, MapPin,
  Phone, Mail, Calendar, Filter, Users, UserCheck, Baby, Heart,
  FileText, ChevronDown, ChevronUp, User2, Building2, CreditCard,
  Droplets, Briefcase, X, Stethoscope, Save, Pill, ClipboardList,
  AlertTriangle, Activity, ChevronRight, History, PenLine, Lock,
  ShieldCheck, BookOpen, FileCheck, Brain, Bone, Eye as EyeIcon,
  Thermometer, Scale, Ruler, Paperclip, Shield, Clipboard,
  Clock, TestTube, DollarSign, CalendarPlus, RefreshCw, Wallet,
} from 'lucide-react';
import { addDays, format, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExtratoDoPaciente } from '@/components/patients/ExtratoDoPaciente';
import { ConsentimentoLGPD } from '@/components/clinical/ConsentimentoLGPD';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { EtiquetaPaciente } from '@/components/EtiquetaPaciente';
import { PatientStats, PatientListTable } from '@/components/patients';
import { PatientPhoto, PatientTimeline, VitalSignsChart, AllergyAlert, Cid10Search, ClinicalProtocols, AnexosProntuario, DigitalSignature } from '@/components/clinical';
import { AutorizacaoConvenioModal } from '@/components/AutorizacaoConvenioModal';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';
import { Paciente } from '@/types';
import { cn, sanitizeText } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { gerarProntuarioPDF, downloadPDF, openPDF } from '@/lib/pdfGenerator';
import { ageFromDateOnly, isValidDateOnly, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { logAudit } from '@/lib/auditTrail';
import { cpfValido } from '@/lib/importacao/campos';

interface PacienteFormData {
  nome: string;
  nome_social: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
  email: string;
  sexo: string;
  estado_civil: string;
  profissao: string;
  tipo_sanguineo: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  convenio_id: string;
  numero_carteira: string;
  validade_carteira: string;
  alergias: string[];
  // Alimentam os alertas de contraindicação em src/lib/clinicalAlerts.ts. Sem
  // eles a checagem de segurança da prescrição roda cega nesses dois pontos.
  gestante: boolean;
  amamentando: boolean;
  // Ficam em paciente_comorbidades, não numa coluna de `pacientes`. Aqui só a
  // descrição, que é o que o alerta de contraindicação compara.
  comorbidades: string[];
  observacoes: string;
  nome_responsavel: string;
  cpf_responsavel: string;
  parentesco_responsavel: string;
  is_menor: boolean;
}

const initialFormData: PacienteFormData = {
  nome: '', nome_social: '', cpf: '', data_nascimento: '', telefone: '', email: '',
  sexo: '', estado_civil: '', profissao: '', tipo_sanguineo: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  convenio_id: '', numero_carteira: '', validade_carteira: '',
  alergias: [], gestante: false, amamentando: false, comorbidades: [], observacoes: '',
  nome_responsavel: '', cpf_responsavel: '', parentesco_responsavel: '',
  is_menor: false,
};

const SEXO_OPTIONS = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
  { value: 'O', label: 'Outro' },
];

const ESTADO_CIVIL_OPTIONS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União Estável' },
];

const TIPO_SANGUINEO_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const TAMANHO_PAGINA_HISTORICO = 50;

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const isMinor = (dataNascimento: string): boolean => {
  if (!dataNascimento) return false;
  const idade = ageFromDateOnly(dataNascimento);
  return idade >= 0 && idade < 18;
};

const mascararCpf = (valor: string): string => {
  const digits = valor.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

const calcularIdade = (dataNascimento: string | null) => {
  if (!dataNascimento) return 0;
  return ageFromDateOnly(dataNascimento);
};

const minutosDaHora = (hora: string | null | undefined): number | null => {
  if (!hora || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(hora)) return null;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

export default function Pacientes() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [selectedPacienteUpdatedAt, setSelectedPacienteUpdatedAt] = useState<string | null>(null);
  const [formData, setFormData] = useState<PacienteFormData>(initialFormData);
  const [isEtiquetaOpen, setIsEtiquetaOpen] = useState(false);
  const [viewTab, setViewTab] = useState('dados');

  // Deep-link: /pacientes?paciente=<id>&tab=<financeiro|...>
  // Vem da agenda ("Ficha do paciente" / "Extrato financeiro" no menu de
  // contexto do card) e de outros lugares que queiram apontar direto.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAplicadoRef = useRef<string | null>(null);

  /** Modal de guias/senhas de autorização do convênio do paciente. */
  const [showAutorizacao, setShowAutorizacao] = useState(false);
  const [linkPortalGerado, setLinkPortalGerado] = useState<{ nome: string; url: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const cepLookupRef = useRef(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const pacienteSaveLockRef = useRef(false);
  const pacienteDeleteLockRef = useRef(false);
  const exameSaveLockRef = useRef(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterSexo, setFilterSexo] = useState<string>('todos');
  const [filterConvenio, setFilterConvenio] = useState<string>('todos');
  const [filterIdade, setFilterIdade] = useState<string>('todos');
  const [formSection, setFormSection] = useState<string>('pessoal');
  // Prontuário inline state
  const [prontuarioList, setProntuarioList] = useState<any[]>([]);
  const [loadingProntuarios, setLoadingProntuarios] = useState(false);
  const [loadingMaisProntuarios, setLoadingMaisProntuarios] = useState(false);
  const [temMaisProntuarios, setTemMaisProntuarios] = useState(false);
  const [prontuariosLoadError, setProntuariosLoadError] = useState<unknown>(null);
  const [activeProntuario, setActiveProntuario] = useState<any>(null);
  const [isEditingProntuario, setIsEditingProntuario] = useState(false);
  const [prontuarioForm, setProntuarioForm] = useState<Record<string, any>>({});
  const [prontuarioSinais, setProntuarioSinais] = useState<Record<string, string>>({});
  const [prontuarioPrescricoes, setProntuarioPrescricoes] = useState<any[]>([]);
  const [prontuarioTab, setProntuarioTab] = useState('lista');
  const [savingProntuario, setSavingProntuario] = useState(false);
  // Agendamentos inline state
  const [agendamentosList, setAgendamentosList] = useState<any[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);
  const [loadingMaisAgendamentos, setLoadingMaisAgendamentos] = useState(false);
  const [temMaisAgendamentos, setTemMaisAgendamentos] = useState(false);
  const [agendamentosLoadError, setAgendamentosLoadError] = useState<unknown>(null);
  const [showAgendamentoForm, setShowAgendamentoForm] = useState(false);
  const [agendamentoForm, setAgendamentoForm] = useState<Record<string, string>>({});
  const [savingAgendamento, setSavingAgendamento] = useState(false);
  // Exames inline state
  const [examesList, setExamesList] = useState<any[]>([]);
  const [loadingExames, setLoadingExames] = useState(false);
  const [loadingMaisExames, setLoadingMaisExames] = useState(false);
  const [temMaisExames, setTemMaisExames] = useState(false);
  const [examesLoadError, setExamesLoadError] = useState<unknown>(null);
  const [showExameForm, setShowExameForm] = useState(false);
  const [exameForm, setExameForm] = useState<Record<string, string>>({});
  const [savingExame, setSavingExame] = useState(false);

  const { profile: authProfile, hasRole, isAdmin } = useSupabaseAuth();
  const queryClient = useQueryClient();

  // A aba Prontuário grava em `prontuarios` e `prescricoes`, e o RLS das duas
  // aceita SÓ admin e médico — nem enfermagem. A rota /pacientes admite recepção
  // e enfermagem, então a aba aparecia para quem não consegue salvar: preenchia
  // o prontuário e perdia tudo no botão. Melhor não oferecer do que recusar
  // depois de a pessoa digitar.
  const podeVerProntuario = isAdmin() || hasRole('medico');
  const exigeResponsavel = formData.is_menor || isMinor(formData.data_nascimento);

  // Gerar link do portal grava em paciente_portal_tokens, cujo RLS exige
  // can_manage_data — admin ou recepção. Enfermagem não passa.
  const podeGerarLinkPortal = isAdmin() || hasRole('recepcao');
  const { medicoId, isMedicoOnly } = useCurrentMedico();
  const [paginaPacientes, setPaginaPacientes] = useState(0);
  const limiteBusca = (paginaPacientes + 1) * 50 + 1;
  const hoje = todaySaoPauloDateOnly();
  const dataLimite = (anos: number) => format(subYears(parseDateOnly(hoje), anos), 'yyyy-MM-dd');
  const filtrosBusca = useMemo(() => {
    let nascimentoApos: string | undefined;
    let nascimentoAte: string | undefined;
    if (filterIdade === 'crianca') { nascimentoApos = format(addDays(subYears(parseDateOnly(hoje), 12), 1), 'yyyy-MM-dd'); nascimentoAte = hoje; }
    if (filterIdade === 'adolescente') { nascimentoApos = format(addDays(subYears(parseDateOnly(hoje), 18), 1), 'yyyy-MM-dd'); nascimentoAte = dataLimite(12); }
    if (filterIdade === 'adulto') { nascimentoApos = format(addDays(subYears(parseDateOnly(hoje), 60), 1), 'yyyy-MM-dd'); nascimentoAte = dataLimite(18); }
    if (filterIdade === 'idoso') nascimentoAte = dataLimite(60);
    return { sexo: filterSexo === 'todos' ? undefined : filterSexo, convenio: filterConvenio === 'todos' ? undefined : filterConvenio, nascimentoApos, nascimentoAte };
  }, [filterSexo, filterConvenio, filterIdade, hoje]);
  const { data: resultadoBusca, isLoading, isFetching: isBuscandoPacientes, error: pacientesError, refetch } = useBuscaPacientes(searchTerm, { limite: limiteBusca, filtros: filtrosBusca });
  const resumoPacientes = resultadoBusca?.pacientes ?? [];
  const inicioPagina = paginaPacientes * 50;
  const resumosVisiveis = resumoPacientes.slice(inicioPagina, inicioPagina + 50);
  const idsVisiveis = resumosVisiveis.map((p) => p.id);
  const { data: pacientes = [], error: detalhesErro, isLoading: carregandoDetalhes } = useQuery({
    queryKey: ['pacientes-lista-detalhes', authProfile?.clinica_id, idsVisiveis],
    enabled: !!authProfile?.clinica_id && idsVisiveis.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('pacientes').select('*').eq('clinica_id', authProfile!.clinica_id).in('id', idsVisiveis);
      if (error) throw error;
      const porId = new Map((data ?? []).map((p: any) => [p.id, p]));
      return idsVisiveis.map((id) => porId.get(id)).filter(Boolean) as any[];
    },
    staleTime: 30_000,
  });
  const { data: resumoEstatisticas, error: erroEstatisticas, isLoading: carregandoEstatisticas, refetch: refazerEstatisticas } = useQuery({
    queryKey: ['pacientes-estatisticas', authProfile?.clinica_id],
    enabled: !!authProfile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('resumo_pacientes_clinica', { p_hoje: hoje });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as { total: number; com_convenio: number; menores: number; com_alergias: number };
    },
    staleTime: 60_000,
  });
  const deepLinkPacienteId = searchParams.get('paciente');
  const { data: pacienteDeepLink, isLoading: carregandoDeepLink, error: erroDeepLink, refetch: refazerDeepLink } = useQuery({
    queryKey: ['paciente-deep-link', authProfile?.clinica_id, deepLinkPacienteId],
    enabled: !!authProfile?.clinica_id && !!deepLinkPacienteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('pacientes').select('*').eq('clinica_id', authProfile!.clinica_id).eq('id', deepLinkPacienteId).maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });
  const { data: pacienteSelecionadoDetalhe } = useQuery({
    queryKey: ['paciente-lista-selecionado', authProfile?.clinica_id, selectedPacienteId],
    enabled: !!authProfile?.clinica_id && !!selectedPacienteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('pacientes').select('*').eq('clinica_id', authProfile!.clinica_id).eq('id', selectedPacienteId).maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });
  const { data: convenios = [], isLoading: carregandoConvenios, error: conveniosError, refetch: refetchConvenios } = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true } });
  const conveniosAtivos = useMemo(() => convenios.filter((convenio: any) => convenio.ativo !== false), [convenios]);
  const convenioSelecionado = formData.convenio_id && formData.convenio_id !== 'pending'
    ? convenios.find((convenio: any) => convenio.id === formData.convenio_id)
    : null;
  const conveniosDisponiveisNoFormulario = convenioSelecionado && convenioSelecionado.ativo === false
    ? [...conveniosAtivos, convenioSelecionado]
    : conveniosAtivos;
  const { data: medicos = [], error: medicosError, refetch: refetchMedicos } = useSupabaseQuery<any>('medicos', { orderBy: { column: 'nome', ascending: true } });

  /**
   * Guarda qual paciente está aberto AGORA.
   *
   * As três cargas abaixo eram disparadas sem cancelamento nem verificação: ao
   * abrir o paciente A e logo em seguida o B, a resposta atrasada de A
   * preenchia as abas de B. O operador via prontuário, exames ou consultas de
   * outra pessoa na ficha aberta — e é o tipo de erro que ninguém consegue
   * reproduzir depois, mas que causa dano se alguém agir sobre o que viu.
   */
  const pacienteEmFococRef = useRef<string | null>(null);
  const edicaoPacienteSolicitadaRef = useRef(0);

  // Load prontuários when patient changes.
  //
  // As três cargas descartavam `error`: numa falha de rede ou de permissão a
  // lista vinha vazia e a tela dizia "nenhum registro". Um paciente com dez
  // anos de histórico aparecia como se nunca tivesse sido atendido — e o
  // médico decidia em cima disso.
  const loadProntuarios = useCallback(async (pacienteId: string, offset = 0) => {
    const carregarMais = offset > 0;
    if (carregarMais) setLoadingMaisProntuarios(true);
    else setLoadingProntuarios(true);
    setProntuariosLoadError(null);
    const { data, error } = await supabase
      .from('prontuarios')
      .select('id, data, queixa_principal, hipotese_diagnostica, diagnostico_principal, conduta, sinais_vitais, plano_terapeutico, historia_doenca_atual, historia_patologica_pregressa, historia_familiar, historia_social, revisao_sistemas, alergias_relatadas, medicamentos_em_uso, exames_fisicos, exame_cabeca_pescoco, exame_torax, exame_abdomen, exame_membros, exame_neurologico, exame_pele, orientacoes_paciente, observacoes_internas, diagnosticos_secundarios, medico_id, paciente_id, medicos(nome, crm, especialidade)')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + TAMANHO_PAGINA_HISTORICO - 1);
    if (pacienteEmFococRef.current !== pacienteId) {
      if (carregarMais) setLoadingMaisProntuarios(false); else setLoadingProntuarios(false);
      return; // resposta velha
    }
    if (error) {
      if (carregarMais) toast.error('Não foi possível carregar as evoluções anteriores.', { description: mensagemDeErro(error) });
      else setProntuariosLoadError(error);
    } else {
      setProntuarioList(atual => {
        if (!carregarMais) return data || [];
        const ids = new Set(atual.map(item => item.id));
        return [...atual, ...(data || []).filter(item => !ids.has(item.id))];
      });
      setTemMaisProntuarios((data || []).length === TAMANHO_PAGINA_HISTORICO);
    }
    if (carregarMais) setLoadingMaisProntuarios(false); else setLoadingProntuarios(false);
  }, []);

  const loadAgendamentos = useCallback(async (pacienteId: string, offset = 0) => {
    const carregarMais = offset > 0;
    if (carregarMais) setLoadingMaisAgendamentos(true);
    else setLoadingAgendamentos(true);
    setAgendamentosLoadError(null);
    const { data, error } = await supabase
      .from('agendamentos')
      .select('id, data, hora_inicio, hora_fim, status, tipo, observacoes, medico_id, medicos(nome, crm, especialidade), salas(nome)')
      .eq('paciente_id', pacienteId)
      .order('data', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + TAMANHO_PAGINA_HISTORICO - 1);
    if (pacienteEmFococRef.current !== pacienteId) {
      if (carregarMais) setLoadingMaisAgendamentos(false); else setLoadingAgendamentos(false);
      return;
    }
    if (error) {
      if (carregarMais) toast.error('Não foi possível carregar as consultas anteriores.', { description: mensagemDeErro(error) });
      else setAgendamentosLoadError(error);
    } else {
      setAgendamentosList(atual => {
        if (!carregarMais) return data || [];
        const ids = new Set(atual.map(item => item.id));
        return [...atual, ...(data || []).filter(item => !ids.has(item.id))];
      });
      setTemMaisAgendamentos((data || []).length === TAMANHO_PAGINA_HISTORICO);
    }
    if (carregarMais) setLoadingMaisAgendamentos(false); else setLoadingAgendamentos(false);
  }, []);

  const loadExames = useCallback(async (pacienteId: string, offset = 0) => {
    const carregarMais = offset > 0;
    if (carregarMais) setLoadingMaisExames(true);
    else setLoadingExames(true);
    setExamesLoadError(null);
    const { data, error } = await supabase
      .from('exames')
      .select('id, tipo_exame, status, data_solicitacao, data_realizacao, resultado, observacoes, medico_solicitante_id, medicos:medico_solicitante_id(nome, crm)')
      .eq('paciente_id', pacienteId)
      .order('data_solicitacao', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + TAMANHO_PAGINA_HISTORICO - 1);
    if (pacienteEmFococRef.current !== pacienteId) {
      if (carregarMais) setLoadingMaisExames(false); else setLoadingExames(false);
      return;
    }
    if (error) {
      if (carregarMais) toast.error('Não foi possível carregar os exames anteriores.', { description: mensagemDeErro(error) });
      else setExamesLoadError(error);
    } else {
      setExamesList(atual => {
        if (!carregarMais) return data || [];
        const ids = new Set(atual.map(item => item.id));
        return [...atual, ...(data || []).filter(item => !ids.has(item.id))];
      });
      setTemMaisExames((data || []).length === TAMANHO_PAGINA_HISTORICO);
    }
    if (carregarMais) setLoadingMaisExames(false); else setLoadingExames(false);
  }, []);

  // Reset state when view opens
  const handleViewWithProntuario = useCallback((paciente: any) => {
    edicaoPacienteSolicitadaRef.current += 1;
    setIsFormOpen(false);
    pacienteEmFococRef.current = paciente.id; // antes de disparar as cargas
    setSelectedPacienteId(paciente.id);
    // Limpa as listas do paciente anterior: sem isso, entre abrir a ficha e a
    // resposta chegar, a tela mostra os dados de quem estava aberto antes.
    setProntuarioList([]);
    setTemMaisProntuarios(false);
    setLoadingMaisProntuarios(false);
    setProntuariosLoadError(null);
    setAgendamentosList([]);
    setTemMaisAgendamentos(false);
    setLoadingMaisAgendamentos(false);
    setAgendamentosLoadError(null);
    setExamesList([]);
    setTemMaisExames(false);
    setLoadingMaisExames(false);
    setExamesLoadError(null);
    setViewTab('dados');
    setProntuarioTab('lista');
    setActiveProntuario(null);
    setIsEditingProntuario(false);
    setShowAgendamentoForm(false);
    setShowExameForm(false);
    setIsViewOpen(true);
    loadProntuarios(paciente.id);
    loadAgendamentos(paciente.id);
    loadExames(paciente.id);
  }, [loadProntuarios, loadAgendamentos, loadExames]);

  useEffect(() => {
    const pid = searchParams.get('paciente');
    if (!pid) {
      deepLinkAplicadoRef.current = null;
      return;
    }
    if (isLoading || pacientesError || erroDeepLink || (deepLinkPacienteId && carregandoDeepLink)) return;

    const tab = searchParams.get('tab') || 'dados';
    const linkKey = `${pid}:${tab}`;
    if (deepLinkAplicadoRef.current === linkKey) return;

    const paciente = pacienteDeepLink;
    if (!paciente) {
      deepLinkAplicadoRef.current = linkKey;
      toast.error('Não foi possível abrir a ficha deste paciente.', {
        description: 'O cadastro não foi encontrado ou você não tem acesso a ele.',
      });
    } else {
      const abasDisponiveis = ['dados', 'consultas', 'exames', 'historico', 'sinais', 'endereco', 'financeiro', 'lgpd'];
      if (podeVerProntuario) abasDisponiveis.push('prontuario');
      handleViewWithProntuario(paciente);
      setViewTab(abasDisponiveis.includes(tab) ? tab : 'dados');
      deepLinkAplicadoRef.current = linkKey;
    }

    // Mantém a URL intacta enquanto a lista carrega; limpa apenas depois de
    // abrir a ficha ou informar que o paciente não está acessível.
    const params = new URLSearchParams(searchParams);
    params.delete('paciente');
    params.delete('tab');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, isLoading, pacientesError, erroDeepLink, pacienteDeepLink, deepLinkPacienteId, carregandoDeepLink, podeVerProntuario, handleViewWithProntuario]);

  const handleNewProntuario = () => {
    const paciente = pacientes.find(p => p.id === selectedPacienteId);
    setProntuarioForm({
      paciente_id: selectedPacienteId,
      medico_id: medicoId || authProfile?.id || '',
      data: todaySaoPauloDateOnly(),
      queixa_principal: '',
      historia_doenca_atual: '',
      historia_patologica_pregressa: '',
      historia_familiar: '',
      historia_social: '',
      revisao_sistemas: '',
      alergias_relatadas: paciente?.alergias?.join(', ') || '',
      medicamentos_em_uso: '',
      exames_fisicos: '',
      exame_cabeca_pescoco: '', exame_torax: '', exame_abdomen: '',
      exame_membros: '', exame_neurologico: '', exame_pele: '',
      hipotese_diagnostica: '',
      diagnostico_principal: '',
      diagnosticos_secundarios: [],
      conduta: '',
      plano_terapeutico: '',
      orientacoes_paciente: '',
      observacoes_internas: '',
    });
    setProntuarioSinais({});
    setProntuarioPrescricoes([]);
    setActiveProntuario(null);
    setIsEditingProntuario(true);
    setProntuarioTab('editor');
  };

  const handleOpenProntuario = async (pront: any) => {
    setProntuarioForm(pront);
    setProntuarioSinais(pront.sinais_vitais || {});
    const { data: prescs, error: prescsError } = await supabase
      .from('prescricoes')
      .select('*')
      .eq('prontuario_id', pront.id);
    if (prescsError) {
      toast.error('Não foi possível carregar as prescrições.', { description: mensagemDeErro(prescsError) });
      return;
    }
    setProntuarioPrescricoes((prescs || []).map((p: any) => ({
      medicamento: p.medicamento, dosagem: p.dosagem || '', posologia: p.posologia || '',
      duracao: p.duracao || '', quantidade: p.quantidade || '', observacoes: p.observacoes || '',
    })));
    setActiveProntuario(pront);
    setIsEditingProntuario(false);
    setProntuarioTab('editor');
  };

  const handleSaveProntuario = async () => {
    if (!prontuarioForm.queixa_principal) {
      toast.error('Erro', { description: 'Preencha a queixa principal.' });
      return;
    }
    setSavingProntuario(true);
    try {
      const payload = {
        queixa_principal: prontuarioForm.queixa_principal,
        historia_doenca_atual: prontuarioForm.historia_doenca_atual,
        historia_patologica_pregressa: prontuarioForm.historia_patologica_pregressa,
        historia_familiar: prontuarioForm.historia_familiar,
        historia_social: prontuarioForm.historia_social,
        revisao_sistemas: prontuarioForm.revisao_sistemas,
        alergias_relatadas: prontuarioForm.alergias_relatadas,
        medicamentos_em_uso: prontuarioForm.medicamentos_em_uso,
        sinais_vitais: JSON.parse(JSON.stringify(prontuarioSinais)),
        exames_fisicos: prontuarioForm.exames_fisicos,
        exame_cabeca_pescoco: prontuarioForm.exame_cabeca_pescoco,
        exame_torax: prontuarioForm.exame_torax,
        exame_abdomen: prontuarioForm.exame_abdomen,
        exame_membros: prontuarioForm.exame_membros,
        exame_neurologico: prontuarioForm.exame_neurologico,
        exame_pele: prontuarioForm.exame_pele,
        hipotese_diagnostica: prontuarioForm.hipotese_diagnostica,
        diagnostico_principal: prontuarioForm.diagnostico_principal,
        diagnosticos_secundarios: prontuarioForm.diagnosticos_secundarios || [],
        conduta: prontuarioForm.conduta,
        plano_terapeutico: prontuarioForm.plano_terapeutico,
        orientacoes_paciente: prontuarioForm.orientacoes_paciente,
        observacoes_internas: prontuarioForm.observacoes_internas,
      };

      let prontuarioId = activeProntuario?.id;
      if (activeProntuario?.id) {
        const { data, error } = await supabase.from('prontuarios')
          .update(payload)
          .eq('id', activeProntuario.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('O prontuário não foi localizado para atualização. Atualize o histórico e tente novamente.');
      } else {
        if (!authProfile?.clinica_id) {
          throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
        }
        const { data, error } = await supabase.from('prontuarios').insert({
          ...payload,
          paciente_id: prontuarioForm.paciente_id,
          medico_id: prontuarioForm.medico_id,
          data: prontuarioForm.data,
          clinica_id: authProfile.clinica_id,
        }).select().single();
        if (error) throw error;
        prontuarioId = data.id;
      }

      // Prescrições numa transação só (migration 20260812120000). Antes eram
      // inserts soltos com o erro descartado: a tela dizia "Prontuário salvo"
      // e um medicamento podia simplesmente não ter sido gravado.
      //
      // Também passou a rodar na edição, não só na criação: antes o bloco era
      // `if (!activeProntuario?.id)`, então alterar ou remover uma prescrição
      // de um prontuário existente não mudava nada no banco.
      if (prontuarioId) {
        const validas = prontuarioPrescricoes.filter(p => p.medicamento);
        const { error: prescErr } = await (supabase as any).rpc(
          'substituir_prescricoes_do_prontuario',
          {
            p_prontuario_id: prontuarioId,
            p_prescricoes: validas.map(presc => ({
              medicamento: presc.medicamento,
              dosagem: presc.dosagem || null,
              posologia: presc.posologia || null,
              duracao: presc.duracao || null,
              quantidade: presc.quantidade || null,
              observacoes: presc.observacoes || null,
              data_emissao: todaySaoPauloDateOnly(),
              tipo: 'simples',
            })),
          }
        );
        if (prescErr) throw prescErr;
      }

      // O `catch` vazio daqui nunca disparava: o supabase-js devolve `{ error }`
      // em vez de lançar. Um prontuário podia ser alterado sem qualquer
      // registro de quem foi — exatamente o que a CFM 1.821/07 exige que haja.
      const trilhaOk = await logAudit({
        action: activeProntuario?.id ? 'update' : 'create',
        collection: 'prontuarios',
        recordId: prontuarioId,
        recordName: pacientes.find(p => p.id === selectedPacienteId)?.nome || '',
        userId: authProfile?.id || undefined,
        userName: authProfile?.nome || undefined,
      });

      if (trilhaOk) {
        toast.success('Prontuário salvo com sucesso!');
      } else {
        toast.warning('Prontuário salvo, mas não registrado na auditoria.', {
          description: 'O registro ficou na fila de reenvio. Se persistir, avise o suporte.',
          duration: 8000,
        });
      }
      if (selectedPacienteId) loadProntuarios(selectedPacienteId);
      setProntuarioTab('lista');
      setIsEditingProntuario(false);
      setActiveProntuario(null);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving prontuario:', error);
      toast.error('Erro ao salvar prontuário', { description: mensagemDeErro(error) });
    } finally {
      setSavingProntuario(false);
    }
  };

  const updateProntuarioField = (field: string, value: any) => setProntuarioForm(prev => ({ ...prev, [field]: value }));
  const updateSinal = (field: string, value: string) => {
    const next = { ...prontuarioSinais, [field]: value };
    if (field === 'peso' || field === 'altura') {
      const p = parseFloat(field === 'peso' ? value : next.peso || '0');
      const a = parseFloat(field === 'altura' ? value : next.altura || '0');
      if (p && a) { const altM = a > 3 ? a / 100 : a; next.imc = (p / (altM * altM)).toFixed(1); }
    }
    setProntuarioSinais(next);
  };

  const buscarCep = useCallback(async (cep: string) => {
    const lookupId = ++cepLookupRef.current;
    const cleaned = cep.replace(/\D/g, '');
    if (!cleaned) {
      setCepError('');
      setCepLoading(false);
      return;
    }
    if (cleaned.length !== 8) {
      setCepError('Informe os 8 dígitos do CEP para consultar o endereço.');
      setCepLoading(false);
      return;
    }
    setCepLoading(true);
    setCepError('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      if (!res.ok) throw new Error('Serviço de consulta de CEP indisponível.');
      const data = await res.json();
      if (lookupId !== cepLookupRef.current) return;
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
      } else {
        setCepError('CEP não encontrado. Confira os números ou preencha o endereço manualmente.');
      }
    } catch {
      if (lookupId === cepLookupRef.current) {
        setCepError('Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.');
      }
    } finally {
      if (lookupId === cepLookupRef.current) setCepLoading(false);
    }
  }, []);

  const filteredPacientes = pacientes;
  const selectedPaciente = pacienteSelecionadoDetalhe ?? pacientes.find((p) => p.id === selectedPacienteId) ?? pacienteDeepLink ?? null;
  const stats = {
    total: resumoEstatisticas?.total ?? '—',
    comConvenio: resumoEstatisticas?.com_convenio ?? '—',
    menores: resumoEstatisticas?.menores ?? '—',
    comAlergias: resumoEstatisticas?.com_alergias ?? '—',
  };
  const temMaisPacientes = resumoPacientes.length > inicioPagina + 50;

  const activeFilters = [Boolean(searchTerm.trim()), filterSexo !== 'todos', filterConvenio !== 'todos', filterIdade !== 'todos'].filter(Boolean).length;
  const atualizarListasPacientes = () => {
    void queryClient.invalidateQueries({ queryKey: ['busca-pacientes'] });
    void queryClient.invalidateQueries({ queryKey: ['pacientes-lista-detalhes'] });
    void queryClient.invalidateQueries({ queryKey: ['paciente-lista-selecionado'] });
    void queryClient.invalidateQueries({ queryKey: ['paciente-deep-link'] });
    void queryClient.invalidateQueries({ queryKey: ['pacientes-estatisticas'] });
  };
  const clearPatientFilters = () => {
    setPaginaPacientes(0);
    setSearchTerm('');
    setFilterSexo('todos');
    setFilterConvenio('todos');
    setFilterIdade('todos');
  };

  const handleNew = () => {
    edicaoPacienteSolicitadaRef.current += 1;
    cepLookupRef.current += 1;
    setCepLoading(false);
    setCepError('');
    setSelectedPacienteId(null);
    setSelectedPacienteUpdatedAt(null);
    setFormData(initialFormData);
    setFormSection('pessoal');
    setIsFormOpen(true);
  };

  const handleEdit = async (paciente: any) => {
    const edicaoSolicitada = ++edicaoPacienteSolicitadaRef.current;
    cepLookupRef.current += 1;
    setCepLoading(false);
    setCepError('');
    setIsViewOpen(false);
    setSelectedPacienteId(paciente.id);
    setSelectedPacienteUpdatedAt(paciente.updated_at || null);

    // As comorbidades vivem em tabela própria. Só as ativas entram no campo —
    // as inativas ficam no histórico e aparecem na linha do tempo do paciente.
    const { data: comorbidades, error: erroComorbidades } = await (supabase as any)
      .from('paciente_comorbidades')
      .select('descricao')
      .eq('paciente_id', paciente.id)
      .eq('ativo', true)
      .order('created_at');

    if (edicaoPacienteSolicitadaRef.current !== edicaoSolicitada) return;
    if (erroComorbidades) {
      // Sem isto, um erro aqui abriria o formulário com o campo vazio e o
      // salvamento apagaria as comorbidades que já existiam.
      toast.error('Não foi possível carregar as comorbidades. Recarregue antes de salvar.', { description: mensagemDeErro(erroComorbidades) });
      return;
    }

    setFormData({
      nome: paciente.nome,
      nome_social: paciente.nome_social || '',
      cpf: paciente.cpf || '',
      data_nascimento: paciente.data_nascimento || '',
      telefone: paciente.telefone || '',
      email: paciente.email || '',
      sexo: paciente.sexo || '',
      estado_civil: paciente.estado_civil || '',
      profissao: paciente.profissao || '',
      tipo_sanguineo: paciente.tipo_sanguineo || '',
      cep: paciente.cep || '',
      logradouro: paciente.logradouro || '',
      numero: paciente.numero || '',
      complemento: paciente.complemento || '',
      bairro: paciente.bairro || '',
      cidade: paciente.cidade || '',
      estado: paciente.estado || '',
      convenio_id: paciente.convenio_id || '',
      numero_carteira: paciente.numero_carteira || '',
      validade_carteira: paciente.validade_carteira || '',
      alergias: paciente.alergias || [],
      gestante: !!(paciente as any).gestante,
      amamentando: !!(paciente as any).amamentando,
      comorbidades: (comorbidades || []).map((c: any) => c.descricao).filter(Boolean),
      observacoes: paciente.observacoes || '',
      nome_responsavel: paciente.nome_responsavel || '',
      cpf_responsavel: paciente.cpf_responsavel || '',
      parentesco_responsavel: paciente.parentesco_responsavel || '',
      is_menor: !!paciente.nome_responsavel || isMinor(paciente.data_nascimento || ''),
    });
    setFormSection('pessoal');
    setIsFormOpen(true);
  };

  const handleView = handleViewWithProntuario;

  const handleDeleteClick = (paciente: any) => {
    setSelectedPacienteId(paciente.id);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedPacienteId) return;
    if (!authProfile?.clinica_id) {
      toast.error('Clínica não identificada', { description: 'Atualize a sessão antes de excluir pacientes.' });
      return;
    }
    if (pacienteDeleteLockRef.current) return;
    pacienteDeleteLockRef.current = true;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.from('pacientes').delete()
        .eq('id', selectedPacienteId).eq('clinica_id', authProfile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Não foi possível excluir: sem permissão ou o paciente já foi removido.');
        atualizarListasPacientes();
        setIsDeleteOpen(false);
        return;
      }
      toast.success('Paciente excluído com sucesso');
      atualizarListasPacientes();
      setIsDeleteOpen(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Erro ao excluir:', error);
      if ((error as any)?.code === '23503' || String((error as any)?.message || '').includes('histórico vinculado')) {
        toast.error('Exclusão bloqueada para preservar o histórico', {
          description: 'Use o fluxo LGPD para avaliar solicitações de exclusão de pacientes com dados vinculados.',
          duration: 9000,
        });
      } else {
        toast.error('Erro ao excluir paciente', { description: mensagemDeErro(error) });
      }
    } finally {
      pacienteDeleteLockRef.current = false;
      setIsDeleting(false);
    }
  };

  /**
   * Espelha o campo de comorbidades da ficha na tabela paciente_comorbidades.
   *
   * Uma comorbidade retirada da lista é marcada como inativa, não apagada: a
   * linha do tempo do paciente mostra "Condição inativa", e histórico clínico
   * não se joga fora. Reaparecer na lista reativa a mesma linha, preservando a
   * data de diagnóstico registrada antes.
   */
  const sincronizarComorbidades = async (pacienteId: string, desejadas: string[]) => {
    const { error } = await (supabase as any).rpc('sincronizar_comorbidades_paciente', {
      p_paciente_id: pacienteId,
      p_descricoes: desejadas,
    });
    if (error) throw error;
  };

  const handleSave = async () => {
    if (pacienteSaveLockRef.current) return;
    if (!authProfile?.clinica_id) {
      toast.error('Clínica não identificada', { description: 'Recarregue a página antes de cadastrar ou alterar pacientes.' });
      return;
    }
    if (!formData.nome.trim()) {
      setFormSection('pessoal');
      toast.error('Erro', { description: 'O campo Nome é obrigatório.' });
      return;
    }

    if (formData.cpf && !cpfValido(formData.cpf)) {
      setFormSection('pessoal');
      toast.error('CPF inválido', { description: 'Informe um CPF válido com 11 dígitos.' });
      return;
    }
    const cpfDigits = formData.cpf.replace(/\D/g, '');
    const pacienteComMesmoCpf = cpfDigits
      ? pacientes.find((paciente) => paciente.id !== selectedPacienteId && (paciente.cpf || '').replace(/\D/g, '') === cpfDigits)
      : null;
    if (pacienteComMesmoCpf) {
      setFormSection('pessoal');
      toast.error('Este CPF já está cadastrado nesta clínica', {
        description: `O cadastro pertence a ${(pacienteComMesmoCpf as any).nome_social || pacienteComMesmoCpf.nome}. Abra a ficha existente para evitar duplicidade.`,
        action: { label: 'Abrir ficha', onClick: () => handleView(pacienteComMesmoCpf) },
      });
      return;
    }
    if (formData.cpf_responsavel && !cpfValido(formData.cpf_responsavel)) {
      setFormSection('pessoal');
      toast.error('CPF do responsável inválido', { description: 'Informe um CPF válido com 11 dígitos.' });
      return;
    }
    if (formData.profissao.trim().length > 120) {
      toast.error('Profissão muito longa', { description: 'Use no máximo 120 caracteres.' });
      setFormSection('pessoal');
      return;
    }

    // Validate email only if provided
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setFormSection('pessoal');
      toast.error('E-mail inválido', { description: 'Informe um e-mail válido.' });
      return;
    }

    // Validate birthdate only if provided
    if (formData.data_nascimento && !isValidDateOnly(formData.data_nascimento)) {
      setFormSection('pessoal');
      toast.error('Data inválida', { description: 'Confira a data de nascimento informada.' });
      return;
    }
    if (formData.data_nascimento && formData.data_nascimento > todaySaoPauloDateOnly()) {
      setFormSection('pessoal');
      toast.error('Data inválida', { description: 'A data de nascimento não pode ser no futuro.' });
      return;
    }
    if (formData.validade_carteira && !isValidDateOnly(formData.validade_carteira)) {
      setFormSection('convenio');
      toast.error('Validade inválida', { description: 'Confira a data de validade da carteirinha.' });
      return;
    }

    if (exigeResponsavel && !formData.nome_responsavel.trim()) {
      toast.error('Responsável obrigatório', { description: 'Informe o nome do responsável por pacientes menores ou dependentes.' });
      setFormSection('pessoal');
      return;
    }

    // Validate phone only if provided
    if (formData.telefone) {
      const phoneDigits = formData.telefone.replace(/\D/g, '');
      if (phoneDigits.length > 0 && (phoneDigits.length < 10 || phoneDigits.length > 11)) {
        setFormSection('pessoal');
        toast.error('Telefone inválido', { description: 'O telefone deve ter 10 ou 11 dígitos.' });
        return;
      }
    }

    const comorbidadesParaSalvar = [...formData.comorbidades];
    pacienteSaveLockRef.current = true;
    setIsSubmitting(true);
    try {
      const dataToSave: any = {
        nome: formData.nome.trim(),
        nome_social: formData.nome_social || null,
        cpf: formData.cpf || null,
        data_nascimento: formData.data_nascimento || null,
        telefone: formData.telefone || null,
        email: formData.email.trim().toLocaleLowerCase('pt-BR') || null,
        sexo: formData.sexo || null,
        estado_civil: formData.estado_civil || null,
        profissao: formData.profissao.trim() || null,
        tipo_sanguineo: formData.tipo_sanguineo || null,
        cep: formData.cep || null,
        logradouro: formData.logradouro || null,
        numero: formData.numero || null,
        complemento: formData.complemento || null,
        bairro: formData.bairro || null,
        cidade: formData.cidade || null,
        estado: formData.estado || null,
        convenio_id: formData.convenio_id && formData.convenio_id !== '' && formData.convenio_id !== 'none' && formData.convenio_id !== 'pending' ? formData.convenio_id : null,
        numero_carteira: formData.numero_carteira || null,
        validade_carteira: formData.validade_carteira || null,
        alergias: (formData.alergias || []).map((a: string) => sanitizeText(a) || 'Alergia').filter(Boolean),
        gestante: formData.gestante,
        amamentando: formData.amamentando,
        observacoes: sanitizeText(formData.observacoes),
        nome_responsavel: formData.nome_responsavel || null,
        cpf_responsavel: formData.cpf_responsavel || null,
        parentesco_responsavel: formData.parentesco_responsavel || null,
        clinica_id: authProfile.clinica_id,
      };

      let pacienteId: string;
      let acao: 'atualizado' | 'cadastrado';

      if (selectedPacienteId) {
        if (!selectedPacienteUpdatedAt) {
          throw new Error('Não foi possível confirmar a versão desta ficha. Feche e abra o cadastro novamente antes de salvar.');
        }
        const { data, error } = await supabase.from('pacientes')
          .update(dataToSave)
          .eq('id', selectedPacienteId)
          .eq('clinica_id', authProfile.clinica_id)
          .eq('updated_at', selectedPacienteUpdatedAt)
          .select('id, updated_at')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Esta ficha foi alterada ou removida em outra sessão. Seus dados continuam no formulário; recarregue o cadastro e confira as alterações antes de salvar novamente.');
        setSelectedPacienteUpdatedAt(data.updated_at);
        pacienteId = selectedPacienteId;
        acao = 'atualizado';
      } else {
        // `.select('id').single()` porque as comorbidades vão para outra tabela
        // e precisam do id que o banco acabou de gerar.
        const { data: novo, error } = await supabase
          .from('pacientes')
          .insert(dataToSave)
          .select('id')
          .single();
        if (error) throw error;
        pacienteId = novo.id;
        acao = 'cadastrado';
      }

      // A partir daqui o paciente JÁ está salvo. Uma falha nas comorbidades não
      // pode ser anunciada como "erro ao salvar paciente": foi assim que o
      // cadastro pela recepção parecia falhar enquanto o paciente era criado, e
      // quem tentava de novo acabava com paciente duplicado.
      try {
        await sincronizarComorbidades(pacienteId, comorbidadesParaSalvar);
        toast.success(`Paciente ${acao} com sucesso`);
      } catch (erroComorbidades: any) {
        toast.warning(`Paciente ${acao}, mas as comorbidades não foram salvas`, {
          description: erroComorbidades?.message || 'Edite a ficha para tentar de novo.',
        });
      }

      atualizarListasPacientes();
      setIsFormOpen(false);
    } catch (error: any) {
      console.error('Erro ao salvar paciente:', error);
      const duplicidadeCpf = error?.code === '23505'
        && String(error?.message || '').includes('pacientes_cpf_por_clinica');
      if (duplicidadeCpf) {
        toast.error('Este CPF já está cadastrado nesta clínica', {
          description: 'Outro usuário pode ter cadastrado o paciente agora. Atualize a lista e abra a ficha existente.',
        });
        atualizarListasPacientes();
        return;
      }
      // A mensagem do banco costuma dizer exatamente o que faltou (campo
      // obrigatório, CPF duplicado, permissão). Esconder isso obriga a adivinhar.
      toast.error('Erro ao salvar paciente', {
        description: error?.message || error?.details || 'Verifique os dados e tente novamente.',
      });
    } finally {
      pacienteSaveLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleGeneratePortalLink = async (pacienteId: string, pacienteNome: string) => {
    try {
      const { data, error } = await supabase.rpc('link_portal_paciente', {
        p_paciente_id: pacienteId,
      });
      if (error) throw error;
      if (!data) throw new Error('Paciente não encontrado');
      const url = String(data);
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Cópia indisponível neste navegador.');
        await navigator.clipboard.writeText(url);
        toast.success('Link copiado!', { description: `Link do portal de ${pacienteNome} copiado.` });
      } catch {
        setLinkPortalGerado({ nome: pacienteNome, url });
        toast.info('O link foi gerado', { description: 'A cópia automática não funcionou. Copie o link na janela aberta.' });
      }
    } catch (e) {
      toast.error('Erro ao gerar link do portal', { description: mensagemDeErro(e) });
    }
  };

  const copiarLinkPortalExibido = async () => {
    if (!linkPortalGerado) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Cópia indisponível neste navegador.');
      await navigator.clipboard.writeText(linkPortalGerado.url);
      toast.success('Link copiado!');
    } catch {
      const campo = document.getElementById('link-portal-paciente') as HTMLInputElement | null;
      campo?.focus();
      campo?.select();
      toast.info('Link selecionado', { description: 'Pressione Ctrl+C (ou ⌘C no Mac) para copiar.' });
    }
  };

  const getConvenioNome = (convenioId: string | null) => {
    if (!convenioId) return 'Particular';
    const c = convenios.find((cv: any) => cv.id === convenioId);
    return c?.nome || 'Particular';
  };

  const pacientesForEtiqueta: Paciente[] = filteredPacientes.map((p) => ({
    id: p.id, nome: p.nome, cpf: p.cpf || '', dataNascimento: p.data_nascimento || '',
    telefone: p.telefone || '', email: p.email || '', convenio: null,
    endereco: { cep: p.cep || '', logradouro: p.logradouro || '', numero: p.numero || '', bairro: p.bairro || '', cidade: p.cidade || '', estado: p.estado || '' },
    alergias: p.alergias || [], observacoes: p.observacoes || '', criadoEm: p.created_at,
  }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (pacientesError) return <ErrorState error={pacientesError} title="Não foi possível carregar os pacientes" onRetry={() => { void refetch(); }} />;

  return (
    <div className="space-y-5 sm:space-y-6">
      {conveniosError && <ErrorState compact error={conveniosError} title="Convênios indisponíveis" description="A lista de convênios não carregou. Você pode continuar consultando pacientes, mas não deve alterar o convênio até atualizar os dados." onRetry={() => { void refetchConvenios(); }} />}
      {medicosError && <ErrorState compact error={medicosError} title="Médicos indisponíveis" description="A lista de médicos não carregou. Atualize os dados antes de agendar consultas ou solicitar exames nesta ficha." onRetry={() => { void refetchMedicos(); }} />}
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Pacientes</h1>
          <p className="text-muted-foreground">Gestão completa do cadastro de pacientes</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-3">
          <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setIsEtiquetaOpen(true)}
              className="h-11 w-full gap-2 rounded-xl border-2 border-border/60 px-3 text-sm font-semibold shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md sm:w-auto sm:px-5"
            >
              <Tag className="h-4 w-4" />
              Etiquetas da página
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
            <Button
              size="lg"
              onClick={handleNew}
              className="h-11 w-full gap-2 rounded-xl px-3 text-sm font-semibold shadow-md transition-all duration-200 hover:shadow-lg sm:w-auto sm:px-6"
            >
              <Plus className="h-5 w-5" />
              Novo Paciente
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats */}
      {resultadoBusca?.incompleta && resumoPacientes.length < limiteBusca && (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          A busca encontrou muitos cadastros semelhantes e foi limitada para manter a tela responsiva. Refine o nome, CPF ou telefone para localizar outros resultados.
        </div>
      )}
      {erroDeepLink && <ErrorState compact error={erroDeepLink} title="Não foi possível abrir o paciente do link" onRetry={() => { void refazerDeepLink(); }} />}
      {erroEstatisticas && <ErrorState compact error={erroEstatisticas} title="Indicadores indisponíveis" description="A lista continua disponível, mas os indicadores precisam ser atualizados." onRetry={() => { void refazerEstatisticas(); }} />}
      {detalhesErro && <ErrorState compact error={detalhesErro} title="Não foi possível carregar os dados desta página" onRetry={() => { void queryClient.invalidateQueries({ queryKey: ['pacientes-lista-detalhes'] }); }} />}
      <PatientStats total={stats.total} comConvenio={stats.comConvenio} menores={stats.menores} comAlergias={stats.comAlergias} />

      {/* Search & Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              Lista de Pacientes
              <Badge variant="secondary" className="text-xs">{temMaisPacientes ? `${inicioPagina + 50}+` : resumoPacientes.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome, CPF, telefone, email..."
                  value={searchTerm}
                  onChange={(e) => { setPaginaPacientes(0); setSearchTerm(e.target.value); }}
                className="h-11 pl-9"
                />
              </div>
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className="relative h-11 w-11 shrink-0"
                aria-label={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
              >
                <Filter className="h-4 w-4" />
                {activeFilters > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                    {activeFilters}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:flex sm:flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Sexo</Label>
                <Select value={filterSexo} onValueChange={(value) => { setPaginaPacientes(0); setFilterSexo(value); }}>
                  <SelectTrigger className="h-11 w-full text-xs sm:w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {SEXO_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Convênio</Label>
                <Select value={filterConvenio} onValueChange={(value) => { setPaginaPacientes(0); setFilterConvenio(value); }}>
                  <SelectTrigger className="h-11 w-full text-xs sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="particular">Particular</SelectItem>
                    {convenios.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Faixa Etária</Label>
                <Select value={filterIdade} onValueChange={(value) => { setPaginaPacientes(0); setFilterIdade(value); }}>
                  <SelectTrigger className="h-11 w-full text-xs sm:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="crianca">Criança (0-11)</SelectItem>
                    <SelectItem value="adolescente">Adolescente (12-17)</SelectItem>
                    <SelectItem value="adulto">Adulto (18-59)</SelectItem>
                    <SelectItem value="idoso">Idoso (60+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeFilters > 0 && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" className="h-11 text-xs gap-1" onClick={clearPatientFilters}>
                    <X className="h-3 w-3" /> Limpar
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <PatientListTable
            pacientes={filteredPacientes}
            totalPacientes={resumoEstatisticas?.total ?? null}
            totalPacientesCarregado={!carregandoEstatisticas || Boolean(erroEstatisticas)}
            hasFiltrosAtivos={activeFilters > 0}
            pagina={paginaPacientes}
            hasMore={temMaisPacientes}
            isLoading={carregandoDetalhes || isBuscandoPacientes}
            hasError={Boolean(detalhesErro || pacientesError)}
            onPaginaChange={setPaginaPacientes}
            onLimparFiltros={clearPatientFilters}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
            onGeneratePortalLink={handleGeneratePortalLink}
            podeGerarLinkPortal={podeGerarLinkPortal}
            podeExcluirPaciente={isAdmin()}
            getConvenioNome={getConvenioNome}
            calcularIdade={calcularIdade}
          />
        </CardContent>
      </Card>

      {/* ─── Form Dialog ─── */}
      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (open || !isSubmitting) {
          if (!open) edicaoPacienteSolicitadaRef.current += 1;
          setIsFormOpen(open);
        }
      }}>
        <DialogContent className="max-h-[100dvh] w-full max-w-3xl overflow-y-auto rounded-none pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:rounded-lg" aria-busy={isSubmitting}>
          <DialogHeader>
            <DialogTitle>{selectedPacienteId ? 'Editar Paciente' : 'Novo Paciente'}</DialogTitle>
          </DialogHeader>

          <fieldset disabled={isSubmitting} className="min-w-0 space-y-6 border-0 p-0">
          {/* Section nav */}
          <div className="flex gap-1 flex-wrap border-b pb-2">
            {[
              { key: 'pessoal', label: 'Dados Pessoais', icon: User2 },
              { key: 'endereco', label: 'Endereço', icon: MapPin },
              { key: 'convenio', label: 'Convênio', icon: Building2 },
              { key: 'clinico', label: 'Dados Clínicos', icon: Heart },
            ].map(s => (
              <Button
                key={s.key}
                variant={formSection === s.key ? 'default' : 'ghost'}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setFormSection(s.key)}
              >
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </Button>
            ))}
          </div>

          <div className="py-2 space-y-4">
            {/* Dados Pessoais */}
            {formSection === 'pessoal' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome Completo <span className="text-destructive">*</span></Label>
                    <Input value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome completo" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Nome Social
                      <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">Opcional</Badge>
                    </Label>
                    <Input value={formData.nome_social} onChange={e => setFormData({ ...formData, nome_social: e.target.value })} placeholder="Nome pelo qual prefere ser chamado(a)" />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF</Label>
                    <Input value={formData.cpf} onChange={e => {
                      setFormData({ ...formData, cpf: mascararCpf(e.target.value) });
                    }} placeholder="000.000.000-00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Nascimento</Label>
                    <Input type="date" value={formData.data_nascimento} onChange={e => setFormData({ ...formData, data_nascimento: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sexo</Label>
                    <Select value={formData.sexo} onValueChange={v => setFormData({ ...formData, sexo: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {SEXO_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={formData.telefone} onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      let masked = digits;
                      if (digits.length > 0) masked = `(${digits.slice(0, 2)}`;
                      if (digits.length > 2) masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                      if (digits.length > 7) masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                      else if (digits.length > 6) masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
                      setFormData({ ...formData, telefone: masked });
                    }} placeholder="(00) 00000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@exemplo.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado Civil</Label>
                    <Select value={formData.estado_civil} onValueChange={v => setFormData({ ...formData, estado_civil: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {ESTADO_CIVIL_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Profissão</Label>
                    <Input value={formData.profissao} onChange={e => setFormData({ ...formData, profissao: e.target.value })} placeholder="Profissão do paciente" maxLength={120} />
                  </div>
                </div>

                {/* Toggle menor de idade */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <Baby className="h-4 w-4 text-warning" />
                      Paciente menor de idade ou dependente?
                    </h4>
                    <Button
                      type="button"
                      variant={exigeResponsavel ? 'default' : 'outline'}
                      size="sm"
                      disabled={isMinor(formData.data_nascimento)}
                      onClick={() => setFormData({ ...formData, is_menor: !exigeResponsavel })}
                    >
                      {exigeResponsavel ? 'Sim' : 'Não'}
                    </Button>
                  </div>
                  {isMinor(formData.data_nascimento) && (
                    <p className="text-xs text-warning mt-1">A data de nascimento indica menor de idade; os dados do responsável são obrigatórios.</p>
                  )}
                </div>

                {exigeResponsavel && (
                  <div className="border rounded-lg p-4 bg-warning/5 border-warning/20">
                    <h4 className="font-medium mb-3 flex items-center gap-2 text-warning">
                      <Baby className="h-4 w-4" />
                      Dados do Responsável Legal
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Nome do Responsável *</Label>
                        <Input value={formData.nome_responsavel} onChange={e => setFormData({ ...formData, nome_responsavel: e.target.value })} placeholder="Nome completo" />
                      </div>
                      <div className="space-y-2">
                        <Label>CPF do Responsável</Label>
                        <Input value={formData.cpf_responsavel} onChange={e => setFormData({ ...formData, cpf_responsavel: mascararCpf(e.target.value) })} placeholder="000.000.000-00" />
                      </div>
                      <div className="space-y-2">
                        <Label>Parentesco</Label>
                        <Select value={formData.parentesco_responsavel} onValueChange={v => setFormData({ ...formData, parentesco_responsavel: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mae">Mãe</SelectItem>
                            <SelectItem value="pai">Pai</SelectItem>
                            <SelectItem value="avo">Avó/Avô</SelectItem>
                            <SelectItem value="tio">Tio(a)</SelectItem>
                            <SelectItem value="tutor">Tutor Legal</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Endereço */}
            {formSection === 'endereco' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <div className="relative">
                    <Input
                      value={formData.cep}
                      onChange={e => {
                        cepLookupRef.current += 1;
                        setCepLoading(false);
                        setCepError('');
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                        const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
                        setFormData({ ...formData, cep: masked });
                      }}
                      onBlur={e => buscarCep(e.target.value)}
                      placeholder="00000-000"
                      className="pr-8"
                    />
                    {cepLoading ? (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  {cepError ? (
                    <p role="alert" className="text-xs text-destructive">{cepError}</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Sai do campo para preencher automaticamente</p>
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Logradouro</Label>
                  <Input value={formData.logradouro} onChange={e => setFormData({ ...formData, logradouro: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input value={formData.numero} onChange={e => setFormData({ ...formData, numero: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Complemento</Label>
                  <Input value={formData.complemento} onChange={e => setFormData({ ...formData, complemento: e.target.value })} placeholder="Apto, Bloco, etc." />
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input value={formData.bairro} onChange={e => setFormData({ ...formData, bairro: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input value={formData.cidade} onChange={e => setFormData({ ...formData, cidade: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select value={formData.estado} onValueChange={v => setFormData({ ...formData, estado: v })}>
                    <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Convênio */}
            {formSection === 'convenio' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Possui convênio?</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={!formData.convenio_id ? 'default' : 'outline'}
                      onClick={() => setFormData({ ...formData, convenio_id: '', numero_carteira: '', validade_carteira: '' })}
                    >
                      Não
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={formData.convenio_id ? 'default' : 'outline'}
                      onClick={() => {
                        if (!formData.convenio_id) {
                          if (carregandoConvenios || conveniosError || conveniosAtivos.length === 0) return;
                          setFormData({ ...formData, convenio_id: conveniosAtivos[0].id });
                        }
                      }}
                      disabled={!formData.convenio_id && (carregandoConvenios || !!conveniosError || conveniosAtivos.length === 0)}
                    >
                      Sim
                    </Button>
                  </div>
                </div>

                {!formData.convenio_id && !carregandoConvenios && !conveniosError && conveniosAtivos.length === 0 && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Não há convênios ativos disponíveis. Ative ou cadastre um convênio antes de associá-lo a um novo paciente.
                  </p>
                )}

                {formData.convenio_id && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/30">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Convênio</Label>
                      <Select value={formData.convenio_id || 'none'} onValueChange={v => setFormData({ ...formData, convenio_id: v === 'none' ? '' : v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione o convênio" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum (Particular)</SelectItem>
                          {conveniosDisponiveisNoFormulario.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}{c.ativo === false ? ' (inativo — vínculo existente)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Número da Carteira</Label>
                      <Input value={formData.numero_carteira} onChange={e => setFormData({ ...formData, numero_carteira: e.target.value })} placeholder="Número da carteirinha" />
                    </div>
                    <div className="space-y-2">
                      <Label>Validade da Carteira</Label>
                      <Input type="date" value={formData.validade_carteira} onChange={e => setFormData({ ...formData, validade_carteira: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Dados Clínicos */}
            {formSection === 'clinico' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo Sanguíneo</Label>
                    <Select value={formData.tipo_sanguineo} onValueChange={v => setFormData({ ...formData, tipo_sanguineo: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {TIPO_SANGUINEO_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Informado pelo paciente; confirme antes de qualquer decisão clínica.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Alergias (separadas por vírgula)</Label>
                  <Input
                    value={formData.alergias.join(', ')}
                    onChange={e => setFormData({ ...formData, alergias: e.target.value.split(',').map(a => a.trim()).filter(Boolean) })}
                    placeholder="Penicilina, Dipirona, Ibuprofeno, etc."
                  />
                </div>
                {/* Alimentam os alertas de contraindicação na prescrição. Antes
                    não havia onde informar, então esses alertas nunca disparavam. */}
                <div className="space-y-2">
                  <Label>Condições que restringem medicamentos</Label>
                  <div className="flex flex-wrap gap-6 rounded-md border p-3">
                    <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                      <Checkbox
                        checked={formData.gestante}
                        onCheckedChange={v => setFormData({ ...formData, gestante: v === true })}
                      />
                      Gestante
                    </label>
                    <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                      <Checkbox
                        checked={formData.amamentando}
                        onCheckedChange={v => setFormData({ ...formData, amamentando: v === true })}
                      />
                      Amamentando
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A prescrição avisa o médico se o medicamento for contraindicado nessas condições.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Comorbidades (separadas por vírgula)</Label>
                  <Input
                    value={formData.comorbidades.join(', ')}
                    onChange={e => setFormData({
                      ...formData,
                      comorbidades: e.target.value.split(',').map(c => c.trim()).filter(Boolean),
                    })}
                    placeholder="Hipertensão, Diabetes tipo 2, Insuficiência renal, etc."
                  />
                  <p className="text-xs text-muted-foreground">
                    Retirar uma comorbidade daqui não apaga o histórico — ela passa a constar como
                    inativa na linha do tempo do paciente.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Observações Gerais</Label>
                  <Textarea
                    value={formData.observacoes}
                    onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                    placeholder="Informações adicionais relevantes sobre o paciente..."
                    rows={4}
                  />
                </div>
              </div>
            )}
          </div>

          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <LoadingButton onClick={handleSave} isLoading={isSubmitting} loadingText="Salvando...">Salvar</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Dialog (with Prontuário) ─── */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <User2 className="h-5 w-5 text-primary" />
              Ficha do Paciente
            </DialogTitle>
          </DialogHeader>
          {selectedPaciente && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Patient header summary */}
              <div className="flex items-center gap-3 px-1 py-2 flex-shrink-0">
                <PatientPhoto
                  pacienteId={selectedPaciente.id}
                  pacienteNome={selectedPaciente.nome}
                  currentPhotoUrl={selectedPaciente.foto_url}
                  size="md"
                  editable={false}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold truncate">{(selectedPaciente as any).nome_social || selectedPaciente.nome}</h3>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span>{selectedPaciente.data_nascimento
                      ? Number.isFinite(calcularIdade(selectedPaciente.data_nascimento)) && calcularIdade(selectedPaciente.data_nascimento) >= 0
                        ? `${calcularIdade(selectedPaciente.data_nascimento)}a`
                        : 'Nascimento inválido'
                      : 'Idade N/I'}</span>
                    {selectedPaciente.sexo && <span>• {selectedPaciente.sexo === 'M' ? '♂' : selectedPaciente.sexo === 'F' ? '♀' : '⚧'}</span>}
                    {selectedPaciente.cpf && <span>• {selectedPaciente.cpf}</span>}
                    <span>• {getConvenioNome(selectedPaciente.convenio_id)}</span>
                  </div>
                </div>
                {selectedPaciente.alergias && selectedPaciente.alergias.length > 0 && (
                  <AllergyAlert alergias={selectedPaciente.alergias} compact />
                )}
              </div>

              <Tabs value={viewTab} onValueChange={setViewTab} className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-shrink-0 overflow-x-auto">
                  <TabsList className="inline-flex w-auto min-w-full h-auto p-0.5 bg-muted/40 rounded-xl">
                    <TabsTrigger value="dados" className="text-[11px] gap-1 py-1.5 rounded-lg"><User2 className="h-3 w-3" />Dados</TabsTrigger>
                    <TabsTrigger value="consultas" className="text-[11px] gap-1 py-1.5 rounded-lg"><Calendar className="h-3 w-3" />Consultas</TabsTrigger>
                    <TabsTrigger value="exames" className="text-[11px] gap-1 py-1.5 rounded-lg"><TestTube className="h-3 w-3" />Exames</TabsTrigger>
                    {podeVerProntuario && (
                      <TabsTrigger value="prontuario" className="text-[11px] gap-1 py-1.5 rounded-lg"><Stethoscope className="h-3 w-3" />Prontuário</TabsTrigger>
                    )}
                    <TabsTrigger value="historico" className="text-[11px] gap-1 py-1.5 rounded-lg"><History className="h-3 w-3" />Timeline</TabsTrigger>
                    <TabsTrigger value="sinais" className="text-[11px] gap-1 py-1.5 rounded-lg"><Activity className="h-3 w-3" />Sinais</TabsTrigger>
                    <TabsTrigger value="endereco" className="text-[11px] gap-1 py-1.5 rounded-lg"><MapPin className="h-3 w-3" />Endereço</TabsTrigger>
                    <TabsTrigger value="financeiro" className="text-[11px] gap-1 py-1.5 rounded-lg"><Wallet className="h-3 w-3" />Financeiro</TabsTrigger>
                    <TabsTrigger value="lgpd" className="text-[11px] gap-1 py-1.5 rounded-lg"><ShieldCheck className="h-3 w-3" />LGPD</TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1 mt-3">
                  {/* Tab: Financeiro —
                      "esse paciente deve alguma coisa?" é a pergunta que a
                      recepção faz o dia inteiro e que não tinha resposta em
                      lugar nenhum do sistema. */}
                  <TabsContent value="financeiro" className="mt-0 space-y-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" />
                      Extrato do paciente
                    </span>
                    <ExtratoDoPaciente pacienteId={selectedPaciente.id} />
                  </TabsContent>

                  {/* Tab: LGPD — captação de consentimento. Sem esta tab, o
                      componente `ConsentimentoLGPD` existia mas ninguém
                      chamava, e `consentimentos_lgpd` ficou zerado nas 12
                      clínicas. Agora aparece na ficha, ao lado do resto. */}
                  <TabsContent value="lgpd" className="mt-0 space-y-3">
                    <ConsentimentoLGPD
                      pacienteId={selectedPaciente.id}
                      pacienteNome={selectedPaciente.nome}
                      consentimentos={[]}
                      onConsentimentoRegistrado={() => { /* refetch é feito internamente pelo componente */ }}
                    />
                  </TabsContent>

                  {/* Tab: Dados */}
                  <TabsContent value="dados" className="space-y-5 pt-1 mt-0">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <InfoField icon={FileText} label="CPF" value={selectedPaciente.cpf} />
                      <InfoField icon={Calendar} label="Nascimento" value={selectedPaciente.data_nascimento ? new Date(selectedPaciente.data_nascimento + 'T12:00').toLocaleDateString('pt-BR') : null} />
                      <InfoField icon={Phone} label="Telefone" value={selectedPaciente.telefone} />
                      <InfoField icon={Mail} label="Email" value={selectedPaciente.email} />
                      <InfoField icon={Building2} label="Convênio" value={getConvenioNome(selectedPaciente.convenio_id)} />
                      <InfoField icon={CreditCard} label="Carteira" value={selectedPaciente.numero_carteira} />
                      <InfoField icon={Users} label="Estado civil" value={ESTADO_CIVIL_OPTIONS.find(option => option.value === selectedPaciente.estado_civil)?.label} />
                      <InfoField icon={Briefcase} label="Profissão" value={selectedPaciente.profissao} />
                      <InfoField icon={Droplets} label="Tipo sanguíneo informado" value={selectedPaciente.tipo_sanguineo} />
                    </div>

                    {selectedPaciente.convenio_id && (
                      <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3">
                        <div className="text-sm">
                          <p className="font-medium">Autorizações do convênio</p>
                          <p className="text-xs text-muted-foreground">
                            Guias e senhas de autorização deste paciente
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-xl text-xs"
                          onClick={() => setShowAutorizacao(true)}
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          Gerenciar
                        </Button>
                      </div>
                    )}

                    {selectedPaciente.nome_responsavel && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2"><Baby className="h-4 w-4 text-warning" /> Responsável Legal</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                            <InfoField icon={User2} label="Nome" value={selectedPaciente.nome_responsavel} />
                            <InfoField icon={FileText} label="CPF" value={selectedPaciente.cpf_responsavel} />
                            <InfoField icon={Users} label="Parentesco" value={selectedPaciente.parentesco_responsavel} />
                          </div>
                        </div>
                      </>
                    )}
                    {selectedPaciente.observacoes && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-medium text-sm mb-1">Observações</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedPaciente.observacoes}</p>
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* Tab: Consultas / Agendamentos */}
                  <TabsContent value="consultas" className="mt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Consultas ({agendamentosList.length}{temMaisAgendamentos ? '+' : ''})
                      </span>
                      <Button size="sm" disabled={!!medicosError} onClick={() => { setAgendamentoForm({ data: todaySaoPauloDateOnly(), hora_inicio: '08:00', medico_id: medicoId || '', tipo: 'consulta', observacoes: '' }); setShowAgendamentoForm(true); }} className="gap-1.5 rounded-xl text-xs">
                        <CalendarPlus className="h-3.5 w-3.5" />Agendar Consulta
                      </Button>
                    </div>

                    {showAgendamentoForm && (
                      <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
                        <h4 className="text-sm font-semibold">Nova Consulta</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Data *</Label>
                            <Input type="date" value={agendamentoForm.data || ''} onChange={e => setAgendamentoForm(p => ({ ...p, data: e.target.value }))} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Horário *</Label>
                            <Input type="time" value={agendamentoForm.hora_inicio || ''} onChange={e => setAgendamentoForm(p => ({ ...p, hora_inicio: e.target.value }))} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Médico *</Label>
                            <Select value={agendamentoForm.medico_id || ''} onValueChange={v => setAgendamentoForm(p => ({ ...p, medico_id: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                {medicos.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome || m.crm} - {m.especialidade || 'Geral'}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Tipo</Label>
                            <Select value={agendamentoForm.tipo || 'consulta'} onValueChange={v => setAgendamentoForm(p => ({ ...p, tipo: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="consulta">Consulta</SelectItem>
                                <SelectItem value="retorno">Retorno</SelectItem>
                                <SelectItem value="exame">Exame</SelectItem>
                                <SelectItem value="coleta">Coleta Laboratorial</SelectItem>
                                <SelectItem value="procedimento">Procedimento</SelectItem>
                                <SelectItem value="cirurgia">Cirurgia</SelectItem>
                                <SelectItem value="avaliacao">Avaliação</SelectItem>
                                <SelectItem value="checkup">Check-up</SelectItem>
                                <SelectItem value="triagem">Triagem</SelectItem>
                                <SelectItem value="enfermagem">Atendimento Enfermagem</SelectItem>
                                <SelectItem value="vacina">Vacinação</SelectItem>
                                <SelectItem value="curativo">Curativo</SelectItem>
                                <SelectItem value="outro">Outro</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Observações</Label>
                            <Textarea value={agendamentoForm.observacoes || ''} onChange={e => setAgendamentoForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} className="text-xs" placeholder="Observações sobre a consulta..." />
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Este agendamento reserva 30 minutos. Conflitos e bloqueios do médico serão conferidos ao salvar.</p>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setShowAgendamentoForm(false)} className="text-xs h-7">Cancelar</Button>
                          <LoadingButton size="sm" className="text-xs h-7" isLoading={savingAgendamento} loadingText="Salvando..." onClick={async () => {
                            if (!agendamentoForm.data || !agendamentoForm.hora_inicio || !agendamentoForm.medico_id) {
                              toast.error('Preencha data, horário e médico');
                              return;
                            }
                            if (!authProfile?.clinica_id) {
                              toast.error('Não foi possível identificar a clínica deste usuário.');
                              return;
                            }
                            const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(agendamentoForm.data)
                              && !Number.isNaN(new Date(`${agendamentoForm.data}T12:00:00Z`).getTime())
                              && new Date(`${agendamentoForm.data}T12:00:00Z`).toISOString().slice(0, 10) === agendamentoForm.data;
                            const inicioMin = minutosDaHora(agendamentoForm.hora_inicio);
                            if (!dataValida || inicioMin === null || inicioMin + 30 >= 24 * 60) {
                              toast.error('Informe uma data e um horário válidos. A consulta deve terminar antes da meia-noite.');
                              return;
                            }
                            const fimMin = inicioMin + 30;
                            setSavingAgendamento(true);
                            try {
                              const [{ data: doDia, error: erroDoDia }, { data: bloqueios, error: erroBloqueios }] = await Promise.all([
                                supabase.from('agendamentos')
                                  .select('id, hora_inicio, hora_fim, status')
                                  .eq('clinica_id', authProfile.clinica_id)
                                  .eq('medico_id', agendamentoForm.medico_id)
                                  .eq('data', agendamentoForm.data),
                                (supabase.from('bloqueios_agenda' as any)
                                  .select('id, hora_inicio, hora_fim, dia_inteiro, motivo, tipo')
                                  .eq('clinica_id', authProfile.clinica_id)
                                  .eq('medico_id', agendamentoForm.medico_id)
                                  .lte('data_inicio', agendamentoForm.data)
                                  .gte('data_fim', agendamentoForm.data) as any),
                              ]);
                              if (erroDoDia) throw erroDoDia;
                              if (erroBloqueios) throw erroBloqueios;

                              const conflito = (doDia || []).find((ag: any) => {
                                if (ag.status === 'cancelado' || ag.status === 'faltou') return false;
                                const inicioExistente = minutosDaHora(ag.hora_inicio);
                                const fimExistente = minutosDaHora(ag.hora_fim) ?? (inicioExistente === null ? null : inicioExistente + 30);
                                return inicioExistente !== null && fimExistente !== null && inicioExistente < fimMin && fimExistente > inicioMin;
                              });
                              if (conflito) throw new Error('Este médico já tem uma consulta neste horário. Escolha outro horário.');

                              const bloqueio = (bloqueios || []).find((item: any) => {
                                if (item.dia_inteiro) return true;
                                const inicioBloqueio = minutosDaHora(item.hora_inicio);
                                const fimBloqueio = minutosDaHora(item.hora_fim);
                                return inicioBloqueio !== null && fimBloqueio !== null && inicioBloqueio < fimMin && fimBloqueio > inicioMin;
                              });
                              if (bloqueio) {
                                throw new Error(`Este médico está bloqueado neste horário${bloqueio.motivo ? `: ${bloqueio.motivo}` : bloqueio.tipo ? ` (${bloqueio.tipo})` : '.'}`);
                              }

                              const { error } = await supabase.from('agendamentos').insert({
                                paciente_id: selectedPacienteId!,
                                medico_id: agendamentoForm.medico_id,
                                data: agendamentoForm.data,
                                hora_inicio: agendamentoForm.hora_inicio,
                                hora_fim: `${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}:00`,
                                tipo: agendamentoForm.tipo || 'consulta',
                                observacoes: agendamentoForm.observacoes || null,
                                status: 'agendado',
                                clinica_id: authProfile?.clinica_id || null,
                              });
                              if (error) throw error;
                              toast.info('Consulta agendada!');
                              setShowAgendamentoForm(false);
                              loadAgendamentos(selectedPacienteId!);
                            } catch (err: any) {
                              const mensagem = mensagemDeErro(err);
                              toast.error('Erro ao agendar', {
                                description: err?.code === '23P01' || mensagem.includes('agendamentos_sem_sobreposicao')
                                  ? 'O horário acabou de ser ocupado. Atualize a agenda e tente novamente.'
                                  : mensagem,
                              });
                            } finally { setSavingAgendamento(false); }
                          }}>Agendar</LoadingButton>
                        </div>
                      </div>
                    )}

                    {loadingAgendamentos ? (
                      <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
                    ) : agendamentosLoadError ? (
                      <ErrorState compact title="Não foi possível carregar as consultas" error={agendamentosLoadError} onRetry={() => { if (selectedPacienteId) void loadAgendamentos(selectedPacienteId); }} />
                    ) : agendamentosList.length === 0 ? (
                      <div className="flex flex-col items-center py-14 text-muted-foreground">
                        <Calendar className="h-8 w-8 opacity-20 mb-2" />
                        <p className="text-xs">Nenhuma consulta agendada</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {agendamentosList.map((a, idx) => {
                          const statusColors: Record<string, string> = {
                            agendado: 'bg-info/10 text-info',
                            confirmado: 'bg-success/10 text-success',
                            cancelado: 'bg-destructive/10 text-destructive',
                            realizado: 'bg-muted text-muted-foreground',
                            em_atendimento: 'bg-warning/10 text-warning',
                          };
                          return (
                            <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                              className="border border-border/40 rounded-xl p-3 hover:border-primary/30 transition-all">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge className={cn("text-[10px] px-1.5 py-0", statusColors[a.status] || 'bg-muted text-muted-foreground')}>
                                      {a.status?.replace('_', ' ')}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.tipo || 'consulta'}</Badge>
                                  </div>
                                  <p className="text-xs font-semibold">
                                    {format(new Date(a.data + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })} às {a.hora_inicio?.slice(0, 5)}
                                  </p>
                                  {a.medicos && <p className="text-[11px] text-muted-foreground">{nomeMedico(a.medicos.nome || a.medicos.crm)}</p>}
                                  {a.observacoes && <p className="text-[11px] text-muted-foreground line-clamp-1">{a.observacoes}</p>}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                    {temMaisAgendamentos && !agendamentosLoadError && selectedPacienteId && (
                      <div className="flex justify-center pt-1">
                        <Button variant="outline" size="sm" disabled={loadingMaisAgendamentos} onClick={() => void loadAgendamentos(selectedPacienteId, agendamentosList.length)}>
                          {loadingMaisAgendamentos ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
                          {loadingMaisAgendamentos ? 'Carregando…' : 'Carregar consultas anteriores'}
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab: Exames */}
                  <TabsContent value="exames" className="mt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <TestTube className="h-3.5 w-3.5" />
                        Exames ({examesList.length}{temMaisExames ? '+' : ''})
                      </span>
                      <Button size="sm" disabled={!!medicosError} onClick={() => { setExameForm({ tipo_exame: '', medico_solicitante_id: medicoId || '', observacoes: '' }); setShowExameForm(true); }} className="gap-1.5 rounded-xl text-xs">
                        <Plus className="h-3.5 w-3.5" />Solicitar Exame
                      </Button>
                    </div>

                    {showExameForm && (
                      <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
                        <h4 className="text-sm font-semibold">Novo Pedido de Exame</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1 col-span-2">
                            <Label className="text-xs">Tipo de Exame *</Label>
                            <Input value={exameForm.tipo_exame || ''} onChange={e => setExameForm(p => ({ ...p, tipo_exame: e.target.value }))} placeholder="Ex: Hemograma, Glicemia..." className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Médico Solicitante *</Label>
                            <Select value={exameForm.medico_solicitante_id || ''} onValueChange={v => setExameForm(p => ({ ...p, medico_solicitante_id: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                {medicos.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome || m.crm}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Data Agendamento</Label>
                            <Input type="date" value={exameForm.data_agendamento || ''} onChange={e => setExameForm(p => ({ ...p, data_agendamento: e.target.value }))} className="h-8 text-xs" />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Observações / Justificativa</Label>
                            <Textarea value={exameForm.observacoes || ''} onChange={e => setExameForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} className="text-xs" placeholder="Indicação clínica, urgência..." />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setShowExameForm(false)} className="text-xs h-7">Cancelar</Button>
                          <LoadingButton size="sm" className="text-xs h-7" isLoading={savingExame} loadingText="Salvando..." onClick={async () => {
                            if (exameSaveLockRef.current) return;
                            if (!exameForm.tipo_exame || !exameForm.medico_solicitante_id) {
                              toast.error('Preencha tipo de exame e médico');
                              return;
                            }
                            if (!authProfile?.clinica_id) {
                              toast.error('Não foi possível identificar a clínica deste usuário.');
                              return;
                            }
                            if (exameForm.data_agendamento && !isValidDateOnly(exameForm.data_agendamento)) {
                              toast.error('Informe uma data válida para o exame.');
                              return;
                            }
                            exameSaveLockRef.current = true;
                            setSavingExame(true);
                            try {
                              const { error } = await supabase.from('exames').insert({
                                paciente_id: selectedPacienteId!,
                                medico_solicitante_id: exameForm.medico_solicitante_id,
                                tipo_exame: exameForm.tipo_exame,
                                data_agendamento: exameForm.data_agendamento || null,
                                observacoes: exameForm.observacoes || null,
                                status: 'solicitado',
                                clinica_id: authProfile.clinica_id,
                              });
                              if (error) throw error;
                              toast.success('Exame solicitado!');
                              setShowExameForm(false);
                              loadExames(selectedPacienteId!);
                            } catch (err: any) {
                              toast.error('Erro ao solicitar exame', { description: mensagemDeErro(err) });
                            } finally {
                              exameSaveLockRef.current = false;
                              setSavingExame(false);
                            }
                          }}>Solicitar</LoadingButton>
                        </div>
                      </div>
                    )}

                    {loadingExames ? (
                      <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
                    ) : examesLoadError ? (
                      <ErrorState compact title="Não foi possível carregar os exames" error={examesLoadError} onRetry={() => { if (selectedPacienteId) void loadExames(selectedPacienteId); }} />
                    ) : examesList.length === 0 ? (
                      <div className="flex flex-col items-center py-14 text-muted-foreground">
                        <TestTube className="h-8 w-8 opacity-20 mb-2" />
                        <p className="text-xs">Nenhum exame registrado</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {examesList.map((ex, idx) => {
                          const exStatusColors: Record<string, string> = {
                            solicitado: 'bg-info/10 text-info',
                            agendado: 'bg-warning/10 text-warning',
                            em_andamento: 'bg-primary/10 text-primary',
                            concluido: 'bg-success/10 text-success',
                            cancelado: 'bg-destructive/10 text-destructive',
                          };
                          return (
                            <motion.div key={ex.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                              className="border border-border/40 rounded-xl p-3 hover:border-primary/30 transition-all">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge className={cn("text-[10px] px-1.5 py-0", exStatusColors[ex.status] || 'bg-muted text-muted-foreground')}>
                                    {ex.status?.replace('_', ' ')}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {ex.data_solicitacao ? format(new Date(ex.data_solicitacao + 'T12:00'), 'dd/MM/yyyy') : ''}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold">{ex.tipo_exame}</p>
                                {ex.medicos && <p className="text-[11px] text-muted-foreground">Solicitante: {nomeMedico(ex.medicos.nome || ex.medicos.crm)}</p>}
                                {ex.resultado && <p className="text-[11px] text-success">Resultado: {ex.resultado.substring(0, 80)}...</p>}
                                {ex.observacoes && <p className="text-[11px] text-muted-foreground line-clamp-1">{ex.observacoes}</p>}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                    {temMaisExames && !examesLoadError && selectedPacienteId && (
                      <div className="flex justify-center pt-1">
                        <Button variant="outline" size="sm" disabled={loadingMaisExames} onClick={() => void loadExames(selectedPacienteId, examesList.length)}>
                          {loadingMaisExames ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
                          {loadingMaisExames ? 'Carregando…' : 'Carregar exames anteriores'}
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab: Prontuário */}
                  {/* Também condicionado: esconder só o gatilho deixaria o
                      conteúdo acessível por URL ou pelo estado da aba. */}
                  <TabsContent value="prontuario" className={podeVerProntuario ? 'mt-0 space-y-3' : 'hidden'}>
                    {prontuarioTab === 'lista' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <ClipboardList className="h-3.5 w-3.5" />
                            Evoluções ({prontuarioList.length}{temMaisProntuarios ? '+' : ''})
                          </span>
                          <Button size="sm" onClick={handleNewProntuario} className="gap-1.5 rounded-xl text-xs">
                            <Plus className="h-3.5 w-3.5" />Novo Atendimento
                          </Button>
                        </div>

                        {loadingProntuarios ? (
                          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
                        ) : prontuariosLoadError ? (
                          <ErrorState compact title="Não foi possível carregar o histórico" description="O prontuário pode ter registros; atualize a lista antes de concluir que está vazia." error={prontuariosLoadError} onRetry={() => { if (selectedPacienteId) void loadProntuarios(selectedPacienteId); }} />
                        ) : prontuarioList.length === 0 ? (
                          <div className="flex flex-col items-center py-14 text-muted-foreground">
                            <FileText className="h-8 w-8 opacity-20 mb-2" />
                            <p className="text-xs">Nenhuma evolução registrada</p>
                            <Button variant="link" size="sm" onClick={handleNewProntuario} className="text-xs mt-1">Iniciar primeiro atendimento</Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {prontuarioList.map((p, idx) => (
                              <motion.div
                                key={p.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.02 }}
                                className="group border border-border/40 rounded-xl p-3.5 hover:border-primary/30 cursor-pointer transition-all hover:bg-primary/[0.02]"
                                onClick={() => handleOpenProntuario(p)}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-1.5 py-0">
                                        {format(parseDateOnly(p.data)!, 'dd/MM/yyyy')}
                                      </Badge>
                                      {p.diagnostico_principal && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{p.diagnostico_principal}</Badge>
                                      )}
                                      {p.medicos && (
                                        <span className="text-[10px] text-muted-foreground">{nomeMedico(p.medicos.nome || p.medicos.crm)}</span>
                                      )}
                                    </div>
                                    <p className="text-xs font-semibold text-foreground truncate">{p.queixa_principal}</p>
                                    {p.conduta && <p className="text-[11px] text-muted-foreground line-clamp-1">Conduta: {p.conduta}</p>}
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {prontuarioTab === 'lista' && temMaisProntuarios && !prontuariosLoadError && selectedPacienteId && (
                      <div className="flex justify-center pt-1">
                        <Button variant="outline" size="sm" disabled={loadingMaisProntuarios} onClick={() => void loadProntuarios(selectedPacienteId, prontuarioList.length)}>
                          {loadingMaisProntuarios ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
                          {loadingMaisProntuarios ? 'Carregando…' : 'Carregar evoluções anteriores'}
                        </Button>
                      </div>
                    )}

                    {prontuarioTab === 'editor' && (
                      <div className="space-y-4">
                        {/* Editor header */}
                        <div className="flex items-center justify-between">
                          <Button variant="ghost" size="sm" onClick={() => { setProntuarioTab('lista'); setIsEditingProntuario(false); }} className="gap-1 text-xs">
                            ← Voltar
                          </Button>
                          <div className="flex items-center gap-2">
                            {activeProntuario && !isEditingProntuario && (
                              <Button variant="outline" size="sm" onClick={() => setIsEditingProntuario(true)} className="gap-1 text-xs h-7">
                                <PenLine className="h-3 w-3" />Editar
                              </Button>
                            )}
                            {isEditingProntuario && (
                              <LoadingButton
                                onClick={handleSaveProntuario}
                                isLoading={savingProntuario}
                                loadingText="Salvando..."
                                size="sm"
                                className="gap-1 text-xs h-7 rounded-xl"
                              >
                                <Save className="h-3 w-3" />Salvar
                              </LoadingButton>
                            )}
                          </div>
                        </div>

                        {/* Read-only banner */}
                        {activeProntuario && !isEditingProntuario && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border/40 rounded-xl text-xs text-muted-foreground">
                            <Lock className="h-3 w-3 flex-shrink-0" />
                            Somente leitura — CFM nº 1.821/07
                          </div>
                        )}

                        <fieldset disabled={activeProntuario ? !isEditingProntuario : false} className="space-y-4">
                          {/* Queixa Principal */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-destructive" />Queixa Principal *</Label>
                            <Textarea placeholder="Queixa principal..." value={prontuarioForm.queixa_principal || ''} onChange={e => updateProntuarioField('queixa_principal', e.target.value)} rows={2} />
                          </div>

                          {/* HDA */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold flex items-center gap-1.5"><FileText className="h-3 w-3" />História da Doença Atual</Label>
                            <Textarea placeholder="Evolução cronológica..." value={prontuarioForm.historia_doenca_atual || ''} onChange={e => updateProntuarioField('historia_doenca_atual', e.target.value)} rows={3} />
                          </div>

                          {/* Sinais Vitais */}
                          <div className="space-y-2">
                            <Label className="text-xs font-bold flex items-center gap-1.5"><Activity className="h-3 w-3 text-primary" />Sinais Vitais</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                              {[
                                { label: 'PA Sist.', field: 'pressao_sistolica', placeholder: '120', icon: Heart, accent: 'text-destructive' },
                                { label: 'PA Diast.', field: 'pressao_diastolica', placeholder: '80', icon: Heart, accent: 'text-destructive' },
                                { label: 'FC (bpm)', field: 'frequencia_cardiaca', placeholder: '72', icon: Heart, accent: 'text-destructive' },
                                { label: 'FR (irpm)', field: 'frequencia_respiratoria', placeholder: '16', icon: Activity, accent: 'text-info' },
                                { label: 'Temp (°C)', field: 'temperatura', placeholder: '36.5', icon: Thermometer, accent: 'text-warning' },
                                { label: 'SpO₂ (%)', field: 'saturacao', placeholder: '98', icon: Droplets, accent: 'text-info' },
                                { label: 'Peso (kg)', field: 'peso', placeholder: '70', icon: Scale, accent: 'text-success' },
                                { label: 'Alt (cm)', field: 'altura', placeholder: '170', icon: Ruler, accent: 'text-primary' },
                                { label: 'Glasgow', field: 'glasgow', placeholder: '15', icon: Brain, accent: 'text-primary' },
                                { label: 'Dor (0-10)', field: 'dor', placeholder: '0', icon: AlertTriangle, accent: 'text-warning' },
                              ].map(f => {
                                const Icon = f.icon;
                                return (
                                  <div key={f.field} className="rounded-xl border border-border/60 bg-card p-2 space-y-0.5">
                                    <Label className={`text-[9px] font-semibold flex items-center gap-0.5 ${f.accent}`}>
                                      <Icon className="h-2.5 w-2.5" />{f.label}
                                    </Label>
                                    <Input
                                      placeholder={f.placeholder}
                                      value={prontuarioSinais[f.field] || ''}
                                      onChange={e => updateSinal(f.field, e.target.value)}
                                      className="h-7 text-xs px-2"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Exame Físico */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold flex items-center gap-1.5"><Stethoscope className="h-3 w-3" />Exame Físico</Label>
                            <Textarea placeholder="Estado geral, ausculta..." value={prontuarioForm.exames_fisicos || ''} onChange={e => updateProntuarioField('exames_fisicos', e.target.value)} rows={3} />
                          </div>

                          {/* Alergias + Medicamentos */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-destructive" />Alergias Relatadas</Label>
                              <Textarea placeholder="Alergias..." value={prontuarioForm.alergias_relatadas || ''} onChange={e => updateProntuarioField('alergias_relatadas', e.target.value)} rows={2} className="border-destructive/30" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold flex items-center gap-1.5"><Pill className="h-3 w-3" />Medicamentos em Uso</Label>
                              <Textarea placeholder="Medicamentos..." value={prontuarioForm.medicamentos_em_uso || ''} onChange={e => updateProntuarioField('medicamentos_em_uso', e.target.value)} rows={2} />
                            </div>
                          </div>

                          {/* Hipótese + Diagnóstico */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold flex items-center gap-1.5"><BookOpen className="h-3 w-3" />Hipótese Diagnóstica</Label>
                              <Input placeholder="CID-10 / Hipótese" value={prontuarioForm.hipotese_diagnostica || ''} onChange={e => updateProntuarioField('hipotese_diagnostica', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold flex items-center gap-1.5"><FileCheck className="h-3 w-3" />Diagnóstico Principal</Label>
                              <Input placeholder="Diagnóstico" value={prontuarioForm.diagnostico_principal || ''} onChange={e => updateProntuarioField('diagnostico_principal', e.target.value)} />
                            </div>
                          </div>

                          {/* Conduta */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold flex items-center gap-1.5"><FileCheck className="h-3 w-3" />Conduta</Label>
                            <Textarea placeholder="Conduta terapêutica, exames, encaminhamentos..." value={prontuarioForm.conduta || ''} onChange={e => updateProntuarioField('conduta', e.target.value)} rows={3} />
                          </div>

                          {/* Plano + Orientações */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold flex items-center gap-1.5"><ClipboardList className="h-3 w-3" />Plano Terapêutico</Label>
                              <Textarea placeholder="Plano detalhado..." value={prontuarioForm.plano_terapeutico || ''} onChange={e => updateProntuarioField('plano_terapeutico', e.target.value)} rows={2} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold flex items-center gap-1.5"><User2 className="h-3 w-3" />Orientações ao Paciente</Label>
                              <Textarea placeholder="Cuidados, retorno, sinais de alarme..." value={prontuarioForm.orientacoes_paciente || ''} onChange={e => updateProntuarioField('orientacoes_paciente', e.target.value)} rows={2} />
                            </div>
                          </div>

                          {/* Prescrições */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <Label className="text-xs font-bold flex items-center gap-1.5"><Pill className="h-3 w-3" />Prescrições ({prontuarioPrescricoes.length})</Label>
                              {isEditingProntuario && (
                                <Button variant="outline" size="sm" onClick={() => setProntuarioPrescricoes([...prontuarioPrescricoes, { medicamento: '', dosagem: '', posologia: '', duracao: '', quantidade: '', observacoes: '' }])} className="text-[10px] h-6 gap-1">
                                  <Plus className="h-3 w-3" />Adicionar
                                </Button>
                              )}
                            </div>
                            {prontuarioPrescricoes.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-3 text-center">Nenhuma prescrição</p>
                            ) : (
                              <div className="space-y-2">
                                {prontuarioPrescricoes.map((presc, i) => (
                                  <div key={i} className="border rounded-lg p-2.5 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-semibold">#{i + 1}</span>
                                      {isEditingProntuario && (
                                        <Button variant="ghost" size="sm" onClick={() => setProntuarioPrescricoes(prontuarioPrescricoes.filter((_, idx) => idx !== i))} className="text-destructive h-5 w-5 p-0">
                                          <X className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                                      <div className="col-span-2 md:col-span-3">
                                        <Input placeholder="Medicamento *" value={presc.medicamento} onChange={e => { const u = [...prontuarioPrescricoes]; u[i] = { ...u[i], medicamento: e.target.value }; setProntuarioPrescricoes(u); }} className="text-xs h-7" />
                                      </div>
                                      <Input placeholder="Dosagem" value={presc.dosagem} onChange={e => { const u = [...prontuarioPrescricoes]; u[i] = { ...u[i], dosagem: e.target.value }; setProntuarioPrescricoes(u); }} className="text-xs h-7" />
                                      <Input placeholder="Posologia" value={presc.posologia} onChange={e => { const u = [...prontuarioPrescricoes]; u[i] = { ...u[i], posologia: e.target.value }; setProntuarioPrescricoes(u); }} className="text-xs h-7" />
                                      <Input placeholder="Duração" value={presc.duracao} onChange={e => { const u = [...prontuarioPrescricoes]; u[i] = { ...u[i], duracao: e.target.value }; setProntuarioPrescricoes(u); }} className="text-xs h-7" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Observações internas */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold flex items-center gap-1.5"><Shield className="h-3 w-3" />Observações Internas</Label>
                            <Textarea placeholder="Anotações internas (não imprime)..." value={prontuarioForm.observacoes_internas || ''} onChange={e => updateProntuarioField('observacoes_internas', e.target.value)} rows={2} className="border-dashed" />
                          </div>
                        </fieldset>

                        {/* LGPD badge */}
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 rounded-lg p-2">
                          <ShieldCheck className="h-3 w-3" />
                          <span>LGPD • CFM nº 1.821/07 • Todos os acessos registrados</span>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab: Endereço */}
                  <TabsContent value="endereco" className="pt-1 mt-0">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <InfoField icon={MapPin} label="CEP" value={selectedPaciente.cep} />
                      <InfoField icon={MapPin} label="Logradouro" value={selectedPaciente.logradouro} />
                      <InfoField icon={MapPin} label="Número" value={selectedPaciente.numero} />
                      <InfoField icon={MapPin} label="Complemento" value={(selectedPaciente as any).complemento} />
                      <InfoField icon={MapPin} label="Bairro" value={selectedPaciente.bairro} />
                      <InfoField icon={MapPin} label="Cidade" value={selectedPaciente.cidade} />
                      <InfoField icon={MapPin} label="Estado" value={selectedPaciente.estado} />
                    </div>
                  </TabsContent>

                  <TabsContent value="historico" className="pt-1 mt-0">
                    <PatientTimeline pacienteId={selectedPaciente.id} />
                  </TabsContent>
                  <TabsContent value="sinais" className="pt-1 mt-0">
                    <VitalSignsChart pacienteId={selectedPaciente.id} />
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão só será permitida se esta ficha não tiver registros relacionados. Para preservar o histórico clínico, o banco bloqueará a exclusão quando houver prontuário, atendimento, exame ou outro dado vinculado. Solicite avaliação pelo fluxo LGPD quando precisar tratar dados de um paciente com histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isAdmin() && (
            <RouterLink
              to="/lgpd-pacientes"
              className="text-sm font-medium text-primary underline underline-offset-4"
              onClick={() => setIsDeleteOpen(false)}
            >
              Abrir fluxo LGPD
            </RouterLink>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <LoadingButton onClick={handleDelete} isLoading={isDeleting} loadingText="Excluindo..." variant="destructive">
              Excluir ficha vazia
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Etiquetas */}
      <EtiquetaPaciente pacientes={pacientesForEtiqueta} open={isEtiquetaOpen} onOpenChange={setIsEtiquetaOpen} />

      <Dialog open={!!linkPortalGerado} onOpenChange={(open) => { if (!open) setLinkPortalGerado(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link do Portal do Paciente</DialogTitle>
            <DialogDescription>
              Link gerado para {linkPortalGerado?.nome}. Compartilhe diretamente com o paciente.
            </DialogDescription>
          </DialogHeader>
          <Input
            id="link-portal-paciente"
            value={linkPortalGerado?.url || ''}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Link de acesso ao portal do paciente"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkPortalGerado(null)}>Fechar</Button>
            <Button onClick={() => void copiarLinkPortalExibido()}>Copiar link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Autorizações de convênio do paciente selecionado */}
      {selectedPaciente && (
        <AutorizacaoConvenioModal
          open={showAutorizacao}
          onOpenChange={setShowAutorizacao}
          pacienteId={selectedPaciente.id}
          pacienteNome={selectedPaciente.nome}
          convenioId={selectedPaciente.convenio_id || undefined}
        />
      )}
    </div>
  );
}

// Helper component for info display
function InfoField({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}
