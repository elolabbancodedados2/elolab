import { nomeMedico } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { ArrowLeft, CircleX, History, Loader2, MessageCircle } from '@/components/icons/elolabIcons';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { linkWhatsApp } from '@/lib/whatsapp';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { mensagemDeErro } from '@/lib/erros';
import { useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { appointmentStartHasPassed, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { appointmentEndMinutes } from '@/lib/agendaTime';
import { appointmentPayloadForSave } from '@/lib/agendaAppointmentPayload';
import { datasDaRecorrencia, FREQUENCIAS_RECORRENCIA, MAX_OCORRENCIAS, type FrequenciaRecorrencia } from '@/lib/recorrenciaAgenda';
import { describeAppointmentConflict } from '@/lib/agendaConflictMessage';
import { APPOINTMENT_CANCELLATION_REASONS, appointmentCancellationReasonLabel, isAppointmentCancellationReason } from '@/lib/appointmentCancellation';
import { faixasDoExpediente, horariosLivresNoDia } from '@/lib/vagaLivreDia';
import { minutosAgoraSaoPaulo } from '@/lib/proximaVagaLivre';
import { saldoDevedor } from '@/lib/liberacaoAtendimento';
import { formatCurrency } from '@/lib/formatters';
import { TIPOS_FIXOS_CONSULTA } from './agendaStatus';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: any | null;
  medicos: any[];
  tipos: any[];
  salas: any[];
  /** Convênios da clínica; a consulta grava o escolhido em agendamentos.convenio_id. */
  convenios?: any[];
  onSaved?: () => void | Promise<void>;
}

const MIN_OCORRENCIAS = 2;
/** Total de consultas da série, aplicado ao sair do campo e ao salvar (não a cada tecla). */
export function ocorrenciasValidas(valor: unknown): number {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n) || n < MIN_OCORRENCIAS) return MIN_OCORRENCIAS;
  return Math.min(MAX_OCORRENCIAS, n);
}

