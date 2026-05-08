import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Shield, Download, Trash2, Search, FileJson, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { usePacientes } from '@/hooks/useSupabaseData';
import { exportPatientData, deletePatientData } from '@/lib/lgpdCompliance';

export default function LgpdPacientes() {
  const { data: pacientes = [], refetch } = usePacientes();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPaciente, setSelectedPaciente] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const filtered = pacientes.filter((p: any) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      p.nome?.toLowerCase().includes(term) ||
      p.cpf?.includes(term) ||
      p.email?.toLowerCase().includes(term)
    );
  });

  const handleExport = async (paciente: any) => {
    setIsProcessing(true);
    try {
      const data = await exportPatientData(paciente.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lgpd-export-${paciente.nome.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Dados de ${paciente.nome} exportados`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao exportar dados');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedPaciente) return;
    setIsProcessing(true);
    try {
      await deletePatientData(selectedPaciente.id, deleteReason);
      toast.success(`Dados de ${selectedPaciente.nome} apagados conforme LGPD`);
      setIsDeleteOpen(false);
      setSelectedPaciente(null);
      setDeleteReason('');
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao apagar dados');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 p-2 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          Direitos do Titular (LGPD)
        </h1>
        <p className="text-muted-foreground mt-1">
          Atender solicitações de portabilidade e direito ao esquecimento (Lei 13.709/2018)
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          A exportação gera um arquivo JSON completo com todos os dados do paciente. A exclusão é
          <strong> irreversível</strong> e remove prontuários, prescrições, exames e anexos.
          Toda ação é registrada em log de auditoria.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Buscar Paciente</CardTitle>
          <CardDescription>Por nome, CPF ou email</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite nome, CPF ou email..."
              className="pl-10"
            />
          </div>

          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {searchTerm && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum paciente encontrado</p>
            )}
            {filtered.slice(0, 30).map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 p-3 border rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.cpf || 'sem CPF'} {p.email ? ` · ${p.email}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(p)}
                    disabled={isProcessing}
                    title="Exportar dados (portabilidade)"
                  >
                    <FileJson className="h-4 w-4 mr-1" />
                    Exportar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setSelectedPaciente(p);
                      setDeleteReason('');
                      setIsDeleteOpen(true);
                    }}
                    disabled={isProcessing}
                    title="Apagar dados (direito ao esquecimento)"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Apagar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar exclusão de dados
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Você está prestes a apagar <strong>todos os dados</strong> do paciente{' '}
                  <strong>{selectedPaciente?.nome}</strong> em conformidade com o direito ao
                  esquecimento da LGPD.
                </p>
                <p className="text-destructive font-medium">
                  Esta ação é irreversível. Prontuários, exames, prescrições e anexos serão removidos.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo da solicitação (registrado no log)</Label>
            <Textarea
              id="reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Ex.: Solicitação do titular conforme art. 18 da LGPD..."
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isProcessing || !deleteReason.trim()}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isProcessing ? 'Apagando...' : 'Confirmar exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
