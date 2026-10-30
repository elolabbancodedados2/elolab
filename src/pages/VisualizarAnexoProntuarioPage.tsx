import { useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Download, FileText, Image as ImageIcon, Loader2, Shield } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { registrarAcessoProntuario } from '@/lib/prontuarioAudit';
import { registrarAcessoDocumentoClinico } from '@/lib/clinicalDocumentAudit';
import { clinicalAttachmentStoragePath, createClinicalAttachmentSignedUrl } from '@/lib/clinicalAttachmentStorage';
import { parseDateOnly } from '@/lib/dateOnly';

type Relation<T> = T | T[] | null;
type AttachmentContext = {
  id: string;
  paciente_id: string;
  medico_id: string | null;
  data: string;
  pacientes: Relation<{ nome: string | null; nome_social: string | null }>;
  medicos: Relation<{ nome: string | null; crm: string | null }>;
};
type Attachment = {
  id: string;
  prontuario_id: string;
  paciente_id: string;
  clinica_id: string;
  nome_arquivo: string;
  tipo_arquivo: string;
  tamanho_bytes: number | null;
  url_arquivo: string;
  categoria: string | null;
  descricao: string | null;
  created_at: string | null;
};

function one<T>(value: Relation<T> | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function getReturnTo(requested: unknown, prontuarioId: string) {
  const fallback = `/prontuarios?prontuario=${encodeURIComponent(prontuarioId)}&secao=anexos`;
  if (typeof requested !== 'string') return fallback;
  try {
    const target = new URL(requested, window.location.origin);
    if (target.origin !== window.location.origin) return fallback;
    if (target.pathname === '/prontuarios' || target.pathname === '/prontuarios/atendimento') {
      return `${target.pathname}${target.search}`;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return 'Não informado';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClinicalDate(value: string | null) {
  if (!value) return 'Data não informada';
  const parsed = parseDateOnly(value);
  return parsed ? format(parsed, 'dd/MM/yyyy', { locale: ptBR }) : value;
}

export default function VisualizarAnexoProntuarioPage() {
  const { prontuarioId = '', anexoId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id;
  const canAccess = profile?.roles?.some(role => role === 'admin' || role === 'medico') ?? false;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadLock = useRef(false);
  const returnTo = getReturnTo(location.state?.returnTo, prontuarioId);

  const attachmentQuery = useQuery({
    queryKey: ['visualizar-anexo-prontuario', clinicId, prontuarioId, anexoId],
    enabled: Boolean(clinicId && prontuarioId && anexoId && canAccess),
    queryFn: async () => {
      await registrarAcessoProntuario(prontuarioId, 'visualizacao');
      const { data: contextData, error: contextError } = await supabase
        .from('prontuarios')
        .select('id,paciente_id,medico_id,data,pacientes(nome,nome_social),medicos(nome,crm)')
        .eq('id', prontuarioId)
        .eq('clinica_id', clinicId!)
        .maybeSingle();
      if (contextError) throw contextError;
      if (!contextData) throw new Error('Este prontuário não está disponível para a clínica ativa.');

      const context = contextData as unknown as AttachmentContext;
      const { data: attachmentData, error: attachmentError } = await supabase
        .from('anexos_prontuario')
        .select('id,prontuario_id,paciente_id,clinica_id,nome_arquivo,tipo_arquivo,tamanho_bytes,url_arquivo,categoria,descricao,created_at')
        .eq('id', anexoId)
        .eq('prontuario_id', context.id)
        .eq('paciente_id', context.paciente_id)
        .eq('clinica_id', clinicId!)
        .maybeSingle();
      if (attachmentError) throw attachmentError;
      if (!attachmentData) throw new Error('O anexo não está disponível neste prontuário.');

      const attachment = attachmentData as Attachment;
      await registrarAcessoDocumentoClinico('anexo_prontuario', attachment.id, 'visualizacao');
      const previewUrl = await createClinicalAttachmentSignedUrl(attachment.url_arquivo);
      if (!previewUrl) throw new Error('Não foi possível gerar um acesso temporário para este arquivo. Tente novamente.');
      return { context, attachment, previewUrl };
    },
  });

  const handleDownload = async () => {
    if (!attachmentQuery.data || downloadLock.current) return;
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    if (!tab) {
      setDownloadError('O navegador bloqueou a nova aba. Permita a abertura de uma aba para baixar o documento.');
      return;
    }
    downloadLock.current = true;
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = await createClinicalAttachmentSignedUrl(attachmentQuery.data.attachment.url_arquivo);
      if (!url) throw new Error('Não foi possível gerar o link temporário.');
      await registrarAcessoDocumentoClinico('anexo_prontuario', attachmentQuery.data.attachment.id, 'exportacao');
      tab.location.replace(url);
    } catch {
      tab.close();
      setDownloadError('Não foi possível registrar e preparar o download. Revise sua conexão e tente novamente.');
    } finally {
      downloadLock.current = false;
      setDownloading(false);
    }
  };

  const context = attachmentQuery.data?.context;
  const attachment = attachmentQuery.data?.attachment;
  const patient = one(context?.pacientes);
  const doctor = one(context?.medicos);
  const patientName = patient?.nome_social || patient?.nome || 'Paciente';
  const doctorName = doctor?.nome || 'Profissional responsável';

  if (!canAccess || !clinicId) {
    return <section role="alert" className="mx-auto max-w-5xl space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5"><h1 className="font-semibold">Não foi possível abrir o documento clínico</h1><p className="text-sm text-muted-foreground">Confirme seu acesso e a clínica ativa antes de abrir o anexo.</p><Button variant="outline" onClick={() => navigate('/prontuarios')}>Voltar aos prontuários</Button></section>;
  }

  if (attachmentQuery.isLoading) {
    return <section data-testid="attachment-view-page" className="mx-auto w-full max-w-6xl space-y-5" aria-busy="true"><PageHeader title="Visualizar anexo clínico" description="Conferindo o prontuário e registrando o acesso." icon={<FileText />} actions={<Button variant="outline" onClick={() => navigate(returnTo)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao prontuário</Button>} /><div role="status" className="flex min-h-48 items-center justify-center gap-3 rounded-xl border bg-card text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" />Validando acesso ao documento…</div></section>;
  }

  if (attachmentQuery.isError || !attachment || !context) {
    return <section data-testid="attachment-view-page" className="mx-auto w-full max-w-6xl space-y-5"><PageHeader title="Visualizar anexo clínico" description="O documento não foi exibido." icon={<FileText />} actions={<Button variant="outline" onClick={() => navigate(returnTo)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao prontuário</Button>} /><div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5"><p className="font-medium text-foreground">Não foi possível abrir este anexo.</p><p className="text-sm text-muted-foreground">{attachmentQuery.error instanceof Error ? attachmentQuery.error.message : 'Confirme que o anexo pertence ao prontuário e tente novamente.'}</p><Button variant="outline" onClick={() => void attachmentQuery.refetch()}>Tentar novamente</Button></div></section>;
  }

  const isImage = attachment.tipo_arquivo.startsWith('image/');
  const isPdf = attachment.tipo_arquivo === 'application/pdf';
  const previewAvailable = isImage || isPdf;

  return (
    <section data-testid="attachment-view-page" className="mx-auto w-full max-w-6xl space-y-5 pb-24 sm:pb-8">
      <PageHeader
        title="Visualizar documento clínico"
        description={`${patientName} · ${attachment.nome_arquivo}`}
        icon={<FileText />}
        actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate(returnTo)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao prontuário</Button><Button onClick={() => void handleDownload()} disabled={downloading} className="min-h-10">{downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{downloading ? 'Preparando…' : 'Baixar anexo'}</Button></div>}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border py-3 text-sm">
        <span className="font-medium">{attachment.nome_arquivo}</span>
        <span className="text-muted-foreground">{attachment.categoria || 'Documento'} · {formatFileSize(attachment.tamanho_bytes)}</span>
        <span className="text-muted-foreground">Evolução de {formatClinicalDate(context.data)}</span>
        <span className="text-muted-foreground">Responsável: {doctorName}</span>
      </div>

      {attachment.descricao && <p className="text-sm text-muted-foreground">{attachment.descricao}</p>}
      <p role="note" className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Shield aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />A visualização e os downloads são registrados no histórico clínico. O acesso ao arquivo é temporário e privado.</p>
      {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}

      <div className="flex min-h-[24rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20 p-2 sm:min-h-[32rem] sm:p-4">
        {isImage ? <img src={attachmentQuery.data.previewUrl} alt={`Prévia de ${attachment.nome_arquivo}`} className="max-h-[min(68vh,900px)] max-w-full object-contain" />
          : isPdf ? <iframe src={attachmentQuery.data.previewUrl} title={`Prévia do anexo ${attachment.nome_arquivo}`} referrerPolicy="no-referrer" className="h-[min(68vh,900px)] min-h-[24rem] w-full rounded-md bg-white sm:min-h-[32rem]" />
            : <div className="space-y-3 text-center"><ImageIcon aria-hidden="true" className="mx-auto h-10 w-10 text-muted-foreground" /><p className="text-sm font-medium">A prévia não está disponível para este tipo de arquivo.</p><Button variant="outline" onClick={() => void handleDownload()} disabled={downloading}><Download className="mr-2 h-4 w-4" />Baixar anexo</Button></div>}
      </div>
    </section>
  );
}
