import { formatWithDatePreference as format } from '@/lib/datePreference';
import { formatCurrency } from '@/lib/formatters';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useSearchParams, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Search, Eye, FileText, FileDown, Loader2, X,
  AlertTriangle, Upload, Clock, Calendar, Building2, DollarSign, Trash2,
  RefreshCw, FlaskConical, ClipboardList, ExternalLink, Paperclip, Check, Printer, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { FieldHelp } from '@/components/ContextualHelp';
import { gravarFiltrosExames, lerFiltrosExames, type FiltrosExames } from '@/lib/examesFiltros';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Separator } from '@/components/ui/separator';
import { LoadingButton } from '@/components/ui/loading-button';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { normalizarTexto, pacienteCorresponde } from '@/lib/buscaPaciente';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { cn } from '@/lib/utils';
import { addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { useMedicos } from '@/hooks/useSupabaseData';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Database } from '@/integrations/supabase/types';
import { autoCreateColeta, autoProgressExame } from '@/lib/workflowAutomation';
import { podeExcluirExame, preparosAusentesNaGuia, proximaAcaoExame, textoPreparosParaGuia } from '@/lib/examesWorkflow';
import { LancarResultado } from '@/components/exames/LancarResultado';
import { parseDateOnly, toDateOnly } from '@/lib/dateOnly';
import { gerarGuiaSolicitacaoExames, downloadPDF } from '@/lib/pdfGenerator';
import { CATALOGO_EXAMES, exameDoTipoGravado, tipoCategorizadoDaCategoria, type ExameCatalogo } from '@/lib/catalogoExames';
import { contagem, palavra } from '@/lib/plural';
import { lerDadosDaGuia } from '@/lib/guiaExamesGravada';
import { PreparoExamesAcoes } from '@/components/exames/PreparoExamesAcoes';

const DIAS_PERIODO_EXAMES = 90;

type StatusExame = Database['public']['Enums']['status_exame'];

const STATUS_COLORS: Record<StatusExame, string> = {
  solicitado: 'border-warning/40 bg-warning/10 text-warning-foreground',
  agendado: 'border-primary/30 bg-primary/10 text-primary',
  realizado: 'border-info/30 bg-info/10 text-info',
  laudo_disponivel: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
  cancelado: 'border-border bg-muted text-muted-foreground',
};

const TIPO_CATEGORIZADO_LABELS: Record<string, string> = {
  laboratorial: 'Laboratorial',
  imagem: 'Imagem',
  ultrassom: 'Ultrassom',
  cardiologia: 'Cardiologia',
  endoscopia: 'Endoscopia',
  outro: 'Outro',
};

type IndicadorExame = 'todos' | 'aguardando' | 'hoje' | 'agendado' | 'laudo_disponivel' | 'criticos';

const BUCKET_ANEXOS = 'medical-attachments';

/**
 * Os anexos da guia ficam gravados nas observações como
 * `Anexos: exames/<paciente>/<arquivo>, ...`. Registros antigos podem guardar a
 * URL pública completa (que nunca abriu, pois o bucket é privado); para esses,
 * recuperamos o path a partir da URL.
 */
function caminhoStorage(valor: string): string {
  const texto = valor.trim();
  if (!texto.startsWith('http')) return texto;
  const aposBucket = texto.split(`/${BUCKET_ANEXOS}/`)[1];
  if (aposBucket) return decodeURIComponent(aposBucket.split('?')[0]);
  return texto.split('/').slice(-3).join('/');
}

function extrairAnexosGuia(observacoes?: string | null): string[] {
  if (!observacoes) return [];
  const linha = observacoes.split('\n').find(l => /^\s*Anexos:/i.test(l));
  if (!linha) return [];
  return linha
    .replace(/^\s*Anexos:\s*/i, '')
    .split(',')
    .map(item => item.trim())
    .filter(item => item && !/^\d+\s+arquivo/i.test(item))
    .map(caminhoStorage);
}

const STATUS_LABELS: Record<StatusExame, string> = {
  solicitado: 'Solicitado',
  agendado: 'Agendado',
  realizado: 'Realizado',
  laudo_disponivel: 'Laudo disponível',
  cancelado: 'Cancelado',
};

// Grouped for display
const CATEGORIAS_EXAME = [...new Set(CATALOGO_EXAMES.map(e => e.categoria))].sort();
const MAX_ANEXO_EXAME_BYTES = 10 * 1024 * 1024;
const TIPOS_ANEXO_EXAME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);

interface ExameSelecionado {
  nome: string;
  tuss: string;
  categoria?: string;
  lateralidade?: string;
  regiao_anatomica?: string;
  necessita_contraste?: boolean;
}

interface FormData {
  paciente_id: string;
  medico_solicitante_id: string;
  data_solicitacao: string;
  validade_dias: number;
  indicacao_clinica: string;
  hipotese_diagnostica: string;
  urgencia: string;
  justificativa_urgencia: string;
  jejum: string;
  observacoes: string;
  necessita_contraste: boolean;
  tipo_categorizado?: string;
  laboratorio_id?: string;
  preco_custo?: number;
  preco_venda?: number;
}

const initialFormData: FormData = {
  paciente_id: '',
  medico_solicitante_id: '',
  data_solicitacao: todaySaoPauloDateOnly(),
  validade_dias: 30,
  indicacao_clinica: '',
  hipotese_diagnostica: '',
  urgencia: 'normal',
  justificativa_urgencia: '',
  jejum: '',
  observacoes: '',
  necessita_contraste: false,
};

const ETAPAS_EXAME = ['Solicitado', 'Agendado', 'Realizado', 'Laudo'] as const;
const INDICE_ETAPA_EXAME: Record<StatusExame, number> = { solicitado: 0, agendado: 1, realizado: 2, laudo_disponivel: 3, cancelado: -1 };

