import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Trash2, Loader2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: any | null;
  pacientes: any[];
  medicos: any[];
  tipos: any[];
  salas: any[];
  onSaved?: () => void;
}

export function AppointmentDialog({ open, onOpenChange, initial, pacientes, medicos, tipos, salas, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth() as any;
  const editing = !!initial?.id;
  const [tab, setTab] = useState('paciente');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [pacSearch, setPacSearch] = useState('');
  const [pacOpen, setPacOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        paciente_id: initial?.paciente_id || '',
        medico_id: initial?.medico_id || '',
        data: initial?.data || new Date().toISOString().split('T')[0],
        hora_inicio: initial?.hora_inicio || '09:00',
        hora_fim: initial?.hora_fim || '',
        tipo: initial?.tipo || 'consulta',
        status: initial?.status || 'agendado',
        sala_id: initial?.sala_id || '',
        observacoes: initial?.observacoes || '',
        send_whatsapp: false,
      });
      setTab('paciente');
      setPacSearch('');
    }
  }, [open, initial]);

  const paciente = pacientes.find(p => p.id === form.paciente_id);
  const filteredPacs = pacSearch
    ? pacientes.filter(p =>
        (p.nome || '').toLowerCase().includes(pacSearch.toLowerCase()) ||
        (p.cpf || '').includes(pacSearch) ||
        (p.telefone || '').includes(pacSearch)
      ).slice(0, 20)
    : pacientes.slice(0, 20);

  const handleSave = async () => {
    if (!form.paciente_id) { toast.error('Selecione um paciente'); setTab('paciente'); return; }
    if (!form.medico_id) { toast.error('Selecione um médico'); setTab('consulta'); return; }
    if (!form.hora_inicio) { toast.error('Informe o horário'); setTab('consulta'); return; }

    setSaving(true);
    try {
      // Sem esta checagem, salvar pelo formulário permite marcar dois pacientes
      // no mesmo horário para o mesmo médico. O arrastar-e-soltar em AgendaPage
      // valida, mas este caminho não validava nada.
      //
      // A comparação é em MINUTOS de propósito: o banco guarda TIME e devolve
      // "08:00:00", enquanto o formulário usa "08:00". Comparar como texto
      // produz "09:00:00" > "09:00" = true, o que bloqueava marcar 09:00 logo
      // após uma consulta que termina às 09:00 — ou seja, impedia encaixar
      // consultas em sequência.
      const toMin = (t?: string | null): number | null => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
      };
      const DURACAO_PADRAO = 30;
      const novoInicio = toMin(form.hora_inicio)!;
      const novoFim = toMin(form.hora_fim) ?? novoInicio + DURACAO_PADRAO;

      if (novoFim <= novoInicio) {
        toast.error('O horário de término deve ser após o início.');
        setTab('consulta'); setSaving(false); return;
      }

      const { data: doDia } = await supabase
        .from('agendamentos')
        .select('id, hora_inicio, hora_fim, status')
        .eq('medico_id', form.medico_id)
        .eq('data', form.data);

      const conflito = (doDia || []).find((a: any) => {
        if (a.status === 'cancelado') return false;
        if (editing && a.id === initial?.id) return false;
        const ini = toMin(a.hora_inicio);
        if (ini === null) return false;
        const fim = toMin(a.hora_fim) ?? ini + DURACAO_PADRAO;
        // Encostar (fim == início) não é conflito.
        return ini < novoFim && fim > novoInicio;
      });

      if (conflito) {
        toast.error('Este médico já tem consulta neste horário.');
        setTab('consulta'); setSaving(false); return;
      }

      // Bloqueio de agenda cobrindo o novo horário?
      const { data: blocks } = await (supabase
        .from('bloqueios_agenda' as any)
        .select('id, data_inicio, data_fim, hora_inicio, hora_fim, dia_inteiro, motivo, tipo')
        .eq('medico_id', form.medico_id)
        .lte('data_inicio', form.data)
        .gte('data_fim', form.data) as any);
      const bloqueio = (blocks || []).find((b: any) => {
        if (b.dia_inteiro) return true;
        const bi = toMin(b.hora_inicio);
        const bf = toMin(b.hora_fim);
        if (bi === null || bf === null) return false;
        return bi < novoFim && bf > novoInicio;
      });
      if (bloqueio) {
        toast.error('Horário bloqueado para este médico', {
          description: bloqueio.motivo || bloqueio.tipo || 'Escolha outro horário.',
        });
        setTab('consulta'); setSaving(false); return;
      }

      const payload: any = {
        paciente_id: form.paciente_id,
        medico_id: form.medico_id,
        data: form.data,
        hora_inicio: form.hora_inicio.length === 5 ? form.hora_inicio + ':00' : form.hora_inicio,
        hora_fim: form.hora_fim ? (form.hora_fim.length === 5 ? form.hora_fim + ':00' : form.hora_fim) : null,
        tipo: form.tipo,
        status: form.status,
        sala_id: form.sala_id || null,
        observacoes: form.observacoes || null,
      };

      let result;
      if (editing) {
        result = await (supabase.from('agendamentos').update(payload).eq('id', initial.id) as any);
      } else {
        payload.clinica_id = profile?.clinica_id;
        result = await (supabase.from('agendamentos').insert(payload) as any);
      }
      if (result.error) throw result.error;

      if (form.send_whatsapp && !editing) {
        supabase.functions.invoke('send-appointment-reminder', {
          body: { paciente_id: form.paciente_id, data: form.data, hora: form.hora_inicio },
        }).catch(() => {});
      }

      toast.success(editing ? 'Consulta atualizada' : 'Consulta agendada');
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      // A constraint agendamentos_sem_sobreposicao é a rede de segurança para o
      // caso de duas pessoas marcarem ao mesmo tempo: a checagem acima roda no
      // navegador e não enxerga o que a outra acabou de gravar. Quando o banco
      // recusa, o erro vem como violação de constraint — traduzimos para algo
      // que a recepção entenda.
      const violouSobreposicao =
        e?.code === '23P01' || String(e?.message || '').includes('agendamentos_sem_sobreposicao');

      if (violouSobreposicao) {
        toast.error('Este horário acabou de ser ocupado', {
          description: 'Outro usuário marcou nesta janela enquanto você preenchia. Escolha outro horário.',
        });
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      } else {
        toast.error(e.message || 'Erro ao salvar');
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm('Cancelar esta consulta?')) return;
    const { error } = await (supabase.from('agendamentos').delete().eq('id', initial.id) as any);
    if (error) return toast.error('Erro ao remover');
    toast.success('Consulta removida');
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar consulta' : 'Nova consulta'}</DialogTitle>
          <DialogDescription>
            {form.data} · {form.hora_inicio || '—'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="paciente">Paciente</TabsTrigger>
            <TabsTrigger value="consulta">Consulta</TabsTrigger>
            <TabsTrigger value="obs">Observações</TabsTrigger>
          </TabsList>

          <TabsContent value="paciente" className="space-y-3 mt-4">
            <Label>Buscar paciente</Label>
            <Popover open={pacOpen} onOpenChange={setPacOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <Search className="mr-2 h-4 w-4" />
                  {paciente ? (paciente.nome_social || paciente.nome) : 'Nome, CPF ou telefone...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[420px]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Buscar..." value={pacSearch} onValueChange={setPacSearch} />
                  <CommandList>
                    <CommandEmpty>Nenhum paciente encontrado.</CommandEmpty>
                    <CommandGroup>
                      {filteredPacs.map(p => (
                        <CommandItem key={p.id} value={p.id} onSelect={() => {
                          setForm({ ...form, paciente_id: p.id }); setPacOpen(false);
                        }}>
                          <div>
                            <div className="font-medium">{p.nome_social || p.nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.cpf && `CPF ${p.cpf}`} {p.telefone && `· ${p.telefone}`}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {paciente && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="font-medium">{paciente.nome_social || paciente.nome}</div>
                {paciente.cpf && <div className="text-xs text-muted-foreground">CPF: {paciente.cpf}</div>}
                {paciente.telefone && <div className="text-xs text-muted-foreground">Tel: {paciente.telefone}</div>}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTab('consulta')} disabled={!form.paciente_id}>Próximo →</Button>
            </div>
          </TabsContent>

          <TabsContent value="consulta" className="space-y-3 mt-4">
            <div>
              <Label>Médico *</Label>
              <Select value={form.medico_id} onValueChange={(v) => setForm({ ...form, medico_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                <SelectContent>
                  {medicos.filter(m => m.ativo !== false).map(m => (
                    <SelectItem key={m.id} value={m.id}>Dr(a). {m.nome || m.crm} · {m.especialidade || 'Geral'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label>Início *</Label>
                <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consulta">Consulta</SelectItem>
                    <SelectItem value="retorno">Retorno</SelectItem>
                    <SelectItem value="exame">Exame</SelectItem>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                    {tipos.map(t => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="aguardando">Aguardando</SelectItem>
                    <SelectItem value="em_atendimento">Em atendimento</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="faltou">Faltou</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {salas.length > 0 && (
              <div>
                <Label>Sala</Label>
                <Select value={form.sala_id || 'none'} onValueChange={(v) => setForm({ ...form, sala_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem sala</SelectItem>
                    {salas.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>

          <TabsContent value="obs" className="space-y-3 mt-4">
            <div>
              <Label>Observações</Label>
              <Textarea rows={4} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Motivo, sintomas, orientações..." />
            </div>
            {!editing && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Enviar confirmação por WhatsApp
                </div>
                <Switch checked={form.send_whatsapp} onCheckedChange={(v) => setForm({ ...form, send_whatsapp: v })} />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {editing && (
              <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Remover
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? 'Salvar' : 'Agendar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
