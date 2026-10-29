import { nomeMedico } from '@/lib/formatters';
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
      case 'medico': return medicos.map(m => ({ key: m.id, label: `${nomeMedico(m.nome || m.crm)}` }));
      case 'convenio': return [{ key: 'particular', label: 'Particular' }, ...convenios.map(c => ({ key: c.id, label: c.nome }))];
      case 'tipo': return tipos.map(t => ({ key: t.nome, label: t.nome }));
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pr-10"><DialogTitle>Personalizar cores da agenda</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="agenda-color-criterion">Colorir por</Label>
            <Select value={criterion} onValueChange={(v) => setCriterion(v as ColorCriterion)}>
              <SelectTrigger id="agenda-color-criterion"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="medico">Médico</SelectItem>
                <SelectItem value="convenio">Convênio</SelectItem>
                <SelectItem value="tipo">Tipo de consulta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {options.map(o => {
              const currentColor = map[o.key];
              const isLegacyColor = !!currentColor && !PALETTE.some(color => color.value === currentColor);
              const colors = isLegacyColor
                ? [{ label: 'Cor atual', value: currentColor }, ...PALETTE]
                : PALETTE;

              return (
              <div key={o.key} className="space-y-2 rounded-md border border-border/60 p-2">
                <span className="block truncate text-sm">{o.label}</span>
                <div className="grid grid-cols-[repeat(4,minmax(2.75rem,1fr))] gap-1.5">
                  {colors.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      aria-label={`${c.label === 'Cor atual' ? 'Manter' : 'Usar'} ${c.label === 'Cor atual' ? `cor atual ${c.value}` : c.label} para ${o.label}`}
                      aria-pressed={currentColor === c.value}
                      onClick={() => setMap({ ...map, [o.key]: c.value })}
                      className={cn(
                        'h-11 w-11 rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        currentColor === c.value ? 'border-foreground' : 'border-transparent hover:border-border'
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.label === 'Cor atual' ? `Cor atual: ${c.value}` : c.label}
                    />
                  ))}
                </div>
              </div>
              );
            })}
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
