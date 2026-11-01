import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, Paperclip, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { caminhoDocumentoRecurso, situacaoPrazoRecurso, validarDocumentoRecurso } from '@/lib/recursoGlosa';
import { isValidDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';

interface FaturamentoFiltros { tab?: string; buscaLote?: string; statusLote?: string; buscaGlosa?: string; statusGlosa?: string }
interface EstadoRota { filtros?: FaturamentoFiltros }
interface GlosaRecurso {
  id: string; status: string; codigo_glosa: string; valor_glosado: number; motivo: string;
  recurso_justificativa: string | null; recurso_prazo: string | null; recurso_responsavel_id: string | null;
  lotes_tiss: { numero_lote: string; convenios: { nome: string } | null } | null;
}
interface DocumentoRecurso { id: string; storage_path: string; file_name: string; created_at: string }
interface ResponsavelRecurso { id: string; nome: string | null }
interface PayloadRecurso { justificativa: string; prazo: string; responsavelId: string }
interface DocumentoPendente { storagePath: string; fileName: string; contentType: string; byteSize: number }

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export default function RecursoGlosaTissPage() {
  const { glosaId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id ?? '';
  const completed = useRef(false);
  const initializedFor = useRef('');
  const pendingSave = useRef<PayloadRecurso | null>(null);
  const filtros = (location.state as EstadoRota | null)?.filtros;
  const retornoState = filtros ? { restaurarFiltros: filtros } : undefined;
  const [justificativa, setJustificativa] = useState('');
  const [prazo, setPrazo] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [pendingDocument, setPendingDocument] = useState<DocumentoPendente | null>(null);

  const retorno = useMemo(() => ({ pathname: '/faturamento-convenios', state: retornoState }), [retornoState]);
  const glosaQuery = useQuery({
    queryKey: ['glosa-recurso', clinicId || null, glosaId],
    enabled: !!clinicId && !!glosaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('glosas_convenio')
        .select('id,status,codigo_glosa,valor_glosado,motivo,recurso_justificativa,recurso_prazo,recurso_responsavel_id,lotes_tiss(numero_lote,convenios(nome))')
        .eq('id', glosaId).eq('clinica_id', clinicId).maybeSingle();
      if (error) throw error;
      return data as GlosaRecurso | null;
    },
  });
  const documentosQuery = useQuery({
    queryKey: ['glosa-recurso-documentos', clinicId || null, glosaId],
    enabled: !!clinicId && !!glosaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('glosa_recurso_documentos')
        .select('id,storage_path,file_name,created_at').eq('clinica_id', clinicId).eq('glosa_id', glosaId)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentoRecurso[];
    },
  });
  const responsaveisQuery = useQuery({
    queryKey: ['responsaveis-financeiro', clinicId || null],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_responsaveis_financeiro');
      if (error) throw error;
      return (data ?? []) as ResponsavelRecurso[];
    },
  });
  const glosa = glosaQuery.data;
  const documents = documentosQuery.data ?? [];
  const assigneeOptions = responsaveisQuery.data ?? [];

  useEffect(() => {
    if (!glosa || initializedFor.current === glosa.id) return;
    initializedFor.current = glosa.id;
    setJustificativa(glosa.recurso_justificativa ?? '');
    setPrazo(glosa.recurso_prazo ?? '');
    setResponsavelId(glosa.recurso_responsavel_id ?? '');
  }, [glosa]);

  const eligible = glosa && ['pendente', 'recurso_preparacao'].includes(glosa.status);
  const pendingStatus = glosa?.status === 'pendente';
  const prazoInfo = situacaoPrazoRecurso(prazo || null, todaySaoPauloDateOnly());
  const dirty = !!glosa && (justificativa !== (glosa.recurso_justificativa ?? '') || prazo !== (glosa.recurso_prazo ?? '') || responsavelId !== (glosa.recurso_responsavel_id ?? ''));
  const busy = saving || uploading;

  async function persistir(payload: PayloadRecurso) {
    if (!glosa || !clinicId) throw new Error('Glosa ou clínica não identificada. Atualize a tela e tente novamente.');
    const { data: preparation, error: preparationError } = await (supabase as any).rpc('atualizar_glosa_convenio', {
      p_glosa_id: glosa.id,
      p_status: 'recurso_preparacao',
      p_recurso_justificativa: payload.justificativa,
      p_valor_recuperado: null,
    });
    if (preparationError) throw preparationError;
    if (!preparation?.success) throw new Error('A glosa mudou de status. Atualize a lista antes de continuar.');

    const { error } = await supabase.rpc('definir_recurso_glosa', {
      p_glosa_id: glosa.id,
      p_prazo: payload.prazo,
      p_responsavel_id: payload.responsavelId,
    });
    if (error) throw error;
  }

  async function salvar(payload?: PayloadRecurso) {
    if (!glosa || !eligible) return;
    const tentativa = payload ?? {
      justificativa: justificativa.trim(), prazo, responsavelId,
    };
    if (tentativa.justificativa.length < 10) return toast.error('Descreva a justificativa do recurso com pelo menos 10 caracteres.');
    if (!isValidDateOnly(tentativa.prazo) || !assigneeOptions.some(item => item.id === tentativa.responsavelId)) {
      return toast.error('Informe um prazo válido e selecione um responsável financeiro.');
    }
    pendingSave.current = tentativa;
    setSaving(true);
    setErro('');
    try {
      await persistir(tentativa);
      pendingSave.current = null;
      completed.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] }),
        queryClient.invalidateQueries({ queryKey: ['glosa-recurso', clinicId, glosaId] }),
        queryClient.invalidateQueries({ queryKey: ['glosa-recurso-documentos'] }),
      ]);
      toast.success(pendingStatus ? 'Recurso preparado.' : 'Recurso atualizado.');
      navigate(retorno.pathname, { replace: true, state: retorno.state });
    } catch (error) {
      setErro(mensagemDeErro(error));
    } finally {
      setSaving(false);
    }
  }

  async function registrarDocumento(pendente: DocumentoPendente) {
    if (!glosa) return;
    setUploading(true);
    setDocumentError('');
    try {
      const { error } = await supabase.rpc('registrar_documento_recurso_glosa', {
        p_glosa_id: glosa.id,
        p_storage_path: pendente.storagePath,
        p_file_name: pendente.fileName,
        p_content_type: pendente.contentType,
        p_byte_size: pendente.byteSize,
      });
      if (error) throw error;
      setPendingDocument(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['glosa-recurso-documentos'] }),
        queryClient.invalidateQueries({ queryKey: ['glosa-recurso-documentos', clinicId, glosaId] }),
      ]);
      toast.success('Documento anexado ao recurso.');
    } catch (error) {
      setDocumentError(mensagemDeErro(error));
    } finally {
      setUploading(false);
    }
  }

  async function anexar(file?: File) {
    if (!glosa || !file) return;
    const validation = validarDocumentoRecurso(file);
    if (validation) { toast.error(validation); return; }
    setUploading(true);
    setDocumentError('');
    try {
      const storagePath = caminhoDocumentoRecurso(clinicId, glosa.id, file.name, crypto.randomUUID());
      const { error } = await supabase.storage.from('recursos-glosa').upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const pending = { storagePath, fileName: file.name, contentType: file.type, byteSize: file.size };
      setPendingDocument(pending);
      setUploading(false);
      await registrarDocumento(pending);
    } catch (error) {
      setDocumentError(mensagemDeErro(error));
      setUploading(false);
    }
  }

  async function abrirDocumento(storagePath: string) {
    const { data, error } = await supabase.storage.from('recursos-glosa').createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) { toast.error('Não foi possível abrir o documento.', { description: error?.message }); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (!clinicId) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para preparar recursos." /></div>;
  if (glosaQuery.isLoading || responsaveisQuery.isLoading || documentosQuery.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  if (glosaQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar a glosa" error={glosaQuery.error} onRetry={() => void glosaQuery.refetch()} /></div>;
  if (responsaveisQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar os responsáveis" error={responsaveisQuery.error} onRetry={() => void responsaveisQuery.refetch()} /></div>;
  if (documentosQuery.isError) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar os documentos" error={documentosQuery.error} onRetry={() => void documentosQuery.refetch()} /></div>;
  if (!glosa) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Glosa não encontrada" icon={<FileText />} actions={<Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} /><p className="text-sm text-muted-foreground">O registro não existe ou não está disponível para esta clínica.</p></div>;
  if (!eligible) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Preparação indisponível" description="Apenas glosas pendentes ou em preparação podem ser revisadas." icon={<FileText />} actions={<Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} /><Card><CardContent className="pt-6 text-sm text-muted-foreground">Status atual: <Badge variant="outline" className="capitalize">{glosa.status.replace(/_/g, ' ')}</Badge></CardContent></Card></div>;

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title={pendingStatus ? 'Preparar recurso de glosa' : 'Revisar recurso de glosa'} description="Documente a justificativa, o prazo e o responsável antes de registrar o envio à operadora." icon={<FileText />} actions={<Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })} disabled={busy}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao faturamento</Button>} />
    <Card>
      <CardHeader className="border-b border-border/70"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">Identificação da glosa</CardTitle><p className="mt-1 text-sm text-muted-foreground">Lote {glosa.lotes_tiss?.numero_lote ?? '—'} · {glosa.lotes_tiss?.convenios?.nome ?? 'Convênio'}</p></div><Badge variant="outline" className="capitalize">{glosa.status.replace(/_/g, ' ')}</Badge></div></CardHeader>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Código</p><p className="mt-1 font-medium">{glosa.codigo_glosa}</p></div><div><p className="text-xs text-muted-foreground">Valor glosado</p><p className="mt-1 font-medium tabular-nums">{brl(Number(glosa.valor_glosado))}</p></div><div><p className="text-xs text-muted-foreground">Motivo informado</p><p className="mt-1 text-sm">{glosa.motivo}</p></div></CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">Preparação do recurso</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="tiss-recurso-justificativa">Justificativa</Label><Textarea id="tiss-recurso-justificativa" rows={6} maxLength={4000} value={justificativa} onChange={event => setJustificativa(event.target.value)} disabled={busy || !!erro} placeholder="Explique por que a cobrança deve ser revista pela operadora." /><p className="text-xs text-muted-foreground">Mínimo de 10 caracteres. O status só muda para “Preparando recurso” ao salvar.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="tiss-recurso-prazo">Prazo para envio</Label><Input id="tiss-recurso-prazo" type="date" value={prazo} onChange={event => setPrazo(event.target.value)} disabled={busy || !!erro} />{prazoInfo && <p className={`text-xs ${prazoInfo === 'vencido' ? 'text-destructive' : prazoInfo === 'vence_em_breve' ? 'text-warning-foreground' : 'text-muted-foreground'}`}>{prazoInfo === 'vencido' ? 'Prazo vencido' : prazoInfo === 'vence_em_breve' ? 'Prazo vence em até 3 dias' : 'Prazo vigente'}</p>}</div><div className="space-y-2"><Label htmlFor="tiss-recurso-responsavel">Responsável financeiro</Label><select id="tiss-recurso-responsavel" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={responsavelId} onChange={event => setResponsavelId(event.target.value)} disabled={busy || !!erro}><option value="">Selecione um responsável</option>{assigneeOptions.map(person => <option key={person.id} value={person.id}>{person.nome || 'Usuário sem nome'}</option>)}</select>{assigneeOptions.length === 0 && <p className="text-xs text-warning-foreground">Nenhum responsável financeiro disponível para esta clínica.</p>}</div></div>
        {erro && <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{erro}</p><p className="text-xs">A justificativa, o prazo e o responsável foram preservados. A primeira etapa pode ter sido registrada; a repetição usa os mesmos dados.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button size="sm" variant="outline" onClick={() => { pendingSave.current = null; setErro(''); }}>Editar e conferir</Button><Button size="sm" onClick={() => pendingSave.current && void salvar(pendingSave.current)}>Repetir a mesma tentativa</Button></div></div>}
        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => navigate(retorno.pathname, { state: retorno.state })} disabled={busy}>Cancelar</Button><Button onClick={() => void salvar()} disabled={busy || !!erro || justificativa.trim().length < 10 || !prazo || !responsavelId}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{pendingStatus ? 'Salvar preparação' : 'Salvar alterações'}</Button></div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4" />Documentos de apoio</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="tiss-recurso-documento">Anexar PDF, JPEG ou PNG (até 10 MB)</Label><Input id="tiss-recurso-documento" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || !!pendingDocument} onChange={event => { void anexar(event.target.files?.[0]); event.target.value = ''; }} />{documents.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p> : <ul className="divide-y divide-border rounded-lg border">{documents.map(doc => <li key={doc.id} className="flex items-center justify-between gap-3 p-3"><span className="truncate text-sm">{doc.file_name}</span><Button type="button" variant="outline" size="sm" onClick={() => void abrirDocumento(doc.storage_path)}>Abrir</Button></li>)}</ul>}</div>
        {pendingDocument && <div role="alert" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"><p>O arquivo {pendingDocument.fileName} já foi enviado ao armazenamento, mas ainda falta registrar seus dados no recurso.</p>{documentError && <p className="text-destructive">{documentError}</p>}<Button size="sm" onClick={() => void registrarDocumento(pendingDocument)} disabled={busy}>{uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Repetir registro do mesmo arquivo</Button></div>}
        {!pendingDocument && documentError && <p role="alert" className="text-sm text-destructive">Não foi possível enviar o documento: {documentError}</p>}
      </CardContent>
    </Card>
    <div role="note" className="rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">Depois de salvar, a lista permite registrar que o recurso foi enviado. Essa marcação deve ocorrer somente após o envio pelo canal oficial da operadora.</div>
    <UnsavedChangesGuard dirty={dirty} busy={busy} completed={completed} />
  </div>;
}
