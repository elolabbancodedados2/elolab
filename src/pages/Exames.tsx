import { useState, useMemo, useRef } from 'react';
import {
  Plus, Search, Eye, FileText, Loader2, PlusCircle, X, Printer,
  AlertTriangle, Upload, ShieldCheck, Clock, Calendar, Tag, Building2, DollarSign, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { LoadingButton } from '@/components/ui/loading-button';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePacientes, useMedicos } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Database } from '@/integrations/supabase/types';
import { autoCreateColeta, autoProgressExame, autoVincularResultadoProntuario } from '@/lib/workflowAutomation';
import { GerenciadorLaboratorios } from '@/components/GerenciadorLaboratorios';
import { parseDateOnly } from '@/lib/dateOnly';

type StatusExame = Database['public']['Enums']['status_exame'];

const STATUS_COLORS: Record<StatusExame, string> = {
  solicitado: 'bg-warning/10 text-warning',
  agendado: 'bg-info/10 text-info',
  realizado: 'bg-primary/10 text-primary',
  laudo_disponivel: 'bg-success/10 text-success',
  cancelado: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<StatusExame, string> = {
  solicitado: 'Solicitado',
  agendado: 'Agendado',
  realizado: 'Realizado',
  laudo_disponivel: 'Laudo Disponível',
  cancelado: 'Cancelado',
};

// ── Catálogo de Exames com Código TUSS ──
interface ExameCatalogo {
  nome: string;
  tuss: string;
  categoria: string;
}

const CATALOGO_EXAMES: ExameCatalogo[] = [
  // Hematologia
  { nome: 'Hemograma Completo', tuss: '40304361', categoria: 'Hematologia' },
  { nome: 'Coagulograma', tuss: '40304329', categoria: 'Hematologia' },
  { nome: 'VHS', tuss: '40304400', categoria: 'Hematologia' },
  { nome: 'Reticulócitos', tuss: '40304388', categoria: 'Hematologia' },
  { nome: 'Tipagem Sanguínea (ABO/Rh)', tuss: '40304060', categoria: 'Hematologia' },
  { nome: 'Eletroforese de Hemoglobina', tuss: '40304230', categoria: 'Hematologia' },
  { nome: 'TAP (Tempo de Protrombina)', tuss: '40304396', categoria: 'Hematologia' },
  { nome: 'TTPA', tuss: '40304078', categoria: 'Hematologia' },
  { nome: 'INR', tuss: '40304396', categoria: 'Hematologia' },
  { nome: 'Fibrinogênio', tuss: '40304256', categoria: 'Hematologia' },
  { nome: 'D-Dímero', tuss: '40304191', categoria: 'Hematologia' },
  // Bioquímica
  { nome: 'Glicemia em Jejum', tuss: '40302040', categoria: 'Bioquímica' },
  { nome: 'Hemoglobina Glicada (HbA1c)', tuss: '40302059', categoria: 'Bioquímica' },
  { nome: 'Curva Glicêmica (TOTG)', tuss: '40302067', categoria: 'Bioquímica' },
  { nome: 'Colesterol Total', tuss: '40301630', categoria: 'Bioquímica' },
  { nome: 'Colesterol HDL', tuss: '40301621', categoria: 'Bioquímica' },
  { nome: 'Colesterol LDL', tuss: '40301613', categoria: 'Bioquímica' },
  { nome: 'Perfil Lipídico Completo', tuss: '40301648', categoria: 'Bioquímica' },
  { nome: 'Triglicerídeos', tuss: '40302580', categoria: 'Bioquímica' },
  { nome: 'Ureia', tuss: '40302601', categoria: 'Bioquímica' },
  { nome: 'Creatinina', tuss: '40301702', categoria: 'Bioquímica' },
  { nome: 'Ácido Úrico', tuss: '40301010', categoria: 'Bioquímica' },
  { nome: 'TGO (AST)', tuss: '40302547', categoria: 'Bioquímica' },
  { nome: 'TGP (ALT)', tuss: '40302555', categoria: 'Bioquímica' },
  { nome: 'Gama GT', tuss: '40302024', categoria: 'Bioquímica' },
  { nome: 'Fosfatase Alcalina', tuss: '40301990', categoria: 'Bioquímica' },
  { nome: 'Bilirrubinas (Total e Frações)', tuss: '40301257', categoria: 'Bioquímica' },
  { nome: 'Proteínas Totais e Frações', tuss: '40302377', categoria: 'Bioquímica' },
  { nome: 'Albumina', tuss: '40301036', categoria: 'Bioquímica' },
  { nome: 'PCR (Proteína C Reativa)', tuss: '40302318', categoria: 'Bioquímica' },
  { nome: 'PCR Ultrassensível', tuss: '40302326', categoria: 'Bioquímica' },
  { nome: 'Ferro Sérico', tuss: '40301974', categoria: 'Bioquímica' },
  { nome: 'Ferritina', tuss: '40301966', categoria: 'Bioquímica' },
  { nome: 'Transferrina', tuss: '40302598', categoria: 'Bioquímica' },
  { nome: 'Sódio', tuss: '40302512', categoria: 'Bioquímica' },
  { nome: 'Potássio', tuss: '40302369', categoria: 'Bioquímica' },
  { nome: 'Cálcio Total', tuss: '40301290', categoria: 'Bioquímica' },
  { nome: 'Cálcio Iônico', tuss: '40301281', categoria: 'Bioquímica' },
  { nome: 'Magnésio', tuss: '40302199', categoria: 'Bioquímica' },
  { nome: 'Fósforo', tuss: '40302008', categoria: 'Bioquímica' },
  { nome: 'Amilase', tuss: '40301079', categoria: 'Bioquímica' },
  { nome: 'Lipase', tuss: '40302181', categoria: 'Bioquímica' },
  { nome: 'CPK (Creatinoquinase)', tuss: '40301710', categoria: 'Bioquímica' },
  { nome: 'CPK-MB', tuss: '40301729', categoria: 'Bioquímica' },
  { nome: 'Troponina I', tuss: '40302563', categoria: 'Bioquímica' },
  { nome: 'LDH', tuss: '40301737', categoria: 'Bioquímica' },
  { nome: 'Lactato', tuss: '40302164', categoria: 'Bioquímica' },
  // Hormônios
  { nome: 'TSH', tuss: '40316327', categoria: 'Hormônios' },
  { nome: 'T4 Livre', tuss: '40316360', categoria: 'Hormônios' },
  { nome: 'T3 Total', tuss: '40316343', categoria: 'Hormônios' },
  { nome: 'FSH', tuss: '40316084', categoria: 'Hormônios' },
  { nome: 'LH', tuss: '40316190', categoria: 'Hormônios' },
  { nome: 'Estradiol (E2)', tuss: '40316068', categoria: 'Hormônios' },
  { nome: 'Progesterona', tuss: '40316262', categoria: 'Hormônios' },
  { nome: 'Testosterona Total', tuss: '40316300', categoria: 'Hormônios' },
  { nome: 'Prolactina', tuss: '40316270', categoria: 'Hormônios' },
  { nome: 'Cortisol Basal', tuss: '40316041', categoria: 'Hormônios' },
  { nome: 'Insulina Basal', tuss: '40316149', categoria: 'Hormônios' },
  { nome: 'PTH (Paratormônio)', tuss: '40316246', categoria: 'Hormônios' },
  { nome: 'Vitamina D (25-OH)', tuss: '40316408', categoria: 'Hormônios' },
  { nome: 'Beta-HCG Quantitativo', tuss: '40302016', categoria: 'Hormônios' },
  { nome: 'GH', tuss: '40316106', categoria: 'Hormônios' },
  { nome: 'IGF-1', tuss: '40316130', categoria: 'Hormônios' },
  { nome: 'DHEA-S', tuss: '40316050', categoria: 'Hormônios' },
  // Urinálise
  { nome: 'EAS (Urina Tipo I)', tuss: '40311040', categoria: 'Urinálise' },
  { nome: 'Urocultura', tuss: '40311058', categoria: 'Urinálise' },
  { nome: 'Microalbuminúria', tuss: '40311023', categoria: 'Urinálise' },
  { nome: 'Proteinúria de 24h', tuss: '40311031', categoria: 'Urinálise' },
  { nome: 'Clearance de Creatinina', tuss: '40311015', categoria: 'Urinálise' },
  // Sorologia
  { nome: 'Anti-HIV (1 e 2)', tuss: '40307450', categoria: 'Sorologia' },
  { nome: 'VDRL', tuss: '40307590', categoria: 'Sorologia' },
  { nome: 'HBsAg (Hepatite B)', tuss: '40307310', categoria: 'Sorologia' },
  { nome: 'Anti-HBs', tuss: '40307280', categoria: 'Sorologia' },
  { nome: 'Anti-HBc Total', tuss: '40307271', categoria: 'Sorologia' },
  { nome: 'Anti-HCV (Hepatite C)', tuss: '40307301', categoria: 'Sorologia' },
  { nome: 'Toxoplasmose (IgG e IgM)', tuss: '40307565', categoria: 'Sorologia' },
  { nome: 'Rubéola (IgG e IgM)', tuss: '40307530', categoria: 'Sorologia' },
  { nome: 'CMV (IgG e IgM)', tuss: '40307115', categoria: 'Sorologia' },
  { nome: 'Dengue (IgG e IgM)', tuss: '40307140', categoria: 'Sorologia' },
  { nome: 'Covid-19 PCR (RT-PCR)', tuss: '40314618', categoria: 'Sorologia' },
  // Imunologia
  { nome: 'FAN (Fator Antinuclear)', tuss: '40306879', categoria: 'Imunologia' },
  { nome: 'Fator Reumatoide (FR)', tuss: '40306895', categoria: 'Imunologia' },
  { nome: 'Anti-CCP', tuss: '40306810', categoria: 'Imunologia' },
  { nome: 'ASLO', tuss: '40306844', categoria: 'Imunologia' },
  { nome: 'Complemento C3', tuss: '40306860', categoria: 'Imunologia' },
  { nome: 'Complemento C4', tuss: '40306852', categoria: 'Imunologia' },
  { nome: 'IgE Total', tuss: '40306917', categoria: 'Imunologia' },
  // Marcadores Tumorais
  { nome: 'PSA Total', tuss: '40316289', categoria: 'Marcadores Tumorais' },
  { nome: 'PSA Livre', tuss: '40316297', categoria: 'Marcadores Tumorais' },
  { nome: 'CEA', tuss: '40316033', categoria: 'Marcadores Tumorais' },
  { nome: 'CA 125', tuss: '40316009', categoria: 'Marcadores Tumorais' },
  { nome: 'CA 19-9', tuss: '40316017', categoria: 'Marcadores Tumorais' },
  { nome: 'CA 15-3', tuss: '40316025', categoria: 'Marcadores Tumorais' },
  { nome: 'AFP (Alfafetoproteína)', tuss: '40302385', categoria: 'Marcadores Tumorais' },
  // Vitaminas
  { nome: 'Vitamina B12', tuss: '40302610', categoria: 'Vitaminas' },
  { nome: 'Ácido Fólico', tuss: '40301028', categoria: 'Vitaminas' },
  { nome: 'Vitamina A', tuss: '40302628', categoria: 'Vitaminas' },
  { nome: 'Zinco', tuss: '40302636', categoria: 'Vitaminas' },
  // Fezes
  { nome: 'Parasitológico de Fezes (EPF)', tuss: '40310060', categoria: 'Fezes' },
  { nome: 'Sangue Oculto nas Fezes', tuss: '40310078', categoria: 'Fezes' },
  { nome: 'Coprocultura', tuss: '40310035', categoria: 'Fezes' },
  { nome: 'Calprotectina Fecal', tuss: '40310027', categoria: 'Fezes' },
  // Imagem - Raio-X
  { nome: 'Raio-X Tórax PA', tuss: '40801012', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Tórax PA e Perfil', tuss: '40801020', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Coluna Cervical', tuss: '40801039', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Coluna Lombar', tuss: '40801047', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Abdome', tuss: '40801055', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Seios da Face', tuss: '40801063', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Joelho', tuss: '40801071', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Ombro', tuss: '40801080', categoria: 'Imagem - RX' },
  { nome: 'Raio-X Mão', tuss: '40801098', categoria: 'Imagem - RX' },
  // Imagem - Ultrassom
  { nome: 'Ultrassom Abdominal Total', tuss: '40901017', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Pélvico', tuss: '40901025', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Transvaginal', tuss: '40901033', categoria: 'Imagem - US' },
  { nome: 'Ultrassom de Tireoide', tuss: '40901041', categoria: 'Imagem - US' },
  { nome: 'Ultrassom de Mama', tuss: '40901050', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Rins e Vias Urinárias', tuss: '40901068', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Obstétrico', tuss: '40901076', categoria: 'Imagem - US' },
  { nome: 'Ultrassom Morfológico', tuss: '40901084', categoria: 'Imagem - US' },
  { nome: 'Doppler de Carótidas', tuss: '40901092', categoria: 'Imagem - US' },
  { nome: 'Doppler Venoso MMII', tuss: '40901106', categoria: 'Imagem - US' },
  // Imagem - Tomografia
  { nome: 'TC Crânio (sem contraste)', tuss: '41001011', categoria: 'Imagem - TC' },
  { nome: 'TC Crânio (com contraste)', tuss: '41001020', categoria: 'Imagem - TC' },
  { nome: 'TC Tórax', tuss: '41001038', categoria: 'Imagem - TC' },
  { nome: 'TC Abdome Total', tuss: '41001046', categoria: 'Imagem - TC' },
  { nome: 'TC Coluna Lombar', tuss: '41001054', categoria: 'Imagem - TC' },
  { nome: 'Angiotomografia Coronariana', tuss: '41001062', categoria: 'Imagem - TC' },
  { nome: 'Angiotomografia Pulmonar', tuss: '41001070', categoria: 'Imagem - TC' },
  // Imagem - Ressonância
  { nome: 'RM Crânio', tuss: '41101014', categoria: 'Imagem - RM' },
  { nome: 'RM Coluna Cervical', tuss: '41101022', categoria: 'Imagem - RM' },
  { nome: 'RM Coluna Lombar', tuss: '41101030', categoria: 'Imagem - RM' },
  { nome: 'RM Joelho', tuss: '41101049', categoria: 'Imagem - RM' },
  { nome: 'RM Ombro', tuss: '41101057', categoria: 'Imagem - RM' },
  { nome: 'RM Pelve', tuss: '41101065', categoria: 'Imagem - RM' },
  { nome: 'RM Mama', tuss: '41101073', categoria: 'Imagem - RM' },
  { nome: 'RM Cardíaca', tuss: '41101081', categoria: 'Imagem - RM' },
  // Mamografia
  { nome: 'Mamografia Bilateral', tuss: '40801128', categoria: 'Mamografia' },
  { nome: 'Densitometria Óssea', tuss: '40801136', categoria: 'Mamografia' },
  // Cardiologia
  { nome: 'Eletrocardiograma (ECG)', tuss: '40101010', categoria: 'Cardiologia' },
  { nome: 'Ecocardiograma Transtorácico', tuss: '40101029', categoria: 'Cardiologia' },
  { nome: 'Teste Ergométrico', tuss: '40101037', categoria: 'Cardiologia' },
  { nome: 'Holter 24h', tuss: '40101045', categoria: 'Cardiologia' },
  { nome: 'MAPA 24h', tuss: '40101053', categoria: 'Cardiologia' },
  // Endoscopia
  { nome: 'Endoscopia Digestiva Alta', tuss: '40201015', categoria: 'Endoscopia' },
  { nome: 'Colonoscopia', tuss: '40201023', categoria: 'Endoscopia' },
  // Pneumologia
  { nome: 'Espirometria', tuss: '40501012', categoria: 'Pneumologia' },
  { nome: 'Polissonografia', tuss: '40501020', categoria: 'Pneumologia' },
  // Neurologia
  { nome: 'Eletroencefalograma (EEG)', tuss: '40401014', categoria: 'Neurologia' },
  { nome: 'Eletroneuromiografia', tuss: '40401022', categoria: 'Neurologia' },
  // Otorrino
  { nome: 'Audiometria Tonal', tuss: '40601013', categoria: 'Otorrino' },
  { nome: 'Impedanciometria', tuss: '40601021', categoria: 'Otorrino' },
  // Oftalmologia
  { nome: 'Tonometria', tuss: '40701017', categoria: 'Oftalmologia' },
  { nome: 'Campimetria Visual', tuss: '40701025', categoria: 'Oftalmologia' },
  { nome: 'OCT (Tomografia Óptica)', tuss: '40701033', categoria: 'Oftalmologia' },
  // Ginecologia
  { nome: 'Citopatológico (Papanicolau)', tuss: '40601030', categoria: 'Ginecologia' },
  { nome: 'Colposcopia', tuss: '40601048', categoria: 'Ginecologia' },
  // Gasometria
  { nome: 'Gasometria Arterial', tuss: '40302032', categoria: 'Gasometria' },
  // Microbiologia
  { nome: 'Hemocultura', tuss: '40309011', categoria: 'Microbiologia' },
  { nome: 'Cultura de Secreção', tuss: '40309029', categoria: 'Microbiologia' },
  { nome: 'Antibiograma', tuss: '40309037', categoria: 'Microbiologia' },
  { nome: 'BAAR', tuss: '40309045', categoria: 'Microbiologia' },
];

// Grouped for display
const CATEGORIAS_EXAME = [...new Set(CATALOGO_EXAMES.map(e => e.categoria))].sort();

interface ExameSelecionado {
  nome: string;
  tuss: string;
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
  data_solicitacao: format(new Date(), 'yyyy-MM-dd'),
  validade_dias: 30,
  indicacao_clinica: '',
  hipotese_diagnostica: '',
  urgencia: 'normal',
  justificativa_urgencia: '',
  jejum: '',
  observacoes: '',
  necessita_contraste: false,
};

export default function Exames() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isManageTypesOpen, setIsManageTypesOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...initialFormData });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multi-select exams
  const [examesSelecionados, setExamesSelecionados] = useState<ExameSelecionado[]>([]);
  const [examSearch, setExamSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [customExamCode, setCustomExamCode] = useState('');
  const [showExamPicker, setShowExamPicker] = useState(false);

  // Attachments
  const [anexos, setAnexos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom types
  const [newTypeInput, setNewTypeInput] = useState('');
  const [newTypeCat, setNewTypeCat] = useState('Personalizado');

  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { data: pacientes = [], isLoading: loadingPacientes } = usePacientes();
  const { data: medicos = [], isLoading: loadingMedicos } = useMedicos();
  const { medicoId, isMedicoOnly } = useCurrentMedico();

  const { data: customTypesFromDB = [] } = useQuery({
    queryKey: ['tipos_exame_custom'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_exame_custom' as any).select('*').order('nome');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  /**
   * Cadastra tipo de exame personalizado.
   *
   * Estava duplicado entre o Enter do campo e o botão Adicionar, e em ambos o
   * erro do insert era ignorado: a tela dizia "Tipo cadastrado!" e a lista
   * continuava igual, sem explicação.
   */
  const cadastrarTipoExame = async () => {
    if (!newTypeInput.trim() || !user) return;
    const { error } = await supabase.from('tipos_exame_custom' as any).insert({
      user_id: user.id,
      nome: newTypeInput.trim(),
      categoria: newTypeCat,
    } as any);
    if (error) {
      toast.error(
        error.message?.includes('duplicate')
          ? 'Já existe um tipo com esse nome.'
          : 'Não foi possível cadastrar o tipo.'
      );
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['tipos_exame_custom'] });
    setNewTypeInput('');
    toast.success('Tipo cadastrado!');
  };

  // Merge catalog with custom types
  const allExames = useMemo(() => {
    const custom = customTypesFromDB.map((t: any) => ({
      nome: t.nome,
      tuss: t.codigo_tuss || '',
      categoria: t.categoria || 'Personalizado',
    }));
    return [...CATALOGO_EXAMES, ...custom];
  }, [customTypesFromDB]);

  const filteredCatalogo = useMemo(() => {
    return allExames.filter(e => {
      const matchSearch = !examSearch || e.nome.toLowerCase().includes(examSearch.toLowerCase()) || e.tuss.includes(examSearch);
      const matchCat = !catFilter || e.categoria === catFilter;
      const notSelected = !examesSelecionados.some(s => s.nome === e.nome);
      return matchSearch && matchCat && notSelected;
    });
  }, [allExames, examSearch, catFilter, examesSelecionados]);

  const canAddCustomExam = useMemo(() => {
    const normalizedSearch = examSearch.trim().toLowerCase();
    if (!normalizedSearch) return false;

    return !examesSelecionados.some(exame => exame.nome.trim().toLowerCase() === normalizedSearch);
  }, [examSearch, examesSelecionados]);

  const { data: exames = [], isLoading: loadingExames } = useQuery({
    queryKey: ['exames', isMedicoOnly, medicoId],
    queryFn: async () => {
      let query = supabase
        .from('exames')
        .select('*, pacientes(nome), medicos(crm, especialidade, nome)')
        .order('data_solicitacao', { ascending: false });
      if (isMedicoOnly && medicoId) {
        query = query.eq('medico_solicitante_id', medicoId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isLoading = loadingExames || loadingPacientes || loadingMedicos;

  const filteredExames = useMemo(() => {
    return exames.filter(e => {
      const paciente = (e as any).pacientes;
      const matchesSearch =
        paciente?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.tipo_exame.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'todos' || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [exames, searchTerm, statusFilter]);

  const selectedExame = useMemo(() => exames.find(e => e.id === selectedId), [exames, selectedId]);

  const addExame = (exame: ExameCatalogo) => {
    setExamesSelecionados(prev => [...prev, { nome: exame.nome, tuss: exame.tuss }]);
    setExamSearch('');
    setCustomExamCode('');
    setShowExamPicker(false);
  };

  const generateAutomaticExamCode = () => `INT${Date.now().toString().slice(-7)}`;

  const addCustomExame = () => {
    const nome = examSearch.trim();
    const codigo = customExamCode.trim();

    if (!nome) {
      toast.error('Digite o nome do exame personalizado.');
      return;
    }

    if (examesSelecionados.some(exame => exame.nome.trim().toLowerCase() === nome.toLowerCase())) {
      toast.error('Este exame já foi adicionado à guia.');
      return;
    }

    setExamesSelecionados(prev => [...prev, { nome, tuss: codigo }]);
    setExamSearch('');
    setCustomExamCode('');
    setShowExamPicker(false);
    toast.success('Exame personalizado adicionado à guia.');
  };

  const removeExame = (nome: string) => {
    setExamesSelecionados(prev => prev.filter(e => e.nome !== nome));
  };

  const handleOpenNew = () => {
    setFormData({ ...initialFormData, medico_solicitante_id: medicoId || '' });
    setExamesSelecionados([]);
    setAnexos([]);
    setExamSearch('');
    setCatFilter('');
    setCustomExamCode('');
    setIsDialogOpen(true);
  };

  const handleView = (id: string) => {
    setSelectedId(id);
    setIsViewOpen(true);
  };

  const handleSave = async (emitir = false) => {
    if (!formData.paciente_id) {
      toast.error('Selecione o paciente.');
      return;
    }
    if (examesSelecionados.length === 0) {
      toast.error('Adicione pelo menos um exame à guia.');
      return;
    }
    if ((formData.urgencia === 'urgente' || formData.urgencia === 'emergencia') && !formData.justificativa_urgencia) {
      toast.error('Justifique a urgência/emergência para fins de autorização.');
      return;
    }

    setIsSubmitting(true);
    try {
      const validadeData = format(addDays(new Date(formData.data_solicitacao + 'T12:00'), formData.validade_dias), 'yyyy-MM-dd');

      // Upload attachments
      const anexoUrls: string[] = [];
      for (const file of anexos) {
        const ext = file.name.split('.').pop();
        const path = `exames/${formData.paciente_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('medical-attachments').upload(path, file);
        if (!upErr) {
          // O bucket é privado: getPublicUrl() gerava um link que nunca abria.
          // Guardamos o path; o link é gerado com createSignedUrl na exibição.
          anexoUrls.push(path);
        }
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
        anexoUrls.length > 0 && `Anexos: ${anexoUrls.length} arquivo(s)`,
      ].filter(Boolean).join('\n');

      // Insert one row per exam in the batch
      const inserts = examesSelecionados.map(ex => ({
        paciente_id: formData.paciente_id,
        medico_solicitante_id: formData.medico_solicitante_id || null,
        tipo_exame: `${ex.tuss ? ex.tuss + ' - ' : ''}${ex.nome}`,
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

      const { data: inserted, error } = await supabase.from('exames').insert(inserts).select('id, tipo_exame');
      if (error) throw error;

      // Auto-create coleta records for lab exams
      if (inserted) {
        const coletaResults = await Promise.all(
          inserted.map(ex => autoCreateColeta({
            exameId: ex.id,
            pacienteId: formData.paciente_id,
            medicoId: formData.medico_solicitante_id,
            tipoExame: ex.tipo_exame,
            urgente: formData.urgencia === 'urgente' || formData.urgencia === 'emergencia',
          }))
        );
        const coletasCriadas = coletaResults.filter(r => r.actions.length > 0).length;
        if (coletasCriadas > 0) {
          toast.info(`${coletasCriadas} coleta(s) de laboratório criada(s) automaticamente.`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['exames'] });
      queryClient.invalidateQueries({ queryKey: ['coletas_laboratorio'] });
      setIsDialogOpen(false);

      if (emitir) {
        toast.success(`${examesSelecionados.length} exame(s) emitidos — coletas de lab criadas automaticamente.`);
      } else {
        toast.success(`${examesSelecionados.length} exame(s) solicitados com sucesso!`);
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Erro ao solicitar exames:', error);
      toast.error(error.message || 'Erro ao solicitar exames.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: StatusExame) => {
    try {
      const exame = exames.find(e => e.id === id);
      if (!exame) throw new Error('Exame não encontrado');
      const pac = pacientes.find(p => p.id === exame.paciente_id);

      const result = await autoProgressExame({
        exameId: id,
        novoStatus: newStatus,
        pacienteId: exame.paciente_id,
        pacienteNome: pac?.nome || 'Paciente',
        medicoId: exame.medico_solicitante_id,
        tipoExame: exame.tipo_exame,
        convenioId: pac?.convenio_id,
        resultado: exame.resultado || undefined,
      });

      // Auto-link result to prontuario when report is available
      if (newStatus === 'laudo_disponivel' && exame.resultado) {
        await autoVincularResultadoProntuario({
          exameId: id,
          pacienteId: exame.paciente_id,
          tipoExame: exame.tipo_exame,
          resultado: exame.resultado,
        });
      }

      if (result.actions.length > 0) {
        toast.info(`Automações: ${result.actions.join(' • ')}`);
      }

      toast.success('Status atualizado!');
      queryClient.invalidateQueries({ queryKey: ['exames'] });
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar status');
    }
  };

  const handleDeleteExame = async (id: string) => {
    if (!confirm('Excluir este exame permanentemente? Esta ação não pode ser desfeita.')) return;
    try {
      const { data, error } = await supabase
        .from('exames')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Não foi possível excluir: você não tem permissão ou o exame já foi removido.', { description: mensagemDeErro(error) });
        return;
      }
      toast.success('Exame excluído!');
      queryClient.invalidateQueries({ queryKey: ['exames'] });
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir exame');
    }
  };

  // Pipeline step for visual indicator
  const getExameStep = (status: StatusExame): number => {
    const steps: Record<StatusExame, number> = {
      solicitado: 0, agendado: 1, realizado: 2, laudo_disponivel: 3, cancelado: -1,
    };
    return steps[status] ?? 0;
  };

  const PIPELINE_STEPS = ['Solicitado', 'Coleta/Agendado', 'Realizado', 'Laudo'] as const;

  const getNextStatus = (current: StatusExame): StatusExame | null => {
    const flow: Record<StatusExame, StatusExame | null> = {
      solicitado: 'agendado', agendado: 'realizado', realizado: 'laudo_disponivel',
      laudo_disponivel: null, cancelado: null,
    };
    return flow[current] ?? null;
  };

  const getNextStatusLabel = (current: StatusExame): string => {
    const labels: Record<StatusExame, string> = {
      solicitado: 'Agendar Coleta', agendado: 'Marcar Realizado', realizado: 'Liberar Laudo',
      laudo_disponivel: '', cancelado: '',
    };
    return labels[current] ?? '';
  };

  const getPacienteNome = (exame: any) => exame.pacientes?.nome || 'Desconhecido';
  const getMedicoInfo = (exame: any) => {
    const m = exame.medicos;
    if (!m) return 'Sem solicitante';
    return `${m.nome || m.crm} - ${m.especialidade || 'Clínico'}`;
  };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Solicitação de Exames
          </h1>
          <p className="text-muted-foreground">Gerencie guias com TUSS, código livre ou código interno automático</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsManageTypesOpen(true)} className="gap-2">
            <Building2 className="h-4 w-4" />Laboratórios
          </Button>
          <Button onClick={handleOpenNew} className="gap-2"><Plus className="h-4 w-4" />Nova Guia de Exames</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const count = exames.filter(e => e.status === key).length;
          return (
            <Card key={key} className="kpi-card cursor-pointer" onClick={() => setStatusFilter(key)}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold tabular-nums">{count}</p>
                <Badge className={cn('mt-1', STATUS_COLORS[key as StatusExame])}>{label}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle>Exames ({filteredExames.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Filtrar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar paciente ou exame..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Exame / Código</TableHead>
                  <TableHead className="hidden md:table-cell">Solicitante</TableHead>
                  <TableHead className="hidden sm:table-cell">Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExames.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum exame encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExames.map(exame => {
                    const step = getExameStep(exame.status || 'solicitado');
                    const nextStatus = getNextStatus(exame.status || 'solicitado');
                    const nextLabel = getNextStatusLabel(exame.status || 'solicitado');
                    return (
                    <TableRow key={exame.id}>
                      <TableCell className="font-medium">{getPacienteNome(exame)}</TableCell>
                      <TableCell>
                        <span className="text-sm">{exame.tipo_exame}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{getMedicoInfo(exame)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {exame.data_solicitacao && format(parseDateOnly(exame.data_solicitacao)!, 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        {/* Pipeline visual */}
                        <div className="flex items-center gap-0.5">
                          {PIPELINE_STEPS.map((label, i) => (
                            <div key={i} className="flex items-center gap-0.5">
                              <div className={cn(
                                'h-5 px-1.5 rounded text-[9px] font-medium flex items-center',
                                i < step && 'bg-success/10 text-success',
                                i === step && step >= 0 && 'bg-primary/10 text-primary ring-1 ring-primary/20',
                                i > step && 'bg-muted text-muted-foreground/40',
                                step === -1 && 'bg-muted text-muted-foreground line-through',
                              )}>
                                {i < step ? '✓' : label}
                              </div>
                              {i < PIPELINE_STEPS.length - 1 && (
                                <div className={cn('w-2 h-px', i < step ? 'bg-success' : 'bg-border')} />
                              )}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleView(exame.id)}><Eye className="h-4 w-4" /></Button>
                          {nextStatus && (
                            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => handleUpdateStatus(exame.id, nextStatus)}>
                              {nextLabel}
                            </Button>
                          )}
                          {exame.status !== 'cancelado' && exame.status !== 'laudo_disponivel' && (
                            <Button variant="ghost" size="icon" className="text-destructive/60 hover:text-destructive" onClick={() => handleUpdateStatus(exame.id, 'cancelado')}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="text-destructive/60 hover:text-destructive" title="Excluir permanentemente" onClick={() => handleDeleteExame(exame.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* ─── New Exam Dialog ─── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Nova Guia de Exames
              <Badge variant="outline" className="ml-auto text-[10px] gap-1"><ShieldCheck className="h-3 w-3 text-success" />ICP-Brasil</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-2">
            {/* Paciente + Médico */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Paciente *</Label>
                <Select value={formData.paciente_id} onValueChange={v => setFormData({ ...formData, paciente_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                  <SelectContent>{pacientes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Profissional Solicitante</Label>
                <Select value={formData.medico_solicitante_id} onValueChange={v => setFormData({ ...formData, medico_solicitante_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>{medicos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome || m.crm} — {m.especialidade || 'Clínico'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Data + Validade */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />Data do Pedido</Label>
                <Input type="date" value={formData.data_solicitacao} onChange={e => setFormData({ ...formData, data_solicitacao: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" />Validade (dias)</Label>
                <Select value={formData.validade_dias.toString()} onValueChange={v => setFormData({ ...formData, validade_dias: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                    <SelectItem value="90">90 dias</SelectItem>
                    <SelectItem value="180">180 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Urgência</Label>
                <Select value={formData.urgencia} onValueChange={v => setFormData({ ...formData, urgencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="emergencia">Emergência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Jejum</Label>
                <Select value={formData.jejum} onValueChange={v => setFormData({ ...formData, jejum: v })}>
                  <SelectTrigger><SelectValue placeholder="Se necessário" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não necessário</SelectItem>
                    <SelectItem value="8h">8 horas</SelectItem>
                    <SelectItem value="10h">10 horas</SelectItem>
                    <SelectItem value="12h">12 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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
                      <button onClick={() => removeExame(ex.nome)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}

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
                    {CATEGORIAS_EXAME.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                  <Label className="text-xs font-medium">Tipo de Exame</Label>
                  <Select value={formData.tipo_categorizado || 'laboratorial'} onValueChange={v => setFormData({ ...formData, tipo_categorizado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
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
                  <Label className="text-xs font-medium">Preço de Custo (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.preco_custo || ''}
                    onChange={e => setFormData({ ...formData, preco_custo: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Preço de Venda (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.preco_venda || ''}
                    onChange={e => setFormData({ ...formData, preco_venda: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {formData.preco_custo && formData.preco_venda && (
                <div className="mt-3 p-3 bg-success/5 border border-success/20 rounded-lg">
                  <p className="text-sm text-success">
                    💰 Margem: <span className="font-bold">R$ {(formData.preco_venda - formData.preco_custo).toFixed(2)}</span> ({(((formData.preco_venda - formData.preco_custo) / formData.preco_custo) * 100).toFixed(0)}%)
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Clinical info */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Indicação Clínica *</Label>
              <Textarea
                value={formData.indicacao_clinica}
                onChange={e => setFormData({ ...formData, indicacao_clinica: e.target.value })}
                placeholder="Sintomas, achados clínicos, suspeita diagnóstica..."
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Hipótese Diagnóstica / CID</Label>
              <Input
                value={formData.hipotese_diagnostica}
                onChange={e => setFormData({ ...formData, hipotese_diagnostica: e.target.value })}
                placeholder="Ex: J18.9 - Pneumonia, M54.5 - Lombalgia..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Observações para Laboratório/Clínica</Label>
              <Textarea
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
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) setAnexos(prev => [...prev, ...Array.from(e.target.files!)]);
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1">
                  <Upload className="h-3.5 w-3.5" />Selecionar Arquivos
                </Button>
                <span className="text-xs text-muted-foreground">{anexos.length} arquivo(s)</span>
              </div>
              {anexos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {anexos.map((f, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-xs">
                      {f.name.length > 25 ? f.name.slice(0, 25) + '...' : f.name}
                      <button onClick={() => setAnexos(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></button>
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
          </div>

          <DialogFooter className="flex-shrink-0 pt-4 border-t gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button variant="secondary" onClick={() => handleSave(false)} disabled={isSubmitting} className="gap-1">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Solicitar ({examesSelecionados.length})
            </Button>
            <Button onClick={() => handleSave(true)} disabled={isSubmitting} className="gap-1">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <Printer className="h-4 w-4" />Emitir e Assinar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Dialog ─── */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhes do Exame</DialogTitle></DialogHeader>
          {selectedExame && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Paciente</p>
                  <p className="font-medium">{getPacienteNome(selectedExame)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={cn(STATUS_COLORS[selectedExame.status || 'solicitado'])}>{STATUS_LABELS[selectedExame.status || 'solicitado']}</Badge>
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
              {selectedExame.observacoes && (
                <div>
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedExame.observacoes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manage Laboratories ─── */}
      <Dialog open={isManageTypesOpen} onOpenChange={setIsManageTypesOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Gerenciar Laboratórios e Fornecedores</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto pr-4">
            <GerenciadorLaboratorios />
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Old Manage Custom Types (backup) ─── */}
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tipos de Exame (Obsoleto)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input value={newTypeInput} onChange={e => setNewTypeInput(e.target.value)} placeholder="Nome do exame..." className="flex-1"
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newTypeInput.trim() && user) {
                    await cadastrarTipoExame();
                  }
                }}
              />
              <Button disabled={!newTypeInput.trim()} onClick={cadastrarTipoExame} className="gap-1"><Plus className="h-4 w-4" />Adicionar</Button>
            </div>
            {customTypesFromDB.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Nenhum tipo personalizado cadastrado</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {customTypesFromDB.map((tipo: any) => (
                  <div key={tipo.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <div>
                      <p className="font-medium text-sm">{tipo.nome}</p>
                      <p className="text-xs text-muted-foreground">{tipo.categoria} {tipo.codigo_tuss && `• TUSS: ${tipo.codigo_tuss}`}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={async () => {
                      const { error } = await supabase.from('tipos_exame_custom' as any).delete().eq('id', tipo.id);
                      if (error) { toast.error('Não foi possível remover o tipo.'); return; }
                      queryClient.invalidateQueries({ queryKey: ['tipos_exame_custom'] });
                      toast.success('Removido');
                    }}>Remover</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsManageTypesOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
