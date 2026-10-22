import { formatWithDatePreference as format } from '@/lib/datePreference';
import { nomeMedico } from '@/lib/formatters';
import { Link, useSearchParams } from 'react-router-dom';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { textoDoModelo } from '@/lib/templatesPrescricao';
import { normalizarTexto, pacienteCorresponde } from '@/lib/buscaPaciente';
import { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

import { ptBR } from 'date-fns/locale';
// Tipo apenas: o runtime entra por import() dentro de buildReceitaPdf.
import type jsPDF from 'jspdf';
import { useQuery } from '@tanstack/react-query';
import {
  Pill, Plus, Search, FileDown, ExternalLink, Clipboard, AlertTriangle, Loader2,
  RefreshCw, X, MessageCircle, CalendarCheck, FileText, CloudOff, BookOpen, FileSignature, Upload,
} from 'lucide-react';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MAX_LINHAS_AUTO, useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ClinicalAlertsDisplay, useClinicalAlerts } from '@/components/ClinicalAlertsDisplay';
import { consolidateAlerts, ClinicalAlert } from '@/lib/clinicalAlerts';
import { allergyOverrideJustificationError, requiresAllergyOverrideJustification } from '@/lib/allergyOverride';
import { registrarAcessoDocumentoClinico } from '@/lib/clinicalDocumentAudit';
import { LoadingButton } from '@/components/ui/loading-button';
import { ErrorState } from '@/components/ErrorState';
import { mensagemDeErro } from '@/lib/erros';
import { isValidDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { PageHeader } from '@/components/PageHeader';

type MemedPayload = Record<string, any>;

declare global {
  interface Window {
    MdHub?: {
      event: { add: (name: string, callback: (payload: MemedPayload) => void) => void };
      command: { send: (module: string, command: string, payload: MemedPayload) => Promise<unknown> };
      module: { show: (module: string) => Promise<unknown> };
    };
    MdSinapsePrescricao?: {
      event: { add: (name: string, callback: (module: { name?: string }) => void) => void };
    };
  }
}

let memedHubWithListeners: Window['MdHub'] | null = null;
let memedEventHandlers: {
  printed: (payload: MemedPayload) => void;
  deleted: (payload: unknown) => void;
} | null = null;

function dateForMemed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : undefined;
}

async function loadMemedPrescriptionScript(
  token: string,
  scriptUrl: string,
  handlers: NonNullable<typeof memedEventHandlers>,
): Promise<void> {
  memedEventHandlers = handlers;
  const oldScript = document.getElementById('memed-prescricao-script');
  oldScript?.remove();

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'memed-prescricao-script';
    script.src = scriptUrl;
    script.async = true;
    script.dataset.token = token;
    const timeout = window.setTimeout(() => reject(new Error('Tempo esgotado ao iniciar a Memed.')), 30_000);

    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Não foi possível carregar a plataforma Memed.'));
    };
    script.onload = () => {
      const sinapse = window.MdSinapsePrescricao;
      if (!sinapse) {
        window.clearTimeout(timeout);
        reject(new Error('O módulo da Memed não inicializou.'));
        return;
      }
      sinapse.event.add('core:moduleInit', (module) => {
        if (module.name !== 'plataforma.prescricao') return;
        const hub = window.MdHub;
        if (!hub) {
          window.clearTimeout(timeout);
          reject(new Error('A comunicação com a Memed não ficou disponível.'));
          return;
        }
        if (memedHubWithListeners !== hub) {
          hub.event.add('prescricaoImpressa', (payload) => memedEventHandlers?.printed(payload));
          hub.event.add('prescricaoExcluida', (payload) => memedEventHandlers?.deleted(payload));
          memedHubWithListeners = hub;
        }
        window.clearTimeout(timeout);
        resolve();
      });
    };
    document.body.appendChild(script);
  });
}

async function imageToDataUrl(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ─── PDF Builder ─── */
async function buildReceitaPdf(data: {
  pacienteNome: string;
  cpf: string;
  dataEmissao: string;
  medicoNome: string;
  crm: string;
  especialidade: string;
  medicamentosTexto: string;
  clinicaNome?: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;
  clinicaCnpj?: string;
  clinicaCnes?: string;
  logoUrl?: string;
  rodapeReceita?: string;
  mostrarLogo?: boolean;
  mostrarCRM?: boolean;
  mostrarCNES?: boolean;
}): Promise<jsPDF> {
  // Carrega as ~660 KB do jsPDF só quando o médico gera a receita,
  // em vez de ao abrir a tela.
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const w = 210;
  const margin = 20;

  const logoDataUrl = data.mostrarLogo === false ? null : await imageToDataUrl(data.logoUrl);
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', margin, 14, 24, 24, undefined, 'FAST'); } catch { /* logo opcional */ }
  }

  // ── Border ──
  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.7);
  doc.rect(10, 10, w - 20, 277);

  // ── Header / letterhead ──
  doc.setFontSize(18);
  doc.setTextColor(0, 102, 204);
  doc.text(data.clinicaNome || 'Clínica Médica', w / 2, 25, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(120);
  if (data.clinicaEndereco) doc.text(data.clinicaEndereco, w / 2, 31, { align: 'center' });
  const contato = [data.clinicaTelefone && `Tel: ${data.clinicaTelefone}`, data.clinicaCnpj && `CNPJ: ${data.clinicaCnpj}`].filter(Boolean).join(' | ');
  if (contato) doc.text(contato, w / 2, 36, { align: 'center' });
  if (data.mostrarCNES && data.clinicaCnes) {
    doc.text(`CNES: ${data.clinicaCnes}`, w / 2, 40, { align: 'center' });
  }

  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.4);
  doc.line(margin, 42, w - margin, 42);

  // ── Title ──
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('RECEITUÁRIO MÉDICO', w / 2, 52, { align: 'center' });

  // ── Patient info ──
  let y = 64;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const addField = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + doc.getTextWidth(label) + 2, y);
    y += 6;
  };

  addField('Paciente: ', data.pacienteNome);
  if (data.cpf) addField('CPF: ', data.cpf);
  addField('Data: ', data.dataEmissao);

  y += 4;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);
  y += 8;

  // ── Medications ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Medicamentos e Posologia', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(data.medicamentosTexto, w - margin * 2);
  for (const line of lines) {
    if (y > 240) {
      doc.addPage();
      y = 25;
    }
    doc.text(line, margin, y);
    y += 5.5;
  }

  // ── Doctor signature area ──
  y = Math.max(y + 20, 210);
  if (y > 250) { doc.addPage(); y = 60; }

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(w / 2 - 40, y, w / 2 + 40, y);
  y += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(data.medicoNome, w / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (data.mostrarCRM !== false) {
    doc.text(`CRM: ${data.crm}${data.especialidade ? ` — ${data.especialidade}` : ''}`, w / 2, y, { align: 'center' });
  }

  // ── Rodapé ──
  // Este texto dizia "Documento assinado digitalmente. Valide a autenticidade
  // em assinaturadigital.iti.gov.br" — impresso na hora da geração, antes de
  // qualquer assinatura. A própria tela pede que o médico baixe e assine no
  // portal do ITI depois. Quem tentasse validar receberia "documento não
  // assinado", e a clínica é que pareceria estar falsificando receita.
  const footerY = 280;
  doc.setFontSize(7);
  doc.setTextColor(130);
  if (data.rodapeReceita?.trim()) {
    const customFooter = doc.splitTextToSize(data.rodapeReceita.trim(), w - margin * 2).slice(0, 2);
    customFooter.forEach((line: string, index: number) => doc.text(line, w / 2, footerY - 8 + index * 3, { align: 'center' }));
  }
  doc.text(
    'Documento sem assinatura digital. Assine no portal gov.br ou de próprio punho para ter validade.',
    w / 2, footerY, { align: 'center' },
  );
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    w / 2, footerY + 4, { align: 'center' },
  );
  doc.setTextColor(0);

  return doc;
}

