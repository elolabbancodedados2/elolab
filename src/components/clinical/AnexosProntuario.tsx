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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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

const BUCKET = 'medical-attachments';

/**
 * `url_arquivo` guarda o path do arquivo. Registros antigos guardam a URL
 * pública completa (que nunca funcionou, pois o bucket é privado) — para esses,
 * recuperamos o path a partir do final da URL.
 */
function storagePath(stored: string): string {
  if (!stored.startsWith('http')) return stored;
  const afterBucket = stored.split(`/${BUCKET}/`)[1];
  if (afterBucket) return decodeURIComponent(afterBucket.split('?')[0]);
  return stored.split('/').slice(-2).join('/');
}

/** Gera um link temporário (1h) para visualizar ou baixar o anexo. */
async function signedUrlFor(stored: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath(stored), 3600);
    if (error) {
      console.error('Erro ao gerar link do anexo:', error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (error) {
    console.error('Erro ao gerar link do anexo:', error);
    return null;
  }
}

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
  onAdicionarAnexo?: () => void;
  readOnly?: boolean;
  podeGerenciarPortal?: boolean;
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
  onAdicionarAnexo,
  readOnly = false,
  podeGerenciarPortal = false,
}: AnexosProntuarioProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [publicacoesPortal, setPublicacoesPortal] = useState<Record<string, PublicacaoPortal>>({});
  const [portalStatusLoading, setPortalStatusLoading] = useState(true);
  const [portalStatusError, setPortalStatusError] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Anexo | null>(null);
  const [portalOrigin, setPortalOrigin] = useState<'clinica' | 'externo'>('clinica');
  const [portalValidity, setPortalValidity] = useState('');
  const [savingPortalStatus, setSavingPortalStatus] = useState(false);
  const { toast } = useToast();
  const attachmentIds = anexos.map((anexo) => anexo.id).sort().join(',');

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
  }, [attachmentIds, podeGerenciarPortal, toast]);

  const openPortalManager = (anexo: Anexo) => {
    const atual = publicacoesPortal[anexo.id];
    setPortalOrigin(atual?.origem ?? 'clinica');
    setPortalValidity(atual?.validade_ate ?? '');
    setPortalTarget(anexo);
  };

  const handleSavePortalStatus = async () => {
    if (!portalTarget || savingPortalStatus || portalStatusError) return;
    const atual = publicacoesPortal[portalTarget.id];
    const publicar = !atual?.publicado;
    if (publicar && portalValidity && portalValidity < todaySaoPauloDateOnly()) {
      toast({ title: 'Validade vencida', description: 'Informe hoje ou uma data futura.', variant: 'destructive' });
      return;
    }
    setSavingPortalStatus(true);
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
      setPortalTarget(null);
      toast({ title: publicar ? 'Documento disponibilizado no portal' : 'Documento removido do portal' });
    } catch (error) {
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
        .remove([storagePath(anexo.url_arquivo)]);
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

  const handlePreview = async (anexo: Anexo) => {
    const url = await signedUrlFor(anexo.url_arquivo);
    if (!url) {
      toast({
        title: 'Erro',
        description: 'Não foi possível abrir o anexo.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await registrarAcessoDocumentoClinico('anexo_prontuario', anexo.id, 'visualizacao');
    } catch (error) {
      toast({ title: 'Não foi possível registrar o acesso', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
      return;
    }
    setPreviewUrl(url);
    setPreviewType(anexo.tipo_arquivo);
    setIsPreviewOpen(true);
  };

  const handleDownload = async (anexo: Anexo) => {
    // Abra a aba durante o gesto do clique. Abrir depois do await costuma ser
    // bloqueado pelo navegador como pop-up não solicitado.
    const aba = window.open('about:blank', '_blank');
    if (aba) aba.opener = null;
    if (!aba) {
      toast({ title: 'Download bloqueado', description: 'Permita a abertura de uma nova aba para baixar este anexo.', variant: 'destructive' });
      return;
    }

    const url = await signedUrlFor(anexo.url_arquivo);
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
                        onClick={() => openPortalManager(anexo)}
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

      <Dialog open={!!portalTarget} onOpenChange={(open) => { if (!open && !savingPortalStatus) setPortalTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{publicacoesPortal[portalTarget?.id ?? '']?.publicado ? 'Revogar documento do portal' : 'Disponibilizar documento no portal'}</DialogTitle>
            <DialogDescription>
              {portalTarget?.nome_arquivo}. O paciente receberá acesso a um link privado, criado quando abrir o documento e válido por cinco minutos.
            </DialogDescription>
          </DialogHeader>
          {!publicacoesPortal[portalTarget?.id ?? '']?.publicado && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Origem do documento</Label>
                <Select value={portalOrigin} onValueChange={(value: 'clinica' | 'externo') => setPortalOrigin(value)}>
                  <SelectTrigger aria-label="Origem do documento"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinica">Da clínica</SelectItem>
                    <SelectItem value="externo">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="validade-documento-portal">Validade do documento</Label>
                <Input id="validade-documento-portal" type="date" min={todaySaoPauloDateOnly()} value={portalValidity} onChange={(event) => setPortalValidity(event.target.value)} />
                <p className="text-xs text-muted-foreground">Deixe em branco para não definir vencimento.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPortalTarget(null)} disabled={savingPortalStatus}>Cancelar</Button>
            <Button onClick={handleSavePortalStatus} disabled={savingPortalStatus || portalStatusError}>
              {savingPortalStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {publicacoesPortal[portalTarget?.id ?? '']?.publicado ? 'Confirmar revogação do portal' : 'Publicar documento no portal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Preview */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Visualizar Anexo</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[400px]">
            {previewUrl && (
              previewType.startsWith('image/') ? (
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : previewType === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh]"
                  title="PDF Preview"
                />
              ) : (
                <p className="text-muted-foreground">
                  Visualização não disponível para este tipo de arquivo.
                </p>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
