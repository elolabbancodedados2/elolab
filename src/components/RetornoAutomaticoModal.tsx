import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarClock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RetornoAutomaticoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: RetornoData) => Promise<void>;
  pacienteNome: string;
  medicoNome: string;
  isLoading?: boolean;
}

export interface RetornoData {
  agendar: boolean;
  diasRetorno?: number;
  motivo?: string;
  dataEspecifica?: string;
}

export function RetornoAutomaticoModal({
  open,
  onOpenChange,
  onConfirm,
  pacienteNome,
  medicoNome,
  isLoading,
}: RetornoAutomaticoModalProps) {
  const [agendar, setAgendar] = useState(false);
  const [diasRetorno, setDiasRetorno] = useState('7');
  const [dataEspecifica, setDataEspecifica] = useState('');
  const [motivo, setMotivo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        agendar,
        diasRetorno: agendar ? parseInt(diasRetorno) : undefined,
        dataEspecifica: agendar && dataEspecifica ? dataEspecifica : undefined,
        motivo: agendar && motivo ? motivo : undefined,
      });
      // Reset form
      setAgendar(false);
      setDiasRetorno('7');
      setDataEspecifica('');
      setMotivo('');
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate suggested return date
  const hoje = new Date();
  const dataRetorno = new Date(hoje);
  dataRetorno.setDate(dataRetorno.getDate() + parseInt(diasRetorno || '7'));
  const dataFormatada = dataRetorno.toLocaleDateString('pt-BR');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Retorno Automático
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Patient info */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <p className="text-sm font-medium">{pacienteNome}</p>
            <p className="text-xs text-muted-foreground">Médico: {medicoNome}</p>
          </div>

          {/* Schedule return toggle */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Agendar Retorno?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Card
                className={cn(
                  'cursor-pointer transition-all border-2',
                  !agendar ? 'border-primary bg-primary/5' : 'border-border hover:border-border'
                )}
                onClick={() => setAgendar(false)}
              >
                <CardContent className="pt-4 pb-3 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-success" />
                  <p className="text-sm font-medium">Não</p>
                  <p className="text-xs text-muted-foreground mt-1">Finalizar sem retorno</p>
                </CardContent>
              </Card>

              <Card
                className={cn(
                  'cursor-pointer transition-all border-2',
                  agendar ? 'border-primary bg-primary/5' : 'border-border hover:border-border'
                )}
                onClick={() => setAgendar(true)}
              >
                <CardContent className="pt-4 pb-3 text-center">
                  <CalendarClock className="h-5 w-5 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-medium">Sim</p>
                  <p className="text-xs text-muted-foreground mt-1">Agendar retorno automático</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Return details */}
          {agendar && (
            <div className="space-y-3 pt-2 border-t">
              {/* Dias até retorno */}
              <div className="space-y-1.5">
                <Label htmlFor="dias-retorno" className="text-xs font-medium">
                  Dias até o Retorno
                </Label>
                <Select value={diasRetorno} onValueChange={setDiasRetorno}>
                  <SelectTrigger id="dias-retorno">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 dia</SelectItem>
                    <SelectItem value="3">3 dias</SelectItem>
                    <SelectItem value="7">1 semana</SelectItem>
                    <SelectItem value="14">2 semanas</SelectItem>
                    <SelectItem value="21">3 semanas</SelectItem>
                    <SelectItem value="30">1 mês</SelectItem>
                    <SelectItem value="60">2 meses</SelectItem>
                    <SelectItem value="90">3 meses</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Retorno sugerido: <span className="font-medium text-foreground">{dataFormatada}</span>
                </p>
              </div>

              {/* Data específica */}
              <div className="space-y-1.5">
                <Label htmlFor="data-especifica" className="text-xs font-medium">
                  Data Específica (opcional)
                </Label>
                <Input
                  id="data-especifica"
                  type="date"
                  value={dataEspecifica}
                  onChange={(e) => setDataEspecifica(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Motivo */}
              <div className="space-y-1.5">
                <Label htmlFor="motivo" className="text-xs font-medium">
                  Motivo do Retorno
                </Label>
                <Textarea
                  id="motivo"
                  placeholder="Ex: Avaliar resposta ao tratamento, revisar exames, acompanhamento pós-operatório..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="h-20 resize-none"
                />
              </div>

              {/* Alertas */}
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 space-y-1">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs space-y-0.5">
                    <p className="font-medium text-amber-900 dark:text-amber-200">Lembretes automáticos</p>
                    <p className="text-amber-800 dark:text-amber-300">
                      O paciente receberá lembretes via WhatsApp/SMS:
                      <br />• 1 semana antes
                      <br />• 1 dia antes
                      <br />• 1 hora antes
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || isLoading}
            className="gap-2"
          >
            {isSubmitting || isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {agendar ? 'Agendar Retorno' : 'Finalizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
