import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, Database, Trash2, HardDrive, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  downloadBackup, 
  validateBackup, 
  restoreBackup, 
  getStorageStats,
  BackupData 
} from '@/lib/backup';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLLECTION_LABELS: Record<string, string> = {
  pacientes: 'Pacientes',
  agendamentos: 'Agendamentos',
  prontuarios: 'Prontuários',
  prescricoes: 'Prescrições',
  atestados: 'Atestados',
  lancamentos: 'Lançamentos Financeiros',
  estoque: 'Itens de Estoque',
  convenios: 'Convênios',
  salas: 'Salas',
  fila_atendimento: 'Fila de Atendimento',
  templates_prescricao: 'Templates de Prescrição',
  templates_atestado: 'Templates de Atestado',
  medicos: 'Médicos',
  funcionarios: 'Funcionários',
  exames: 'Exames',
  encaminhamentos: 'Encaminhamentos',
  lista_espera: 'Lista de Espera',
};

export function BackupRestore() {
  const [stats, setStats] = useState<{ used: string; collections: Record<string, number> }>({ used: 'Carregando...', collections: {} });
  const [previewData, setPreviewData] = useState<BackupData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number; tabela: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    getStorageStats().then(setStats);
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setProgresso(null);
    try {
      const { backup } = await downloadBackup((feitas, total, tabela) =>
        setProgresso({ feitas, total, tabela }),
      );

      // "Backup criado com sucesso" num arquivo pela metade é a mentira mais
      // cara deste sistema: só se descobre no dia de restaurar.
      if (!backup.completo) {
        const falhas = backup.metadata.tabelasComFalha;
        const cortadas = backup.metadata.tabelasTruncadas;
        toast({
          title: 'Backup INCOMPLETO — o arquivo saiu com "PARCIAL" no nome',
          description: [
            falhas.length ? `Não consegui ler: ${falhas.slice(0, 3).join('; ')}${falhas.length > 3 ? ` e mais ${falhas.length - 3}` : ''}.` : '',
            cortadas.length ? `Cortadas no limite: ${cortadas.join(', ')}.` : '',
            'Não use este arquivo como backup único.',
          ].filter(Boolean).join(' '),
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Backup completo baixado',
          description: `${backup.metadata.totalRecords.toLocaleString('pt-BR')} registros de ${backup.metadata.tablesCount} tabelas.`,
        });
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao criar backup',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
      setProgresso(null);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const validation = validateBackup(data);
        
        if (!validation.valid) {
          toast({
            title: 'Erro no arquivo',
            description: validation.error,
            variant: 'destructive',
          });
          return;
        }

        setPreviewData(validation.backup!);
        setShowPreview(true);
      } catch {
        toast({
          title: 'Erro ao ler arquivo',
          description: 'O arquivo não é um JSON válido.',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!previewData) return;
    
    setRestoring(true);
    try {
      const result = await restoreBackup(previewData, overwrite);

      setShowPreview(false);
      const newStats = await getStorageStats();
      setStats(newStats);

      if (result.success) {
        toast({
          title: 'Backup restaurado',
          description: `${result.restored.toLocaleString('pt-BR')} registros em ${result.porTabela.length} tabelas.`,
        });
      } else {
        // Restauração parcial deixa o banco num estado que ninguém consegue
        // avaliar de fora. Dizer quais tabelas falharam é o mínimo.
        toast({
          title: `Restauração parcial — ${result.falhas.length} tabela(s) falharam`,
          description: `${result.restored.toLocaleString('pt-BR')} registros entraram. Falhou: ${result.falhas.slice(0, 3).join('; ')}${result.falhas.length > 3 ? ` e mais ${result.falhas.length - 3}` : ''}.`,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao restaurar backup',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Fazer Backup
            </CardTitle>
            <CardDescription>
              Todas as 78 tabelas da clínica em um arquivo JSON — inclui
              pagamentos, triagem, anexos de prontuário e a trilha de LGPD.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span>{stats.used}</span>
            </div>
            <Button onClick={handleDownload} className="w-full" disabled={downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? 'Exportando...' : 'Baixar Backup'}
            </Button>
            {progresso && (
              // São 78 tabelas: sem isto o botão fica "Exportando..." por um
              // minuto e a pessoa acha que travou e recarrega a página.
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((progresso.feitas / progresso.total) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {progresso.feitas} de {progresso.total} tabelas
                  {progresso.tabela ? ` · ${progresso.tabela}` : ''}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Restore */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Restaurar Backup
            </CardTitle>
            <CardDescription>
              Carregue um arquivo de backup para restaurar os dados no Supabase
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="mr-2 h-4 w-4" />
              Selecionar Arquivo
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Current Data Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Dados Atuais no Supabase
          </CardTitle>
          <CardDescription>
            Resumo dos registros armazenados no banco de dados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(stats.collections)
              .filter(([_, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([collection, count]) => (
                <div key={collection} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">{COLLECTION_LABELS[collection] || collection}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pré-visualização do Backup</DialogTitle>
            <DialogDescription>
              Revise os dados antes de restaurar
            </DialogDescription>
          </DialogHeader>
          
          {previewData && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Data do backup:</span>
                  <p className="font-medium">
                    {format(new Date(previewData.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total de registros:</span>
                  <p className="font-medium">{previewData.metadata.totalRecords}</p>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Object.entries(previewData.metadata.collectionCounts)
                  .filter(([_, count]) => count > 0)
                  .map(([collection, count]) => (
                    <div key={collection} className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded">
                      <span className="text-sm">{COLLECTION_LABELS[collection] || collection}</span>
                      <Badge>{count} registros</Badge>
                    </div>
                  ))}
              </div>

              <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                <AlertTriangle className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="overwrite">Substituir dados existentes</Label>
                    <Switch id="overwrite" checked={overwrite} onCheckedChange={setOverwrite} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overwrite 
                      ? 'Dados existentes serão atualizados' 
                      : 'Apenas novos registros serão adicionados'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRestore} disabled={restoring}>
              {restoring ? (
                <>Restaurando...</>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Restaurar Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
