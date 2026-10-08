import { nomeMedico } from '@/lib/formatters';
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
import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/integrations/supabase/client';
import { useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { LoadingButton } from '@/components/ui/loading-button';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  const [bloqueioParaRemover, setBloqueioParaRemover] = useState<Bloqueio | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const medicosQuery = useMedicos();
  const { data: medicos = [] } = medicosQuery;
  const bloqueiosQuery = useSupabaseQuery<Bloqueio>('bloqueios_agenda', {
    orderBy: { column: 'data_inicio', ascending: true },
    ...(medicoIdFilter ? { filters: [{ column: 'medico_id', operator: 'eq', value: medicoIdFilter }] } : {}),
  });
  const { data: bloqueios = [], isLoading } = bloqueiosQuery;

  const getMedicoLabel = (id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `${nomeMedico(m.nome || m.crm)} - ${m.especialidade || 'Geral'}` : id;
  };

  const handleSave = async () => {
    if (!form.medico_id || !form.data_inicio || !form.data_fim) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    const dataValida = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T12:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!dataValida(form.data_inicio) || !dataValida(form.data_fim) || form.data_fim < form.data_inicio) {
      toast.error('Informe um período válido', { description: 'A data final deve ser igual ou posterior à data inicial.' });
      return;
    }

    if (!form.dia_inteiro) {
      const horaValida = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (!horaValida(form.hora_inicio) || !horaValida(form.hora_fim)) {
        toast.error('Informe o horário inicial e final do bloqueio.');
        return;
      }
      if (form.hora_fim <= form.hora_inicio) {
        toast.error('O horário final deve ser posterior ao horário inicial.');
        return;
      }
    }

    setSalvando(true);
    try {
      const { error } = await supabase.from('bloqueios_agenda' as any).insert({
        medico_id: form.medico_id,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        hora_inicio: form.dia_inteiro ? null : form.hora_inicio,
        hora_fim: form.dia_inteiro ? null : form.hora_fim,
        dia_inteiro: form.dia_inteiro,
        motivo: form.motivo.trim() || null,
        tipo: form.tipo,
        clinica_id: profile?.clinica_id || null,
      });

      if (error) throw error;
      toast.success('Horário bloqueado com sucesso');
      void queryClient.invalidateQueries({ queryKey: ['bloqueios_agenda'] });
      setDialogOpen(false);
      setForm({ medico_id: medicoIdFilter || '', data_inicio: '', data_fim: '', hora_inicio: '', hora_fim: '', dia_inteiro: true, motivo: '', tipo: 'bloqueio' });
    } catch (error) {
      toast.error('Erro ao criar bloqueio', { description: mensagemDeErro(error) });
    } finally {
      setSalvando(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a página e tente novamente.');
      return;
    }
    setRemovendoId(id);
    try {
      const { data, error } = await (supabase.from('bloqueios_agenda' as any)
        .delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id') as any);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Bloqueio não encontrado ou sem permissão para remover.');
        return;
      }
      toast.success('Bloqueio removido. Novos agendamentos podem ocupar esse período.');
      void queryClient.invalidateQueries({ queryKey: ['bloqueios_agenda'] });
      setBloqueioParaRemover(null);
    } catch (error) {
      toast.error('Erro ao remover bloqueio', { description: mensagemDeErro(error) });
    } finally {
      setRemovendoId(null);
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
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando bloqueios…</p>
          ) : bloqueiosQuery.isError ? (
            <div className="space-y-2 text-center py-4">
              <p className="text-sm text-destructive">Não foi possível carregar os bloqueios.</p>
              <Button size="sm" variant="outline" onClick={() => void bloqueiosQuery.refetch()}>Tentar novamente</Button>
            </div>
          ) : bloqueios.length === 0 ? (
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
                  <Button variant="ghost" size="icon" aria-label={`Remover bloqueio de ${getMedicoLabel(b.medico_id)}`} onClick={() => setBloqueioParaRemover(b)} disabled={!!removendoId}>
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
                      <SelectItem key={m.id} value={m.id}>{nomeMedico(m.crm)} - {m.especialidade || 'Geral'}</SelectItem>
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
                <Input type="date" required value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value, data_fim: !form.data_fim || form.data_fim < e.target.value ? e.target.value : form.data_fim })} />
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input type="date" required min={form.data_inicio || undefined} value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
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
                  <Input type="time" required value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
                </div>
                <div>
                  <Label>Hora Fim</Label>
                  <Input type="time" required min={form.hora_inicio || undefined} value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
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

      <ConfirmDialog
        open={!!bloqueioParaRemover}
        onOpenChange={(open) => { if (!open && !removendoId) setBloqueioParaRemover(null); }}
        title="Remover bloqueio da agenda?"
        description={bloqueioParaRemover
          ? `Após remover o bloqueio de ${getMedicoLabel(bloqueioParaRemover.medico_id)}, novos agendamentos poderão ocupar ${format(parseISO(bloqueioParaRemover.data_inicio), 'dd/MM/yyyy')}${bloqueioParaRemover.data_inicio !== bloqueioParaRemover.data_fim ? ` a ${format(parseISO(bloqueioParaRemover.data_fim), 'dd/MM/yyyy')}` : ''}${!bloqueioParaRemover.dia_inteiro && bloqueioParaRemover.hora_inicio && bloqueioParaRemover.hora_fim ? `, das ${bloqueioParaRemover.hora_inicio.slice(0, 5)} às ${bloqueioParaRemover.hora_fim.slice(0, 5)}` : ', durante o dia inteiro'}.`
          : ''}
        confirmLabel="Remover bloqueio"
        variant="destructive"
        isLoading={removendoId === bloqueioParaRemover?.id}
        closeOnConfirm={false}
        onConfirm={() => { if (bloqueioParaRemover) void handleDelete(bloqueioParaRemover.id); }}
      />
    </>
  );
}
