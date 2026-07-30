import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, Plus, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { LoadingButton } from '@/components/ui/loading-button';

interface Bloqueio {
  id: string;
  medico_id: string;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  dia_inteiro: boolean;
  motivo: string | null;
  tipo: string;
}

interface BloqueioAgendaProps {
  medicoIdFilter?: string;
}

export function BloqueioAgenda({ medicoIdFilter }: BloqueioAgendaProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    medico_id: medicoIdFilter || '',
    data_inicio: '',
    data_fim: '',
    hora_inicio: '',
    hora_fim: '',
    dia_inteiro: true,
    motivo: '',
    tipo: 'bloqueio',
  });

  const [salvando, setSalvando] = useState(false);
  const queryClient = useQueryClient();
  const { data: medicos = [] } = useMedicos();
  const { data: bloqueios = [], isLoading } = useSupabaseQuery<Bloqueio>('bloqueios_agenda', {
    orderBy: { column: 'data_inicio', ascending: true },
    ...(medicoIdFilter ? { filters: [{ column: 'medico_id', operator: 'eq', value: medicoIdFilter }] } : {}),
  });

  const getMedicoLabel = (id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `Dr(a). ${m.nome || m.crm} - ${m.especialidade || 'Geral'}` : id;
  };

  const handleSave = async () => {
    if (!form.medico_id || !form.data_inicio || !form.data_fim) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from('bloqueios_agenda' as any).insert({
      medico_id: form.medico_id,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      hora_inicio: form.dia_inteiro ? null : form.hora_inicio || null,
      hora_fim: form.dia_inteiro ? null : form.hora_fim || null,
      dia_inteiro: form.dia_inteiro,
      motivo: form.motivo || null,
      tipo: form.tipo,
    });

    if (error) {
      toast.error('Erro ao criar bloqueio');
      console.error(error);
    } else {
      toast.success('Horário bloqueado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['bloqueios_agenda'] });
      setDialogOpen(false);
      setForm({ medico_id: medicoIdFilter || '', data_inicio: '', data_fim: '', hora_inicio: '', hora_fim: '', dia_inteiro: true, motivo: '', tipo: 'bloqueio' });
    }
    setSalvando(false);
  };

  const handleDelete = async (id: string) => {
    const { data, error } = await (supabase.from('bloqueios_agenda' as any).delete().eq('id', id).select('id') as any);
    if (error) {
      toast.error('Erro ao remover bloqueio');
    } else if (!data || data.length === 0) {
      toast.error('Sem permissão para remover este bloqueio.');
    } else {
      toast.success('Bloqueio removido');
      queryClient.invalidateQueries({ queryKey: ['bloqueios_agenda'] });
    }
  };

  const tipoLabels: Record<string, string> = {
    bloqueio: 'Bloqueio',
    ferias: 'Férias',
    almoco: 'Almoço',
    reuniao: 'Reunião',
    folga: 'Folga',
  };

  const tipoBadgeVariant = (tipo: string) => {
    switch (tipo) {
      case 'ferias': return 'bg-info/10 text-info border-info/20';
      case 'almoco': return 'bg-warning/10 text-warning border-warning/20';
      case 'reuniao': return 'bg-primary/10 text-primary border-primary/20';
      default: return 'bg-destructive/10 text-destructive border-destructive/20';
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Ban className="h-4 w-4" />
            Bloqueios de Horário
          </CardTitle>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Bloquear
          </Button>
        </CardHeader>
        <CardContent>
          {bloqueios.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum bloqueio cadastrado</p>
          ) : (
            <div className="space-y-2">
              {bloqueios.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <Ban className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{getMedicoLabel(b.medico_id)}</span>
                        <Badge variant="outline" className={cn("text-[10px]", tipoBadgeVariant(b.tipo))}>
                          {tipoLabels[b.tipo] || b.tipo}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(b.data_inicio), "dd/MM/yyyy")} 
                        {b.data_inicio !== b.data_fim && ` - ${format(parseISO(b.data_fim), "dd/MM/yyyy")}`}
                        {!b.dia_inteiro && b.hora_inicio && ` • ${b.hora_inicio} - ${b.hora_fim}`}
                        {b.dia_inteiro && ' • Dia inteiro'}
                        {b.motivo && ` • ${b.motivo}`}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Horário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!medicoIdFilter && (
              <div>
                <Label>Médico *</Label>
                <Select value={form.medico_id} onValueChange={(v) => setForm({ ...form, medico_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                  <SelectContent>
                    {medicos.filter(m => m.ativo).map((m) => (
                      <SelectItem key={m.id} value={m.id}>Dr(a). {m.crm} - {m.especialidade || 'Geral'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bloqueio">Bloqueio</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="almoco">Almoço</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="folga">Folga</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início *</Label>
                <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value, data_fim: form.data_fim || e.target.value })} />
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.dia_inteiro} onCheckedChange={(v) => setForm({ ...form, dia_inteiro: v })} />
              <Label>Dia inteiro</Label>
            </div>
            {!form.dia_inteiro && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Hora Início</Label>
                  <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
                </div>
                <div>
                  <Label>Hora Fim</Label>
                  <Input type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
                </div>
              </div>
            )}
            <div>
              <Label>Motivo</Label>
              <Textarea value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ex: Férias, Congresso médico..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <LoadingButton onClick={handleSave} isLoading={salvando} loadingText="Salvando...">
              Salvar Bloqueio
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
