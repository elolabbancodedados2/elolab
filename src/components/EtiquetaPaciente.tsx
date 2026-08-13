import { useState } from 'react';
import { Printer, Tag, Settings, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { gerarEtiquetaPaciente, downloadPDF, openPDF } from '@/lib/pdfGenerator';
import { Paciente } from '@/types';

interface EtiquetaPacienteProps {
  pacientes: Paciente[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EtiquetaPaciente({ pacientes, open, onOpenChange }: EtiquetaPacienteProps) {
  const [tamanho, setTamanho] = useState<'pequena' | 'media' | 'grande'>('media');
  const [selecionados, setSelecionados] = useState<string[]>(pacientes.map((p) => p.id));
  const { toast } = useToast();

  const handleTogglePaciente = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selecionados.length === pacientes.length) {
      setSelecionados([]);
    } else {
      setSelecionados(pacientes.map((p) => p.id));
    }
  };

  const handleImprimir = async () => {
    const pacientesSelecionados = pacientes
      .filter((p) => selecionados.includes(p.id))
      .map((p) => ({
        nome: p.nome,
        cpf: p.cpf,
        dataNascimento: p.dataNascimento,
        telefone: p.telefone,
        convenio: p.convenio?.nome,
        numeroCarteira: p.convenio?.numeroCarteira,
      }));

    if (pacientesSelecionados.length === 0) {
      toast({
        title: 'Nenhum paciente selecionado',
        description: 'Selecione pelo menos um paciente para imprimir.',
        variant: 'destructive',
      });
      return;
    }

    const doc = await gerarEtiquetaPaciente(pacientesSelecionados, tamanho);
    openPDF(doc);
    onOpenChange(false);

    toast({
      title: 'Etiquetas geradas',
      description: `${pacientesSelecionados.length} etiqueta(s) pronta(s) para impressão.`,
    });
  };

  const handleDownload = async () => {
    const pacientesSelecionados = pacientes
      .filter((p) => selecionados.includes(p.id))
      .map((p) => ({
        nome: p.nome,
        cpf: p.cpf,
        dataNascimento: p.dataNascimento,
        telefone: p.telefone,
        convenio: p.convenio?.nome,
        numeroCarteira: p.convenio?.numeroCarteira,
      }));

    if (pacientesSelecionados.length === 0) {
      toast({
        title: 'Nenhum paciente selecionado',
        description: 'Selecione pelo menos um paciente.',
        variant: 'destructive',
      });
      return;
    }

    const doc = await gerarEtiquetaPaciente(pacientesSelecionados, tamanho);
    downloadPDF(doc, 'etiquetas-pacientes');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Imprimir Etiquetas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Configurações */}
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label>Tamanho da Etiqueta</Label>
              <Select value={tamanho} onValueChange={(v: any) => setTamanho(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pequena">Pequena (80x30mm)</SelectItem>
                  <SelectItem value="media">Média (100x40mm)</SelectItem>
                  <SelectItem value="grande">Grande (120x50mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <p className="text-sm font-medium mb-2">Preview da Etiqueta:</p>
            <div
              className={`border-2 border-dashed rounded p-2 bg-white ${
                tamanho === 'pequena'
                  ? 'w-32 h-12'
                  : tamanho === 'media'
                  ? 'w-40 h-16'
                  : 'w-48 h-20'
              }`}
            >
              <p className="text-xs font-bold truncate">NOME DO PACIENTE</p>
              <p className="text-[8px] text-muted-foreground">CPF: 000.000.000-00</p>
              <p className="text-[8px] text-muted-foreground">Nasc: 01/01/2000</p>
            </div>
          </div>

          {/* Lista de Pacientes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Pacientes ({selecionados.length} de {pacientes.length})</Label>
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                {selecionados.length === pacientes.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </Button>
            </div>
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              {pacientes.map((paciente) => (
                <label
                  key={paciente.id}
                  className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                >
                  <Checkbox
                    checked={selecionados.includes(paciente.id)}
                    onCheckedChange={() => handleTogglePaciente(paciente.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{paciente.nome}</p>
                    <p className="text-sm text-muted-foreground">{paciente.cpf}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Baixar PDF
          </Button>
          <Button onClick={handleImprimir} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
