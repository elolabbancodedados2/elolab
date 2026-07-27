import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, FileText, Loader2, Download, Eye, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface NotaFiscalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lancamentoId: string;
  pacienteName: string;
  valor: number;
}

export function NotaFiscalModal({
  open,
  onOpenChange,
  lancamentoId,
  pacienteName,
  valor,
}: NotaFiscalModalProps) {
  const [nfeData, setNfeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open && lancamentoId) {
      loadNotaFiscal();
    }
  }, [open, lancamentoId]);

  const loadNotaFiscal = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('notas_fiscais')
        .select('*')
        .eq('lancamento_id', lancamentoId)
        .maybeSingle();

      setNfeData(data);
    } catch (e) {
      console.error('Erro ao carregar NF-e:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleGerarNFe = async () => {
    setGenerating(true);
    try {
      // Call edge function to generate NFe
      const { data: response, error } = await supabase.functions.invoke(
        'generate-nfe',
        {
          body: {
            lancamento_id: lancamentoId,
            paciente_nome: pacienteName,
            valor,
          },
        }
      );

      if (error) throw error;

      // Reload the NFe data
      await loadNotaFiscal();
      toast.success('Nota Fiscal gerada com sucesso!');
    } catch (e: any) {
      toast.error('Erro ao gerar NF-e: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="secondary">Pendente</Badge>;
      case 'enviada':
        return <Badge className="bg-blue-500">Enviada para SEFAZ</Badge>;
      case 'autorizada':
        return <Badge className="bg-green-500">Autorizada</Badge>;
      case 'cancelada':
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Nota Fiscal Eletrônica
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Patient & Value Info */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <p className="text-sm font-medium">{pacienteName}</p>
            <p className="text-xs text-muted-foreground">
              Valor: <span className="font-semibold">R$ {valor.toFixed(2)}</span>
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : nfeData ? (
            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                {getStatusBadge(nfeData.status)}
              </div>

              {/* NFe Info */}
              <div className="space-y-2 text-sm">
                {nfeData.numero_nf && (
                  <div>
                    <p className="text-xs text-muted-foreground">Número NF</p>
                    <p className="font-mono font-semibold">{nfeData.numero_nf}</p>
                  </div>
                )}
                {nfeData.serie_nf && (
                  <div>
                    <p className="text-xs text-muted-foreground">Série</p>
                    <p className="font-mono">{nfeData.serie_nf}</p>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              {nfeData.data_emissao && (
                <div className="text-xs text-muted-foreground">
                  Emitida em {new Date(nfeData.data_emissao).toLocaleDateString('pt-BR')}
                </div>
              )}

              {/* DANFE URL */}
              {nfeData.url_danfe && (
                <Button variant="outline" size="sm" className="w-full gap-2 text-primary">
                  <Eye className="h-4 w-4" />
                  Visualizar DANFE
                </Button>
              )}

              {/* Success message for authorized */}
              {nfeData.status === 'autorizada' && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-green-800 dark:text-green-300">
                    <p className="font-semibold">Nota Fiscal Autorizada</p>
                    <p className="text-xs mt-1">
                      Protocolo: <span className="font-mono">{nfeData.numero_autorizacao || '—'}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                  <div>
                    <p className="font-medium text-sm">Nenhuma Nota Fiscal Emitida</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Clique em "Gerar NF-e" para emitir a nota fiscal eletrônica
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info box */}
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-300">
              A Nota Fiscal Eletrônica será automaticamente submetida ao SEFAZ para autorização.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!nfeData ? (
            <Button onClick={handleGerarNFe} disabled={generating} className="gap-2">
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Gerar NF-e
            </Button>
          ) : nfeData.status !== 'autorizada' ? (
            <Button onClick={handleGerarNFe} disabled={generating} variant="secondary">
              {generating ? 'Processando...' : 'Reenviar ao SEFAZ'}
            </Button>
          ) : (
            <Button disabled variant="ghost">
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
              Autorizada
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}