export function AppointmentForm({ open, onOpenChange, initial, medicos, tipos, salas, convenios = [], onSaved }: Props) {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth() as any;
  const editing = !!initial?.id;
  const setTab = (section: string) => {
    const id = section === 'paciente' ? 'appointment-patient' : section === 'consulta' ? 'appointment-doctor' : 'appointment-notes';
    document.getElementById(id)?.focus();
  };
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [form, setForm] = useState<any>({});
  const [initialSnapshot, setInitialSnapshot] = useState('{}');
  const completed = useRef(false);
  const [foraExpediente, setForaExpediente] = useState<string | null>(null);
  const [dataPassada, setDataPassada] = useState(false);
  // `saving` é estado e só muda no próximo render: dois cliques seguidos
  // passavam pela guarda e gravavam a mesma consulta duas vezes.
  const salvandoRef = useRef(false);
  const dataPassadaConfirmada = useRef(false);
  useEffect(() => { dataPassadaConfirmada.current = false; }, [form.data, form.hora_inicio]);

  useEffect(() => {
    if (open) {
      const value = {
        paciente_id: initial?.paciente_id || '',
        medico_id: initial?.medico_id || '',
        data: initial?.data || todaySaoPauloDateOnly(),
        hora_inicio: initial?.hora_inicio?.slice(0, 5) || '09:00',
        hora_fim: initial?.hora_fim?.slice(0, 5) || '',
        tipo: initial?.tipo || 'consulta',
        status: initial?.status || 'agendado',
        sala_id: initial?.sala_id || '',
        observacoes: initial?.observacoes || '',
        convenio_id: initial?.convenio_id || '',
        send_whatsapp: false,
        repetir: 'nao' as FrequenciaRecorrencia,
        ocorrencias: 4 as number | string,
        motivo_remarcacao: '',
      };
      setForm(value);
      setInitialSnapshot(JSON.stringify(value));
      completed.current = false;
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
  const remarcando = !editing && !!initial?._remarcar_id;

  // Ficha do paciente: faltas, retorno previsto e saldo em aberto ajudam a
  // recepção a decidir antes de marcar (confirmar antes, cobrar, juntar retorno).
  const fichaQuery = useQuery({
    queryKey: ['agenda-ficha-paciente', profile?.clinica_id, form.paciente_id],
    enabled: open && !!profile?.clinica_id && !!form.paciente_id,
    staleTime: 60_000,
    queryFn: async () => {
      const [faltas, retorno] = await Promise.all([
        supabase.from('agendamentos').select('id', { count: 'exact', head: true })
          .eq('clinica_id', profile.clinica_id).eq('paciente_id', form.paciente_id).eq('status', 'faltou'),
        supabase.from('retornos').select('data_retorno_prevista, status')
          .eq('clinica_id', profile.clinica_id).eq('paciente_id', form.paciente_id)
          .in('status', ['pendente', 'agendado'])
          .order('data_retorno_prevista', { ascending: true }).limit(1).maybeSingle(),
      ]);
      return {
        faltas: faltas.error ? null : faltas.count ?? 0,
        retorno: retorno.error ? null : (retorno.data as { data_retorno_prevista: string; status: string } | null),
      };
    },
  });
  // Perfil sem acesso ao financeiro recebe erro: a linha do saldo some.
  const saldoQuery = useQuery({
    queryKey: ['agenda-saldo-paciente', profile?.clinica_id, form.paciente_id],
    enabled: open && !!profile?.clinica_id && !!form.paciente_id,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('valor, valor_pago, desconto, acrescimo, status')
        .eq('paciente_id', form.paciente_id)
        .eq('tipo', 'receita');
      if (error) throw error;
      return (data ?? [])
        .filter((c: any) => !['cancelado', 'estornado'].includes(String(c.status)))
        .reduce((total: number, c: any) => total + Math.max(0, saldoDevedor('x', [{ ...c, agendamento_id: 'x' } as any])), 0);
    },
  });

  // Horários livres do médico no dia escolhido, como atalho para o campo Início.
  const duracaoDoTipo = (() => {
    const tipoEscolhido = (tipos as any[]).find((t: any) => String(t.nome || '').toLocaleLowerCase('pt-BR') === String(form.tipo || '').toLocaleLowerCase('pt-BR'));
    return Number(tipoEscolhido?.duracao_minutos) > 0 ? Number(tipoEscolhido.duracao_minutos) : 30;
  })();
  const dataDoFormValida = /^\d{4}-\d{2}-\d{2}$/.test(form.data || '');
  const livresQuery = useQuery({
    queryKey: ['agenda-livres-do-dia', profile?.clinica_id, form.medico_id, form.data, duracaoDoTipo, initial?.id ?? null],
    enabled: open && !!profile?.clinica_id && !!form.medico_id && dataDoFormValida && form.data >= todaySaoPauloDateOnly(),
    staleTime: 30_000,
    queryFn: async () => {
      const diaSemana = new Date(`${form.data}T12:00:00Z`).getUTCDay();
      const [ocupacao, bloqueios, jornada] = await Promise.all([
        supabase.from('agendamentos').select('id, hora_inicio, hora_fim, status')
          .eq('clinica_id', profile.clinica_id).eq('medico_id', form.medico_id).eq('data', form.data),
        (supabase.from('bloqueios_agenda' as any).select('hora_inicio, hora_fim, dia_inteiro')
          .eq('medico_id', form.medico_id).lte('data_inicio', form.data).gte('data_fim', form.data) as any),
        (supabase.from('medico_disponibilidade' as any).select('hora_inicio, hora_fim')
          .eq('medico_id', form.medico_id).eq('dia_semana', diaSemana).eq('ativo', true) as any),
      ]);
      if (ocupacao.error) throw ocupacao.error;
      if (bloqueios.error) throw bloqueios.error;
      if (jornada.error) throw jornada.error;
      return horariosLivresNoDia({
        agendamentos: ((ocupacao.data ?? []) as any[]).filter(a => a.id !== initial?.id),
        bloqueios: bloqueios.data ?? [],
        faixas: faixasDoExpediente(jornada.data ?? []),
        aPartirDe: form.data === todaySaoPauloDateOnly() ? minutosAgoraSaoPaulo() + 1 : 0,
        duracaoMinutos: duracaoDoTipo,
        limite: 16,
      });
    },
  });
  const whatsappPaciente = paciente?.telefone
    ? linkWhatsApp(paciente.telefone, `Olá, ${(paciente.nome_social || paciente.nome || '').split(' ')[0]}! Aqui é da clínica.`)
    : null;
  const terminoPrevisto = (() => {
    if (form.hora_fim || !/^\d{2}:\d{2}$/.test(form.hora_inicio || '')) return null;
    const tipoEscolhido = (tipos as any[]).find((t: any) => String(t.nome || '').toLocaleLowerCase('pt-BR') === String(form.tipo || '').toLocaleLowerCase('pt-BR'));
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

  const medicoDoForm = medicos.find((m) => m.id === form.medico_id);
  const rotuloDoTipo = TIPOS_FIXOS_CONSULTA.find(([valor]) => valor === form.tipo)?.[1] || form.tipo || 'Consulta';
  const convenioDoCadastro = paciente?.convenio_id ? (convenios as any[]).find(c => c.id === paciente.convenio_id)?.nome : null;

  const handleSave = async (confirmouForaExpediente = false) => {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    try {
      await salvarConsulta(confirmouForaExpediente);
    } finally {
      salvandoRef.current = false;
    }
  };

  const salvarConsulta = async (confirmouForaExpediente: boolean) => {
    if (!form.paciente_id) { toast.error('Selecione um paciente'); setTab('paciente'); return; }
    if (!form.medico_id) { toast.error('Selecione um médico'); setTab('consulta'); return; }
    if (!form.hora_inicio) { toast.error('Informe o horário'); setTab('consulta'); return; }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }
    if (remarcando && !isAppointmentCancellationReason(form.motivo_remarcacao)) {
      toast.error('Informe o motivo da remarcação', { description: 'A consulta original será cancelada com esse motivo.' });
      document.getElementById('appointment-reschedule-reason')?.focus();
      return;
    }

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
      const tipoEscolhido = (tipos as any[]).find((t: any) => String(t.nome || '').toLocaleLowerCase('pt-BR') === String(form.tipo || '').toLocaleLowerCase('pt-BR'));
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
          description: `${erroDoDia.message}. Tente de novo antes de salvar.`,
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
          description: `${erroBlocks.message}. Tente de novo — sem isso não dá para saber se o médico está de férias ou se é feriado.`,
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

      // Marcar no passado é raro (registro retroativo) e quase sempre engano
      // de data. Não bloqueia, mas pede confirmação depois das checagens que
      // bloqueiam (conflito e bloqueio de agenda), como o expediente.
      const mudouHorario = !editing || form.data !== initial?.data || form.hora_inicio?.slice(0, 5) !== String(initial?.hora_inicio || '').slice(0, 5);
      if (mudouHorario && !dataPassadaConfirmada.current && appointmentStartHasPassed(form.data, form.hora_inicio)) {
        setDataPassada(true);
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
            description: `${erroJornada.message}. Tente novamente antes de agendar.`,
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
        status: form.status,
        sala_id: form.sala_id || null,
        observacoes: form.observacoes || null,
        // Vazio: o banco preenche com o convênio do cadastro do paciente.
        convenio_id: form.convenio_id || null,
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

      toast.success(editing ? 'Consulta atualizada' : remarcando ? 'Nova consulta marcada' : 'Consulta agendada');

      // Remarcação: a original só é cancelada depois que a nova foi gravada.
      if (remarcando) {
        try {
          const { data, error } = await (supabase as any).rpc('cancelar_agendamento_com_motivo', {
            p_agendamento_id: initial._remarcar_id,
            p_clinica_id: profile.clinica_id,
            p_updated_at: initial._remarcar_updated_at ?? null,
            p_motivo_cancelamento: form.motivo_remarcacao,
          });
          if (error) throw error;
          const resultado = Array.isArray(data) ? data[0] : data;
          if (!resultado?.atualizado) throw new Error('A consulta original mudou desde que foi aberta.');
          toast.success('Consulta remarcada', { description: `A consulta de ${initial._remarcar_resumo || 'origem'} foi cancelada.` });
        } catch (erroRemarcacao) {
          toast.warning('Nova consulta salva, mas a original continua marcada.', {
            description: `${mensagemDeErro(erroRemarcacao)} Cancele a consulta de ${initial._remarcar_resumo || 'origem'} pela agenda.`,
            duration: 12000,
          });
        }
      }

      // Consulta recorrente: a primeira já foi gravada com todas as checagens.
      // As seguintes respeitam bloqueios, expediente e a constraint de
      // sobreposição do banco; o que não couber é listado, sem desfazer o que
      // foi marcado.
      const datasSeguintes = !editing && !initial?._waiting_id && !remarcando
        ? datasDaRecorrencia(form.data, form.repetir, ocorrenciasValidas(form.ocorrencias))
        : [];
      if (datasSeguintes.length) {
        const formatar = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
        const [{ data: bloqueiosSerie, error: erroBloqueiosSerie }, { data: jornadaSerie, error: erroJornadaSerie }] = await Promise.all([
          (supabase.from('bloqueios_agenda' as any)
            .select('data_inicio, data_fim, hora_inicio, hora_fim, dia_inteiro')
            .eq('medico_id', form.medico_id)
            .lte('data_inicio', datasSeguintes[datasSeguintes.length - 1])
            .gte('data_fim', datasSeguintes[0]) as any),
          (supabase.from('medico_disponibilidade' as any)
            .select('dia_semana, hora_inicio, hora_fim')
            .eq('medico_id', form.medico_id).eq('ativo', true) as any),
        ]);
        // Sem bloqueios ou expediente, a série poderia cair em férias ou fora de
        // hora: para e avisa em vez de marcar às cegas.
        if (erroBloqueiosSerie || erroJornadaSerie) {
          toast.warning('A primeira consulta foi marcada, mas as repetições não.', {
            description: `Não foi possível conferir ${erroBloqueiosSerie ? 'os bloqueios' : 'o expediente'} do médico. Marque as datas ${datasSeguintes.map(formatar).join(', ')} manualmente.`,
            duration: 12000,
          });
        } else {
          const ocupadas: string[] = [];
          const foraDoExpediente: string[] = [];
          let criadas = 0;
          for (const data of datasSeguintes) {
            const bloqueada = ((bloqueiosSerie as any[]) || []).some((b: any) => b.data_inicio <= data && b.data_fim >= data && (
              b.dia_inteiro || ((toMin(b.hora_inicio) ?? 0) < novoFim && (toMin(b.hora_fim) ?? 0) > novoInicio)
            ));
            if (bloqueada) { ocupadas.push(data); continue; }
            const diaSemanaSerie = new Date(`${data}T12:00:00Z`).getUTCDay();
            const dentro = ((jornadaSerie as any[]) || []).some((j: any) => {
              const ji = toMin(j.hora_inicio); const jf = toMin(j.hora_fim);
              return j.dia_semana === diaSemanaSerie && ji !== null && jf !== null && novoInicio >= ji && novoFim <= jf;
            });
            // Quem já confirmou "fora do expediente" para a primeira aceitou o horário.
            if (!dentro && !confirmouForaExpediente) { foraDoExpediente.push(data); continue; }
            const { error: erroSerie } = await (supabase.from('agendamentos').insert({ ...payloadToSave, data, status: 'agendado' }) as any);
            if (erroSerie) ocupadas.push(data); else criadas += 1;
          }
          const puladas = ocupadas.length + foraDoExpediente.length;
          if (puladas) {
            toast.warning(`${criadas} repetição(ões) marcada(s); ${puladas} ficou(aram) de fora`, {
              description: [
                ocupadas.length ? `Horário ocupado ou bloqueado em ${ocupadas.map(formatar).join(', ')}.` : '',
                foraDoExpediente.length ? `Fora do expediente em ${foraDoExpediente.map(formatar).join(', ')}.` : '',
                'Marque essas datas manualmente.',
              ].filter(Boolean).join(' '),
              duration: 12000,
            });
          } else {
            toast.success(`${criadas} repetição(ões) marcada(s)`, { description: datasSeguintes.map(formatar).join(', ') });
          }
        }
      }

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
            description: `${erroLembrete?.message || 'Falha ao preparar a confirmação'}. Confira as automações de WhatsApp.`,
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
      completed.current = true;
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
        toast.error(e.message || 'Erro ao salvar');
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
      completed.current = true;
      onOpenChange(false);
    } catch (error) {
      toast.error('Não foi possível cancelar a consulta.', { description: mensagemDeErro(error) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <UnsavedChangesGuard dirty={JSON.stringify(form) !== initialSnapshot} busy={saving || deleting} completed={completed} />
      <div className="mx-auto w-full max-w-6xl space-y-5 pb-6">
        <header className="space-y-3 border-b border-border pb-5">
          <Button variant="ghost" className="-ml-3 gap-2" onClick={() => onOpenChange(false)} disabled={saving || deleting}><ArrowLeft className="h-4 w-4" />Voltar à agenda</Button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{editing ? 'Editar consulta' : remarcando ? 'Remarcar consulta' : 'Nova consulta'}</h1>
            <span className="text-sm text-muted-foreground">{JSON.stringify(form) !== initialSnapshot ? 'Alterações não salvas' : 'Agendamento'}</span>
          </div>
          {/* Ficha-resumo atualizada a cada campo: confere-se tudo sem rolar. */}
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {[
              paciente ? <span key="p" className="font-medium text-foreground">{paciente.nome_social || paciente.nome}</span> : 'Paciente a escolher',
              form.data && /^\d{4}-\d{2}-\d{2}$/.test(form.data) ? `${form.data.split('-').reverse().join('/')}${form.hora_inicio ? ` às ${form.hora_inicio}` : ''}` : 'data a definir',
              medicoDoForm ? nomeMedico(medicoDoForm.nome || medicoDoForm.crm) : 'profissional a escolher',
              rotuloDoTipo,
            ].map((parte, i) => <span key={i}>{i > 0 ? ' · ' : ''}{parte}</span>)}
          </p>
          {remarcando && (
            <p className="text-sm text-muted-foreground">
              Ao salvar, a consulta de <span className="font-medium text-foreground">{initial._remarcar_resumo}</span> será cancelada com o motivo escolhido abaixo.
            </p>
          )}
          {editing && form.status === 'cancelado' && (
            <p className="text-sm text-muted-foreground">
              Motivo do cancelamento: <span className="font-medium text-foreground">{appointmentCancellationReasonLabel(initial?.motivo_cancelamento) ?? 'Não informado'}</span>
            </p>
          )}
        </header>

        <fieldset disabled={saving || deleting || consultaSomenteLeitura} className="min-w-0 space-y-5">
          <section aria-labelledby="appointment-patient-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                <h2 id="appointment-patient-heading" className="text-lg font-semibold">Paciente</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Busque pelo nome, CPF ou telefone para conferir o cadastro e o histórico.</p>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="appointment-patient">Buscar paciente</Label>
                <PacienteCombobox id="appointment-patient" value={form.paciente_id} onChange={(id) => setForm((f: any) => ({ ...f, paciente_id: id }))} />
              </div>
              <div className="min-w-0">
                {paciente ? (
                  <div className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 truncate font-semibold">{paciente.nome_social || paciente.nome}</div>
                      {whatsappPaciente && (
                        <a href={whatsappPaciente} target="_blank" rel="noopener noreferrer" aria-label="Abrir conversa no WhatsApp" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10 text-[#128C7E] transition hover:bg-[#128C7E] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          <MessageCircle aria-hidden="true" className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {paciente.cpf && <span>CPF: {paciente.cpf}</span>}
                      {paciente.telefone && <span>Tel: {paciente.telefone}</span>}
                    </div>
                    {ultimoAtendimento && (
                      <div className="mt-1.5 flex items-start gap-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        <History aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          Último atendimento: <span className="font-medium text-foreground">{String(ultimoAtendimento.data).split('-').reverse().join('/')} às {String(ultimoAtendimento.hora_inicio).slice(0, 5)}</span>
                          {ultimoAtendimento.medicos?.nome && ` · ${nomeMedico(ultimoAtendimento.medicos.nome)}`}
                          {' · '}{formatAppointmentStatus(ultimoAtendimento.status)}
                        </span>
                      </div>
                    )}
                    {!ultimoAtendimento && !ultimoAtendimentoQuery.isLoading && (
                      <div className="mt-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">Primeira consulta na clínica.</div>
                    )}
                    {ultimoAtendimentoQuery.isLoading && (
                      <p className="mt-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">Carregando histórico recente…</p>
                    )}
                    {(fichaQuery.data || (saldoQuery.data ?? 0) > 0) && (
                      <dl className="mt-1.5 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Faltas</dt>
                          <dd className={cn('font-semibold tabular-nums', (fichaQuery.data?.faltas ?? 0) >= 2 ? 'text-warning-foreground' : 'text-foreground')}>
                            {fichaQuery.data?.faltas ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Em aberto</dt>
                          <dd className={cn('font-semibold tabular-nums', (saldoQuery.data ?? 0) > 0 ? 'text-destructive' : 'text-foreground')}>
                            {saldoQuery.isError || saldoQuery.data === undefined ? '—' : formatCurrency(saldoQuery.data)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Retorno previsto</dt>
                          <dd className="font-semibold tabular-nums text-foreground">
                            {fichaQuery.data?.retorno ? String(fichaQuery.data.retorno.data_retorno_prevista).split('-').reverse().join('/') : '—'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-11 items-center rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {form.paciente_id ? 'Carregando dados do paciente…' : 'Selecione um paciente para ver os dados de contato e o último atendimento.'}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="appointment-details-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                <h2 id="appointment-details-heading" className="text-lg font-semibold">Dados da consulta</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Campos com * são obrigatórios. O horário final pode ser calculado pelo tipo de atendimento.</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="appointment-doctor">Médico *</Label>
                <Select value={form.medico_id} onValueChange={(v) => setForm({ ...form, medico_id: v })}>
                  <SelectTrigger id="appointment-doctor"><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                  <SelectContent data-elo-font-preview="agenda">
                    {[...medicos.filter(m => m.ativo !== false), ...(medicoInativoDaConsulta ? [medicoInativoDaConsulta] : [])].map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {nomeMedico(m.nome || m.crm)} · {m.ativo === false ? 'Inativo (consulta existente)' : m.especialidade || 'Geral'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="appointment-date">Data *</Label>
                  <Input id="appointment-date" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="appointment-start">Início *</Label>
                  <Input id="appointment-start" type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="appointment-end">Fim (opcional)</Label>
                  <Input id="appointment-end" type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
                </div>
              </div>
              {form.medico_id && livresQuery.data && (
                <div role="group" aria-label="Horários livres do médico neste dia" className="-mt-1 space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {livresQuery.data.length ? `Horários livres (${duracaoDoTipo} min):` : 'Sem horário livre no expediente deste dia.'}
                  </p>
                  {livresQuery.data.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {livresQuery.data.map(hora => (
                        <button
                          key={hora}
                          type="button"
                          aria-pressed={form.hora_inicio === hora}
                          onClick={() => setForm((f: any) => ({ ...f, hora_inicio: hora, hora_fim: '' }))}
                          className={cn(
                            'min-h-9 rounded-full border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            form.hora_inicio === hora ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-accent',
                          )}
                        >
                          {hora}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {terminoPrevisto && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  Sem término informado: será salvo até <span className="font-semibold text-foreground">{terminoPrevisto.hora}</span> ({terminoPrevisto.duracao} min pelo tipo escolhido).
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="appointment-type">Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger id="appointment-type"><SelectValue /></SelectTrigger>
                    <SelectContent data-elo-font-preview="agenda">
                      <SelectItem value="consulta">Consulta</SelectItem>
                      <SelectItem value="retorno">Retorno</SelectItem>
                      <SelectItem value="exame">Exame</SelectItem>
                      <SelectItem value="procedimento">Procedimento</SelectItem>
                      <SelectItem value="telemedicina">Teleconsulta</SelectItem>
                      {tipos.map(t => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
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
                      <SelectContent data-elo-font-preview="agenda">
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
              <div>
                <Label htmlFor="appointment-insurance">Convênio</Label>
                <Select value={form.convenio_id || 'cadastro'} onValueChange={(v) => setForm({ ...form, convenio_id: v === 'cadastro' ? '' : v })}>
                  <SelectTrigger id="appointment-insurance"><SelectValue /></SelectTrigger>
                  <SelectContent data-elo-font-preview="agenda">
                    <SelectItem value="cadastro">{convenioDoCadastro ? `Do cadastro (${convenioDoCadastro})` : 'Do cadastro do paciente'}</SelectItem>
                    {(convenios as any[]).filter(c => c.ativo !== false || c.id === form.convenio_id).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Define o preço na finalização. Sem escolha, vale o convênio do cadastro.</p>
              </div>
              {salas.length > 0 && (
                <div>
                  <Label htmlFor="appointment-room">Sala</Label>
                  <Select value={form.sala_id || 'none'} onValueChange={(v) => setForm({ ...form, sala_id: v === 'none' ? '' : v })}>
                    <SelectTrigger id="appointment-room"><SelectValue /></SelectTrigger>
                    <SelectContent data-elo-font-preview="agenda">
                      <SelectItem value="none">Sem sala</SelectItem>
                      {salas.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="appointment-notes-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
              <h2 id="appointment-notes-heading" className="text-lg font-semibold">Observações e confirmação</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Informações adicionais para a equipe. Exames precisam do nome do exame.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
              <div className="space-y-2">
                <Label htmlFor="appointment-notes">{['exame', 'exames'].includes(String(form.tipo || '').toLocaleLowerCase('pt-BR')) ? 'Nome do exame *' : 'Observações'}</Label>
                <Textarea id="appointment-notes" rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder={['exame', 'exames'].includes(String(form.tipo || '').toLocaleLowerCase('pt-BR')) ? 'Ex.: Hemograma completo ou 40301630 - Hemograma' : 'Motivo, sintomas, orientações...'} />
              </div>
              {remarcando && (
                <div className="space-y-2">
                  <Label htmlFor="appointment-reschedule-reason">Motivo da remarcação *</Label>
                  <Select value={form.motivo_remarcacao} onValueChange={(v) => setForm({ ...form, motivo_remarcacao: v })}>
                    <SelectTrigger id="appointment-reschedule-reason"><SelectValue placeholder="Selecione um motivo" /></SelectTrigger>
                    <SelectContent data-elo-font-preview="agenda">
                      {APPOINTMENT_CANCELLATION_REASONS.map((reason) => (
                        <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Fica registrado no cancelamento da consulta original.</p>
                </div>
              )}
              {!editing && !initial?._waiting_id && !remarcando && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="appointment-repeat">Repetir</Label>
                    <Select value={form.repetir || 'nao'} onValueChange={(v) => setForm({ ...form, repetir: v as FrequenciaRecorrencia })}>
                      <SelectTrigger id="appointment-repeat"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FREQUENCIAS_RECORRENCIA.map(f => <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.repetir && form.repetir !== 'nao' && (
                    <div>
                      <Label htmlFor="appointment-occurrences">Total de consultas (até {MAX_OCORRENCIAS})</Label>
                      {/* O limite vale ao sair do campo: aplicado a cada tecla, apagar
                          o "4" para digitar "10" virava 2 na hora. */}
                      <Input id="appointment-occurrences" type="number" inputMode="numeric" min={MIN_OCORRENCIAS} max={MAX_OCORRENCIAS} value={form.ocorrencias}
                        onChange={(e) => setForm({ ...form, ocorrencias: e.target.value })}
                        onBlur={() => setForm((f: any) => ({ ...f, ocorrencias: ocorrenciasValidas(f.ocorrencias) }))} />
                    </div>
                  )}
                  {form.repetir && form.repetir !== 'nao' && (
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Também em {datasDaRecorrencia(form.data, form.repetir, ocorrenciasValidas(form.ocorrencias)).map(d => d.split('-').reverse().slice(0, 2).join('/')).join(', ')}. Horários ocupados, bloqueados ou fora do expediente ficam de fora e são avisados.
                    </p>
                  )}
                </div>
              )}
              {!editing && (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="min-w-0">
                    <Label htmlFor="appointment-whatsapp" className="flex items-center gap-2 text-sm">
                      <MessageCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                      Enviar confirmação por WhatsApp
                    </Label>
                    <p className="mt-1 pl-6 text-xs text-muted-foreground">A mensagem configurada entra na fila após agendar.</p>
                  </div>
                  <Switch id="appointment-whatsapp" checked={form.send_whatsapp} onCheckedChange={(v) => setForm({ ...form, send_whatsapp: v })} />
                </div>
              )}
            </div>
          </section>
        </fieldset>

        {/* Rodapé fixo: o botão de salvar fica sempre à vista, sem rolar o formulário. */}
        <footer className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:px-0">
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
          <div className="ml-auto flex gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={saving || deleting}>Cancelar</Button>
            <Button className="min-h-11" onClick={() => handleSave()} disabled={saving || deleting || consultaSomenteLeitura}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {consultaSomenteLeitura ? 'Somente leitura' : editing ? 'Salvar alterações' : remarcando ? 'Remarcar consulta' : 'Agendar consulta'}
            </Button>
          </div>
        </footer>
      </div>
      <AlertDialog open={dataPassada} onOpenChange={(o) => !o && setDataPassada(false)}>
        <AlertDialogContent data-elo-font-preview="agenda">
          <AlertDialogHeader>
            <AlertDialogTitle>Data e horário já passaram</AlertDialogTitle>
            <AlertDialogDescription>A consulta ficaria marcada para {form.data ? form.data.split('-').reverse().join('/') : 'uma data'} às {String(form.hora_inicio || '').slice(0, 5)}, antes de agora. Confira a data ou confirme se é um registro retroativo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Corrigir a data</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDataPassada(false); dataPassadaConfirmada.current = true; void handleSave(); }}>Agendar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!foraExpediente} onOpenChange={(o) => !o && setForaExpediente(null)}>
        <AlertDialogContent data-elo-font-preview="agenda">
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
        <AlertDialogContent data-elo-font-preview="agenda">
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
              <SelectContent data-elo-font-preview="agenda">
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
    </>
  );
}
