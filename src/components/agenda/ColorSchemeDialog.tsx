import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { ColorCriterion, ColorScheme, PALETTE } from './hooks/useAgendaColorScheme';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scheme: ColorScheme;
  onSave: (s: ColorScheme) => void;
  medicos: any[];
  convenios: any[];
  tipos: any[];
}

const STATUS_KEYS: [string, string][] = [
  ['agendado', 'Agendado'],
  ['confirmado', 'Confirmado'],
  ['aguardando', 'Aguardando'],
  ['em_atendimento', 'Em atendimento'],
  ['finalizado', 'Finalizado'],
  ['cancelado', 'Cancelado'],
  ['faltou', 'Faltou'],
];

export function ColorSchemeDialog({ open, onOpenChange, scheme, onSave, medicos, convenios, tipos }: Props) {
  const [criterion, setCriterion] = useState<ColorCriterion>(scheme.criterion);
  const [map, setMap] = useState<Record<string, string>>(scheme.map);

  useEffect(() => {
    if (open) { setCriterion(scheme.criterion); setMap(scheme.map); }
  }, [open, scheme]);

  const options: { key: string; label: string }[] = (() => {
    switch (criterion) {
      case 'status': return STATUS_KEYS.map(([k, l]) => ({ key: k, label: l }));
      case 'medico': return medicos.map(m => ({ key: m.id, label: `Dr(a). ${m.nome || m.crm}` }));
      case 'convenio': return [{ key: 'particular', label: 'Particular' }, ...convenios.map(c => ({ key: c.id, label: c.nome }))];
      case 'tipo': return tipos.map(t => ({ key: t.nome, label: t.nome }));
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Personalizar cores da agenda</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Colorir por</Label>
            <Select value={criterion} onValueChange={(v) => setCriterion(v as ColorCriterion)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="medico">Médico</SelectItem>
                <SelectItem value="convenio">Convênio</SelectItem>
                <SelectItem value="tipo">Tipo de consulta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {options.map(o => (
              <div key={o.key} className="flex items-center justify-between gap-3 p-2 rounded-md border border-border/60">
                <span className="text-sm truncate flex-1">{o.label}</span>
                <div className="flex gap-1">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => setMap({ ...map, [o.key]: c })}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 transition-transform',
                        map[o.key] === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onSave({ criterion, map }); onOpenChange(false); }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
