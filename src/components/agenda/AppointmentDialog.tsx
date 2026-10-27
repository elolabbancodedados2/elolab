import { friendlyErrorMessage } from '@/components/ErrorState';
import { nomeMedico } from '@/lib/formatters';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { CircleX, History, Loader2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { linkWhatsApp } from '@/lib/whatsapp';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { mensagemDeErro } from '@/lib/erros';
import { useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { appointmentEndMinutes } from '@/lib/agendaTime';
import { appointmentPayloadForSave } from '@/lib/agendaAppointmentPayload';
import { describeAppointmentConflict } from '@/lib/agendaConflictMessage';
import { APPOINTMENT_CANCELLATION_REASONS, appointmentCancellationReasonLabel, isAppointmentCancellationReason } from '@/lib/appointmentCancellation';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: any | null;
  medicos: any[];
  tipos: any[];
  salas: any[];
  onSaved?: () => void | Promise<void>;
}

// "Retorno", "Retorno — DEMONSTRAÇÃO": o agendamento guarda como retorno.
const isTipoRetorno = (nome?: string | null) => /^retorno/i.test(String(nome ?? '').trim());

/** Tipo da clínica escolhido tem prioridade; sem ele, cai no nome genérico. */
const tipoDoCatalogo = (tipos: any[], form: any) => tipos.find((t: any) => form.tipo_consulta_id
  ? t.id === form.tipo_consulta_id
  : String(t.nome || '').toLocaleLowerCase('pt-BR') === String(form.tipo || '').toLocaleLowerCase('pt-BR'));

export function AppointmentDialog({ open, onOpenChange, initial, medicos, tipos, salas, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth() as any;
  const editing = !!initial?.id;
  const [tab, setTab] = useState('paciente');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [form, setForm] = useState<any>({});
  const [foraExpediente, setForaExpediente] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Nova consulta já sai com um tipo da clínica, que tem preço; o genérico não tem.
      const tipoPadrao = !initial?.tipo && !initial?.tipo_consulta_id
        ? (tipos as any[]).find((t) => t.ativo !== false && !isTipoRetorno(t.nome)) ?? null
        : null;
      setForm({
        paciente_id: initial?.paciente_id || '',
        medico_id: initial?.medico_id || '',
        data: initial?.data || todaySaoPauloDateOnly(),
        hora_inicio: initial?.hora_inicio?.slice(0, 5) || '09:00',
        hora_fim: initial?.hora_fim?.slice(0, 5) || '',
        tipo: initial?.tipo || 'consulta',
        tipo_consulta_id: initial?.tipo_consulta_id || tipoPadrao?.id || '',
        status: initial?.status || 'agendado',
        sala_id: initial?.sala_id || '',
        observacoes: initial?.observacoes || '',
        send_whatsapp: false,
      });
      setTab('paciente');
      setMotivoCancelamento('');
    }
  }, [open, initial]);

  const { data: paciente } = usePacienteResumo(form.paciente_id);
  const ultimoAtendimentoQuery = useQuery({
    queryKey: ['agenda-ultimo-atendimento', profile?.clinica_id, form.paciente_id, initial?.id ?? null],
    enabled: open && !!profile?.clinica_id && !!form.paciente_id,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase.from('agendamentos')
        .select('id, data, hora_inicio, tipo, status, medicos(nome, crm)')
        .eq('clinica_id', profile.clinica_id)
        .eq('paciente_id', form.paciente_id)
        .lte('data', todaySaoPauloDateOnly())
        .not('status', 'in', '(cancelado,faltou)')
        .order('data', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(1);
      if (initial?.id) q = q.neq('id', initial.id);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const ultimoAtendimento = ultimoAtendimentoQuery.data;
  const whatsappPaciente = paciente?.telefone
    ? linkWhatsApp(paciente.telefone, `Olá, ${(paciente.nome_social || paciente.nome || '').split(' ')[0]}! Aqui é da clínica.`)
    : null;
  const terminoPrevisto = (() => {
    if (form.hora_fim || !/^\d{2}:\d{2}$/.test(form.hora_inicio || '')) return null;
    const tipoEscolhido = tipoDoCatalogo(tipos as any[], form);
    const duracao = Number(tipoEscolhido?.duracao_minutos) > 0 ? Number(tipoEscolhido.duracao_minutos) : 30;
    const [h, m] = form.hora_inicio.split(':').map(Number);
    const fim = h * 60 + m + duracao;
    if (fim >= 24 * 60) return null;
    return { hora: `${String(Math.floor(fim / 60)).padStart(2, '0')}:${String(fim % 60).padStart(2, '0')}`, duracao };
  })();
  // Keep the current provider selectable when editing an existing booking,
  // even if that provider has since been deactivated. Inactive providers remain
  // unavailable for new appointments.
  const medicoInativoDaConsulta = editing
    ? medicos.find((m) => m.id === initial?.medico_id && m.ativo === false)
    : null;
  const consultaSomenteLeitura = editing
    && !['agendado', 'confirmado', 'aguardando'].includes(initial?.status);
  const podeCancelarConsulta = editing
    && ['agendado', 'confirmado', 'aguardando', 'aguardando_triagem', 'em_triagem'].includes(form.status);
  const rotulosStatusOperacionais: Record<string, string> = {
    em_atendimento: 'Em atendimento',
    finalizado: 'Finalizado',
    atendimento_finalizado: 'Atendimento finalizado',
    aguardando_pagamento: 'Aguardando pagamento',
    aguardando_pagamento_adicional: 'Aguardando pagamento adicional',
    pago: 'Pago',
    cancelado: 'Cancelado',
    faltou: 'Faltou',
  };

  const handleSave = async (confirmouForaExpediente = false) => {
    if (!form.paciente_id) { toast.error('Selecione um paciente'); setTab('paciente'); return; }
    if (!form.medico_id) { toast.error('Selecione um médico'); setTab('consulta'); return; }
    if (!form.hora_inicio) { toast.error('Informe o horário'); setTab('consulta'); return; }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }

    if (['exame', 'exames'].includes(String(form.tipo || '').toLocaleLowerCase('pt-BR')) && !form.observacoes?.trim()) {
      toast.error('Informe qual exame será realizado', {
        description: 'O nome do exame é necessário para localizar o preço no balcão.',
      });
      setTab('obs');
      return;
    }

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
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(t)) return null;
        const [h, m] = t.split(':').map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
      };
      const tipoEscolhido = tipoDoCatalogo(tipos as any[], form);
      const DURACAO_PADRAO = Number(tipoEscolhido?.duracao_minutos) > 0 ? Number(tipoEscolhido.duracao_minutos) : 30;
      const novoInicio = toMin(form.hora_inicio);
      const novoFimInformado = toMin(form.hora_fim);

      const dataParseada = /^\d{4}-\d{2}-\d{2}$/.test(form.data) ? new Date(`${form.data}T12:00:00Z`) : null;
      const dataValida = !!dataParseada && !Number.isNaN(dataParseada.getTime()) && dataParseada.toISOString().slice(0, 10) === form.data;
      if (!dataValida || novoInicio === null || novoInicio < 0 || novoInicio >= 24 * 60) {
        toast.error('Informe uma data e um horário de início válidos.');
        setTab('consulta'); setSaving(false); return;
      }
      if (form.hora_fim && (novoFimInformado === null || novoFimInformado < 0 || novoFimInformado >= 24 * 60)) {
        toast.error('Informe um horário de término válido.');
        setTab('consulta'); setSaving(false); return;
      }

      const novoFim = novoFimInformado ?? novoInicio + DURACAO_PADRAO;

      if (novoFim <= novoInicio || novoFim >= 24 * 60) {
        toast.error(novoFim >= 24 * 60 ? 'A consulta precisa terminar antes da meia-noite.' : 'O horário de término deve ser após o início.');
        setTab('consulta'); setSaving(false); return;
      }

      const reservaAtiva = !['cancelado', 'faltou'].includes(form.status);
      if (reservaAtiva) {
      const { data: doDia, error: erroDoDia } = await supabase
        .from('agendamentos')
        .select('id, paciente_id, medico_id, sala_id, hora_inicio, hora_fim, status')
        .eq('clinica_id', profile.clinica_id)
        .eq('data', form.data);

      // Sem esta checagem, uma falha aqui devolvia lista vazia e o código
      // concluía "não há conflito". A constraint do banco ainda barraria a
      // sobreposição, mas com uma mensagem que ninguém entende.
      if (erroDoDia) {
        toast.error('Não foi possível conferir os horários da agenda.', {
          description: `${friendlyErrorMessage(erroDoDia, 'Não foi possível consultar a agenda do dia.')} Tente de novo antes de salvar.`,
        });
        setTab('consulta'); setSaving(false); return;
      }

      const conflito = (doDia || []).find((a: any) => {
        // O banco e o arrastar-e-soltar liberam horários de consultas
        // canceladas ou com falta; o formulário precisa aplicar a mesma regra.
        if (a.status === 'cancelado' || a.status === 'faltou') return false;
        if (editing && a.id === initial?.id) return false;
        const ini = toMin(a.hora_inicio);
        if (ini === null) return false;
        const fim = appointmentEndMinutes(a.hora_inicio, a.hora_fim);
        if (fim === null) return false;
        // Encostar (fim == início) não é conflito.
        const sobrepoe = ini < novoFim && fim > novoInicio;
        return sobrepoe && a.medico_id === form.medico_id;
      });

      if (conflito) {
        toast.error('Este médico já tem consulta neste horário.', {
          description: describeAppointmentConflict({
            resource: 'médico',
            existingStart: conflito.hora_inicio,
            existingEnd: conflito.hora_fim,
            requestedStart: form.hora_inicio,
            requestedEnd: form.hora_fim || `${String(Math.floor(novoFim / 60)).padStart(2, '0')}:${String(novoFim % 60).padStart(2, '0')}`,
          }),
        });
        setTab('consulta'); setSaving(false); return;
      }

      const conflitoPaciente = (doDia || []).find((a: any) => {
        if (a.status === 'cancelado' || a.status === 'faltou' || (editing && a.id === initial?.id)) return false;
        if (a.paciente_id !== form.paciente_id) return false;
        const inicio = toMin(a.hora_inicio);
        if (inicio === null) return false;
        const fim = appointmentEndMinutes(a.hora_inicio, a.hora_fim);
        if (fim === null) return false;
        return inicio < novoFim && fim > novoInicio;
      });
      if (conflitoPaciente) {
        toast.error('Este paciente já tem outro atendimento neste horário.', {
          description: describeAppointmentConflict({
            resource: 'paciente',
            existingStart: conflitoPaciente.hora_inicio,
            existingEnd: conflitoPaciente.hora_fim,
            requestedStart: form.hora_inicio,
            requestedEnd: form.hora_fim || `${String(Math.floor(novoFim / 60)).padStart(2, '0')}:${String(novoFim % 60).padStart(2, '0')}`,
          }),
        });
        setTab('consulta'); setSaving(false); return;
      }

      const conflitoSala = form.sala_id && (doDia || []).find((a: any) => {
        if (a.status === 'cancelado' || a.status === 'faltou' || (editing && a.id === initial?.id)) return false;
        if (a.sala_id !== form.sala_id) return false;
        const inicio = toMin(a.hora_inicio);
        if (inicio === null) return false;
        const fim = appointmentEndMinutes(a.hora_inicio, a.hora_fim);
        if (fim === null) return false;
        return inicio < novoFim && fim > novoInicio;
      });
      if (conflitoSala) {
        toast.error('Esta sala já está reservada neste horário.', {
          description: describeAppointmentConflict({
            resource: 'sala',
            existingStart: conflitoSala.hora_inicio,
            existingEnd: conflitoSala.hora_fim,
            requestedStart: form.hora_inicio,
            requestedEnd: form.hora_fim || `${String(Math.floor(novoFim / 60)).padStart(2, '0')}:${String(novoFim % 60).padStart(2, '0')}`,
          }),
        });
        setTab('consulta'); setSaving(false); return;
      }

      // Bloqueio de agenda cobrindo o novo horário?
      // Diferente da sobreposição, o bloqueio NÃO tem constraint no banco como
      // rede de segurança: se esta consulta falhasse e a lista viesse vazia, a
      // recepção marcava consulta dentro das férias do médico ou de um feriado
      // sem nenhum aviso.
      const { data: blocks, error: erroBlocks } = await (supabase
        .from('bloqueios_agenda' as any)
        .select('id, data_inicio, data_fim, hora_inicio, hora_fim, dia_inteiro, motivo, tipo')
        .eq('medico_id', form.medico_id)
        .lte('data_inicio', form.data)
        .gte('data_fim', form.data) as any);

      if (erroBlocks) {
        toast.error('Não foi possível conferir os bloqueios da agenda.', {
          description: `${friendlyErrorMessage(erroBlocks, 'Não foi possível consultar os bloqueios.')} Tente de novo — sem isso não dá para saber se o médico está de férias ou se é feriado.`,
        });
        setTab('consulta'); setSaving(false); return;
      }

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

      // Fora do expediente cadastrado do médico: não bloqueia (encaixe antes da
      // abertura é comum), mas pede confirmação. Antes salvava calado.
      if (!confirmouForaExpediente) {
        const diaSemana = new Date(`${form.data}T12:00:00Z`).getUTCDay();
        const { data: jornada, error: erroJornada } = await (supabase.from('medico_disponibilidade' as any)
          .select('hora_inicio, hora_fim')
          .eq('medico_id', form.medico_id).eq('dia_semana', diaSemana).eq('ativo', true) as any);
        if (erroJornada) {
          toast.error('Não foi possível conferir o expediente do médico.', {
            description: `${friendlyErrorMessage(erroJornada, 'Não foi possível consultar o expediente.')} Tente novamente antes de agendar.`,
          });
          setTab('consulta'); setSaving(false); return;
        }
        const dentro = ((jornada as any[]) || []).some((j) => {
          const ji = toMin(j.hora_inicio); const jf = toMin(j.hora_fim);
          return ji !== null && jf !== null && novoInicio >= ji && novoFim <= jf;
        });
        if (!dentro) {
          const faixa = ((jornada as any[]) || []).map((j) => `${String(j.hora_inicio).slice(0, 5)}–${String(j.hora_fim).slice(0, 5)}`).join(', ');
          setForaExpediente(faixa ? `O expediente do médico neste dia é ${faixa}.` : 'O médico não tem expediente cadastrado neste dia da semana.');
          setSaving(false); return;
        }
      }
      }

      const payload: any = {
        paciente_id: form.paciente_id,
        medico_id: form.medico_id,
        data: form.data,
        hora_inicio: form.hora_inicio.length === 5 ? form.hora_inicio + ':00' : form.hora_inicio,
        hora_fim: form.hora_fim
          ? (form.hora_fim.length === 5 ? form.hora_fim + ':00' : form.hora_fim)
          : `${String(Math.floor(novoFim / 60)).padStart(2, '0')}:${String(novoFim % 60).padStart(2, '0')}:00`,
        tipo: form.tipo,
        tipo_consulta_id: form.tipo_consulta_id || null,
        status: form.status,
        sala_id: form.sala_id || null,
        observacoes: form.observacoes || null,
      };
      const payloadToSave = appointmentPayloadForSave(payload, editing);

      let result;
      if (editing) {
        let updateQuery = supabase.from('agendamentos')
          .update(payloadToSave)
          .eq('id', initial.id)
          .eq('clinica_id', profile.clinica_id);
        updateQuery = initial.updated_at
          ? updateQuery.eq('updated_at', initial.updated_at)
          : updateQuery.is('updated_at', null);
        result = await (updateQuery.select('id').maybeSingle() as any);
        if (!result.error && !result.data) {
          queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
          throw new Error('Esta consulta foi atualizada ou removida enquanto o formulário estava aberto. Feche e abra novamente antes de salvar.');
        }
      } else {
        payload.clinica_id = profile?.clinica_id;
        result = await (supabase.from('agendamentos').insert(payloadToSave).select('id').single() as any);
      }
      if (result.error) throw result.error;

      toast.success(editing ? 'Consulta atualizada' : 'Consulta agendada');

      // O lembrete é secundário: a consulta já está marcada e não deve ser
      // desfeita se o WhatsApp falhar. Mas a falha era engolida com
      // `.catch(() => {})` e a recepção não sabia que precisava reenviar —
      // o que vira falta na agenda.
      if (form.send_whatsapp && !editing) {
        try {
          const { data, error } = await supabase.functions.invoke('send-appointment-reminder', {
            body: { automation_key: 'confirmacao_agendamento', agendamento_id: result.data?.id },
          });
          if (error) throw error;
          if (!data?.success) throw new Error(data?.error || 'A confirmação não entrou na fila.');
          if (data?.stats?.duplicado) {
            toast.info('A confirmação desta consulta já estava na fila.');
          } else if (!data?.stats?.enfileirados) {
            toast.warning(data?.message || 'Consulta salva, mas a confirmação não foi enfileirada.');
          } else {
            toast.success('Confirmação adicionada à fila do WhatsApp.');
          }
        } catch (erroLembrete: any) {
          toast.warning('Consulta salva, mas a confirmação não entrou na fila.', {
            description: `${friendlyErrorMessage(erroLembrete, 'Falha ao preparar a confirmação.')} Confira as automações de WhatsApp.`,
            duration: 10000,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      try {
        await onSaved?.();
      } catch (error) {
        toast.warning('Consulta salva, mas uma atualização complementar falhou.', { description: mensagemDeErro(error) });
      }
      onOpenChange(false);
    } catch (e: any) {
      // A constraint agendamentos_sem_sobreposicao é a rede de segurança para o
      // caso de duas pessoas marcarem ao mesmo tempo: a checagem acima roda no
      // navegador e não enxerga o que a outra acabou de gravar. Quando o banco
      // recusa, o erro vem como violação de constraint — traduzimos para algo
      // que a recepção entenda.
      const violouSobreposicao =
        e?.code === '23P01' || String(e?.message || '').includes('agendamentos_sem_sobreposicao');
      const sobrepoeBloqueio = String(e?.message || '').includes('AGENDA_BLOQUEIO_CONFLITO');

      if (sobrepoeBloqueio) {
        toast.error('Horário bloqueado', {
          description: 'Este período foi bloqueado para o profissional. Atualize a agenda e escolha outro horário.',
        });
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      } else if (violouSobreposicao) {
        const conflitoDeRecurso = String(e?.message || '').includes('AGENDA_RECURSO_CONFLITO');
        toast.error(conflitoDeRecurso ? 'Paciente ou sala acabaram de ser ocupados' : 'Este horário acabou de ser ocupado', {
          description: conflitoDeRecurso
            ? 'Outro usuário marcou neste período enquanto você preenchia. Escolha outro horário ou sala.'
            : 'Outro usuário marcou nesta janela enquanto você preenchia. Escolha outro horário.',
        });
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      } else {
        toast.error(friendlyErrorMessage(e, 'Não foi possível salvar a consulta. Tente novamente.'));
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!podeCancelarConsulta || !profile?.clinica_id) return;
    if (!isAppointmentCancellationReason(motivoCancelamento)) {
      toast.error('Selecione o motivo do cancelamento');
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await (supabase as any).rpc('cancelar_agendamento_com_motivo', {
        p_agendamento_id: initial.id,
        p_clinica_id: profile.clinica_id,
        p_updated_at: initial.updated_at ?? null,
        p_motivo_cancelamento: motivoCancelamento,
      });
      if (error) throw error;
      if (!data?.atualizado) throw new Error('Esta consulta foi atualizada por outra pessoa. Atualize a agenda e confira o estado antes de tentar novamente.');
      toast.success('Consulta cancelada; o histórico foi preservado.');
      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setConfirmCancel(false);
      onOpenChange(false);
    } catch (error) {
      toast.error('Não foi possível cancelar a consulta.', { description: mensagemDeErro(error) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving && !deleting) onOpenChange(nextOpen); }}>
      <DialogContent className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-none pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar consulta' : 'Nova consulta'}</DialogTitle>
          <DialogDescription>
            {/^\d{4}-\d{2}-\d{2}$/.test(form.data) ? form.data.split('-').reverse().join('/') : form.data} às {form.hora_inicio || '—'}
          </DialogDescription>
          {editing && form.status === 'cancelado' && (
            <p className="text-sm text-muted-foreground">
              Motivo do cancelamento: <span className="font-medium text-foreground">{appointmentCancellationReasonLabel(initial?.motivo_cancelamento) ?? 'Não informado'}</span>
            </p>
          )}
        </DialogHeader>

        <fieldset disabled={saving || deleting || consultaSomenteLeitura} className="min-w-0">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="paciente">Paciente</TabsTrigger>
            <TabsTrigger value="consulta">Consulta</TabsTrigger>
            <TabsTrigger value="obs">Observações</TabsTrigger>
          </TabsList>

          <TabsContent value="paciente" className="space-y-3 mt-4">
            <Label htmlFor="appointment-patient">Buscar paciente</Label>
            <PacienteCombobox id="appointment-patient" value={form.paciente_id} onChange={(id) => setForm((f: any) => ({ ...f, paciente_id: id }))} />
            {paciente && (
              <div className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{paciente.nome_social || paciente.nome}</div>
                  {whatsappPaciente && (
                    <a href={whatsappPaciente} target="_blank" rel="noopener noreferrer" aria-label="Abrir conversa no WhatsApp" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1080CA]/10 text-[#1080CA] transition hover:bg-gradient-primary hover:text-white">
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {paciente.cpf && <div className="text-xs text-muted-foreground">CPF: {paciente.cpf}</div>}
                {paciente.telefone && <div className="text-xs text-muted-foreground">Tel: {paciente.telefone}</div>}
                {ultimoAtendimento && (
                  <div className="mt-1.5 flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    <History className="h-3.5 w-3.5 shrink-0 text-[#1080CA]" />
                    <span>
                      Último atendimento: <span className="font-medium text-foreground">{String(ultimoAtendimento.data).split('-').reverse().join('/')} às {String(ultimoAtendimento.hora_inicio).slice(0, 5)}</span>
                      {ultimoAtendimento.medicos?.nome && ` · ${nomeMedico(ultimoAtendimento.medicos.nome)}`}
                      {' · '}{formatAppointmentStatus(ultimoAtendimento.status)}
                    </span>
                  </div>
                )}
                {!ultimoAtendimento && !ultimoAtendimentoQuery.isLoading && (
                  <div className="mt-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">Primeira consulta na clínica.</div>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTab('consulta')} disabled={!form.paciente_id}>Próximo →</Button>
            </div>
          </TabsContent>

          <TabsContent value="consulta" className="space-y-3 mt-4">
            <div>
              <Label htmlFor="appointment-doctor">Médico *</Label>
              <Select value={form.medico_id} onValueChange={(v) => setForm({ ...form, medico_id: v })}>
                <SelectTrigger id="appointment-doctor"><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                <SelectContent>
                  {[...medicos.filter(m => m.ativo !== false), ...(medicoInativoDaConsulta ? [medicoInativoDaConsulta] : [])].map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {nomeMedico(m.nome || m.crm)} · {m.ativo === false ? 'Inativo (consulta existente)' : m.especialidade || 'Geral'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label htmlFor="appointment-date">Data *</Label>
                <Input id="appointment-date" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="appointment-start">Início *</Label>
                <Input id="appointment-start" type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="appointment-end">Fim</Label>
                <Input id="appointment-end" type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
              </div>
            </div>
            {terminoPrevisto && (
              <p className="-mt-1 text-xs text-muted-foreground">
                Sem término informado: será salvo até <span className="font-semibold text-foreground">{terminoPrevisto.hora}</span> ({terminoPrevisto.duracao} min pelo tipo escolhido).
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="appointment-type">Tipo</Label>
                <Select
                  value={form.tipo_consulta_id ? `tc:${form.tipo_consulta_id}` : form.tipo}
                  onValueChange={(v) => {
                    if (v.startsWith('tc:')) {
                      const escolhido = (tipos as any[]).find((t) => t.id === v.slice(3));
                      // `tipo` fica genérico (o banco só aceita esses); o preço vem do tipo da clínica.
                      setForm({ ...form, tipo: isTipoRetorno(escolhido?.nome) ? 'retorno' : 'consulta', tipo_consulta_id: v.slice(3) });
                    } else {
                      setForm({ ...form, tipo: v, tipo_consulta_id: '' });
                    }
                  }}
                >
                  <SelectTrigger id="appointment-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tipos.filter(t => t.ativo !== false || t.id === form.tipo_consulta_id).map(t => <SelectItem key={t.id} value={`tc:${t.id}`}>{t.nome}</SelectItem>)}
                    <SelectItem value="consulta">Consulta (sem tipo da clínica)</SelectItem>
                    <SelectItem value="retorno">Retorno</SelectItem>
                    <SelectItem value="exame">Exame</SelectItem>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                    {form.tipo === 'telemedicina' && <SelectItem value="telemedicina">Teleconsulta</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="appointment-status">Status</Label>
                {editing ? (
                  <div id="appointment-status" className="flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm text-foreground" aria-label={`Status atual: ${rotulosStatusOperacionais[form.status] || form.status}`}>
                    {rotulosStatusOperacionais[form.status] || form.status}
                  </div>
                ) : (
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={consultaSomenteLeitura}>
                    <SelectTrigger id="appointment-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {editing ? 'O status muda pelos fluxos de atendimento e fila.' : 'Aguardando e falta são registrados pelos fluxos de atendimento.'}
                </p>
                {/* 'em_atendimento' e 'finalizado' saíram do select manual:
                    são estados OPERACIONAIS, que nascem da fila e da
                    finalização com faturamento. Marcá-los à mão burlava o
                    fluxo e deixava consulta sem cobrança. */}
              </div>
            </div>
            {salas.length > 0 && (
              <div>
                <Label htmlFor="appointment-room">Sala</Label>
                <Select value={form.sala_id || 'none'} onValueChange={(v) => setForm({ ...form, sala_id: v === 'none' ? '' : v })}>
                  <SelectTrigger id="appointment-room"><SelectValue /></SelectTrigger>
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
              <Label htmlFor="appointment-notes">{['exame', 'exames'].includes(String(form.tipo || '').toLocaleLowerCase('pt-BR')) ? 'Nome do exame *' : 'Observações'}</Label>
              <Textarea id="appointment-notes" rows={4} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder={['exame', 'exames'].includes(String(form.tipo || '').toLocaleLowerCase('pt-BR')) ? 'Ex.: Hemograma completo ou 40301630 - Hemograma' : 'Motivo, sintomas, orientações...'} />
            </div>
            {!editing && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="appointment-whatsapp" className="flex items-center gap-2 text-sm">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Enviar confirmação por WhatsApp
                </Label>
                <Switch id="appointment-whatsapp" checked={form.send_whatsapp} onCheckedChange={(v) => setForm({ ...form, send_whatsapp: v })} />
              </div>
            )}
          </TabsContent>
        </Tabs>
        </fieldset>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {podeCancelarConsulta && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} disabled={saving || deleting} className="text-destructive">
                <CircleX className="h-4 w-4 mr-1" /> Cancelar consulta
              </Button>
            )}
            {editing && ['cancelado', 'faltou'].includes(form.status) && (
              <p className="max-w-52 text-xs text-muted-foreground">
                Este estado fica no histórico. Para remarcar, crie uma nova consulta.
              </p>
            )}
            {consultaSomenteLeitura && !['cancelado', 'faltou'].includes(form.status) && (
              <p className="max-w-52 text-xs text-muted-foreground">
                Este estado é controlado pelo fluxo de atendimento e financeiro.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>Fechar</Button>
            <Button onClick={() => handleSave()} disabled={saving || deleting || consultaSomenteLeitura || !form.paciente_id || !form.medico_id}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {consultaSomenteLeitura ? 'Somente leitura' : editing ? 'Salvar' : 'Agendar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={!!foraExpediente} onOpenChange={(o) => !o && setForaExpediente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fora do expediente do médico</AlertDialogTitle>
            <AlertDialogDescription>{foraExpediente} Deseja agendar mesmo assim?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Escolher outro horário</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setForaExpediente(null); void handleSave(true); }}>Agendar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmCancel} onOpenChange={(nextOpen) => { if (!deleting) setConfirmCancel(nextOpen); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar consulta?</AlertDialogTitle>
            <AlertDialogDescription>A consulta deixará de ocupar o horário. O registro será mantido no histórico.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor="appointment-cancellation-reason" className="text-sm font-medium">Motivo do cancelamento</label>
            <Select value={motivoCancelamento} onValueChange={setMotivoCancelamento}>
              <SelectTrigger id="appointment-cancellation-reason" aria-label="Motivo do cancelamento" disabled={deleting}>
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_CANCELLATION_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Manter consulta</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelando…</> : 'Confirmar cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
