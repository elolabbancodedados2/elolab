import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, FileText, Loader2, Lock, Paperclip, Upload } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { registrarAcessoProntuario } from '@/lib/prontuarioAudit';
import { parseDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { toast } from 'sonner';
import { formatWithDatePreference } from '@/lib/datePreference';

const BUCKET = 'medical-attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const CATEGORIES = [
  { value: 'exame', label: 'Exame' },
  { value: 'laudo', label: 'Laudo' },
  { value: 'imagem', label: 'Imagem médica' },
  { value: 'receita', label: 'Receita' },
  { value: 'atestado', label: 'Atestado' },
  { value: 'documento', label: 'Documento' },
  { value: 'outro', label: 'Outro' },
];

type Relation<T> = T | T[] | null;
type AttachmentContext = {
  id: string;
  paciente_id: string;
  medico_id: string;
  data: string;
  assinado: boolean;
  pacientes: Relation<{ nome: string | null; nome_social: string | null }>;
  medicos: Relation<{ nome: string | null; crm: string | null }>;
};

function one<T>(value: Relation<T> | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatDate(date: string) {
  const parsed = parseDateOnly(date);
  return parsed ? formatWithDatePreference(parsed, 'dd/MM/yyyy', { locale: ptBR }) : date;
}

function getFileProblem(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return 'O tamanho máximo permitido é 10 MB.';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Selecione uma imagem JPEG, PNG, GIF, WebP ou um PDF.';
  return null;
}

export default function NovoAnexoProntuarioPage() {
  const { prontuarioId = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const { medicoId, currentMedico, isLoading: medicoLoading, error: medicoError } = useCurrentMedico();
  const clinicId = profile?.clinica_id;
  const roles = profile?.roles ?? [];
  const isAdmin = roles.includes('admin');
  const isDoctor = roles.includes('medico');
  const [category, setCategory] = useState('documento');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);
  const completed = useRef(false);

  const contextQuery = useQuery({
    queryKey: ['novo-anexo-prontuario', clinicId, prontuarioId],
    enabled: Boolean(clinicId && prontuarioId),
    queryFn: async (): Promise<AttachmentContext> => {
      await registrarAcessoProntuario(prontuarioId, 'visualizacao');
      const { data, error } = await supabase
        .from('prontuarios')
        .select('id,paciente_id,medico_id,data,assinado,pacientes(nome,nome_social),medicos(nome,crm)')
        .eq('id', prontuarioId)
        .eq('clinica_id', clinicId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este prontuário não está disponível para a clínica ativa.');
      return data as unknown as AttachmentContext;
    },
  });

  const context = contextQuery.data;
  const patient = one(context?.pacientes);
  const doctor = one(context?.medicos);
  const patientName = patient?.nome_social || patient?.nome || 'Paciente';
  const doctorName = doctor?.nome || currentMedico?.nome || 'Profissional responsável';
  const canEdit = Boolean(context && !context.assinado && (isAdmin || (isDoctor && medicoId === context.medico_id)));
  const returnTo = useMemo(() => context
    ? `/prontuarios?paciente=${encodeURIComponent(context.paciente_id)}&prontuario=${encodeURIComponent(context.id)}&secao=anexos`
    : '/prontuarios', [context]);
  const loading = (!isAdmin && isDoctor && medicoLoading) || contextQuery.isLoading;
  const error = (!isAdmin && isDoctor ? medicoError : null) ?? contextQuery.error;
  const dirty = Boolean(selectedFile || category !== 'documento' || description.trim());

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    const problem = file ? getFileProblem(file) : null;
    if (problem && fileInput.current) fileInput.current.value = '';
    setFileError(problem);
    setSelectedFile(file && !problem ? file : null);
    setSaveError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    setSaveError(null);
    if (submitLock.current || !context || !canEdit || !selectedFile || fileError) return;

    submitLock.current = true;
    setUploading(true);
    let uploadedPath: string | null = null;
    let cleanupFailed = false;
    try {
      // This RPC rechecks clinic, actor, responsibility and unsigned state at
      // the point of mutation. The client-side state is only a usability aid.
      await registrarAcessoProntuario(context.id, 'edicao', 'Inclusão de anexo ao prontuário');
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para anexar o arquivo.');

      const extension = selectedFile.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'arquivo';
      const filePath = `${context.id}/${crypto.randomUUID()}.${extension}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, selectedFile);
      if (uploadError) throw uploadError;
      uploadedPath = uploadData?.path || filePath;

      const { error: insertError } = await supabase.from('anexos_prontuario').insert({
        prontuario_id: context.id,
        paciente_id: context.paciente_id,
        nome_arquivo: selectedFile.name,
        tipo_arquivo: selectedFile.type,
        tamanho_bytes: selectedFile.size,
        // The bucket is private; persist its path, never a public URL.
        url_arquivo: filePath,
        categoria: category,
        descricao: description.trim() || null,
        uploaded_by: authData.user.id,
      });
      if (insertError) throw insertError;

      completed.current = true;
      toast.success('Anexo adicionado', { description: 'O arquivo foi vinculado ao prontuário.' });
      navigate(returnTo, { replace: true });
    } catch (uploadFailure) {
      if (uploadedPath) {
        try {
          const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([uploadedPath]);
          if (cleanupError) {
            cleanupFailed = true;
            console.error('Falha ao limpar arquivo após erro no upload:', cleanupError);
          }
        } catch (cleanupError) {
          cleanupFailed = true;
          console.error('Falha ao limpar arquivo após erro no upload:', cleanupError);
        }
      }
      const message = cleanupFailed
        ? 'Não foi possível salvar os dados nem remover o arquivo temporário. Entre em contato com o suporte.'
        : `${mensagemDeErro(uploadFailure)} O arquivo e os campos continuam preenchidos para tentar novamente.`;
      setSaveError(message);
      toast.error('Não foi possível adicionar o anexo', { description: message });
    } finally {
      submitLock.current = false;
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 sm:pb-8">
      <UnsavedChangesGuard dirty={dirty} busy={uploading} completed={completed} />
      <PageHeader
        title="Adicionar anexo ao prontuário"
        description="Vincule um exame, laudo, imagem ou documento à evolução selecionada."
        icon={<Paperclip />}
        actions={<Button type="button" variant="outline" onClick={() => navigate(returnTo)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à ficha</Button>}
      />

      {loading ? (
        <div role="status" className="flex min-h-32 items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />Verificando acesso ao prontuário…
        </div>
      ) : error || !context ? (
        <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-semibold text-foreground">Não foi possível abrir este prontuário</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Confirme o acesso clínico e tente novamente.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {contextQuery.isError && <Button variant="outline" onClick={() => void contextQuery.refetch()}>Tentar novamente</Button>}
            <Button variant="outline" onClick={() => navigate('/prontuarios')}>Voltar aos prontuários</Button>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Contexto do prontuário" className="grid gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:grid-cols-3 sm:divide-x sm:divide-border sm:px-5">
            <div className="min-w-0 sm:pr-4"><p className="text-xs font-medium text-muted-foreground">Paciente</p><p className="mt-1 truncate font-semibold text-foreground">{patientName}</p></div>
            <div className="min-w-0 sm:px-4"><p className="text-xs font-medium text-muted-foreground">Data da evolução</p><p className="mt-1 font-semibold text-foreground">{formatDate(context.data)}</p></div>
            <div className="min-w-0 sm:pl-4"><p className="text-xs font-medium text-muted-foreground">Profissional responsável</p><p className="mt-1 truncate font-semibold text-foreground">{doctorName}</p>{doctor?.crm && <p className="text-xs text-muted-foreground">CRM {doctor.crm}</p>}</div>
          </section>

          {!canEdit ? (
            <section role="alert" className="rounded-xl border border-border bg-muted/30 p-5">
              <h2 className="font-semibold text-foreground">Esta evolução não aceita novos anexos</h2>
              <p className="mt-1 text-sm text-muted-foreground">Somente a administração ou o médico responsável podem adicionar documentos a uma evolução ainda não assinada. Evoluções assinadas permanecem preservadas.</p>
              <Button className="mt-4" variant="outline" onClick={() => navigate(returnTo)}>Voltar à ficha</Button>
            </section>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
                <div className="flex items-start gap-3 border-b border-border pb-4">
                  <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div><h2 className="font-semibold text-foreground">Documento clínico privado</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">O arquivo ficará em armazenamento privado. O acesso é verificado e registrado antes de qualquer gravação.</p></div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medical-attachment-file">Arquivo <span aria-hidden="true">*</span></Label>
                  <Input ref={fileInput} id="medical-attachment-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" onChange={handleFileChange} disabled={uploading} aria-invalid={attempted && (!selectedFile || Boolean(fileError))} aria-describedby="medical-attachment-file-help" />
                  <p id="medical-attachment-file-help" className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP ou PDF · até 10 MB</p>
                  {attempted && !selectedFile && !fileError && <p role="alert" className="text-sm text-destructive">Selecione um arquivo para continuar.</p>}
                  {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
                  {selectedFile && <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"><FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-medium" title={selectedFile.name}>{selectedFile.name}</p><p className="text-xs text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p></div></div>}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="attachment-category">Categoria</Label><Select value={category} onValueChange={setCategory} disabled={uploading}><SelectTrigger id="attachment-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="attachment-description">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></Label><Textarea id="attachment-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto útil para localizar este documento depois." rows={3} disabled={uploading} /></div>
                </div>

                {saveError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-foreground">{saveError}</div>}

                <div data-testid="attachment-actions" className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => navigate(returnTo)}>Cancelar</Button>
                  <Button type="submit" disabled={uploading || !selectedFile || Boolean(fileError)}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{uploading ? 'Enviando…' : 'Adicionar anexo'}</Button>
                </div>
              </section>
            </form>
          )}
        </>
      )}
    </div>
  );
}
