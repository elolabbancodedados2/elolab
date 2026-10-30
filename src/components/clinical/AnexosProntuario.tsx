import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { 
  Upload, 
  File, 
  Image, 
  FileText, 
  Trash2, 
  Download, 
  Eye,
  Loader2,
  Paperclip 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { registrarAcessoDocumentoClinico } from '@/lib/clinicalDocumentAudit';
import { clinicalAttachmentStoragePath, createClinicalAttachmentSignedUrl } from '@/lib/clinicalAttachmentStorage';
import { PageHeader } from '@/components/PageHeader';
import { ArrowLeft, Shield } from 'lucide-react';

const BUCKET = 'medical-attachments';

interface Anexo {
  id: string;
  nome_arquivo: string;
  tipo_arquivo: string;
  tamanho_bytes: number | null;
  /** Path do arquivo no bucket (registros antigos podem conter uma URL). */
  url_arquivo: string;
  categoria: string | null;
  descricao: string | null;
  created_at: string | null;
}

interface AnexosProntuarioProps {
  prontuarioId: string;
  pacienteId: string;
  anexos: Anexo[];
  onAnexoRemovido: () => void;
  onOpenPreview?: (anexoId: string) => void;
  onAdicionarAnexo?: () => void;
  readOnly?: boolean;
  podeGerenciarPortal?: boolean;
  portalAnexoId?: string | null;
  patientName?: string;
  onManagePortal?: (anexoId: string) => void;
  onClosePortalPage?: () => void;
  portalPageError?: unknown;
  onRetryPortalPage?: () => void;
  portalPageLoading?: boolean;
}

interface PublicacaoPortal {
  anexo_id: string;
  publicado: boolean;
  validade_ate: string | null;
  origem: 'clinica' | 'externo';
  publicado_em?: string | null;
}

const CATEGORIAS = [
  { value: 'exame', label: 'Exame' },
  { value: 'laudo', label: 'Laudo' },
  { value: 'imagem', label: 'Imagem Médica' },
  { value: 'receita', label: 'Receita' },
  { value: 'atestado', label: 'Atestado' },
  { value: 'documento', label: 'Documento' },
  { value: 'outro', label: 'Outro' },
];

export function AnexosProntuario({ 
  prontuarioId, 
  pacienteId, 
  anexos, 
  onAnexoRemovido,
  onOpenPreview,
  onAdicionarAnexo,
  readOnly = false,
  podeGerenciarPortal = false,
  portalAnexoId,
  patientName,
  onManagePortal,
  onClosePortalPage,
  portalPageError,
  onRetryPortalPage,
  portalPageLoading = false,
}: AnexosProntuarioProps) {
  const [loading, setLoading] = useState(false);
  const [publicacoesPortal, setPublicacoesPortal] = useState<Record<string, PublicacaoPortal>>({});
  const [portalStatusLoading, setPortalStatusLoading] = useState(true);
  const [portalStatusError, setPortalStatusError] = useState(false);
  const [portalOrigin, setPortalOrigin] = useState<'clinica' | 'externo'>('clinica');
  const [portalValidity, setPortalValidity] = useState('');
  const [savingPortalStatus, setSavingPortalStatus] = useState(false);
  const [portalStatusReload, setPortalStatusReload] = useState(0);
  const [portalMutationError, setPortalMutationError] = useState<string | null>(null);
  const { toast } = useToast();
  const attachmentIds = anexos.map((anexo) => anexo.id).sort().join(',');
  const portalTarget = anexos.find((anexo) => anexo.id === portalAnexoId) ?? null;
  const isPortalPage = Boolean(portalAnexoId);

  useEffect(() => {
    if (!podeGerenciarPortal || !attachmentIds) {
      setPublicacoesPortal({});
      setPortalStatusError(false);
      setPortalStatusLoading(false);
      return;
    }

    let ativo = true;
    setPortalStatusLoading(true);
    setPortalStatusError(false);
    void Promise.resolve(supabase.from('documentos_portal_paciente')
      .select('anexo_id,publicado,validade_ate,origem,publicado_em')
      .in('anexo_id', attachmentIds.split(',')))
      .then(({ data, error }: any) => {
        if (!ativo) return;
        if (error) throw error;
        setPublicacoesPortal(Object.fromEntries((data ?? []).map((item: PublicacaoPortal) => [item.anexo_id, item])));
      })
      .catch((error) => {
        if (!ativo) return;
        setPortalStatusError(true);
        toast({ title: 'Não foi possível verificar as publicações no portal', description: 'Atualize a ficha antes de alterar a disponibilidade.', variant: 'destructive' });
        console.error('Erro ao verificar publicação de anexos no portal:', error);
      })
      .finally(() => { if (ativo) setPortalStatusLoading(false); });
    return () => { ativo = false; };
  }, [attachmentIds, podeGerenciarPortal, portalStatusReload, toast]);

  useEffect(() => {
    if (!portalTarget) return;
    const atual = publicacoesPortal[portalTarget.id];
    setPortalOrigin(atual?.origem ?? 'clinica');
    setPortalValidity(atual?.validade_ate ?? '');
    setPortalMutationError(null);
  }, [portalTarget, publicacoesPortal]);

  const handleSavePortalStatus = async () => {
    if (!portalTarget || savingPortalStatus || portalStatusError || !podeGerenciarPortal) return;
    const atual = publicacoesPortal[portalTarget.id];
    const publicar = !atual?.publicado;
    if (publicar && portalValidity && portalValidity < todaySaoPauloDateOnly()) {
      toast({ title: 'Validade vencida', description: 'Informe hoje ou uma data futura.', variant: 'destructive' });
      return;
    }
    setSavingPortalStatus(true);
    setPortalMutationError(null);
    try {
      const { data, error } = await (supabase as any).rpc('gerenciar_documento_portal_paciente', {
        p_anexo_id: portalTarget.id,
        p_publicado: publicar,
        p_validade_ate: portalValidity || null,
        p_origem: portalOrigin,
      });
      if (error) throw error;
      if (!data || typeof data.publicado !== 'boolean') throw new Error('O servidor não confirmou a disponibilidade do documento.');
      setPublicacoesPortal((current) => ({
        ...current,
        [portalTarget.id]: {
          anexo_id: portalTarget.id,
          publicado: data.publicado,
          validade_ate: data.validade_ate ?? null,
          origem: data.origem ?? portalOrigin,
          publicado_em: data.publicado_em ?? null,
        },
      }));
      toast({ title: publicar ? 'Documento disponibilizado no portal' : 'Documento removido do portal' });
      onClosePortalPage?.();
    } catch (error) {
      setPortalMutationError(error instanceof Error ? error.message : 'Tente novamente.');
      toast({ title: 'Não foi possível atualizar o portal', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSavingPortalStatus(false);
    }
  };

  const handleDelete = async (anexo: Anexo) => {
    if (readOnly) return;
    if (!confirm('Deseja realmente excluir este anexo?')) return;

    setLoading(true);
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([clinicalAttachmentStoragePath(anexo.url_arquivo)]);
      if (storageError) throw storageError;

      // Delete from database
      const { error } = await supabase
        .from('anexos_prontuario')
        .delete()
        .eq('id', anexo.id);

      if (error) throw error;

      toast({
        title: 'Anexo excluído',
        description: 'O arquivo foi removido do prontuário.',
      });

      onAnexoRemovido();
    } catch (error) {
      console.error('Erro ao excluir anexo:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o anexo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (anexo: Anexo) => onOpenPreview?.(anexo.id);

  const handleDownload = async (anexo: Anexo) => {
    // Abra a aba durante o gesto do clique. Abrir depois do await costuma ser
    // bloqueado pelo navegador como pop-up não solicitado.
    const aba = window.open('about:blank', '_blank');
    if (aba) aba.opener = null;
    if (!aba) {
      toast({ title: 'Download bloqueado', description: 'Permita a abertura de uma nova aba para baixar este anexo.', variant: 'destructive' });
      return;
    }

    const url = await createClinicalAttachmentSignedUrl(anexo.url_arquivo);
    if (!url) {
      aba.close();
      toast({
        title: 'Erro',
        description: 'Não foi possível baixar o anexo.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await registrarAcessoDocumentoClinico('anexo_prontuario', anexo.id, 'exportacao');
    } catch (error) {
      aba.close();
      toast({ title: 'Não foi possível registrar o download', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
      return;
    }
    aba.location.replace(url);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (tipo: string) => {
    if (tipo.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
    if (tipo === 'application/pdf') return <FileText className="h-8 w-8 text-red-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const getCategoriaLabel = (categoria: string | null) => {
    return CATEGORIAS.find(c => c.value === categoria)?.label || categoria || 'Documento';
  };

  if (isPortalPage) {
    const pageHeader = (description: string) => (
      <PageHeader
        title="Acesso pelo Portal do Paciente"
        description={description}
        icon={<Shield />}
        actions={<Button variant="outline" onClick={onClosePortalPage} className="min-h-10"><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos anexos</Button>}
      />
    );

    if (portalPageLoading) {
      return <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="attachment-portal-page" aria-busy="true">{pageHeader('Restaurando o contexto do anexo…')}<div role="status" className="rounded-lg border p-5 text-sm text-muted-foreground">Carregando documento e disponibilidade…</div></section>;
    }
    if (portalPageError) {
      return <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="attachment-portal-page">{pageHeader('Não foi possível consultar os anexos deste prontuário.')}<div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5"><p className="text-sm">O estado do documento não foi confirmado. Não altere a disponibilidade até carregar os dados novamente.</p><Button variant="outline" onClick={onRetryPortalPage}>Tentar novamente</Button></div></section>;
    }
    if (!portalTarget) {
      return <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="attachment-portal-page">{pageHeader('O documento solicitado não está disponível neste prontuário.')}<div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-5 text-sm">Verifique se o anexo ainda existe e se você está no prontuário correto.</div></section>;
    }

    const publicacaoAtual = publicacoesPortal[portalTarget.id];
    const publicado = publicacaoAtual?.publicado === true;
    return (
      <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="attachment-portal-page">
        <PageHeader
          title={publicado ? 'Documento disponível no portal' : 'Disponibilizar documento no portal'}
          description={`Paciente: ${patientName || 'Paciente atual'} · ${portalTarget.nome_arquivo}`}
          icon={<Shield />}
          actions={<Button variant="outline" onClick={onClosePortalPage} className="min-h-10"><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos anexos</Button>}
        />
        {!podeGerenciarPortal ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm">Seu perfil não pode alterar a disponibilidade de documentos no portal.</div>
        ) : portalStatusLoading ? (
          <div role="status" className="rounded-lg border p-5 text-sm text-muted-foreground">Verificando o estado atual antes de permitir alterações…</div>
        ) : portalStatusError ? (
          <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5"><p className="text-sm">Não foi possível confirmar se o documento já está publicado. Nenhuma alteração foi enviada.</p><Button variant="outline" onClick={() => setPortalStatusReload((value) => value + 1)}>Tentar novamente</Button></div>
        ) : (
          <>
            <div className="rounded-lg border bg-card p-5">
              <h2 className="font-semibold">Documento selecionado</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Arquivo</dt><dd className="break-all font-medium">{portalTarget.nome_arquivo}</dd></div>
                <div><dt className="text-muted-foreground">Categoria</dt><dd>{getCategoriaLabel(portalTarget.categoria)}</dd></div>
                <div><dt className="text-muted-foreground">Tamanho</dt><dd>{formatFileSize(portalTarget.tamanho_bytes)}</dd></div>
                <div><dt className="text-muted-foreground">Paciente</dt><dd>{patientName || 'Paciente atual'}</dd></div>
              </dl>
            </div>
            <p role="note" className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">O paciente recebe um link privado gerado ao abrir o documento. Cada link fica válido por cinco minutos; a publicação não torna o arquivo público.</p>
            {publicado ? (
              <div className="space-y-4 rounded-lg border p-5">
                <div><h2 className="font-semibold">Acesso ativo</h2><p className="mt-1 text-sm text-muted-foreground">{publicacaoAtual.origem === 'externo' ? 'Origem externa' : 'Documento da clínica'} · {publicacaoAtual.validade_ate ? `válido até ${format(new Date(`${publicacaoAtual.validade_ate}T12:00:00`), 'dd/MM/yyyy')}` : 'sem vencimento definido'}</p></div>
                {portalMutationError && <p role="alert" className="text-sm text-destructive">A revogação não foi confirmada: {portalMutationError}</p>}
                <Button variant="destructive" onClick={handleSavePortalStatus} disabled={savingPortalStatus} className="min-h-10">{savingPortalStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Revogar acesso ao documento</Button>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border p-5">
                <h2 className="font-semibold">Definir disponibilidade</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="origem-documento-portal">Origem do documento</Label><Select value={portalOrigin} onValueChange={(value: 'clinica' | 'externo') => setPortalOrigin(value)}><SelectTrigger id="origem-documento-portal"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clinica">Da clínica</SelectItem><SelectItem value="externo">Externo</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="validade-documento-portal">Validade do acesso</Label><Input id="validade-documento-portal" type="date" min={todaySaoPauloDateOnly()} value={portalValidity} onChange={(event) => setPortalValidity(event.target.value)} /><p className="text-xs text-muted-foreground">Deixe em branco para não definir vencimento.</p></div>
                </div>
                {portalMutationError && <p role="alert" className="text-sm text-destructive">A publicação não foi confirmada: {portalMutationError}. Revise o estado e tente novamente.</p>}
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={onClosePortalPage} disabled={savingPortalStatus}>Cancelar</Button><Button onClick={handleSavePortalStatus} disabled={savingPortalStatus} className="min-h-10">{savingPortalStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Disponibilizar no portal</Button></div>
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Anexos</CardTitle>
              {anexos.length > 0 && (
                <Badge variant="secondary">{anexos.length}</Badge>
              )}
            </div>
            <Button onClick={onAdicionarAnexo} size="sm" disabled={readOnly}>
              <Upload className="h-4 w-4 mr-2" />
              Adicionar Anexo
            </Button>
          </div>
          <CardDescription>
            Exames, laudos, imagens e outros documentos do prontuário
          </CardDescription>
        </CardHeader>
        <CardContent>
          {anexos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Paperclip className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum anexo adicionado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {anexos.map((anexo) => (
                <div
                  key={anexo.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {getFileIcon(anexo.tipo_arquivo)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" title={anexo.nome_arquivo}>
                        {anexo.nome_arquivo}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {getCategoriaLabel(anexo.categoria)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(anexo.tamanho_bytes)}
                        </span>
                      </div>
                      {anexo.descricao && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {anexo.descricao}
                        </p>
                      )}
                      {anexo.created_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(anexo.created_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      )}
                      {podeGerenciarPortal && !portalStatusLoading && !portalStatusError && publicacoesPortal[anexo.id]?.publicado && (
                        <p className="text-xs text-emerald-700 mt-2">
                          Disponível no portal · {publicacoesPortal[anexo.id].origem === 'externo' ? 'Origem externa' : 'Documento da clínica'} · {publicacoesPortal[anexo.id].validade_ate ? `válido até ${format(new Date(`${publicacoesPortal[anexo.id].validade_ate}T12:00:00`), 'dd/MM/yyyy')}` : 'sem vencimento'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1 mt-3">
                    {podeGerenciarPortal && !portalStatusLoading && !portalStatusError && (
                      <Button
                        variant={publicacoesPortal[anexo.id]?.publicado ? 'outline' : 'secondary'}
                        size="sm"
                        aria-label={`${publicacoesPortal[anexo.id]?.publicado ? 'Revogar documento do portal' : 'Disponibilizar no portal'} para ${anexo.nome_arquivo}`}
                        id={`portal-trigger-${anexo.id}`}
                        onClick={() => onManagePortal?.(anexo.id)}
                      >
                        {publicacoesPortal[anexo.id]?.publicado ? 'Revogar do portal' : 'Disponibilizar no portal'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Visualizar anexo ${anexo.nome_arquivo}`}
                      onClick={() => handlePreview(anexo)}
                      disabled={!onOpenPreview}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Baixar anexo ${anexo.nome_arquivo}`}
                      onClick={() => handleDownload(anexo)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Excluir anexo ${anexo.nome_arquivo}`}
                      onClick={() => handleDelete(anexo)}
                      disabled={loading || readOnly}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
