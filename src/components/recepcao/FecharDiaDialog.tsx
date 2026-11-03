import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { candidatosAFalta, marcarFaltasSelecionadas, type ConsultaFalta } from '@/lib/fecharDia';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { minutosAgoraSaoPaulo } from '@/lib/proximaVagaLivre';
import { toast } from 'sonner';

export function FecharDiaDialog({ consultas, fila, clinicaId, disabled, onConcluido }: {
  consultas: ConsultaFalta[]; fila: { agendamento_id: string }[]; clinicaId: string; disabled: boolean; onConcluido: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tolerancia, setTolerancia] = useState('15');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const [falhas, setFalhas] = useState<{ id: string; nome: string; motivo: string }[]>([]);
  const candidatas = candidatosAFalta(consultas, fila, todaySaoPauloDateOnly(), minutosAgoraSaoPaulo(), tolerancia.trim() ? Number(tolerancia) : NaN);
  const escolhidas = candidatas.filter(a => selecionadas.includes(a.id));
  const salvar = async () => {
    if (trava.current || !escolhidas.length) return;
    trava.current = true;
    setSalvando(true);
    try {
      const resultado = await marcarFaltasSelecionadas(escolhidas, clinicaId);
      setFalhas(resultado.falhas);
      setSelecionadas([]);
      if (resultado.marcadas.length) toast.success(`${resultado.marcadas.length} falta(s) registrada(s)`);
      onConcluido();
      if (!resultado.falhas.length) setOpen(false);
    } finally { trava.current = false; setSalvando(false); }
  };
  return <>
    <Button variant="outline" disabled={disabled} onClick={() => { setSelecionadas([]); setFalhas([]); setOpen(true); }}>Fechar o dia</Button>
    <Dialog open={open} onOpenChange={value => { if (!salvando) setOpen(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Fechar o dia</DialogTitle><DialogDescription>Marque falta apenas nos selecionados. Pacientes que já chegaram ou foram atendidos ficam fora desta lista.</DialogDescription></DialogHeader>
        <Label htmlFor="tolerancia-falta">Tolerância após o horário (minutos)</Label>
        <Input id="tolerancia-falta" type="number" min="0" step="1" value={tolerancia} disabled={salvando} onChange={e => { setTolerancia(e.target.value); setSelecionadas([]); }} />
        <ul className="max-h-72 space-y-3 overflow-y-auto">{candidatas.map(a => <li key={a.id}><label className="flex items-center gap-2 text-sm">
          <Checkbox checked={selecionadas.includes(a.id)} disabled={salvando} onCheckedChange={checked => setSelecionadas(atual => checked ? [...atual, a.id] : atual.filter(id => id !== a.id))} />
          {a.hora_inicio.slice(0, 5)} · {a.pacientes?.nome_social || a.pacientes?.nome || 'Paciente'}
        </label></li>)}</ul>
        {!candidatas.length && <p>Nenhuma consulta passou da tolerância sem check-in.</p>}
        {falhas.length > 0 && <ul role="alert">{falhas.map(f => <li key={f.id}>{f.nome}: {f.motivo}</li>)}</ul>}
        <DialogFooter><Button variant="outline" disabled={salvando} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={salvando || !escolhidas.length} onClick={() => void salvar()}>{salvando ? 'Registrando…' : `Marcar falta nas selecionadas (${escolhidas.length})`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
