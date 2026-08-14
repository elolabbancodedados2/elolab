import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath(stored), 3600);
  if (error) {
    console.error('Erro ao gerar link do anexo:', error);
    return null;
  }
  return data?.signedUrl ?? null;
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
  onAnexoAdicionado: () => void;
  onAnexoRemovido: () => void;
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
  onAnexoAdicionado,
  onAnexoRemovido 
}: AnexosProntuarioProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoria, setCategoria] = useState('documento');
  const [descricao, setDescricao] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'Arquivo muito grande',
          description: 'O tamanho máximo permitido é 10MB.',
          variant: 'destructive',
        });
        return;
      }

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Tipo de arquivo não permitido',
          description: 'Apenas imagens (JPEG, PNG, GIF, WebP) e PDFs são permitidos.',
          variant: 'destructive',
        });
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'Erro',
        description: 'Selecione um arquivo para enviar.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${prontuarioId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('medical-attachments')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('anexos_prontuario')
        .insert({
          prontuario_id: prontuarioId,
          paciente_id: pacienteId,
          nome_arquivo: selectedFile.name,
          tipo_arquivo: selectedFile.type,
          tamanho_bytes: selectedFile.size,
          // Guardamos o PATH, não uma URL. O bucket medical-attachments é
          // privado, então getPublicUrl() gerava um link que nunca abria.
          url_arquivo: fileName,
          categoria,
          descricao: descricao || null,
          uploaded_by: user?.id,
        });

      if (dbError) throw dbError;

      toast({
        title: 'Arquivo enviado',
        description: 'O anexo foi adicionado ao prontuário.',
      });

      setIsOpen(false);
      setSelectedFile(null);
      setCategoria('documento');
      setDescricao('');
      onAnexoAdicionado();
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: 'Erro no upload',
        description: 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (anexo: Anexo) => {
    if (!confirm('Deseja realmente excluir este anexo?')) return;

    setLoading(true);
    try {
      // Delete from storage
      await supabase.storage
        .from('medical-attachments')
        .remove([storagePath(anexo.url_arquivo)]);

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
    setPreviewUrl(url);
    setPreviewType(anexo.tipo_arquivo);
    setIsPreviewOpen(true);
  };

  const handleDownload = async (anexo: Anexo) => {
    const url = await signedUrlFor(anexo.url_arquivo);
    if (!url) {
      toast({
        title: 'Erro',
        description: 'Não foi possível baixar o anexo.',
        variant: 'destructive',
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
            <Button onClick={() => setIsOpen(true)} size="sm">
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
                    </div>
                  </div>
                  <div className="flex justify-end gap-1 mt-3">
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
                      disabled={loading}
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

      {/* Dialog de Upload */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Anexo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Arquivo *</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                onChange={handleFileSelect}
              />
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: JPEG, PNG, GIF, WebP, PDF (máx. 10MB)
              </p>
            </div>

            {selectedFile && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded">
                {getFileIcon(selectedFile.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva o conteúdo do anexo..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar
                </>
              )}
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
