import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isValidDateOnly } from '@/lib/dateOnly';

export interface DadosRecursoEmLote { justificativa: string; prazo: string; responsavelId: string }

interface Props {
  open: boolean;
  quantidade: number;
  responsaveis: ReadonlyArray<{ id: string; nome: string | null }>;
  salvando: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmar: (dados: DadosRecursoEmLote) => void;
}

/** Mesma justificativa, prazo e responsável para várias glosas do mesmo motivo. */
export function RecursoGlosaEmLoteDialog({ open, quantidade, responsaveis, salvando, onOpenChange, onConfirmar }: Props) {
  const [justificativa, setJustificativa] = useState('');
  const [prazo, setPrazo] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const valido = justificativa.trim().length >= 10 && isValidDateOnly(prazo) && responsaveis.some(r => r.id === responsavelId);

  return <Dialog open={open} onOpenChange={aberto => { if (!salvando) onOpenChange(aberto); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Preparar recurso de {quantidade} glosa{quantidade === 1 ? '' : 's'}</DialogTitle>
        <DialogDescription>A justificativa, o prazo e o responsável valem para todas as glosas selecionadas. Depois, cada uma pode ser revisada separadamente.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="recurso-lote-justificativa">Justificativa</Label><Textarea id="recurso-lote-justificativa" rows={5} maxLength={4000} value={justificativa} onChange={e => setJustificativa(e.target.value)} disabled={salvando} /><p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="recurso-lote-prazo">Prazo para envio</Label><Input id="recurso-lote-prazo" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} disabled={salvando} /></div>
          <div className="space-y-2"><Label htmlFor="recurso-lote-responsavel">Responsável financeiro</Label><Select value={responsavelId} onValueChange={setResponsavelId} disabled={salvando}><SelectTrigger id="recurso-lote-responsavel"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{responsaveis.map(r => <SelectItem key={r.id} value={r.id}>{r.nome || 'Usuário sem nome'}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
        <Button className="min-h-11" disabled={!valido || salvando} onClick={() => onConfirmar({ justificativa: justificativa.trim(), prazo, responsavelId })}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar recursos</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