type FiltroOrigem = 'todos' | 'hoje' | 'pdf' | 'memed' | 'sem_pdf';
type FiltroPeriodo = 'todos' | '7d' | '30d';

const receitaMemedExcluida = (prescricao: Record<string, any>) =>
  String(prescricao.observacoes || '').startsWith('Prescrição excluída na Memed. Memed:');
const receitaMemed = (prescricao: Record<string, any>) =>
  String(prescricao.observacoes || '').startsWith('Memed:') || receitaMemedExcluida(prescricao);
/** Receita gravada sem arquivo (ex.: emitida pelo prontuário) e que não é da Memed. */
const receitaSemArquivo = (prescricao: Record<string, any>) => !prescricao.arquivo_pdf && !receitaMemed(prescricao);

const diasDesde = (dataEmissao: string | null | undefined, hoje: string): number | null => {
  if (!dataEmissao) return null;
  const inicio = new Date(`${dataEmissao}T12:00:00`).getTime();
  const fim = new Date(`${hoje}T12:00:00`).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  return Math.round((fim - inicio) / 86_400_000);
};

/* ─── Component ─── */
export default function Prescricoes() {
  const { profile } = useSupabaseAuth();
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const medicosQuery = useMedicos();
  const medicos = medicosQuery.data || [];
  const loadingMed = medicosQuery.isLoading;
  const { currentMedico, medicoId, isMedicoOnly } = useCurrentMedico();

  const prescricoesQuery = useSupabaseQuery<Record<string, any>>('prescricoes', {
    select: '*, pacientes(nome,nome_social,cpf,telefone,email)',
    orderBy: { column: 'created_at', ascending: false },
    ...(isMedicoOnly && medicoId ? { filters: [{ column: 'medico_id', operator: 'eq', value: medicoId }] } : {}),
    enabled: !isMedicoOnly || !!medicoId,
  });
  const prescricoes = prescricoesQuery.data || [];
  const loadingPresc = prescricoesQuery.isLoading;
  const { refetch } = prescricoesQuery;

  // Auditoria 15: cópia assinada externamente, guardada à parte da receita original.
  const versoesAssinadasQuery = useQuery({
    queryKey: ['prescricoes_versoes_assinadas', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('prescricoes_versoes_assinadas')
        .select('prescricao_id, arquivo_pdf, anexado_em');
      // Sem a migration aplicada a tabela não existe; o histórico segue funcionando sem a versão assinada.
      if (error) return [] as Array<{ prescricao_id: string; arquivo_pdf: string; anexado_em: string }>;
      return (data ?? []) as Array<{ prescricao_id: string; arquivo_pdf: string; anexado_em: string }>;
    },
  });
  const versaoAssinadaPorReceita = useMemo(
    () => new Map((versoesAssinadasQuery.data ?? []).map(v => [v.prescricao_id, v])),
    [versoesAssinadasQuery.data],
  );
  const assinadaInputRef = useRef<HTMLInputElement>(null);
  const [anexandoAssinadaPara, setAnexandoAssinadaPara] = useState<Record<string, any> | null>(null);
  const [enviandoAssinadaId, setEnviandoAssinadaId] = useState<string | null>(null);
  const podeAnexarAssinada = (p: Record<string, any>) =>
    !!p.arquivo_pdf && !versaoAssinadaPorReceita.has(p.id)
    && (profile?.roles?.includes('admin') || (!!currentMedico?.id && currentMedico.id === p.medico_id));

  const handleArquivoAssinado = async (file: File | undefined) => {
    const receita = anexandoAssinadaPara;
    setAnexandoAssinadaPara(null);
    if (assinadaInputRef.current) assinadaInputRef.current.value = '';
    if (!file || !receita) return;
    if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) {
      toast.error('Envie o PDF assinado (até 10 MB).');
      return;
    }
    setEnviandoAssinadaId(receita.id);
    const caminho = `prescricoes/${receita.paciente_id}/${crypto.randomUUID()}-assinada.pdf`;
    try {
      const { error: erroUpload } = await supabase.storage
        .from('medical-attachments')
        .upload(caminho, file, { contentType: 'application/pdf', upsert: false });
      if (erroUpload) throw erroUpload;
      const { error } = await (supabase as any).rpc('anexar_receita_assinada', { p_prescricao_id: receita.id, p_arquivo_pdf: caminho });
      if (error) {
        await supabase.storage.from('medical-attachments').remove([caminho]);
        throw error;
      }
      await versoesAssinadasQuery.refetch();
      toast.success('Versão assinada anexada à receita.', { description: 'O PDF original continua disponível no histórico.' });
    } catch (error) {
      toast.error('Não foi possível anexar a versão assinada.', { description: mensagemDeErro(error) });
    } finally {
      setEnviandoAssinadaId(null);
    }
  };

  const clinicConfigQuery = useQuery({
    queryKey: ['configuracoes_clinica', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const [configClinicaResult, clinicaInfoResult, impressaoResult, clinicaResult] = await Promise.all([
        supabase.from('configuracoes_clinica')
          .select('valor').eq('clinica_id', profile.clinica_id).eq('chave', 'config_clinica')
          .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('configuracoes_clinica')
          .select('valor').eq('clinica_id', profile.clinica_id).eq('chave', 'clinica_info')
          .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('configuracoes_clinica')
          .select('valor').eq('clinica_id', profile.clinica_id).eq('chave', 'config_impressao')
          .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('clinicas').select('nome').eq('id', profile.clinica_id).maybeSingle(),
      ]);
      if (configClinicaResult.error) throw configClinicaResult.error;
      if (clinicaInfoResult.error) throw clinicaInfoResult.error;
      if (impressaoResult.error) throw impressaoResult.error;
      if (clinicaResult.error) throw clinicaResult.error;

      const configClinica = configClinicaResult.data?.valor as Record<string, string> | undefined;
      const clinicaInfo = clinicaInfoResult.data?.valor as Record<string, string> | undefined;
      const impressao = impressaoResult.data?.valor as Record<string, any> | undefined;

      return {
        nome_fantasia: configClinica?.nomeClinica || clinicaInfo?.nome || clinicaResult.data?.nome || '',
        endereco: configClinica?.endereco || clinicaInfo?.endereco || '',
        cidade: configClinica?.cidade || clinicaInfo?.cidade || '',
        uf: configClinica?.estado || clinicaInfo?.uf || '',
        telefone: configClinica?.telefone || clinicaInfo?.telefone || '',
        cnpj: configClinica?.cnpj || clinicaInfo?.cnpj || '',
        cnes: configClinica?.cnes || '',
        logoUrl: configClinica?.logoUrl || '',
        rodapeReceita: impressao?.rodapeReceita || '',
        mostrarLogo: impressao?.mostrarLogo !== false,
        mostrarCRM: impressao?.mostrarCRM !== false,
        mostrarCNES: impressao?.mostrarCNES === true,
      };
    },
    enabled: !!profile?.clinica_id,
  });
  const clinicConfig = clinicConfigQuery.data;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('todos');
  // Deep-link: /documentos-clinicos?paciente=<id> abre o histórico já filtrado pelo paciente.
  const [searchParams, setSearchParams] = useSearchParams();
  const pacienteFiltroId = searchParams.get('paciente');
  const limparPacienteFiltro = () => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    next.delete('paciente');
    return next;
  }, { replace: true });
  const [gerando, setGerando] = useState(false);
  const [gerandoHistoricoId, setGerandoHistoricoId] = useState<string | null>(null);
  const savePrescriptionLock = useRef(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfPrescriptionId, setPdfPrescriptionId] = useState<string | null>(null);
  const [downloadingPrescriptionId, setDownloadingPrescriptionId] = useState<string | null>(null);
  const [memedOpening, setMemedOpening] = useState(false);
  const [clinicalAlerts, setClinicalAlerts] = useState<ClinicalAlert[]>([]);
  const [allergyOverrideJustification, setAllergyOverrideJustification] = useState('');
  const [showAlertsDialog, setShowAlertsDialog] = useState(false);
  const { dismissAlert } = useClinicalAlerts();

  const [form, setForm] = useState({
    paciente_id: '',
    medico_id: medicoId || '',
    data_emissao: today,
    medicamentos_texto: '',
  });

  // Ficha completa do paciente escolhido (alergias, comorbidades, dados do PDF).
  const selectedPacienteQuery = useQuery({
    queryKey: ['prescricao-paciente', profile?.id ?? null, profile?.clinica_id ?? null, form.paciente_id],
    enabled: !!form.paciente_id && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('pacientes').select('*').eq('id', form.paciente_id).eq('clinica_id', profile?.clinica_id ?? '').maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const selectedPaciente = selectedPacienteQuery.data;
  const medicosAtivos = medicos.filter(m => m.ativo !== false);
  const medicosDisponiveis = isMedicoOnly && medicoId
    ? medicosAtivos.filter(m => m.id === medicoId)
    : medicosAtivos;

  const modelosQuery = useSupabaseQuery<any>('templates_prescricao', {
    orderBy: { column: 'nome', ascending: true },
  });
  const modelos = modelosQuery.data ?? [];
  const aplicarModelo = (id: string) => {
    const modelo = (modelos as any[]).find(m => m.id === id);
    if (!modelo) return;
    const texto = textoDoModelo(modelo);
    if (!texto) { toast.error('Este modelo não tem medicamentos cadastrados.'); return; }
    // Acrescenta em vez de substituir: o médico pode combinar modelos.
    setForm(f => ({ ...f, medicamentos_texto: f.medicamentos_texto.trim() ? `${f.medicamentos_texto.trim()}\n${texto}` : texto }));
  };

  const stats = useMemo(() => ({
    total: prescricoes.length,
    hoje: prescricoes.filter(p => p.data_emissao === today).length,
    pdf: prescricoes.filter(p => !!p.arquivo_pdf).length,
    memed: prescricoes.filter(p => receitaMemed(p)).length,
    semPdf: prescricoes.filter(p => receitaSemArquivo(p)).length,
    pacientes: new Set(prescricoes.map(p => p.paciente_id)).size,
  }), [prescricoes, today]);

  const filteredPrescricoes = useMemo(() => {
    const termo = normalizarTexto(searchTerm);
    return prescricoes.filter(p => {
      if (pacienteFiltroId && p.paciente_id !== pacienteFiltroId) return false;
      if (filtroOrigem === 'hoje' && p.data_emissao !== today) return false;
      if (filtroOrigem === 'pdf' && !p.arquivo_pdf) return false;
      if (filtroOrigem === 'memed' && !receitaMemed(p)) return false;
      if (filtroOrigem === 'sem_pdf' && !receitaSemArquivo(p)) return false;
      if (filtroPeriodo !== 'todos') {
        const dias = diasDesde(p.data_emissao, today);
        if (dias === null || dias < 0 || dias > (filtroPeriodo === '7d' ? 7 : 30)) return false;
      }
      if (!termo) return true;
      return pacienteCorresponde(p.pacientes || {}, searchTerm)
        || normalizarTexto(`${p.medicamento || ''} ${p.posologia || ''}`).includes(termo);
    });
  }, [prescricoes, searchTerm, filtroOrigem, filtroPeriodo, pacienteFiltroId, today]);

  const temFiltro = !!searchTerm || filtroOrigem !== 'todos' || filtroPeriodo !== 'todos' || !!pacienteFiltroId;
  const limparFiltros = () => {
    setSearchTerm('');
    setFiltroOrigem('todos');
    setFiltroPeriodo('todos');
    if (pacienteFiltroId) limparPacienteFiltro();
  };

  const handleOpen = () => {
    setForm({ paciente_id: '', medico_id: medicoId || '', data_emissao: today, medicamentos_texto: '' });
    setClinicalAlerts([]);
    setAllergyOverrideJustification('');
    setIsFormOpen(true);
  };

  const handleSaveAndGenerate = async () => {
    if (!form.paciente_id || !form.medico_id || !form.medicamentos_texto.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    if (!isValidDateOnly(form.data_emissao) || form.data_emissao > today) {
      toast.error('Informe uma data de emissão válida, igual ou anterior a hoje.');
      return;
    }
    if (isMedicoOnly && form.medico_id !== medicoId) {
      toast.error('Seu perfil só pode emitir receitas em seu próprio nome.');
      return;
    }
    const medicoSelecionado = medicos.find(m => m.id === form.medico_id);
    if (!medicoSelecionado || medicoSelecionado.ativo === false) {
      toast.error('Médico prescritor indisponível', {
        description: 'Selecione um médico ativo da clínica antes de emitir a receita.',
      });
      return;
    }
    if (selectedPacienteQuery.isLoading) {
      toast.error('Aguarde o carregamento dos dados do paciente.');
      return;
    }
    if (selectedPacienteQuery.isError || !selectedPaciente) {
      toast.error('Não foi possível carregar o paciente. Confira os dados e tente novamente.');
      return;
    }

    setGerando(true);

    const paciente = selectedPaciente;
    const medico = medicos.find(m => m.id === form.medico_id);
    if (!paciente || !medico || (isMedicoOnly && form.medico_id !== medicoId)) {
      setGerando(false);
      return;
    }

    // ✅ CHECK CLINICAL ALERTS antes de salvar
    // Helper: aceita array de strings ou CSV (campo no banco pode vir como ambos)
    const toList = (val: unknown): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
      if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    };

    const pAny = paciente as any;

    // As comorbidades ficam em tabela própria, não numa coluna de `pacientes`.
    // Antes este código lia pAny.comorbidades, campo que nunca existiu: o alerta
    // de contraindicação por comorbidade nunca chegava a disparar.
    let comorbidades: Array<{ descricao: string }>;
    try {
      const { data, error } = await (supabase as any)
        .from('paciente_comorbidades')
        .select('descricao')
        .eq('paciente_id', paciente.id)
        .eq('clinica_id', profile?.clinica_id ?? '')
        .eq('ativo', true);
      if (error) throw error;
      comorbidades = data ?? [];
    } catch (error) {
      toast.error('Não foi possível verificar as comorbidades.', {
        description: `${mensagemDeErro(error)} Tente novamente; os alertas de segurança não puderam ser completados.`,
      });
      setGerando(false);
      return;
    }

    const medicationLines = form.medicamentos_texto.split('\n').filter(line => line.trim());
    const alerts: ClinicalAlert[] = [];

    for (const line of medicationLines) {
      const lineAlerts = consolidateAlerts(line, {
        alergias: toList(pAny.alergias),
        // Não passamos `idade`: a conta aqui era `anoAtual - anoNascimento`, sem
        // ajuste de aniversário, e tinha precedência sobre o cálculo correto do
        // motor de alertas. Uma criança de 1 ano e 8 meses virava 2 anos e o
        // alerta pediátrico deixava de disparar. A data basta.
        dataNascimento: pAny.data_nascimento,
        gestante: !!pAny.gestante,
        amamentando: !!pAny.amamentando,
        comorbidades: (comorbidades || []).map((c: any) => c.descricao).filter(Boolean),
      });
      alerts.push(...lineAlerts);
    }

    // Se há QUALQUER alerta, abrir dialog e aguardar confirmação explícita do médico.
    // A prescrição só é salva no botão "Confirmar e Gerar Receita" do dialog (ou aqui sem alertas).
    if (alerts.length > 0) {
      const hasCriticalAlerts = alerts.some(a => a.severity === 'critical' && !a.canIgnore);
      setClinicalAlerts(alerts);
      setAllergyOverrideJustification('');
      setShowAlertsDialog(true);
      if (hasCriticalAlerts) {
        toast.error('⚠️ Alertas de segurança críticos! Resolva antes de prescrever.');
      }
      setGerando(false);
      return;
    }

    // Sem alertas: salvar direto
    await executeSaveAndPdf(paciente, medico);
  };

  // Função extraída: salva no DB e gera PDF. Chamada quando não há alertas
  // ou após o médico confirmar no dialog de alertas.
  const executeSaveAndPdf = async (paciente: any, medico: any) => {
    if (savePrescriptionLock.current) {
      toast.info('A receita já está sendo processada. Aguarde a conclusão.');
      return;
    }
    if (!profile?.clinica_id) {
      setGerando(false);
      toast.error('Sua clínica ainda não foi identificada.', {
        description: 'Atualize a página e entre novamente antes de emitir a receita.',
      });
      return;
    }
    const prescritorAtivo = medicos.some(m => m.id === medico.id && m.ativo !== false);
    if (!prescritorAtivo) {
      setGerando(false);
      toast.error('O médico prescritor foi inativado', {
        description: 'Atualize os dados da equipe e selecione um profissional ativo antes de emitir.',
      });
      return;
    }
    if (clinicConfigQuery.isLoading) {
      setGerando(false);
      toast.info('Aguarde o carregamento dos dados da clínica antes de gerar a receita.');
      return;
    }
    if (clinicConfigQuery.isError) {
      setGerando(false);
      toast.error('Não foi possível carregar a configuração da clínica.', {
        description: mensagemDeErro(clinicConfigQuery.error),
      });
      return;
    }
    if (!clinicConfig?.nome_fantasia?.trim()) {
      setGerando(false);
      toast.error('Configure o nome da clínica antes de emitir a receita.');
      return;
    }

    savePrescriptionLock.current = true;
    let arquivoPdfPath: string | null = null;
    let arquivoPdfEnviado = false;
    try {
      // Gera primeiro para evitar gravar no histórico sem conseguir entregar o PDF.
      const doc = await buildReceitaPdf({
        pacienteNome: paciente.nome,
        cpf: paciente.cpf || '',
        dataEmissao: format(new Date(form.data_emissao + 'T12:00:00'), 'dd/MM/yyyy'),
        medicoNome: medico.nome || medico.crm,
        crm: medico.crm,
        especialidade: medico.especialidade || '',
        medicamentosTexto: form.medicamentos_texto,
        clinicaNome: clinicConfig?.nome_fantasia || 'Clínica Médica',
        clinicaEndereco: [clinicConfig?.endereco, [clinicConfig?.cidade, clinicConfig?.uf].filter(Boolean).join('/')].filter(Boolean).join(' — '),
        clinicaTelefone: clinicConfig?.telefone || '',
        clinicaCnpj: clinicConfig?.cnpj || '',
        clinicaCnes: clinicConfig?.cnes || '',
        logoUrl: clinicConfig?.logoUrl || '',
        rodapeReceita: clinicConfig?.rodapeReceita || '',
        mostrarLogo: clinicConfig?.mostrarLogo,
        mostrarCRM: clinicConfig?.mostrarCRM,
        mostrarCNES: clinicConfig?.mostrarCNES,
      });
      const blob = doc.output('blob');
      arquivoPdfPath = `prescricoes/${paciente.id}/${crypto.randomUUID()}.pdf`;
      const { error: erroUploadPdf } = await supabase.storage
        .from('medical-attachments')
        .upload(arquivoPdfPath, blob, { contentType: 'application/pdf', upsert: false });
      if (erroUploadPdf) throw erroUploadPdf;
      arquivoPdfEnviado = true;

      const { data: prescricaoSalva, error } = await (supabase.from('prescricoes') as any).insert({
        paciente_id: form.paciente_id,
        medico_id: form.medico_id,
        clinica_id: profile.clinica_id,
        medicamento: form.medicamentos_texto.slice(0, 100),
        posologia: form.medicamentos_texto,
        data_emissao: form.data_emissao,
        tipo: 'simples',
        arquivo_pdf: arquivoPdfPath,
        alertas_seguranca: clinicalAlerts.map(({ id, severity, title, message, action, canIgnore }) => ({
          id, severity, title, message, action: action ?? null, canIgnore,
        })),
        justificativa_alerta: requiresAllergyOverrideJustification(clinicalAlerts)
          ? allergyOverrideJustification.trim()
          : null,
      }).select('id').single();
      if (error) throw error;
      if (!prescricaoSalva?.id) throw new Error('A receita foi salva sem retornar seu identificador. Atualize o histórico antes de baixar.');
      setPdfPrescriptionId(prescricaoSalva.id);

      void refetch();
      const safeName = paciente.nome.replace(/\s+/g, '_').slice(0, 25);
      setPdfBlob(blob);
      setPdfFileName(`receita_${safeName}_${form.data_emissao}.pdf`);
      setIsFormOpen(false);
      setIsResultOpen(true);
      setShowAlertsDialog(false);
      setClinicalAlerts([]);
      toast.success('Receita gerada e salva no prontuário.', { description: 'O PDF também ficará disponível para baixar no histórico de prescrições.' });
    } catch (error) {
      if (arquivoPdfPath && arquivoPdfEnviado) {
        try {
          const { error: erroLimpeza } = await supabase.storage.from('medical-attachments').remove([arquivoPdfPath]);
          if (erroLimpeza) throw erroLimpeza;
        } catch (erroLimpeza) {
          toast.warning('A prescrição não foi salva e o PDF temporário não pôde ser removido.', {
            description: mensagemDeErro(erroLimpeza),
          });
        }
      }
      toast.error('Não foi possível gerar a receita.', {
        description: `${mensagemDeErro(error)} A prescrição não foi salva no histórico.`,
        duration: 10000,
      });
    } finally {
      savePrescriptionLock.current = false;
      setGerando(false);
    }
  };

  // Chamado pelo dialog de alertas quando o médico confirma prescrever apesar dos avisos
  const handleConfirmDespiteAlerts = async () => {
    const justificationError = allergyOverrideJustificationError(clinicalAlerts, allergyOverrideJustification);
    if (justificationError) {
      toast.error('Justificativa obrigatória', { description: justificationError });
      return;
    }
    setGerando(true);
    const paciente = selectedPaciente;
    const medico = medicos.find(m => m.id === form.medico_id);
    if (!paciente || !medico || (isMedicoOnly && form.medico_id !== medicoId)) {
      setGerando(false);
      return;
    }
    await executeSaveAndPdf(paciente, medico);
  };

  const handleDownload = async () => {
    if (!pdfBlob || !pdfPrescriptionId) return;
    try {
      await registrarAcessoDocumentoClinico('prescricao', pdfPrescriptionId, 'exportacao');
    } catch (error) {
      toast.error('Não foi possível registrar o download.', { description: mensagemDeErro(error) });
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFileName;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadFromHistory = async (prescricao: Record<string, any>, assinada = false) => {
    const arquivo = assinada ? versaoAssinadaPorReceita.get(prescricao.id)?.arquivo_pdf : prescricao.arquivo_pdf;
    if (!arquivo || downloadingPrescriptionId) return;
    setDownloadingPrescriptionId(prescricao.id);
    try {
      const { data, error } = await supabase.storage
        .from('medical-attachments')
        .download(arquivo);
      if (error) throw error;
      if (!data) throw new Error('O arquivo não foi encontrado. Atualize a lista e tente novamente.');
      await registrarAcessoDocumentoClinico('prescricao', prescricao.id, 'exportacao');
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      const nomePaciente = String(prescricao.pacientes?.nome_social || prescricao.pacientes?.nome || 'paciente')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
      anchor.href = url;
      anchor.download = `receita_${nomePaciente}_${prescricao.data_emissao || 'documento'}${assinada ? '_assinada' : ''}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error('Não foi possível baixar esta receita.', { description: mensagemDeErro(error) });
    } finally {
      setDownloadingPrescriptionId(null);
    }
  };

  // Auditoria 07: receitas gravadas pelo prontuário chegam sem arquivo_pdf.
  // Reaproveita o gerador de receita com os dados já salvos (medicamentos,
  // paciente, médico e cabeçalho da clínica), sem redigitar nem alterar o registro.
  const handleGerarPdfDoHistorico = async (prescricao: Record<string, any>) => {
    if (gerandoHistoricoId || downloadingPrescriptionId) return;
    const texto = String(prescricao.posologia || prescricao.medicamento || '').trim();
    const medico = medicos.find(m => m.id === prescricao.medico_id);
    const paciente = prescricao.pacientes;
    if (!texto || !medico || !paciente?.nome) {
      toast.error('Não há dados suficientes para montar esta receita.', {
        description: 'Confira se o registro tem medicamentos, paciente e médico prescritor.',
      });
      return;
    }
    if (clinicConfigQuery.isLoading) {
      toast.info('Aguarde o carregamento dos dados da clínica antes de gerar a receita.');
      return;
    }
    if (clinicConfigQuery.isError || !clinicConfig?.nome_fantasia?.trim()) {
      toast.error('Configure o nome da clínica antes de gerar a receita.');
      return;
    }
    setGerandoHistoricoId(prescricao.id);
    try {
      const dataEmissao = prescricao.data_emissao && isValidDateOnly(prescricao.data_emissao)
        ? prescricao.data_emissao
        : today;
      const doc = await buildReceitaPdf({
        pacienteNome: paciente.nome,
        cpf: paciente.cpf || '',
        dataEmissao: format(new Date(`${dataEmissao}T12:00:00`), 'dd/MM/yyyy'),
        medicoNome: medico.nome || medico.crm,
        crm: medico.crm,
        especialidade: medico.especialidade || '',
        medicamentosTexto: texto,
        clinicaNome: clinicConfig.nome_fantasia,
        clinicaEndereco: [clinicConfig.endereco, [clinicConfig.cidade, clinicConfig.uf].filter(Boolean).join('/')].filter(Boolean).join(' — '),
        clinicaTelefone: clinicConfig.telefone || '',
        clinicaCnpj: clinicConfig.cnpj || '',
        clinicaCnes: clinicConfig.cnes || '',
        logoUrl: clinicConfig.logoUrl || '',
        rodapeReceita: clinicConfig.rodapeReceita || '',
        mostrarLogo: clinicConfig.mostrarLogo,
        mostrarCRM: clinicConfig.mostrarCRM,
        mostrarCNES: clinicConfig.mostrarCNES,
      });
      await registrarAcessoDocumentoClinico('prescricao', prescricao.id, 'exportacao');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const nomePaciente = String(paciente.nome_social || paciente.nome || 'paciente')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
      anchor.href = url;
      anchor.download = `receita_${nomePaciente}_${dataEmissao}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Receita montada a partir do histórico.', { description: 'O PDF sai sem assinatura; assine no gov.br ou de próprio punho.' });
    } catch (error) {
      toast.error('Não foi possível montar esta receita.', { description: mensagemDeErro(error) });
    } finally {
      setGerandoHistoricoId(null);
    }
  };

  const handleOpenAssinador = () => {
    window.open('https://assinaturadigital.iti.gov.br/', '_blank');
  };

  const handleOpenMemed = async () => {
    const paciente = selectedPaciente as any;
    const medico = medicos.find(m => m.id === form.medico_id) as any;
    if (selectedPacienteQuery.isFetching) {
      toast.info('Aguarde o carregamento dos dados do paciente.');
      return;
    }
    if (selectedPacienteQuery.isError) {
      toast.error('Não foi possível carregar os dados do paciente.', {
        description: mensagemDeErro(selectedPacienteQuery.error),
      });
      return;
    }
    if (!form.paciente_id || !paciente || !medico || (isMedicoOnly && form.medico_id !== medicoId)) {
      toast.error('Selecione o paciente e o médico prescritor.');
      return;
    }
    if (medico.ativo === false) {
      toast.error('O médico prescritor está inativo', {
        description: 'Selecione um profissional ativo antes de abrir o receituário.',
      });
      return;
    }

    setMemedOpening(true);
    try {
      const { data, error } = await supabase.functions.invoke('memed-prescription', {
        body: { action: 'prepare', pacienteId: paciente.id, medicoId: medico.id },
      });
      if (error) throw new Error(data?.error || 'Não foi possível preparar a integração com a Memed.');
      if (data?.error) throw new Error(data.error);

      const saveEvent = async (action: 'prescription_printed' | 'prescription_deleted', payload: MemedPayload) => {
        const result = await supabase.functions.invoke('memed-prescription', {
          body: { action, pacienteId: paciente.id, medicoId: medico.id, payload },
        });
        if (result.error || result.data?.error) {
          toast.error(result.data?.error || 'Não foi possível salvar a atualização da receita Memed.');
          return;
        }
        if (action === 'prescription_printed') {
          toast.success('Receita Memed salva no histórico do paciente.');
        } else {
          toast.info('Receita excluída na Memed. O histórico foi atualizado.');
        }
        await refetch();
      };

      await loadMemedPrescriptionScript(data.token, data.scriptUrl, {
        printed: payload => { void saveEvent('prescription_printed', payload); },
        deleted: payload => {
          const deletedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload as MemedPayload
            : { prescriptionId: String(payload ?? '') };
          void saveEvent('prescription_deleted', deletedPayload);
        },
      });

      const hub = window.MdHub;
      if (!hub) throw new Error('A comunicação com a Memed não ficou disponível.');
      const sexo = String(paciente.sexo ?? '').toLowerCase();
      const sexoMemed = sexo.startsWith('f') ? 'Feminino' : sexo.startsWith('m') ? 'Masculino' : '';
      await hub.command.send('plataforma.prescricao', 'setPaciente', {
        idExterno: paciente.id,
        nome: paciente.nome,
        sexo: sexoMemed,
        ...(paciente.cpf ? { cpf: String(paciente.cpf).replace(/\D/g, '') } : {}),
        ...(dateForMemed(paciente.data_nascimento) ? { data_nascimento: dateForMemed(paciente.data_nascimento) } : {}),
        ...(paciente.telefone ? { telefone: String(paciente.telefone).replace(/\D/g, '') } : {}),
        ...(paciente.email ? { email: paciente.email } : {}),
      });
      await hub.module.show('plataforma.prescricao');
    } catch (error) {
      toast.error((error as Error)?.message || 'Não foi possível abrir a Memed.');
    } finally {
      setMemedOpening(false);
    }
  };

  const getPacienteNome = (id: string) => {
    const paciente = (prescricoes as any[]).find(p => p.paciente_id === id)?.pacientes;
    return paciente?.nome_social || paciente?.nome || '—';
  };
  const pacienteFiltroNome = pacienteFiltroId ? getPacienteNome(pacienteFiltroId) : null;
  const mensagemWhatsApp = (prescricao: Record<string, any>) => {
    const nome = String(prescricao.pacientes?.nome_social || prescricao.pacientes?.nome || '').split(' ')[0];
    const data = prescricao.data_emissao ? format(new Date(`${prescricao.data_emissao}T12:00:00`), 'dd/MM/yyyy') : '';
    const clinica = clinicConfig?.nome_fantasia?.trim() || 'a clínica';
    return `Olá${nome ? `, ${nome}` : ''}! Sua receita${data ? ` emitida em ${data}` : ''} está disponível. Em caso de dúvida sobre a medicação, fale com ${clinica}.`;
  };
  const getMedicoNome = (id: string) => { const m = medicos.find(x => x.id === id); return m ? `${nomeMedico(m.nome || m.crm)}` : '—'; };

  if (loadingMed || loadingPresc) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  }

  if (medicosQuery.isError || prescricoesQuery.isError) {
    const failedQuery = medicosQuery.isError ? medicosQuery : prescricoesQuery;
    return <ErrorState title="Não foi possível carregar prescrições" error={failedQuery.error} onRetry={() => {
      void medicosQuery.refetch();
      void prescricoesQuery.refetch();
    }} />;
  }

  if (isMedicoOnly && (!medicoId || currentMedico?.ativo === false)) {
    return <ErrorState
      title={currentMedico?.ativo === false ? 'Cadastro médico inativo' : 'Perfil médico sem vínculo'}
      description={currentMedico?.ativo === false
        ? 'Seu cadastro médico foi inativado. Peça ao administrador para revisar seu acesso antes de emitir novas prescrições.'
        : 'Seu usuário não está vinculado a um cadastro médico ativo da clínica. Peça ao administrador para revisar esse vínculo antes de consultar ou emitir prescrições.'}
    />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="Prescrições"
        description={stats.total > 0
          ? `${stats.total} receita${stats.total === 1 ? '' : 's'} · ${stats.hoje} hoje${stats.semPdf > 0 ? ` · ${stats.semPdf} sem PDF` : ''}${stats.memed > 0 ? ` · ${stats.memed} pela Memed` : ''} · ${stats.pacientes} paciente${stats.pacientes === 1 ? '' : 's'}`
          : 'Prescrição em PDF; assinatura digital feita fora do EloLab'}
        icon={<Pill />}
        actions={(
          <>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/todos-templates"><BookOpen className="h-4 w-4" />Modelos</Link>
            </Button>
            <Button variant="outline" className="shrink-0 gap-2 rounded-full" onClick={handleOpenAssinador} title="Abrir o assinador digital do ITI (gov.br) em nova aba">
              <FileSignature className="h-4 w-4" />Assinador gov.br
            </Button>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void refetch()} aria-label="Atualizar prescrições" title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleOpen}
              className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
              disabled={
                medicosDisponiveis.length === 0 || clinicConfigQuery.isLoading || clinicConfigQuery.isError
                || !clinicConfig?.nome_fantasia?.trim()
              }
            >
              <Plus className="h-4 w-4" />Nova Prescrição
            </Button>
          </>
        )}
      />

      {clinicConfigQuery.isLoading && (
        <p className="text-sm text-muted-foreground" role="status">Carregando os dados da clínica necessários para a receita…</p>
      )}
      {!profile?.clinica_id && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível identificar a clínica deste usuário. Atualize a sessão antes de emitir receitas.
        </div>
      )}
      {clinicConfigQuery.isError && (
        <ErrorState
          compact
          title="Não foi possível carregar os dados da clínica para a receita"
          error={clinicConfigQuery.error}
          onRetry={() => void clinicConfigQuery.refetch()}
        />
      )}
      {profile?.clinica_id && !clinicConfigQuery.isLoading && !clinicConfigQuery.isError && !clinicConfig?.nome_fantasia?.trim() && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          Configure o nome da clínica antes de emitir receitas. <Link to="/configuracoes" className="font-medium underline">Abrir configurações</Link>.
        </div>
      )}

      {medicosDisponiveis.length === 0 && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          Não há médicos ativos para emitir novas receitas. <Link to="/equipe" className="font-medium underline">Gerenciar equipe</Link>.
        </div>
      )}

      {prescricoes.length >= MAX_LINHAS_AUTO && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>O histórico atingiu o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} receitas. Os totais e os resultados da busca podem estar incompletos.</p>
        </div>
      )}

      {/* Indicadores */}
      <section role="group" aria-label="Resumo das prescrições" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {([
          { key: 'hoje', icon: CalendarCheck, label: 'Hoje', value: stats.hoje, caption: 'emitidas hoje', color: 'text-white', surface: 'bg-white/15', escuro: true },
          { key: 'pdf', icon: FileText, label: 'Com PDF', value: stats.pdf, caption: 'prontas para baixar', color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false },
          { key: 'sem_pdf', icon: CloudOff, label: 'Sem PDF', value: stats.semPdf, caption: 'gerar a partir do histórico', color: 'text-warning', surface: 'bg-warning/10', escuro: false },
          { key: 'memed', icon: ExternalLink, label: 'Memed', value: stats.memed, caption: 'PDF fora do EloLab', color: 'text-info', surface: 'bg-info/10', escuro: false },
          { key: 'todos', icon: Pill, label: 'Total', value: stats.total, caption: `${stats.pacientes} paciente${stats.pacientes === 1 ? '' : 's'}`, color: 'text-foreground', surface: 'bg-muted', escuro: false },
        ] as const).map(s => {
          const Icon = s.icon;
          const ativo = filtroOrigem === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltroOrigem(ativo && s.key !== 'todos' ? 'todos' : s.key)}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                s.escuro && 'border-transparent bg-gradient-primary text-white',
                ativo && !s.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                ativo && s.escuro && 'ring-2 ring-[#1080CA]/60',
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

      {/* Histórico */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Histórico <span className="text-muted-foreground">({filteredPrescricoes.length})</span></CardTitle>
              <div className="relative w-full sm:w-80">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar prescrições por paciente, CPF ou medicamento"
                  placeholder="Buscar paciente, CPF ou medicamento..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Filtrar por período" className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: 'todos', label: 'Todo o período' },
                  { key: '7d', label: 'Últimos 7 dias' },
                  { key: '30d', label: 'Últimos 30 dias' },
                ] as const).map(opt => {
                  const ativo = filtroPeriodo === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => setFiltroPeriodo(opt.key)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                        ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {pacienteFiltroId && (
                  <Badge variant="outline" className="h-8 gap-1 rounded-full border-[#BFD8EE] pl-3 pr-1 text-xs font-medium text-[#1080CA]">
                    Paciente: {pacienteFiltroNome}
                    <button
                      type="button"
                      onClick={limparPacienteFiltro}
                      aria-label="Remover filtro de paciente"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-[#1080CA]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]"
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
              <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{filteredPrescricoes.length} de {prescricoes.length}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Médico</TableHead>
                  <TableHead className="hidden sm:table-cell">Medicamento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrescricoes.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                      <Pill className="h-7 w-7" />
                    </span>
                    <p className="font-semibold text-foreground">{prescricoes.length === 0 ? 'Nenhuma prescrição' : 'Nenhum resultado encontrado'}</p>
                    <p className="mt-1 text-sm">{prescricoes.length === 0 ? 'Crie sua primeira prescrição médica' : 'Tente outro paciente, CPF, telefone, medicamento ou período.'}</p>
                    {prescricoes.length > 0 ? (
                      <Button size="sm" variant="outline" className="mt-4 rounded-full" onClick={limparFiltros}>Limpar filtros</Button>
                    ) : (
                      <Button
                        size="sm"
                        className="mt-4 gap-2 rounded-full bg-gradient-primary text-white hover:brightness-110 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                        onClick={handleOpen}
                        disabled={medicosDisponiveis.length === 0 || clinicConfigQuery.isLoading || clinicConfigQuery.isError || !clinicConfig?.nome_fantasia?.trim()}
                      >
                        <Plus className="h-4 w-4" />Nova receita
                      </Button>
                    )}
                  </TableCell></TableRow>
                ) : filteredPrescricoes.map(p => {
                  const nomePaciente = getPacienteNome(p.paciente_id);
                  const whatsapp = linkWhatsApp(p.pacientes?.telefone, mensagemWhatsApp(p));
                  const semArquivo = receitaSemArquivo(p);
                  const ocupado = downloadingPrescriptionId !== null || gerandoHistoricoId !== null;
                  return (
                    <TableRow key={p.id} className="transition-colors hover:bg-[#F3F8FC]/70">
                      <TableCell className="tabular-nums">{p.data_emissao ? format(new Date(p.data_emissao + 'T12:00:00'), 'dd/MM/yyyy') : '—'}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{nomePaciente}</span>
                          {p.data_emissao === today && <Badge className="rounded-full border-transparent bg-gradient-primary text-[9px] text-white hover:bg-gradient-primary">Hoje</Badge>}
                          {receitaMemed(p) && <Badge variant="outline" className="rounded-full text-[10px]">Memed</Badge>}
                          {receitaMemedExcluida(p) && <Badge variant="destructive" className="rounded-full text-[10px]">Excluída</Badge>}
                          {semArquivo && <Badge variant="outline" className="rounded-full border-warning/40 text-[10px] text-warning">Sem PDF</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{getMedicoNome(p.medico_id)}</TableCell>
                      <TableCell className="hidden max-w-[220px] truncate sm:table-cell" title={p.medicamento || p.posologia || undefined}>{p.medicamento || p.posologia || '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {whatsapp && (
                            <Button aria-label={`Avisar ${nomePaciente} pelo WhatsApp`} asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                              <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Avisar ${nomePaciente} pelo WhatsApp`} title="Avisar pelo WhatsApp">
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button aria-label={`Abrir prontuário de ${nomePaciente}`} asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground">
                            <Link to={`/prontuarios?paciente=${encodeURIComponent(p.paciente_id)}`} aria-label={`Abrir prontuário de ${nomePaciente}`} title="Abrir prontuário">
                              <Clipboard className="h-4 w-4" />
                            </Link>
                          </Button>
                          {p.arquivo_pdf ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 gap-1.5 rounded-full text-xs"
                              aria-label={`Baixar receita de ${nomePaciente}`}
                              title="Baixar PDF"
                              disabled={ocupado}
                              onClick={() => void handleDownloadFromHistory(p)}
                            >
                              {downloadingPrescriptionId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                              Baixar PDF
                            </Button>
                          ) : null}
                          {p.arquivo_pdf && versaoAssinadaPorReceita.has(p.id) && (
                            <Button
                              type="button"
                              className="h-9 gap-1.5 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110"
                              aria-label={`Baixar versão assinada da receita de ${nomePaciente}`}
                              title="Baixar a cópia assinada anexada"
                              disabled={ocupado}
                              onClick={() => void handleDownloadFromHistory(p, true)}
                            >
                              <FileSignature className="h-4 w-4" />
                              Assinada
                            </Button>
                          )}
                          {podeAnexarAssinada(p) && (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 gap-1.5 rounded-full text-xs"
                              aria-label={`Anexar versão assinada da receita de ${nomePaciente}`}
                              title="Anexar o PDF assinado no gov.br"
                              disabled={ocupado || enviandoAssinadaId !== null}
                              onClick={() => { setAnexandoAssinadaPara(p); assinadaInputRef.current?.click(); }}
                            >
                              {enviandoAssinadaId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                              Anexar assinada
                            </Button>
                          )}
                          {p.arquivo_pdf ? null : receitaMemedExcluida(p) ? (
                            <span className="text-xs text-muted-foreground" aria-label={`Receita de ${nomePaciente} excluída na Memed`}>Excluída na Memed</span>
                          ) : receitaMemed(p) ? (
                            <span className="text-xs text-muted-foreground" aria-label={`Receita de ${nomePaciente} gerenciada pela Memed; PDF não armazenado no EloLab`}>PDF na Memed</span>
                          ) : (
                            <Button
                              type="button"
                              className="h-9 gap-1.5 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110"
                              aria-label={`Gerar PDF da receita de ${nomePaciente}`}
                              title="Montar o PDF com os medicamentos já gravados"
                              disabled={ocupado || clinicConfigQuery.isLoading || clinicConfigQuery.isError}
                              onClick={() => void handleGerarPdfDoHistorico(p)}
                            >
                              {gerandoHistoricoId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              Gerar PDF
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <input
            ref={assinadaInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void handleArquivoAssinado(e.target.files?.[0])}
          />
        </CardContent>
      </Card>

      {/* ── New Prescription Dialog ── */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (open || (!gerando && !memedOpening)) setIsFormOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-primary" />Nova Prescrição</DialogTitle>
            <DialogDescription>Preencha os dados da prescrição médica.</DialogDescription>
          </DialogHeader>

          <fieldset disabled={gerando || memedOpening} className="space-y-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="prescricao-paciente">Paciente *</Label>
              <PacienteCombobox id="prescricao-paciente" value={form.paciente_id} onChange={v => setForm(f => ({ ...f, paciente_id: v }))} />
              {selectedPacienteQuery.isError && form.paciente_id && (
                <ErrorState compact title="Não foi possível carregar os dados do paciente" error={selectedPacienteQuery.error} onRetry={() => void selectedPacienteQuery.refetch()} />
              )}
              {selectedPacienteQuery.isFetching && form.paciente_id && <p className="text-xs text-muted-foreground">Carregando dados do paciente…</p>}
              {selectedPaciente?.cpf && (
                <p className="text-xs text-muted-foreground">CPF: {selectedPaciente.cpf}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="prescricao-medico">Médico Prescritor *</Label>
              <Select value={form.medico_id} disabled={isMedicoOnly} onValueChange={v => setForm(f => ({ ...f, medico_id: v }))}>
                <SelectTrigger id="prescricao-medico"><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                <SelectContent>
                  {medicosDisponiveis.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome || m.crm} — CRM {m.crm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prescricao-data">Data de Emissão</Label>
              <Input id="prescricao-data" type="date" max={today} required value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="prescricao-medicamentos">Medicamentos e Posologia *</Label>
                {modelosQuery.isError ? (
                  <ErrorState compact title="Não foi possível carregar os modelos" error={modelosQuery.error} onRetry={() => void modelosQuery.refetch()} />
                ) : modelosQuery.isLoading ? (
                  <span className="text-xs text-muted-foreground">Carregando modelos...</span>
                ) : modelos.length > 0 ? (
                  <Select value="" onValueChange={aplicarModelo}>
                    <SelectTrigger aria-label="Usar modelo de prescrição" className="h-8 w-56 text-xs"><SelectValue placeholder="Usar modelo..." /></SelectTrigger>
                    <SelectContent>
                      {modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Link to="/todos-templates" className="text-xs text-primary hover:underline">Criar modelos de prescrição</Link>
                )}
              </div>
              <Textarea
                id="prescricao-medicamentos"
                placeholder={`1) Amoxicilina 500mg — Tomar 1 cápsula de 8/8h por 7 dias\n2) Ibuprofeno 400mg — Tomar 1 comprimido de 12/12h por 5 dias\n3) Omeprazol 20mg — Tomar 1 cápsula em jejum por 30 dias`}
                value={form.medicamentos_texto}
                onChange={e => setForm(f => ({ ...f, medicamentos_texto: e.target.value }))}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </fieldset>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={gerando || memedOpening}>Cancelar</Button>
            <LoadingButton
              onClick={handleOpenMemed}
              isLoading={memedOpening}
              loadingText="Abrindo Memed..."
              disabled={
                !form.paciente_id || !form.medico_id || !selectedPaciente
                || selectedPacienteQuery.isFetching || selectedPacienteQuery.isError
                || memedOpening || gerando
              }
              variant="secondary"
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />Prescrever pela Memed
            </LoadingButton>
            <LoadingButton
              onClick={handleSaveAndGenerate}
              isLoading={gerando}
              loadingText="Gerando receita..."
              disabled={
                !form.paciente_id || !form.medico_id || !form.medicamentos_texto.trim()
                || !selectedPaciente || selectedPacienteQuery.isFetching || selectedPacienteQuery.isError
                || memedOpening || gerando
              }
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />Gerar Receita PDF
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Clinical Alerts Dialog ── */}
      <Dialog open={showAlertsDialog} onOpenChange={(open) => { if (open || !gerando) setShowAlertsDialog(open); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              ⚠️ Alertas de Segurança Clínica
            </DialogTitle>
            <DialogDescription>
              Revisão antes de prescrever. Alertas com tag "Não ignorável" devem ser resolvidos
              antes de prosseguir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <ClinicalAlertsDisplay alerts={clinicalAlerts} onDismiss={dismissAlert} />
            {requiresAllergyOverrideJustification(clinicalAlerts) && (
              <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <Label htmlFor="prescricao-justificativa-alergia">Justificativa clínica para prosseguir *</Label>
                <Textarea
                  id="prescricao-justificativa-alergia"
                  aria-describedby="prescricao-justificativa-alergia-ajuda"
                  value={allergyOverrideJustification}
                  onChange={event => setAllergyOverrideJustification(event.target.value)}
                  placeholder="Registre a avaliação clínica e o motivo para prosseguir apesar do risco de reação cruzada."
                  maxLength={1000}
                  rows={3}
                />
                <p id="prescricao-justificativa-alergia-ajuda" className="text-xs text-muted-foreground">
                  Mínimo de 20 caracteres. A justificativa ficará registrada junto à prescrição.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAlertsDialog(false)} disabled={gerando}>
              Voltar à Prescrição
            </Button>
            {!clinicalAlerts.some(a => a.severity === 'critical' && !a.canIgnore) && (
              <Button
                onClick={handleConfirmDespiteAlerts}
                disabled={gerando || !!allergyOverrideJustificationError(clinicalAlerts, allergyOverrideJustification)}
              >
                {gerando ? 'Gerando receita...' : 'Confirmar e Gerar Receita'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Result Dialog (Download + Assinar) ── */}
      <Dialog open={isResultOpen} onOpenChange={setIsResultOpen}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-lg">
              <Clipboard className="h-5 w-5 text-primary" />
              Receita Gerada!
            </DialogTitle>
            <DialogDescription>O EloLab guarda o PDF emitido sem assinatura. Depois de assiná-lo externamente, anexe a cópia assinada pelo histórico de receitas.</DialogDescription>
          </DialogHeader>

          <p className="text-muted-foreground text-sm">
            O PDF gerado ainda não está assinado. Baixe o arquivo e, se necessário, assine pelo portal do ITI (Gov.br). Depois, use "Anexar assinada" no histórico: o original e a versão assinada ficam guardados lado a lado.
          </p>

          <div className="flex flex-col gap-3 mt-4">
            <Button onClick={handleDownload} size="lg" className="gap-2 w-full">
              <FileDown className="h-5 w-5" />Baixar Receita PDF
            </Button>

            <Button onClick={handleOpenAssinador} variant="premium" size="lg" className="gap-2 w-full">
              <ExternalLink className="h-5 w-5" />Ir para Assinador Digital (Grátis)
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            O assinador digital do ITI utiliza certificado ICP-Brasil via Gov.br, sem custo adicional.
          </p>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