/** Etapas do exame em texto legível, com a etapa atual destacada e anunciada. */
function EtapasExame({ status }: { status: StatusExame }) {
  const atual = INDICE_ETAPA_EXAME[status] ?? 0;
  if (atual < 0) {
    return <Badge variant="outline" className="rounded-full border-border bg-muted text-xs text-muted-foreground">Cancelado</Badge>;
  }
  return (
    <ol aria-label={`Etapa atual: ${ETAPAS_EXAME[atual]}`} className="flex flex-wrap items-center gap-1 text-xs">
      {ETAPAS_EXAME.map((etapa, indice) => (
        <li key={etapa} aria-current={indice === atual ? 'step' : undefined} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
              indice < atual && 'border-foreground/30 bg-secondary text-foreground',
              indice === atual && 'border-transparent bg-primary text-primary-foreground',
              indice > atual && 'border-border text-muted-foreground',
            )}
          >
            {indice < atual ? <Check className="h-3 w-3" /> : indice + 1}
          </span>
          <span className={cn(indice === atual ? 'font-semibold text-foreground' : 'text-muted-foreground', indice !== atual && 'hidden xl:inline')}>{etapa}</span>
          {indice < ETAPAS_EXAME.length - 1 && <span aria-hidden="true" className="h-px w-2 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

export default function Exames({ creationPage = false, resultPage = false }: { creationPage?: boolean; resultPage?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { examId } = useParams();
  const taskPage = creationPage || !!examId;
  const completed = useRef(false);
  const baseline = useRef(initialFormData);
  const initialized = useRef('');
  const [readyFor, setReadyFor] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const pacienteFiltroId = searchParams.get('paciente');
  const [incluirExamesAntigos, setIncluirExamesAntigos] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>(() => location.state?.examSearch || '');
  const filtrosUrl = lerFiltrosExames(searchParams);
  const statusFilter = filtrosUrl.status;
  const tipoFilter = filtrosUrl.tipo;
  const indicador = filtrosUrl.indicador as IndicadorExame;
  const atualizarFiltros = (filtros: Partial<FiltrosExames>) => setSearchParams(gravarFiltrosExames(searchParams, filtros), { replace: true });
  const setStatusFilter = (status: string) => atualizarFiltros({ status });
  const setTipoFilter = (tipo: string) => atualizarFiltros({ tipo });
  const setIndicador = (valor: IndicadorExame) => atualizarFiltros({ indicador: valor });
  const isDialogOpen = creationPage;
  const isViewOpen = !!examId && !resultPage;

  const [baixandoLaudoId, setBaixandoLaudoId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...initialFormData });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);


  // Multi-select exams
  const [examesSelecionados, setExamesSelecionados] = useState<ExameSelecionado[]>([]);
  const [examSearch, setExamSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [customExamCode, setCustomExamCode] = useState('');
  const [showExamPicker, setShowExamPicker] = useState(false);

  // Attachments
  const [anexos, setAnexos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user, profile } = useSupabaseAuth();
  const prontuarioFonteId = searchParams.get('prontuario');
  const prontuarioFonteQuery = useQuery({
    queryKey: ['exame-prontuario-context', prontuarioFonteId, profile?.clinica_id],
    enabled: Boolean(prontuarioFonteId && profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prontuarios')
        .select('id, paciente_id, clinica_id')
        .eq('id', prontuarioFonteId!)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const queryClient = useQueryClient();
  const fallbackParams = new URLSearchParams(searchParams);
  fallbackParams.delete('novo'); fallbackParams.delete('prontuario');
  const returnTo = /^\/exames(?:\?|$)/.test(location.state?.returnTo || '')
    ? location.state.returnTo : `/exames${fallbackParams.size ? `?${fallbackParams}` : ''}`;
  const leaveTask = () => navigate(returnTo, { replace: true, state: { examSearch: searchTerm } });
  const openTask = (path: string) => {
    if (!taskPage) navigate(`${location.pathname}${location.search}`, { replace: true, state: { examSearch: searchTerm } });
    navigate(path, { state: { returnTo: taskPage ? returnTo : `${location.pathname}${location.search}`, examSearch: searchTerm } });
  };
  const recordQuery = useQuery({
    queryKey: ['exame-pagina', profile?.clinica_id, user?.id, examId, location.key],
    enabled: !!examId && !!profile?.clinica_id && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('exames')
        .select('*, pacientes(nome, nome_social, cpf, telefone, email), medicos(crm, especialidade, nome)')
        .eq('id', examId!).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: Infinity, gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const medicosQuery = useMedicos();
  const { data: medicos = [], isLoading: loadingMedicos } = medicosQuery;
  const { currentMedico, medicoId, isMedicoOnly, isLoading: loadingCurrentMedico, error: currentMedicoError, refetch: refetchCurrentMedico } = useCurrentMedico();
  const pacienteResumoId = formData.paciente_id || pacienteFiltroId;
  const pacienteResumoQuery = usePacienteResumo(pacienteResumoId);
  const medicosAtivos = medicos.filter(m => m.ativo !== false);
  const medicosDisponiveis = isMedicoOnly && medicoId
    ? medicosAtivos.filter(m => m.id === medicoId)
    : medicosAtivos;

  const customTypesQuery = useQuery({
    queryKey: ['tipos_exame_custom', user?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_exame_custom' as any).select('*').eq('user_id', user?.id ?? '').order('nome');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
  const customTypesFromDB = customTypesQuery.data ?? [];

  const laboratoriosQuery = useQuery({
    queryKey: ['laboratorios', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await (supabase as any)
        .from('laboratorios')
        .select('id, nome')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.clinica_id && isDialogOpen,
  });
  const laboratorios = laboratoriosQuery.data ?? [];

  // Preparo configurado no catálogo do laboratório. Consulta auxiliar: se falhar, a guia segue sem o aviso.
  const preparosCatalogoQuery = useQuery({
    queryKey: ['tipo_exames_catalog_preparo', profile?.clinica_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipo_exames_catalog')
        .select('nome, preparo')
        .eq('clinica_id', profile!.clinica_id!)
        .not('preparo', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.clinica_id && isDialogOpen,
  });
  const preparosAusentes = preparosAusentesNaGuia(
    examesSelecionados,
    preparosCatalogoQuery.data ?? [],
    [formData.jejum && formData.jejum !== 'nao' ? `Jejum: ${formData.jejum}` : '', formData.observacoes].join('\n'),
  );

  // Merge catalog with custom types
  const allExames = useMemo(() => {
    const porNome = new Map(CATALOGO_EXAMES.map(exame => [normalizarTexto(exame.nome), exame]));
    for (const tipo of customTypesFromDB) {
      const exame = {
        nome: String(tipo.nome || '').trim(),
        tuss: tipo.codigo_tuss || '',
        categoria: tipo.categoria || 'Personalizado',
      };
      const chave = normalizarTexto(exame.nome);
      if (chave && !porNome.has(chave)) porNome.set(chave, exame);
    }
    return [...porNome.values()];
  }, [customTypesFromDB]);

  const filteredCatalogo = useMemo(() => {
    const termo = normalizarTexto(examSearch);
    const codigo = examSearch.trim().toLowerCase();
    return allExames.filter(e => {
      const matchSearch = !termo || normalizarTexto(e.nome).includes(termo) || e.tuss.toLowerCase().includes(codigo);
      const matchCat = !catFilter || e.categoria === catFilter;
      const notSelected = !examesSelecionados.some(s => normalizarTexto(s.nome) === normalizarTexto(e.nome));
      return matchSearch && matchCat && notSelected;
    });
  }, [allExames, examSearch, catFilter, examesSelecionados]);

  const categoriasDisponiveis = useMemo(
    () => [...new Set<string>([...CATEGORIAS_EXAME, ...customTypesFromDB.map((item: any) => item.categoria).filter((categoria: unknown): categoria is string => typeof categoria === 'string' && !!categoria.trim())])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [customTypesFromDB],
  );

  const canAddCustomExam = useMemo(() => {
    const normalizedSearch = normalizarTexto(examSearch);
    if (!normalizedSearch) return false;

    const alreadyInCatalog = allExames.some(exame => normalizarTexto(exame.nome) === normalizedSearch);
    const alreadySelected = examesSelecionados.some(exame => normalizarTexto(exame.nome) === normalizedSearch);
    return !alreadyInCatalog && !alreadySelected;
  }, [allExames, examSearch, examesSelecionados]);

  // O filtro de paciente, o médico do perfil e o período vão para o servidor:
  // antes a tela baixava todos os exames da clínica e filtrava no navegador.
  // Sem paciente selecionado, o padrão são os últimos 90 dias.
  const inicioPeriodoExames = incluirExamesAntigos || pacienteFiltroId
    ? null
    : toDateOnly(addDays(parseDateOnly(todaySaoPauloDateOnly()), -DIAS_PERIODO_EXAMES));
  const examesQuery = useQuery({
    queryKey: ['exames', user?.id ?? null, profile?.clinica_id ?? null, isMedicoOnly, medicoId, pacienteFiltroId ?? null, inicioPeriodoExames],
    queryFn: async () => {
      return buscarEmBlocos<any>(() => {
        let query = supabase
          .from('exames')
          .select('*, pacientes(nome, nome_social, cpf, telefone, email), medicos(crm, especialidade, nome)')
          .eq('clinica_id', profile?.clinica_id ?? '');
        if (pacienteFiltroId) query = query.eq('paciente_id', pacienteFiltroId);
        // O médico vê os exames da clínica (inclusive os pedidos por colegas); o filtro é por paciente e período.
        if (inicioPeriodoExames) query = query.gte('data_solicitacao', inicioPeriodoExames);
        return query
          .order('data_solicitacao', { ascending: false })
          .order('id', { ascending: true });
      });
    },
    // Ao ampliar o período, mantém a lista atual na tela enquanto busca.
    placeholderData: (anterior) => anterior,
    enabled: !taskPage && !!user && !!profile?.clinica_id && (!isMedicoOnly || !!medicoId),
  });
  const exames = examesQuery.data ?? [];

  // Resultados críticos do laboratório vinculados aos exames da clínica. A
  // consulta é auxiliar: se falhar, a tela segue sem o indicador de críticos.
  const criticosQuery = useQuery({
    queryKey: ['exames_resultados_criticos', profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('resultados_laboratorio')
        .select('exame_id')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .eq('critico', true)
        .not('exame_id', 'is', null);
      if (error) throw error;
      return new Set<string>(((data ?? []) as Array<{ exame_id: string | null }>).map(r => r.exame_id).filter((id): id is string => !!id));
    },
    enabled: !!user && !!profile?.clinica_id,
  });
  const examesCriticos = useMemo(() => criticosQuery.data ?? new Set<string>(), [criticosQuery.data]);

  const examesNoEscopo = useMemo(
    () => pacienteFiltroId ? exames.filter(e => e.paciente_id === pacienteFiltroId) : exames,
    [exames, pacienteFiltroId],
  );

  const isLoading = (!taskPage && examesQuery.isLoading) || loadingMedicos || customTypesQuery.isLoading || loadingCurrentMedico;

  const hoje = todaySaoPauloDateOnly();
  const statusAguardando: StatusExame[] = ['solicitado', 'agendado', 'realizado'];
  const correspondeIndicador = (exame: any, chave: IndicadorExame): boolean => {
    switch (chave) {
      case 'aguardando': return statusAguardando.includes(exame.status || 'solicitado');
      case 'hoje': return exame.data_solicitacao === hoje;
      case 'agendado': return exame.status === 'agendado';
      case 'laudo_disponivel': return exame.status === 'laudo_disponivel';
      case 'criticos': return examesCriticos.has(exame.id);
      default: return true;
    }
  };

  const tiposDisponiveis = useMemo(() => {
    const presentes = new Set<string>();
    for (const exame of examesNoEscopo) {
      const tipo = String(exame.tipo_categorizado || '').toLocaleLowerCase('pt-BR');
      if (tipo) presentes.add(tipo);
    }
    return [...presentes].sort((a, b) => (TIPO_CATEGORIZADO_LABELS[a] || a).localeCompare(TIPO_CATEGORIZADO_LABELS[b] || b, 'pt-BR'));
  }, [examesNoEscopo]);

  const filteredExames = useMemo(() => {
    return examesNoEscopo.filter(e => {
      const paciente = (e as any).pacientes;
      const matchesSearch =
        (paciente && pacienteCorresponde(paciente, searchTerm)) ||
        normalizarTexto(e.tipo_exame).includes(normalizarTexto(searchTerm));
      const matchesStatus = statusFilter === 'todos' || e.status === statusFilter;
      const matchesTipo = tipoFilter === 'todos' || String(e.tipo_categorizado || '').toLocaleLowerCase('pt-BR') === tipoFilter;
      return matchesSearch && matchesStatus && matchesTipo && correspondeIndicador(e, indicador);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examesNoEscopo, searchTerm, statusFilter, tipoFilter, indicador, examesCriticos, hoje]);
  const temFiltroExames = searchTerm.trim() !== '' || statusFilter !== 'todos' || tipoFilter !== 'todos' || indicador !== 'todos';
  const limparFiltrosExames = () => {
    setSearchTerm('');
    atualizarFiltros({ status: 'todos', tipo: 'todos', indicador: 'todos' });
  };

  const contagens = useMemo(() => ({
    aguardando: examesNoEscopo.filter(e => correspondeIndicador(e, 'aguardando')).length,
    hoje: examesNoEscopo.filter(e => correspondeIndicador(e, 'hoje')).length,
    agendado: examesNoEscopo.filter(e => correspondeIndicador(e, 'agendado')).length,
    laudo_disponivel: examesNoEscopo.filter(e => correspondeIndicador(e, 'laudo_disponivel')).length,
    criticos: examesNoEscopo.filter(e => correspondeIndicador(e, 'criticos')).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [examesNoEscopo, examesCriticos, hoje]);

  const INDICADOR_LABELS: Record<IndicadorExame, string> = {
    todos: 'todos',
    aguardando: 'aguardando resultado',
    hoje: 'solicitados hoje',
    agendado: 'agendados / em coleta',
    laudo_disponivel: 'resultados prontos',
    criticos: 'críticos',
  };

  const refreshExames = () => {
    void examesQuery.refetch();
    void criticosQuery.refetch();
  };

  const selectedExame = recordQuery.data;
  const anexosSelecionado = useMemo(() => extrairAnexosGuia(selectedExame?.observacoes), [selectedExame?.observacoes]);
  // A linha "Anexos: ..." vira a lista de anexos acima; o restante das observações continua visível.
  const observacoesSelecionado = useMemo(() => {
    const texto = selectedExame?.observacoes;
    if (!texto) return '';
    return texto.split('\n').filter(l => !/^\s*Anexos:/i.test(l)).join('\n').trim();
  }, [selectedExame?.observacoes]);

  const addExame = (exame: ExameCatalogo) => {
    setExamesSelecionados(prev => [...prev, { nome: exame.nome, tuss: exame.tuss, categoria: exame.categoria }]);
    setExamSearch('');
    setCustomExamCode('');
    setShowExamPicker(false);
  };

  const generateAutomaticExamCode = () => `INT${Date.now().toString().slice(-7)}`;

  const addCustomExame = () => {
    const nome = examSearch.trim();
    const codigo = customExamCode.trim();
    const nomeNormalizado = normalizarTexto(nome);

    if (!nome) {
      toast.error('Digite o nome do exame personalizado.');
      return;
    }

    if (examesSelecionados.some(exame => normalizarTexto(exame.nome) === nomeNormalizado)) {
      toast.error('Este exame já foi adicionado à guia.');
      return;
    }
    if (allExames.some(exame => normalizarTexto(exame.nome) === nomeNormalizado)) {
      toast.error('Este exame já existe no catálogo. Remova o filtro de categoria e selecione-o na lista.');
      return;
    }

    setExamesSelecionados(prev => [...prev, { nome, tuss: codigo, categoria: 'Personalizado' }]);
    setExamSearch('');
    setCustomExamCode('');
    setShowExamPicker(false);
    toast.success('Exame personalizado adicionado à guia.');
  };

  const removeExame = (nome: string) => {
    setExamesSelecionados(prev => prev.filter(e => e.nome !== nome));
  };

  const handleOpenNew = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('novo');
    openTask(`/exames/nova${params.size ? `?${params}` : ''}`);
  };
  const handleCloseNew = leaveTask;
  const taskKey = `${location.pathname}${location.search}`;
  useEffect(() => {
    if (!creationPage && searchParams.get('novo') === '1') {
      const params = new URLSearchParams(searchParams); params.delete('novo');
      navigate(`/exames/nova?${params}`, { replace: true, state: { returnTo, examSearch: searchTerm } });
    }
  }, [creationPage, searchParams, navigate, returnTo, searchTerm]);
  useEffect(() => {
    if (!creationPage || loadingCurrentMedico || currentMedicoError || initialized.current === taskKey) return;
    initialized.current = taskKey;
    const form = { ...initialFormData, data_solicitacao: todaySaoPauloDateOnly(), paciente_id: pacienteFiltroId || '', medico_solicitante_id: medicoId || '' };
    baseline.current = form; completed.current = false;
    // "Repetir pedido" chega com os exames da guia anterior já escolhidos.
    const repetir = Array.isArray(location.state?.repetirExames) ? location.state.repetirExames as ExameSelecionado[] : [];
    const indicacaoRepetida = typeof location.state?.repetirIndicacao === 'string' ? location.state.repetirIndicacao : '';
    setFormData(indicacaoRepetida ? { ...form, indicacao_clinica: indicacaoRepetida } : form);
    setExamesSelecionados(repetir.filter(item => item && typeof item.nome === 'string').map(item => ({ nome: item.nome, tuss: item.tuss || '', categoria: item.categoria })));
    setAnexos([]);
    setExamSearch(''); setCatFilter(''); setCustomExamCode(''); setReadyFor(taskKey);
  }, [creationPage, loadingCurrentMedico, currentMedicoError, taskKey, pacienteFiltroId, medicoId, location.state]);
  const handleView = (id: string) => openTask(`/exames/${id}`);

  /** Baixa um arquivo do bucket privado via download autorizado (sem tornar o storage público). */
  const baixarArquivoStorage = async (path: string, nomeFallback: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET_ANEXOS)
      .download(path);
    if (error) throw error;
    if (!data) throw new Error('O arquivo não foi encontrado.');

    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = path.split('/').pop() || nomeFallback;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadLaudo = async (exame: any) => {
    if (!exame.arquivo_resultado || baixandoLaudoId) return;
    setBaixandoLaudoId(exame.id);
    try {
      await baixarArquivoStorage(exame.arquivo_resultado, `laudo-${exame.id}`);
    } catch (error) {
      toast.error('Não foi possível baixar o laudo', { description: mensagemDeErro(error) });
    } finally {
      setBaixandoLaudoId(null);
    }
  };

  // Anexos enviados com a guia (auditoria item 06): abrir em nova aba com link
  // assinado temporário ou baixar com download autorizado.
  const [anexoEmAcao, setAnexoEmAcao] = useState<string | null>(null);

  const handleAbrirAnexo = async (path: string) => {
    if (anexoEmAcao) return;
    // Abra a aba durante o gesto do clique: abrir depois do await costuma ser
    // bloqueado pelo navegador como pop-up não solicitado.
    const aba = window.open('about:blank', '_blank');
    if (aba) aba.opener = null;
    if (!aba) {
      toast.error('Abertura bloqueada', { description: 'Permita a abertura de uma nova aba para ver este anexo.' });
      return;
    }
    setAnexoEmAcao(path);
    try {
      const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(path, 3600);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('O link do anexo não foi gerado.');
      aba.location.replace(data.signedUrl);
    } catch (error) {
      aba.close();
      toast.error('Não foi possível abrir o anexo', { description: mensagemDeErro(error) });
    } finally {
      setAnexoEmAcao(null);
    }
  };

  const handleBaixarAnexo = async (path: string) => {
    if (anexoEmAcao) return;
    setAnexoEmAcao(path);
    try {
      await baixarArquivoStorage(path, 'anexo-guia');
    } catch (error) {
      toast.error('Não foi possível baixar o anexo', { description: mensagemDeErro(error) });
    } finally {
      setAnexoEmAcao(null);
    }
  };

  /**
   * Exames da mesma guia: mesmo paciente, mesma data e o mesmo texto de
   * detalhes, que é gravado igual em cada exame do envio.
   */
  const buscarExamesDaGuia = async (exame: any): Promise<any[]> => {
    if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
    let query = supabase.from('exames').select('id, tipo_exame, categoria, observacoes')
      .eq('clinica_id', profile.clinica_id)
      .eq('paciente_id', exame.paciente_id)
      .eq('data_solicitacao', exame.data_solicitacao);
    query = exame.descricao ? query.eq('descricao', exame.descricao) : query.is('descricao', null);
    const { data, error } = await query.order('id', { ascending: true }).limit(60);
    if (error) throw error;
    return data?.length ? data : [exame];
  };

  const [reimprimindoGuia, setReimprimindoGuia] = useState(false);
  const handleReimprimirGuia = async (exame: any) => {
    if (reimprimindoGuia) return;
    setReimprimindoGuia(true);
    try {
      const itens = await buscarExamesDaGuia(exame);
      const dados = lerDadosDaGuia(exame.descricao);
      const validade = dados.validade
        ?? format(addDays(new Date(`${exame.data_solicitacao}T12:00`), 30), 'yyyy-MM-dd');
      const doc = await gerarGuiaSolicitacaoExames({
        paciente: { nome: getPacienteNome(exame), cpf: exame.pacientes?.cpf },
        medico: exame.medicos ? { nome: exame.medicos.nome, crm: exame.medicos.crm, especialidade: exame.medicos.especialidade } : null,
        exames: itens.map(item => exameDoTipoGravado(item.tipo_exame || '')),
        dataSolicitacao: exame.data_solicitacao,
        dataValidade: validade,
        indicacaoClinica: dados.indicacaoClinica,
        hipoteseDiagnostica: dados.hipoteseDiagnostica,
        urgencia: dados.urgencia,
        justificativaUrgencia: dados.justificativaUrgencia,
        jejum: dados.jejum,
        observacoes: (exame.observacoes || '').split('\n').filter((linha: string) => !/^\s*Anexos:/i.test(linha)).join('\n') || undefined,
      });
      const nomeSeguro = getPacienteNome(exame).replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 40) || 'paciente';
      downloadPDF(doc, `guia-exames-${nomeSeguro}`);
      toast.success('Segunda via da guia baixada.', { description: 'A guia ainda precisa da assinatura do profissional solicitante.' });
    } catch (error) {
      toast.error('Não foi possível reimprimir a guia', { description: mensagemDeErro(error) });
    } finally {
      setReimprimindoGuia(false);
    }
  };

  const [repetindoPedido, setRepetindoPedido] = useState(false);
  const handleRepetirPedido = async (exame: any) => {
    if (repetindoPedido) return;
    setRepetindoPedido(true);
    try {
      const itens = await buscarExamesDaGuia(exame);
      const vistos = new Set<string>();
      const repetirExames = itens.map(item => exameDoTipoGravado(item.tipo_exame || '')).filter(item => {
        const chave = normalizarTexto(item.nome);
        if (!chave || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
      const dados = lerDadosDaGuia(exame.descricao);
      navigate(`/exames/nova?paciente=${encodeURIComponent(exame.paciente_id)}`, {
        state: { returnTo, examSearch: searchTerm, repetirExames, repetirIndicacao: dados.indicacaoClinica ?? '' },
      });
    } catch (error) {
      toast.error('Não foi possível repetir o pedido', { description: mensagemDeErro(error) });
    } finally {
      setRepetindoPedido(false);
    }
  };

  const handleSave = async (emitir = false) => {
    if (submitLock.current) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página antes de solicitar exames.');
      return;
    }
    if (!formData.paciente_id) {
      toast.error('Selecione o paciente.');
      return;
    }
    if (pacienteResumoQuery.isLoading) {
      toast.info('Carregando os dados do paciente. Tente novamente em instantes.');
      return;
    }
    if (pacienteResumoQuery.isError || pacienteResumoQuery.data?.id !== formData.paciente_id) {
      toast.error('Não foi possível confirmar o paciente selecionado.', {
        description: 'Busque o paciente novamente antes de salvar ou emitir a guia.',
      });
      return;
    }
    if (prontuarioFonteId) {
      if (prontuarioFonteQuery.isLoading) {
        toast.info('Confirmando o prontuário de origem. Tente novamente em instantes.');
        return;
      }
      if (prontuarioFonteQuery.isError || prontuarioFonteQuery.data?.paciente_id !== formData.paciente_id) {
        toast.error('Não foi possível confirmar o vínculo com o prontuário de origem.', {
          description: 'Atualize a página a partir do prontuário do paciente antes de solicitar exames.',
        });
        return;
      }
    }
    if (examesSelecionados.length === 0) {
      toast.error('Adicione pelo menos um exame à guia.');
      return;
    }
    if (!formData.indicacao_clinica.trim()) {
      toast.error('Informe a indicação clínica para a solicitação.');
      return;
    }
    if ((formData.urgencia === 'urgente' || formData.urgencia === 'emergencia') && !formData.justificativa_urgencia.trim()) {
      toast.error('Justifique a urgência/emergência para fins de autorização.');
      return;
    }
    if (isMedicoOnly && formData.medico_solicitante_id !== medicoId) {
      toast.error('Seu perfil só pode solicitar exames em seu próprio nome.');
      return;
    }
    if (formData.medico_solicitante_id) {
      if (medicosQuery.isError) {
        toast.error('Não foi possível confirmar o profissional solicitante.', {
          description: 'Atualize a lista de médicos antes de salvar a solicitação.',
        });
        return;
      }
      const medicoSelecionado = medicos.find(m => m.id === formData.medico_solicitante_id);
      if (!medicoSelecionado || medicoSelecionado.ativo === false) {
        toast.error('Profissional solicitante indisponível', {
          description: 'Selecione um médico ativo da clínica antes de salvar ou emitir a guia.',
        });
        return;
      }
    }
    if (formData.laboratorio_id && laboratoriosQuery.isError) {
      toast.error('Não foi possível confirmar o laboratório selecionado.', {
        description: 'Atualize a lista de laboratórios antes de salvar a guia.',
      });
      return;
    }
    if ([formData.preco_custo, formData.preco_venda].some(valor => valor !== undefined && (!Number.isFinite(valor) || valor < 0))) {
      toast.error('Os preços precisam ser números iguais ou maiores que zero.');
      return;
    }
    if ([formData.preco_custo, formData.preco_venda].some(valor => valor !== undefined && Math.abs(valor * 100 - Math.round(valor * 100)) >= 1e-7)) {
      toast.error('Os preços devem ter no máximo duas casas decimais.');
      return;
    }
    if (emitir && !formData.medico_solicitante_id) {
      toast.error('Selecione o profissional solicitante para gerar a guia.');
      return;
    }
    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(formData.data_solicitacao)
      && format(new Date(`${formData.data_solicitacao}T12:00:00`), 'yyyy-MM-dd') === formData.data_solicitacao;
    if (!dataValida) {
      toast.error('Informe uma data de solicitação válida.');
      return;
    }
    if (formData.data_solicitacao > todaySaoPauloDateOnly()) {
      toast.error('A data de solicitação não pode ser futura.');
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    const anexoUrls: string[] = [];
    let examesCriados = false;
    let coletasCriadas = 0;
    let coletasFalhas: string[] = [];
    const limparAnexosSemGuia = async () => {
      if (!anexoUrls.length) return;
      try {
        const { error } = await supabase.storage.from('medical-attachments').remove(anexoUrls);
        if (error) throw error;
        anexoUrls.length = 0;
      } catch (error) {
        toast.warning('A solicitação não foi criada e alguns anexos temporários podem ter permanecido no Storage.', {
          description: mensagemDeErro(error),
        });
      }
    };
    try {
      const validadeData = format(addDays(new Date(formData.data_solicitacao + 'T12:00'), formData.validade_dias), 'yyyy-MM-dd');
      let guiaPdf: Awaited<ReturnType<typeof gerarGuiaSolicitacaoExames>> | null = null;
      if (emitir) {
        const paciente = pacienteResumoQuery.data;
        const medico = medicos.find(item => item.id === formData.medico_solicitante_id);
        if (!paciente || !medico) throw new Error('Não foi possível carregar o paciente ou profissional para gerar a guia.');
        guiaPdf = await gerarGuiaSolicitacaoExames({
          paciente: { nome: paciente.nome, cpf: paciente.cpf },
          medico: { nome: medico.nome, crm: medico.crm, especialidade: medico.especialidade },
          exames: examesSelecionados,
          dataSolicitacao: formData.data_solicitacao,
          dataValidade: validadeData,
          indicacaoClinica: formData.indicacao_clinica,
          hipoteseDiagnostica: formData.hipotese_diagnostica,
          urgencia: formData.urgencia === 'emergencia' ? 'Emergência' : formData.urgencia === 'urgente' ? 'Urgente' : 'Normal',
          justificativaUrgencia: formData.justificativa_urgencia,
          jejum: formData.jejum,
          observacoes: formData.observacoes,
          anexos: anexos.map(file => file.name),
        });
      }

      // Upload attachments
      //
      // A falha de upload era descartada com `if (!upErr)`: o arquivo
      // simplesmente não entrava na lista, a guia era criada e a tela dizia
      // sucesso. A solicitação saía sem o pedido médico, sem a autorização do
      // convênio ou sem a imagem — e a recepção só descobria no laboratório,
      // com o paciente já lá.
      const anexosQueFalharam: string[] = [];
      for (const file of anexos) {
        const ext = file.name.split('.').pop();
        const path = `exames/${formData.paciente_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('medical-attachments').upload(path, file);
        if (upErr) {
          console.error('Falha ao enviar anexo', file.name, upErr);
          anexosQueFalharam.push(file.name);
          continue;
        }
        // O bucket é privado: getPublicUrl() gerava um link que nunca abria.
        // Guardamos o path; o link é gerado com createSignedUrl na exibição.
        anexoUrls.push(path);
      }

      if (anexosQueFalharam.length > 0) {
        await limparAnexosSemGuia();
        setIsSubmitting(false);
        toast.error(`${contagem(anexosQueFalharam.length, 'anexo')} não ${palavra(anexosQueFalharam.length, 'foi enviado', 'foram enviados')} — a guia não foi criada.`, {
          description: `${anexosQueFalharam.join(', ')}. Tente de novo; emitir a guia sem o anexo faz o paciente voltar.`,
          duration: 10000,
        });
        return;
      }

      // Build details
      const detalhes = [
        formData.indicacao_clinica && `Indicação Clínica: ${formData.indicacao_clinica}`,
        formData.hipotese_diagnostica && `Hipótese Diagnóstica: ${formData.hipotese_diagnostica}`,
        formData.urgencia !== 'normal' && `Urgência: ${formData.urgencia.toUpperCase()}`,
        formData.justificativa_urgencia && `Justificativa: ${formData.justificativa_urgencia}`,
        formData.jejum && formData.jejum !== 'nao' && `Jejum: ${formData.jejum}`,
        formData.necessita_contraste && 'Necessita de Contraste: SIM',
        `Validade: até ${format(new Date(validadeData + 'T12:00'), 'dd/MM/yyyy')}`,
        anexoUrls.length > 0 && `Anexos: ${contagem(anexoUrls.length, 'arquivo')}`,
      ].filter(Boolean).join('\n');

      // Insert one row per exam in the batch
      const inserts = examesSelecionados.map(ex => ({
        paciente_id: formData.paciente_id,
        prontuario_id: prontuarioFonteId ? prontuarioFonteQuery.data!.id : null,
        medico_solicitante_id: formData.medico_solicitante_id || null,
        tipo_exame: `${ex.tuss ? ex.tuss + ' - ' : ''}${ex.nome}`,
        // Cada exame recebe o tipo da sua categoria; o seletor só força um tipo
        // único quando a pessoa escolhe explicitamente.
        tipo_categorizado: formData.tipo_categorizado || tipoCategorizadoDaCategoria(ex.categoria),
        categoria: ex.categoria || 'geral',
        laboratorio_id: formData.laboratorio_id || null,
        preco_custo: formData.preco_custo ?? null,
        preco_venda: formData.preco_venda ?? null,
        descricao: detalhes || null,
        observacoes: [
          formData.observacoes,
          ex.lateralidade && `Lateralidade: ${ex.lateralidade}`,
          ex.regiao_anatomica && `Região: ${ex.regiao_anatomica}`,
          ex.necessita_contraste && 'Necessita Contraste',
          anexoUrls.length > 0 && `Anexos: ${anexoUrls.join(', ')}`,
        ].filter(Boolean).join('\n') || null,
        status: 'solicitado' as StatusExame,
        data_solicitacao: formData.data_solicitacao,
        clinica_id: profile?.clinica_id || null,
      }));

      const { data: inserted, error } = await supabase.from('exames').insert(inserts).select('id, tipo_exame, tipo_categorizado');
      if (error) throw error;
      if (!inserted || inserted.length !== inserts.length) {
        throw new Error('O banco não confirmou todos os exames solicitados. Atualize a lista antes de tentar novamente.');
      }
      examesCriados = true;

      // Coleta só para exames laboratoriais: imagem, ultrassom e afins não
      // passam pelo laboratório.
      const laboratoriais = inserted.filter(ex => (ex.tipo_categorizado || 'laboratorial') === 'laboratorial');
      if (laboratoriais.length > 0) {
        const coletaResults = await Promise.all(
          laboratoriais.map(ex => autoCreateColeta({
            exameId: ex.id,
            pacienteId: formData.paciente_id,
            medicoId: formData.medico_solicitante_id || null,
            tipoExame: ex.tipo_exame,
            urgente: formData.urgencia === 'urgente' || formData.urgencia === 'emergencia',
            clinicaId: profile?.clinica_id,
          }))
        );
        coletasCriadas = coletaResults.filter(r =>
          r.success && r.actions.some(action => action.startsWith('Coleta de '))
        ).length;
        coletasFalhas = coletaResults
          .map((result, index) => ({ result, tipoExame: laboratoriais[index]?.tipo_exame || 'Exame' }))
          .filter(item => !item.result.success)
          .map(item => item.tipoExame);
      }

      queryClient.invalidateQueries({ queryKey: ['exames'] });
      queryClient.invalidateQueries({ queryKey: ['coletas_laboratorio'] });
      completed.current = true;
      leaveTask();

      if (emitir && guiaPdf) {
        try {
          const nomePaciente = pacienteResumoQuery.data?.nome || 'paciente';
          const nomeSeguro = nomePaciente.replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 40) || 'paciente';
          downloadPDF(guiaPdf, `guia-exames-${nomeSeguro}`);
          toast.success(`${contagem(examesSelecionados.length, 'exame')} ${palavra(examesSelecionados.length, 'solicitado', 'solicitados')} e guia baixada.`, {
            description: 'A guia ainda precisa da assinatura do profissional solicitante.',
          });
        } catch (error) {
          toast.warning('Solicitação salva, mas o PDF não foi baixado.', { description: mensagemDeErro(error) });
        }
      } else {
        toast.success(`${contagem(examesSelecionados.length, 'exame')} ${palavra(examesSelecionados.length, 'solicitado', 'solicitados')} com sucesso.`);
      }
      if (coletasCriadas > 0) {
        toast.info(`${contagem(coletasCriadas, 'coleta')} de laboratório ${palavra(coletasCriadas, 'criada', 'criadas')} automaticamente.`);
      }
      if (coletasFalhas.length > 0) {
        toast.warning(`${contagem(coletasFalhas.length, 'coleta')} não ${palavra(coletasFalhas.length, 'foi criada', 'foram criadas')}.`, {
          description: `${coletasFalhas.join(', ')}. As solicitações foram salvas; revise a fila do Laboratório antes da coleta.`,
          duration: 10000,
        });
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao solicitar exames:', error);
      if (!examesCriados) await limparAnexosSemGuia();
      toast.error('Não foi possível concluir a solicitação.', { description: mensagemDeErro(error) });
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * O exame que está tendo o resultado lançado.
   *
   * O botão de avançar para "laudo disponível" passa por aqui em vez de mudar
   * o status direto: sem resultado, o banco recusa a transição — e recusar
   * depois do clique, com a mensagem do trigger, seria pior que pedir antes.
   */
  const setLancandoResultado = (exame: { id: string }) => openTask(`/exames/${exame.id}/resultado`);
  const [exameEmAtualizacao, setExameEmAtualizacao] = useState<string | null>(null);
  const updateStatusLock = useRef(false);

  const handleUpdateStatus = async (id: string, newStatus: StatusExame): Promise<boolean> => {
    if (updateStatusLock.current) return false;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão antes de alterar o exame.');
      return false;
    }
    updateStatusLock.current = true;
    setExameEmAtualizacao(id);
    try {
      let exame = selectedExame?.id === id ? selectedExame : exames.find(e => e.id === id);

      // Ao liberar o laudo, o exame vem do BANCO e não do cache: o resultado
      // pode ter acabado de ser salvo pelo diálogo, e a lista em memória ainda
      // não sabe. Com o resultado ausente, a vinculação ao prontuário era
      // pulada em silêncio — o laudo saía e a ficha do paciente continuava
      // vazia, que é o defeito que este fluxo veio corrigir.
      if (newStatus === 'laudo_disponivel') {
        const { data: fresco, error: erroLeitura } = await supabase
          .from('exames')
          .select('*')
          .eq('id', id)
          .eq('clinica_id', profile?.clinica_id ?? '')
          .maybeSingle();
        if (erroLeitura) throw erroLeitura;
        if (!fresco) throw new Error('Este exame não pertence à clínica atual ou não está mais disponível.');
        if (fresco) exame = fresco as any;
      }

      if (!exame) throw new Error('Exame não encontrado');
      const { data: pac, error: erroPaciente } = await (supabase as any)
        .from('pacientes')
        .select('nome, nome_social, convenio_id')
        .eq('id', exame.paciente_id)
        .eq('clinica_id', profile?.clinica_id ?? '')
        .maybeSingle();
      if (erroPaciente) throw erroPaciente;
      if (!pac) throw new Error('Não foi possível carregar os dados do paciente para atualizar o exame.');

      const result = await autoProgressExame({
        exameId: id,
        novoStatus: newStatus,
        statusAtual: exame.status || 'solicitado',
        pacienteId: exame.paciente_id,
        pacienteNome: pac?.nome || 'Paciente',
        medicoId: exame.medico_solicitante_id,
        tipoExame: exame.tipo_exame,
        convenioId: pac?.convenio_id,
        resultado: exame.resultado || undefined,
        clinicaId: profile.clinica_id,
      });
      if (!result.success) throw new Error(result.message);

      if (result.actions.length > 0) {
        toast.info(`Automações: ${result.actions.join(' • ')}`);
      }

      toast.success('Status atualizado!');
      queryClient.invalidateQueries({ queryKey: ['exames'] });
      return true;
    } catch (error: any) {
      queryClient.invalidateQueries({ queryKey: ['exames'] });
      queryClient.invalidateQueries({ queryKey: ['coletas_laboratorio'] });
      toast.error(error.message || 'Erro ao atualizar status');
      return false;
    } finally {
      updateStatusLock.current = false;
      setExameEmAtualizacao(null);
    }
  };

  const [exameParaCancelar, setExameParaCancelar] = useState<{ id: string; nome: string } | null>(null);
  const [exameParaExcluir, setExameParaExcluir] = useState<string | null>(null);
  const [excluindoExame, setExcluindoExame] = useState(false);

  const handleDeleteExame = (id: string) => setExameParaExcluir(id);

  const confirmarExclusaoExame = async () => {
    if (!exameParaExcluir || excluindoExame) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    setExcluindoExame(true);
    try {
      const { data, error } = await supabase
        .from('exames')
        .delete()
        .eq('id', exameParaExcluir)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error('Não foi possível excluir: o exame não pertence à clínica atual ou já foi removido.');
        queryClient.invalidateQueries({ queryKey: ['exames'] });
        return;
      }
      toast.success('Exame excluído!');
      queryClient.invalidateQueries({ queryKey: ['exames'] });
      setExameParaExcluir(null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir exame');
    } finally {
      setExcluindoExame(false);
    }
  };

  const getNextStatus = (current: StatusExame): StatusExame | null => {
    const flow: Record<StatusExame, StatusExame | null> = {
      solicitado: 'agendado', agendado: 'realizado', realizado: 'laudo_disponivel',
      laudo_disponivel: null, cancelado: null,
    };
    return flow[current] ?? null;
  };

  const getNextStatusLabel = (current: StatusExame): string => {
    const labels: Record<StatusExame, string> = {
      solicitado: 'Agendar coleta', agendado: 'Marcar realizado', realizado: 'Liberar laudo',
      laudo_disponivel: '', cancelado: '',
    };
    return labels[current] ?? '';
  };

  const getPacienteNome = (exame: any) => exame.pacientes?.nome_social?.trim() || exame.pacientes?.nome || 'Desconhecido';
  const getPacienteNomePorId = (id: string, fallback = 'paciente selecionado') => {
    const paciente = pacienteResumoQuery.data?.id === id ? pacienteResumoQuery.data : null;
    return paciente?.nome_social?.trim() || paciente?.nome || fallback;
  };
  const getMedicoInfo = (exame: any) => {
    const m = exame.medicos;
    if (!m) return 'Sem solicitante';
    return `${m.nome || m.crm} - ${m.especialidade || 'Clínico'}`;
  };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!taskPage && examesQuery.isError) return <ErrorState title="Não foi possível carregar as solicitações de exames" error={examesQuery.error} onRetry={() => void examesQuery.refetch()} />;
  if (medicosQuery.isError) {
    return <ErrorState title="Não foi possível carregar os médicos" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />;
  }
  if (customTypesQuery.isError) return <ErrorState title="Não foi possível carregar os tipos de exame personalizados" description="A lista de exames foi pausada para evitar criar solicitações com tipos ou códigos incompletos." error={customTypesQuery.error} onRetry={() => void customTypesQuery.refetch()} />;
  if (isMedicoOnly && (!medicoId || currentMedico?.ativo === false)) {
    return <ErrorState
      title={currentMedico?.ativo === false ? 'Cadastro médico inativo' : 'Perfil médico sem vínculo'}
      description={currentMedico?.ativo === false
        ? 'Seu cadastro médico foi inativado. Peça ao administrador para revisar seu acesso antes de consultar ou solicitar exames.'
        : 'Seu usuário não está vinculado a um cadastro médico ativo da clínica. Peça ao administrador para revisar esse vínculo antes de consultar ou solicitar exames.'}
    />;
  }

  if (currentMedicoError) return <ErrorState title="Não foi possível confirmar seu vínculo médico" error={currentMedicoError} onRetry={() => void refetchCurrentMedico()} />;
  if (examId && recordQuery.isLoading) return <p role="status" className="py-8">Carregando exame…</p>;
  if (examId && recordQuery.isError) return <div className="space-y-4"><Button onClick={leaveTask} variant="outline">Voltar aos exames</Button><ErrorState title="Não foi possível abrir o exame" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} /></div>;
  if (examId && !selectedExame) return <div className="space-y-4"><h1 className="text-2xl font-semibold">Exame indisponível</h1><p>O exame não foi encontrado ou não está disponível nesta clínica.</p><Button variant="outline" onClick={leaveTask}>Voltar aos exames</Button></div>;
  if (creationPage && readyFor !== taskKey) return <p role="status">Preparando solicitação…</p>;
  if (resultPage && selectedExame) {
    const next = proximaAcaoExame(selectedExame.status || 'solicitado', selectedExame.tipo_categorizado);
    return <section className="mx-auto max-w-4xl space-y-6"><Button variant="ghost" onClick={leaveTask}>← Voltar aos exames</Button>
      <div className="border-b pb-4"><p className="text-xs text-muted-foreground">Paciente</p><p className="font-medium">{getPacienteNome(selectedExame)}</p></div>
      {next.destino === 'status' && next.status === 'laudo_disponivel'
        ? <LancarResultado key={selectedExame.id} exame={selectedExame} onFechar={leaveTask} aoSalvar={id => handleUpdateStatus(id, 'laudo_disponivel')} />
        : <div className="space-y-3"><h1 className="text-2xl font-semibold">Lançamento indisponível nesta etapa</h1><p>Confira o estado atual do exame antes de registrar o resultado.</p>{next.destino === 'laboratorio' && <Button asChild variant="outline"><Link to="/laboratorio">Abrir laboratório</Link></Button>}<Button variant="outline" onClick={() => handleView(selectedExame.id)}>Consultar exame</Button></div>}
    </section>;
  }

  const renderAcoesExame = (exame: any) => {
    const acaoSeguinte = proximaAcaoExame(exame.status || 'solicitado', exame.tipo_categorizado);
    const nextStatus = acaoSeguinte.destino === 'status' ? acaoSeguinte.status : null;
    const nextLabel = getNextStatusLabel(exame.status || 'solicitado');
    const exameLaboratorial = (exame.tipo_categorizado || '').toLocaleLowerCase('pt-BR') === 'laboratorial';
    const anexosGuia = extrairAnexosGuia(exame.observacoes);
    const temResultado = !!(exame.resultado?.trim() || exame.arquivo_resultado);
    const precisaLancarResultado = nextStatus === 'laudo_disponivel' && !temResultado;
    return (
      <>
        <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" aria-label={`Ver exame ${exame.tipo_exame || exame.id}`} title="Ver detalhes" onClick={() => handleView(exame.id)}><Eye className="h-4 w-4" /></Button>
        {anexosGuia.length > 0 && (
          <Button
            variant="outline" size="sm" className="min-h-11 gap-1 rounded-full text-xs"
            aria-label={anexosGuia.length === 1 ? `Abrir anexo da guia de ${exame.tipo_exame || exame.id}` : `Ver anexos da guia de ${exame.tipo_exame || exame.id}`}
            disabled={anexoEmAcao !== null}
            onClick={() => anexosGuia.length === 1 ? void handleAbrirAnexo(anexosGuia[0]) : handleView(exame.id)}
          >
            {anexoEmAcao === anexosGuia[0] && anexosGuia.length === 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip aria-hidden="true" className="h-3.5 w-3.5" />}
            {anexosGuia.length === 1 ? 'Abrir anexo' : `Anexos (${anexosGuia.length})`}
          </Button>
        )}
        {exame.arquivo_resultado && (
          <Button
            variant="outline" size="sm" className="min-h-11 gap-1 rounded-full text-xs"
            aria-label={`Baixar laudo de ${exame.tipo_exame || exame.id}`}
            disabled={baixandoLaudoId !== null}
            onClick={() => void handleDownloadLaudo(exame)}
          >
            {baixandoLaudoId === exame.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown aria-hidden="true" className="h-3.5 w-3.5" />}
            Baixar laudo
          </Button>
        )}
        {nextStatus && (
          <Button
            size="sm"
            className="min-h-11 gap-1 rounded-full bg-primary text-xs text-primary-foreground hover:bg-primary/90"
            disabled={exameEmAtualizacao !== null}
            onClick={() => {
              if (precisaLancarResultado) {
                setLancandoResultado(exame);
                return;
              }
              handleUpdateStatus(exame.id, nextStatus);
            }}
          >
            {exameEmAtualizacao === exame.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {precisaLancarResultado ? 'Lançar resultado' : nextLabel}
          </Button>
        )}
        {acaoSeguinte.destino === 'laboratorio' && (
          <Button asChild size="sm" className="min-h-11 gap-1 rounded-full bg-primary text-xs text-primary-foreground hover:bg-primary/90">
            <Link to="/laboratorio"><FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />Abrir laboratório</Link>
          </Button>
        )}
        {exameLaboratorial && exame.status !== 'cancelado' && exame.status !== 'laudo_disponivel' && acaoSeguinte.destino !== 'laboratorio' && (
          <Button asChild variant="outline" size="sm" className="min-h-11 gap-1 rounded-full text-xs">
            <Link to="/laboratorio" state={{ buscaPaciente: getPacienteNome(exame) }}><FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />Coleta no laboratório</Link>
          </Button>
        )}
        {!exameLaboratorial && exame.status !== 'cancelado' && exame.status !== 'laudo_disponivel' && (
          <Button variant="ghost" size="sm" aria-label={`Cancelar exame ${exame.tipo_exame || exame.id}`} title="Cancelar solicitação" className="min-h-11 gap-1 rounded-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setExameParaCancelar({ id: exame.id, nome: exame.tipo_exame || 'este exame' })} disabled={exameEmAtualizacao !== null}>
            <X aria-hidden="true" className="h-3.5 w-3.5" />Cancelar
          </Button>
        )}
        {podeExcluirExame(profile?.roles || []) && (
          <Button variant="ghost" size="icon" aria-label={`Excluir exame ${exame.tipo_exame || exame.id}`} className="h-11 w-11 rounded-full text-destructive/60 hover:bg-destructive/10 hover:text-destructive" title="Excluir permanentemente" onClick={() => handleDeleteExame(exame.id)} disabled={exameEmAtualizacao !== null}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {!taskPage && <>
      <PageHeader
        title="Solicitação de exames"
        description={examesNoEscopo.length > 0
          ? `${contagens.hoje} solicitado${contagens.hoje === 1 ? '' : 's'} hoje · ${contagens.aguardando} aguardando resultado · ${contagens.laudo_disponivel} resultado${contagens.laudo_disponivel === 1 ? '' : 's'} pronto${contagens.laudo_disponivel === 1 ? '' : 's'}${contagens.criticos > 0 ? ` · ${contagens.criticos} crítico${contagens.criticos === 1 ? '' : 's'}` : ''}`
          : 'Crie guias e acompanhe cada exame até a liberação do laudo.'}
        icon={<FileText aria-hidden="true" />}
        actions={
          <>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/laboratorio"><FlaskConical aria-hidden="true" className="h-4 w-4" /> Laboratório</Link>
            </Button>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/laudos-lab"><ClipboardList aria-hidden="true" className="h-4 w-4" /> Laudos</Link>
            </Button>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/guias-externas"><ExternalLink aria-hidden="true" className="h-4 w-4" /> Guias externas</Link>
            </Button>
            <Button variant="outline" onClick={() => navigate(`/exames/laboratorios?voltar=${encodeURIComponent(location.pathname + location.search)}`, { state: { examSearch: searchTerm } })} className="shrink-0 gap-2 rounded-full">
              <Building2 aria-hidden="true" className="h-4 w-4" />Laboratórios
            </Button>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={refreshExames} aria-label="Atualizar exames" title="Atualizar exames">
              <RefreshCw className={cn('h-4 w-4', examesQuery.isFetching && 'animate-spin')} />
            </Button>
            <Button onClick={handleOpenNew} className="shrink-0 gap-2 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90">
              <Plus className="h-4 w-4" />Nova Guia de Exames
            </Button>
          </>
        }
      />

      {pacienteFiltroId && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 p-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Exibindo exames de <span className="font-medium text-primary">{getPacienteNomePorId(pacienteFiltroId)}</span>.
          </p>
          {searchParams.get('voltar') === 'prontuario' && (
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to={`/prontuarios?paciente=${encodeURIComponent(pacienteFiltroId)}${searchParams.get('agendamento') ? `&agendamento=${encodeURIComponent(searchParams.get('agendamento')!)}` : ''}`}>
                Voltar ao prontuário
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete('paciente');
              params.delete('voltar');
              params.delete('agendamento');
              setSearchParams(params, { replace: true });
            }}
          >
            Mostrar todos os exames
          </Button>
        </div>
      )}

      {/* Indicadores clicáveis */}
      <section role="group" aria-label="Situação dos exames" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Situação agora</h2>
          <p className="text-xs text-muted-foreground">
            {indicador === 'todos' ? 'Clique em um indicador para filtrar a lista.' : `Mostrando apenas ${INDICADOR_LABELS[indicador]}.`}
          </p>
        </div>
        <div data-testid="exam-status-kpis" className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {([
            { key: 'aguardando' as IndicadorExame, label: 'Aguardando resultado', caption: 'Solicitados, agendados ou realizados', color: 'text-primary' },
            { key: 'hoje' as IndicadorExame, label: 'Solicitados hoje', caption: 'Guias emitidas hoje', color: 'text-primary' },
            { key: 'agendado' as IndicadorExame, label: 'Agendados / coleta', caption: 'Aguardando realização', color: 'text-info' },
            { key: 'laudo_disponivel' as IndicadorExame, label: 'Resultados prontos', caption: 'Laudo disponível', color: 'text-success' },
            { key: 'criticos' as IndicadorExame, label: 'Críticos', caption: criticosQuery.isError ? 'Não foi possível conferir' : 'Resultado crítico no laboratório', color: 'text-destructive' },
          ]).map(s => {
            const ativo = indicador === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setIndicador(ativo ? 'todos' : s.key)}
                className={cn(
                  'flex min-h-16 min-w-0 items-start gap-3 border-b-2 border-border/70 px-2 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  ativo && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className={cn('min-w-0 flex-1 break-words text-xs font-semibold leading-tight', ativo ? 'text-primary-foreground' : 'text-foreground')}>{s.label}</h3>
                    <span className={cn('shrink-0 text-2xl font-bold tabular-nums', ativo ? 'text-primary-foreground' : s.color)}>{contagens[s.key as Exclude<IndicadorExame, 'todos'>]}</span>
                  </div>
                  <p className={cn('break-words text-[11px] leading-tight', ativo ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{s.caption}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {exames.length >= LIMITE_BUSCA_EM_BLOCOS && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} exames. Solicitações mais antigas podem não aparecer nesta tela.</p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar por paciente ou exame" placeholder="Buscar paciente ou exame..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={cn('h-10 rounded-full pl-9 focus-visible:ring-primary', searchTerm && 'pr-10')} />
          {searchTerm && (
            <Button type="button" variant="ghost" size="icon" aria-label="Limpar busca" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full" onClick={() => setSearchTerm('')}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 w-full rounded-full sm:w-44" aria-label="Filtrar exames por status"><SelectValue placeholder="Filtrar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldHelp term="status_exame" />
        </div>
        {tiposDisponiveis.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar exames por tipo">
            {(['todos', ...tiposDisponiveis]).map(tipo => {
              const ativo = tipoFilter === tipo;
              return (
                <button
                  key={tipo}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setTipoFilter(ativo ? 'todos' : tipo)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    ativo ? 'border-transparent bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {tipo === 'todos' ? 'Todos os tipos' : (TIPO_CATEGORIZADO_LABELS[tipo] || tipo)}
                </button>
              );
            })}
          </div>
        )}
        {temFiltroExames && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltrosExames}>
            <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filteredExames.length} de {examesNoEscopo.length} exame{examesNoEscopo.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Lista: fichas no celular, tabela a partir do tablet */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
              <FileText className="h-4 w-4" />
            </span>
            <CardTitle className="text-base font-semibold">Exames</CardTitle>
            <Badge variant="outline" className="rounded-full border-border text-foreground">{filteredExames.length}</Badge>
            {indicador === 'criticos' && contagens.criticos > 0 && (
              <Badge variant="outline" className="rounded-full border-destructive/40 bg-destructive/10 text-destructive">atenção imediata</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredExames.length === 0 ? (
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 rounded-xl border border-border/60 py-12 text-center">
              <span aria-hidden="true" className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                <FileText className="h-7 w-7" />
              </span>
              <h3 className="font-semibold text-foreground">
                {examesNoEscopo.length === 0
                  ? pacienteFiltroId
                    ? `Nenhum exame encontrado para ${getPacienteNomePorId(pacienteFiltroId, 'este paciente')}`
                    : 'Ainda não há solicitações de exames'
                  : 'Nenhum exame corresponde à busca e ao status selecionados'}
              </h3>
              <p className="max-w-lg px-4 text-sm text-muted-foreground">
                {examesNoEscopo.length === 0
                  ? 'Registre uma nova guia para dar início ao acompanhamento dos exames.'
                  : 'Tente outro termo ou remova o filtro de status para rever as solicitações.'}
              </p>
              {examesNoEscopo.length === 0 ? (
                <Button className="mt-3 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" onClick={handleOpenNew}>
                  <Plus aria-hidden="true" className="mr-2 h-4 w-4" />Nova guia de exames
                </Button>
              ) : (
                <Button variant="outline" className="mt-3 rounded-full" onClick={limparFiltrosExames}>Limpar busca e filtro</Button>
              )}
            </div>
          ) : (
            <>
              <ul className="space-y-2 md:hidden" aria-label="Solicitações de exames">
                {filteredExames.map(exame => {
                  const critico = examesCriticos.has(exame.id);
                  const anexosGuia = extrairAnexosGuia(exame.observacoes);
                  return (
                    <li key={exame.id} className={cn('space-y-3 rounded-xl border border-border/60 bg-card p-3', critico && 'border-destructive/40')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-medium">{getPacienteNome(exame)}</p>
                          <p className="break-words text-sm">{exame.tipo_exame}</p>
                          <p className="text-xs text-muted-foreground">
                            {exame.data_solicitacao && format(parseDateOnly(exame.data_solicitacao)!, 'dd/MM/yyyy')} · {getMedicoInfo(exame)}
                          </p>
                          {anexosGuia.length > 0 && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Paperclip aria-hidden="true" className="h-3 w-3" />{contagem(anexosGuia.length, 'anexo')} na guia
                            </p>
                          )}
                        </div>
                        {critico && <Badge variant="outline" className="shrink-0 rounded-full border-destructive/40 bg-destructive/10 text-xs text-destructive">Crítico</Badge>}
                      </div>
                      <EtapasExame status={exame.status || 'solicitado'} />
                      <div className="flex flex-wrap gap-1">{renderAcoesExame(exame)}</div>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-hidden rounded-xl border border-border/60 md:block">
                <div role="region" aria-label="Tabela de solicitações de exames" tabIndex={0} className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Exame / código</TableHead>
                        <TableHead className="hidden lg:table-cell">Solicitante</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Etapa</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExames.map(exame => {
                        const anexosGuia = extrairAnexosGuia(exame.observacoes);
                        const critico = examesCriticos.has(exame.id);
                        return (
                          <TableRow key={exame.id} className={cn(critico && 'bg-destructive/5')}>
                            <TableCell className="font-medium">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span>{getPacienteNome(exame)}</span>
                                {critico && <Badge variant="outline" className="rounded-full border-destructive/40 bg-destructive/10 text-xs text-destructive">Crítico</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm">{exame.tipo_exame}</span>
                                {anexosGuia.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Paperclip aria-hidden="true" className="h-3 w-3" />{contagem(anexosGuia.length, 'anexo')} na guia
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{getMedicoInfo(exame)}</TableCell>
                            <TableCell className="text-sm">
                              {exame.data_solicitacao && format(parseDateOnly(exame.data_solicitacao)!, 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell><EtapasExame status={exame.status || 'solicitado'} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap justify-end gap-1">{renderAcoesExame(exame)}</div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
          {!pacienteFiltroId && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{incluirExamesAntigos ? 'Exibindo todas as solicitações.' : `Exibindo solicitações dos últimos ${DIAS_PERIODO_EXAMES} dias.`}</span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setIncluirExamesAntigos(atual => !atual)}
                disabled={examesQuery.isFetching}
              >
                {incluirExamesAntigos ? `Mostrar só os últimos ${DIAS_PERIODO_EXAMES} dias` : 'Ver exames mais antigos'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      </>}
      {creationPage && <section className="mx-auto max-w-5xl space-y-6" aria-busy={isSubmitting}>
        <UnsavedChangesGuard completed={completed} busy={isSubmitting} dirty={JSON.stringify(formData) !== JSON.stringify(baseline.current) || examesSelecionados.length > 0 || anexos.length > 0} />
        <Button variant="ghost" onClick={handleCloseNew}>← Voltar aos exames</Button>
        <header className="space-y-2 border-b pb-5"><h1 className="text-2xl font-semibold tracking-tight">Nova Guia de Exames</h1><p className="text-sm text-muted-foreground">Selecione os exames e revise a indicação clínica, os preparos e os anexos antes de solicitar.</p></header>
          {prontuarioFonteId && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm" role={prontuarioFonteQuery.isLoading ? 'status' : prontuarioFonteQuery.isError || !prontuarioFonteQuery.data || prontuarioFonteQuery.data.paciente_id !== formData.paciente_id ? 'alert' : 'note'}>
              {prontuarioFonteQuery.isLoading ? (
                <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Confirmando o prontuário de origem…</span>
              ) : prontuarioFonteQuery.isError || !prontuarioFonteQuery.data || prontuarioFonteQuery.data.paciente_id !== formData.paciente_id ? (
                <span className="text-destructive">Não foi possível confirmar o paciente e o prontuário de origem. Atualize a página a partir do prontuário antes de salvar.</span>
              ) : (
                <span>Solicitação vinculada ao atendimento de <strong>{getPacienteNomePorId(formData.paciente_id)}</strong>. Os exames serão associados a este prontuário.</span>
              )}
            </div>
          )}

          <fieldset disabled={isSubmitting} data-testid="exam-request-fields" className="min-w-0 space-y-5 border-0 p-0">
            {/* Paciente + Médico */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="request-patient" className="text-xs font-medium">Paciente *</Label>
                <PacienteCombobox id="request-patient"
                  value={formData.paciente_id || null}
                  onChange={id => setFormData(form => ({ ...form, paciente_id: id }))}
                  placeholder="Buscar paciente por nome, CPF ou telefone..."
                  disabled={isSubmitting || Boolean(prontuarioFonteId)}
                  className="h-11"
                />
                {formData.paciente_id && pacienteResumoQuery.isLoading && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                    <Loader2 className="h-3 w-3 animate-spin" /> Carregando os dados do paciente...
                  </p>
                )}
                {formData.paciente_id && pacienteResumoQuery.isError && (
                  <div className="flex items-center justify-between gap-2 text-xs text-destructive" role="alert">
                    <span>Não foi possível carregar os dados deste paciente.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void pacienteResumoQuery.refetch()}>Tentar novamente</Button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="request-doctor" className="text-xs font-medium">Profissional Solicitante</Label>
                <Select value={formData.medico_solicitante_id} disabled={isMedicoOnly} onValueChange={v => setFormData({ ...formData, medico_solicitante_id: v })}>
                  <SelectTrigger id="request-doctor"><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>{medicosDisponiveis.map(m => <SelectItem key={m.id} value={m.id}>{m.nome || m.crm} — {m.especialidade || 'Clínico'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Data + Validade */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="request-date" className="text-xs font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />Data do Pedido</Label>
                <Input id="request-date" type="date" max={todaySaoPauloDateOnly()} value={formData.data_solicitacao} onChange={e => setFormData({ ...formData, data_solicitacao: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="request-validity" className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" />Validade (dias)</Label>
                <Select value={formData.validade_dias.toString()} onValueChange={v => setFormData({ ...formData, validade_dias: parseInt(v) })}>
                  <SelectTrigger id="request-validity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                    <SelectItem value="90">90 dias</SelectItem>
                    <SelectItem value="180">180 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="request-urgency" className="text-xs font-medium">Urgência</Label>
                <Select value={formData.urgencia} onValueChange={v => setFormData({ ...formData, urgencia: v })}>
                  <SelectTrigger id="request-urgency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="emergencia">Emergência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="request-fasting" className="text-xs font-medium">Jejum</Label>
                <Select value={formData.jejum} onValueChange={v => setFormData({ ...formData, jejum: v })}>
                  <SelectTrigger id="request-fasting"><SelectValue placeholder="Se necessário" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não necessário</SelectItem>
                    <SelectItem value="8h">8 horas</SelectItem>
                    <SelectItem value="10h">10 horas</SelectItem>
                    <SelectItem value="12h">12 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {preparosAusentes.length > 0 && (
              <div role="alert" className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <p className="flex items-center gap-1 text-xs font-semibold text-warning-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />A guia não traz o preparo configurado para {preparosAusentes.length === 1 ? 'este exame' : 'estes exames'}
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground">
                  {preparosAusentes.map(item => <li key={item.exame}><span className="font-medium">{item.exame}:</span> {item.preparo}</li>)}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full text-xs"
                  onClick={() => setFormData(atual => ({
                    ...atual,
                    observacoes: [atual.observacoes.trim(), textoPreparosParaGuia(preparosAusentes)].filter(Boolean).join('\n'),
                  }))}
                >
                  Incluir preparo na guia
                </Button>
              </div>
            )}

            {/* Urgency justification */}
            {(formData.urgencia === 'urgente' || formData.urgencia === 'emergencia') && (
              <div className="bg-warning/5 border border-warning/20 rounded-lg p-4 space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />Justificativa de Urgência (obrigatória para autorização) *
                </Label>
                <Textarea
                  value={formData.justificativa_urgencia}
                  onChange={e => setFormData({ ...formData, justificativa_urgencia: e.target.value })}
                  placeholder="Justifique a necessidade de urgência para fins de autorização pelo convênio..."
                  rows={2}
                />
              </div>
            )}

            <Separator />

            {/* ─── Multi-Exam Selector ─── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Exames Solicitados ({examesSelecionados.length})</Label>
                  <Badge variant="outline" className="text-[10px]">TUSS ou código livre</Badge>
              </div>

              {/* Selected exams as tags */}
              {examesSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {examesSelecionados.map(ex => (
                    <Badge key={ex.nome} variant="secondary" className="gap-1.5 py-1.5 px-3 text-xs">
                      {ex.tuss && <span className="text-[10px] text-muted-foreground font-mono">{ex.tuss}</span>}
                      {ex.nome}
                      {ex.necessita_contraste && <span className="text-warning">⚠ contraste</span>}
                      <button type="button" aria-label={`Remover ${ex.nome} da guia`} onClick={() => removeExame(ex.nome)} className="relative ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:text-destructive after:absolute after:-inset-2.5 after:content-['']"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Códigos TUSS aparecem apenas quando foram confirmados. Exames sem código continuam disponíveis para solicitação pelo nome.
              </p>

              {/* Search + Category filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, TUSS ou código livre..."
                    value={examSearch}
                    onChange={e => { setExamSearch(e.target.value); setShowExamPicker(true); }}
                    onFocus={() => setShowExamPicker(true)}
                    className="pl-9"
                  />
                </div>
                <Select value={catFilter} onValueChange={v => { setCatFilter(v === '__all__' ? '' : v); setShowExamPicker(true); }}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas categorias</SelectItem>
                    {categoriasDisponiveis.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Exam picker dropdown */}
              {showExamPicker && (
                <div className="border rounded-lg max-h-48 overflow-y-auto bg-background">
                  {filteredCatalogo.length === 0 ? (
                    <p className="text-center py-4 text-sm text-muted-foreground">Nenhum exame do catálogo encontrado</p>
                  ) : (
                    filteredCatalogo.slice(0, 30).map(ex => (
                      <button
                        key={ex.nome}
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 text-left text-sm border-b last:border-0 transition-colors"
                        onClick={() => addExame(ex)}
                      >
                        <div>
                          <span className="font-medium">{ex.nome}</span>
                          <span className="ml-2 text-[10px] text-muted-foreground font-mono">{ex.tuss}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{ex.categoria}</Badge>
                      </button>
                    ))
                  )}
                  {filteredCatalogo.length > 30 && (
                    <p className="text-center py-2 text-xs text-muted-foreground">Mostrando 30 de {filteredCatalogo.length} — refine sua busca</p>
                  )}

                  {canAddCustomExam && (
                    <div className="border-t bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Adicionar exame personalizado</p>
                          <p className="text-xs text-muted-foreground truncate">Nome: {examSearch.trim()}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] whitespace-nowrap">Código livre</Badge>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          value={customExamCode}
                          onChange={e => setCustomExamCode(e.target.value)}
                          placeholder="Código próprio, TUSS ou deixe em branco"
                          className="font-mono sm:flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCustomExamCode(generateAutomaticExamCode())}
                        >
                          Auto
                        </Button>
                        <Button type="button" onClick={addCustomExame}>
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Contrast checkbox */}
            <div className="flex items-center gap-3">
              <Checkbox
                id="contraste"
                checked={formData.necessita_contraste}
                onCheckedChange={c => setFormData({ ...formData, necessita_contraste: c as boolean })}
              />
              <Label htmlFor="contraste" className="text-sm cursor-pointer">
                Necessita de Contraste? <span className="text-xs text-muted-foreground">(altera preparo do paciente e valor)</span>
              </Label>
            </div>

            <Separator />

            {/* ─── Pricing Section ─── */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" /> Preços e Laboratório
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="request-type" className="text-xs font-medium">Tipo de Exame</Label>
                  <Select value={formData.tipo_categorizado || '__auto__'} onValueChange={v => setFormData({ ...formData, tipo_categorizado: v === '__auto__' ? undefined : v })}>
                    <SelectTrigger id="request-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Pela categoria de cada exame</SelectItem>
                      <SelectItem value="laboratorial">Laboratorial</SelectItem>
                      <SelectItem value="imagem">Imagem</SelectItem>
                      <SelectItem value="ultrassom">Ultrassom</SelectItem>
                      <SelectItem value="cardiologia">Cardiologia</SelectItem>
                      <SelectItem value="endoscopia">Endoscopia</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="request-cost" className="text-xs font-medium">Preço de custo por exame (R$)</Label>
                  <Input id="request-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.preco_custo ?? ''}
                    onChange={e => setFormData({ ...formData, preco_custo: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="request-price" className="text-xs font-medium">Preço de venda por exame (R$)</Label>
                  <Input id="request-price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.preco_venda ?? ''}
                    onChange={e => setFormData({ ...formData, preco_venda: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                O valor informado vale para cada exame da guia e fica registrado em cada pedido. A cobrança no balcão continua usando a tabela de convênio ou o catálogo de preços da clínica.
              </p>
              {examesSelecionados.length > 1 && (formData.preco_custo !== undefined || formData.preco_venda !== undefined) && (
                <p className="mt-1 text-xs text-foreground" aria-live="polite">
                  Total da guia ({contagem(examesSelecionados.length, 'exame')}):
                  {formData.preco_custo !== undefined && <> custo <strong>{formatCurrency(formData.preco_custo * examesSelecionados.length)}</strong></>}
                  {formData.preco_custo !== undefined && formData.preco_venda !== undefined && ' ·'}
                  {formData.preco_venda !== undefined && <> venda <strong>{formatCurrency(formData.preco_venda * examesSelecionados.length)}</strong></>}
                </p>
              )}

              <div className="mt-4 space-y-1.5">
                <Label htmlFor="request-lab" className="text-xs font-medium">Laboratório responsável</Label>
                {laboratoriosQuery.isError ? (
                  <ErrorState compact title="Não foi possível carregar os laboratórios" error={laboratoriosQuery.error} onRetry={() => void laboratoriosQuery.refetch()} />
                ) : (
                  <Select
                    value={formData.laboratorio_id || '__nenhum__'}
                    onValueChange={value => setFormData({ ...formData, laboratorio_id: value === '__nenhum__' ? undefined : value })}
                    disabled={laboratoriosQuery.isLoading}
                  >
                    <SelectTrigger id="request-lab"><SelectValue placeholder={laboratoriosQuery.isLoading ? 'Carregando laboratórios…' : 'Selecione (opcional)'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhum__">Sem laboratório vinculado</SelectItem>
                      {laboratorios.map((laboratorio: any) => (
                        <SelectItem key={laboratorio.id} value={laboratorio.id}>{laboratorio.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {Number(formData.preco_custo) > 0 && formData.preco_venda !== undefined && (
                <div className="mt-3 rounded-lg border border-border bg-card p-3">
                  <p className={cn('text-sm', formData.preco_venda < formData.preco_custo ? 'text-destructive' : 'text-foreground')}>
                    Margem por exame: <span className="font-bold">{formatCurrency((formData.preco_venda - formData.preco_custo))}</span> ({(((formData.preco_venda - formData.preco_custo) / formData.preco_custo) * 100).toFixed(0)}%)
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Clinical info */}
            <div className="space-y-1.5">
              <Label htmlFor="exam-indicacao-clinica" className="text-xs font-medium">Indicação Clínica *</Label>
              <Textarea
                id="exam-indicacao-clinica"
                value={formData.indicacao_clinica}
                onChange={e => setFormData({ ...formData, indicacao_clinica: e.target.value })}
                placeholder="Sintomas, achados clínicos, suspeita diagnóstica..."
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-hipotese-diagnostica" className="text-xs font-medium">Hipótese Diagnóstica / CID</Label>
              <Input
                id="exam-hipotese-diagnostica"
                value={formData.hipotese_diagnostica}
                onChange={e => setFormData({ ...formData, hipotese_diagnostica: e.target.value })}
                placeholder="Ex: J18.9 - Pneumonia, M54.5 - Lombalgia..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-observacoes" className="text-xs font-medium">Observações para Laboratório/Clínica</Label>
              <Textarea
                id="exam-observacoes"
                value={formData.observacoes}
                onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Instruções especiais, alergias a contraste, marcapasso, próteses..."
                rows={2}
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1"><Upload className="h-3 w-3" />Anexos (laudos anteriores, fotos de lesões)</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) {
                      const selectedFiles = Array.from(e.target.files);
                      const validTypeFiles = selectedFiles.filter(file => TIPOS_ANEXO_EXAME.has(file.type));
                      const oversizedFiles = validTypeFiles.filter(file => file.size > MAX_ANEXO_EXAME_BYTES);
                      const validFiles = validTypeFiles.filter(file => file.size <= MAX_ANEXO_EXAME_BYTES);
                      const invalidTypeCount = selectedFiles.length - validTypeFiles.length;
                      if (invalidTypeCount) toast.error(`${contagem(invalidTypeCount, 'arquivo')} ${palavra(invalidTypeCount, 'ignorado', 'ignorados')}. Use PDF, JPG, PNG, GIF ou WebP.`);
                      if (oversizedFiles.length) toast.error(`${contagem(oversizedFiles.length, 'arquivo')} ${palavra(oversizedFiles.length, 'excede', 'excedem')} o limite de 10 MB e ${palavra(oversizedFiles.length, 'foi ignorado', 'foram ignorados')}.`);
                      setAnexos(prev => {
                        const existing = new Set(prev.map(file => `${file.name}:${file.size}:${file.lastModified}`));
                        const novosArquivos = validFiles.filter(file => {
                          const key = `${file.name}:${file.size}:${file.lastModified}`;
                          if (existing.has(key)) return false;
                          existing.add(key);
                          return true;
                        });
                        return [...prev, ...novosArquivos];
                      });
                    }
                    e.currentTarget.value = '';
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1">
                  <Upload className="h-3.5 w-3.5" />Selecionar Arquivos
                </Button>
                <span className="text-xs text-muted-foreground">{contagem(anexos.length, 'arquivo')}</span>
              </div>
              <p className="text-xs text-muted-foreground">PDF, JPG, PNG, GIF ou WebP. Até 10 MB por arquivo.</p>
              {anexos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {anexos.map((f, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-xs">
                      {f.name.length > 25 ? f.name.slice(0, 25) + '...' : f.name}
                      <button type="button" aria-label={`Remover anexo ${f.name}`} className="relative inline-flex h-6 w-6 items-center justify-center rounded-full hover:text-destructive after:absolute after:-inset-2.5 after:content-['']" onClick={() => setAnexos(prev => prev.filter((_, idx) => idx !== i))}><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Validity info */}
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
              <Clock className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Validade da Solicitação</p>
                <p className="text-xs text-muted-foreground">
                  Esta guia é válida por <strong>{formData.validade_dias} dias</strong> — até{' '}
                  {format(addDays(new Date(formData.data_solicitacao + 'T12:00'), formData.validade_dias), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.
                </p>
              </div>
            </div>
          </fieldset>

          <div data-testid="exam-request-footer" className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button variant="outline" onClick={handleCloseNew} disabled={isSubmitting}>Voltar aos exames</Button>
            <Button variant="secondary" onClick={() => handleSave(false)} disabled={isSubmitting || pacienteResumoQuery.isLoading} className="gap-1">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Solicitar ({examesSelecionados.length})
            </Button>
            <Button onClick={() => handleSave(true)} disabled={isSubmitting || pacienteResumoQuery.isLoading} className="gap-1">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <FileDown className="h-4 w-4" />Criar e baixar guia PDF
            </Button>
          </div>
      </section>}

      {isViewOpen && <section className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" onClick={leaveTask}>← Voltar aos exames</Button>
        <h1 className="border-b pb-5 text-2xl font-semibold tracking-tight">Detalhes do Exame</h1>
          {selectedExame && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Paciente</p>
                  <p className="font-medium">{getPacienteNome(selectedExame)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className={cn('rounded-full', STATUS_COLORS[selectedExame.status || 'solicitado'])}>{STATUS_LABELS[selectedExame.status || 'solicitado']}</Badge>
                </div>
              </div>
              <div>
                  <p className="text-sm text-muted-foreground">Exame / Código</p>
                <p className="font-medium">{selectedExame.tipo_exame}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Data Solicitação</p>
                  <p>{selectedExame.data_solicitacao && format(parseDateOnly(selectedExame.data_solicitacao)!, 'dd/MM/yyyy')}</p>
                </div>
                {selectedExame.data_realizacao && (
                  <div>
                    <p className="text-sm text-muted-foreground">Data Realização</p>
                    <p>{format(parseDateOnly(selectedExame.data_realizacao)!, 'dd/MM/yyyy')}</p>
                  </div>
                )}
              </div>
              {selectedExame.descricao && (
                <div>
                  <p className="text-sm text-muted-foreground">Detalhes</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedExame.descricao}</p>
                </div>
              )}
              {selectedExame.resultado && (
                <div>
                  <p className="text-sm text-muted-foreground">Resultado</p>
                  <p className="whitespace-pre-wrap">{selectedExame.resultado}</p>
                </div>
              )}
              {anexosSelecionado.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Anexos da guia ({anexosSelecionado.length})</p>
                  <ul className="space-y-2">
                    {anexosSelecionado.map(path => {
                      const nome = path.split('/').pop() || path;
                      const ocupado = anexoEmAcao === path;
                      return (
                        <li key={path} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Paperclip aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                            <p className="truncate text-sm font-medium" title={nome}>{nome}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="outline" size="sm" className="h-9 gap-1 rounded-full text-xs" aria-label={`Abrir anexo ${nome}`} disabled={anexoEmAcao !== null} onClick={() => void handleAbrirAnexo(path)}>
                              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}
                              Abrir
                            </Button>
                            <Button variant="outline" size="sm" className="h-9 gap-1 rounded-full text-xs" aria-label={`Baixar anexo ${nome}`} disabled={anexoEmAcao !== null} onClick={() => void handleBaixarAnexo(path)}>
                              <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
                              Baixar
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {selectedExame.arquivo_resultado && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Laudo anexado</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedExame.arquivo_resultado.split('/').pop()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-2 rounded-full text-xs"
                    onClick={() => void handleDownloadLaudo(selectedExame)}
                    disabled={baixandoLaudoId !== null}
                  >
                    {baixandoLaudoId === selectedExame.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FileDown className="h-4 w-4" />}
                    Baixar laudo
                  </Button>
                </div>
              )}
              {observacoesSelecionado && (
                <div>
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{observacoesSelecionado}</p>
                </div>
              )}
            </div>
          )}
          {selectedExame && selectedExame.status !== 'cancelado' && selectedExame.status !== 'laudo_disponivel' && (
            <section aria-labelledby="exame-preparo-titulo" className="space-y-2 border-t pt-4">
              <h2 id="exame-preparo-titulo" className="text-sm font-semibold">Preparo do paciente</h2>
              <PreparoExamesAcoes exames={[selectedExame.tipo_exame || '']} pacienteNome={getPacienteNome(selectedExame)} telefone={selectedExame.pacientes?.telefone} />
            </section>
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button variant="outline" onClick={leaveTask}>Voltar aos exames</Button>
            {selectedExame && (
              <Button variant="outline" className="gap-1.5" disabled={reimprimindoGuia} onClick={() => void handleReimprimirGuia(selectedExame)}>
                {reimprimindoGuia ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Printer aria-hidden="true" className="h-4 w-4" />}
                Reimprimir guia
              </Button>
            )}
            {selectedExame && (
              <Button variant="outline" className="gap-1.5" disabled={repetindoPedido} onClick={() => void handleRepetirPedido(selectedExame)}>
                {repetindoPedido ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="h-4 w-4" />}
                Repetir pedido
              </Button>
            )}
            {selectedExame && proximaAcaoExame(selectedExame.status || 'solicitado', selectedExame.tipo_categorizado).destino === 'laboratorio' && <Button asChild><Link to="/laboratorio">Abrir laboratório</Link></Button>}
            {selectedExame?.status === 'realizado' && (selectedExame.tipo_categorizado || '').toLowerCase() !== 'laboratorial' && !selectedExame.resultado && !selectedExame.arquivo_resultado && <Button onClick={() => setLancandoResultado(selectedExame)}>Lançar resultado</Button>}
          </div>
      </section>}

      <AlertDialog
        open={!!exameParaCancelar}
        onOpenChange={(open) => { if (!open && exameEmAtualizacao === null) setExameParaCancelar(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar solicitação de exame?</AlertDialogTitle>
            <AlertDialogDescription>
              A solicitação de {exameParaCancelar?.nome} será marcada como cancelada e sairá do fluxo de atendimento. O histórico permanecerá registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exameEmAtualizacao !== null}>Manter exame</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={exameEmAtualizacao !== null}
              onClick={(event) => {
                event.preventDefault();
                if (!exameParaCancelar || exameEmAtualizacao !== null) return;
                void handleUpdateStatus(exameParaCancelar.id, 'cancelado').then((salvo) => {
                  if (salvo) setExameParaCancelar(null);
                });
              }}
            >
              Cancelar solicitação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!exameParaExcluir}
        onOpenChange={(open) => { if (!open && !excluindoExame) setExameParaExcluir(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir solicitação de exame?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta exclusão é permanente e remove o exame da lista da clínica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoExame}>Manter exame</AlertDialogCancel>
            <AlertDialogAction
              disabled={excluindoExame}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => { event.preventDefault(); void confirmarExclusaoExame(); }}
            >
              {excluindoExame && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir exame
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lançar resultado — o degrau que faltava entre "realizado" e o laudo.
          Depois de salvar, segue o fluxo normal, que vincula ao prontuário e
          avisa o paciente. */}

    </div>
  );
}
