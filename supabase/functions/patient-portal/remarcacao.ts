/**
 * Remarcação de consulta pelo paciente (Portal do Paciente).
 *
 * Fica fora do `index.ts` para ser testável sem subir a Edge Function: o
 * banco e o validador de horário são injetados.
 *
 * Regras além das do horário em si (jornada, bloqueio, sobreposição):
 *   * a nova data respeita a antecedência máxima que a clínica configurou para
 *     agendamento online (`configuracoes_clinica.agendamento_online`), com a
 *     mesma normalização do link público — sem isso o paciente podia empurrar a
 *     consulta para anos à frente, já que a disponibilidade é semanal;
 *   * remarcar para a data e a hora que a consulta já tem é recusado — antes
 *     isso só derrubava a confirmação (`confirmado` → `agendado`).
 */
import {
  agoraEmBrasilia,
  dataValida,
  horarioConsultaPassou,
  timeToMinutes,
  validarHorario,
} from '../_shared/horarios.ts';
import { registrarRemarcacao, resumoErro, type ResultadoRegistroRemarcacao } from './avisoRemarcacao.ts';

/** Mostrado ao paciente quando a clínica não recebeu o aviso por e-mail. */
export const AVISO_CLINICA_NAO_NOTIFICADA =
  'A clínica não foi avisada automaticamente desta mudança. Se puder, confirme o novo horário com a clínica.';

export const DIAS_ANTECEDENCIA_PADRAO = 60;
export const DIAS_ANTECEDENCIA_MAXIMO = 180;

export interface RespostaPortal {
  status: number;
  body: Record<string, unknown>;
}

export interface ContextoPaciente {
  pacienteId: string;
  clinicaId: string;
}

export interface DependenciasRemarcacao {
  /** Instante de referência; padrão: agora. */
  agora?: Date;
  /** Validação de jornada, bloqueio e sobreposição; padrão: `validarHorario`. */
  validarSlot?: typeof validarHorario;
  /** Auditoria e aviso pós-remarcação; padrão: `registrarRemarcacao`. */
  registrarRemarcacao?: typeof registrarRemarcacao;
}

/** Mesma regra do link público: vazio/0 vira o padrão, e fica entre 1 e 180. */
export function normalizarDiasAntecedencia(valor: unknown): number {
  return Math.min(Math.max(Number(valor) || DIAS_ANTECEDENCIA_PADRAO, 1), DIAS_ANTECEDENCIA_MAXIMO);
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function dataBr(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function somarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = (h * 60 + m + minutos) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Última data ("YYYY-MM-DD") aceita para remarcar, contada a partir de hoje em Brasília. */
export async function limiteDataRemarcacao(db: any, clinicaId: string, agora: Date = new Date()): Promise<string> {
  const { data, error } = await db
    .from('configuracoes_clinica')
    .select('valor')
    .eq('clinica_id', clinicaId)
    .eq('chave', 'agendamento_online')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const dias = normalizarDiasAntecedencia((data?.valor as { dias_antecedencia?: unknown } | null)?.dias_antecedencia);
  return somarDias(agoraEmBrasilia(agora).data, dias);
}

/** `null` se a data está dentro do limite; senão, a resposta de recusa. */
export async function recusarDataAlemDoLimite(
  db: any,
  clinicaId: string,
  data: string,
  agora: Date = new Date(),
): Promise<RespostaPortal | null> {
  const limite = await limiteDataRemarcacao(db, clinicaId, agora);
  if (data <= limite) return null;
  return {
    status: 400,
    body: {
      error: `Escolha uma data até ${dataBr(limite)}, o prazo máximo para remarcar pelo portal.`,
      code: 'date_beyond_limit',
      limite,
    },
  };
}

export async function remarcarAgendamento(
  db: any,
  ctx: ContextoPaciente,
  body: { agendamento_id?: unknown; nova_data?: unknown; novo_horario?: unknown },
  deps: DependenciasRemarcacao = {},
): Promise<RespostaPortal> {
  const agora = deps.agora ?? new Date();
  const validarSlot = deps.validarSlot ?? validarHorario;
  const agendamentoId = body.agendamento_id ? String(body.agendamento_id) : '';
  const novaData = body.nova_data ? String(body.nova_data) : '';
  const novoHorario = body.novo_horario ? String(body.novo_horario) : '';

  if (!agendamentoId || !novaData || !novoHorario) {
    return { status: 400, body: { error: 'agendamento_id, nova_data, novo_horario são obrigatórios' } };
  }

  const { data: agendamento, error: fetchError } = await db
    .from('agendamentos')
    .select('id, medico_id, data, hora_inicio, paciente_id, tipo, status')
    .eq('id', agendamentoId)
    .eq('paciente_id', ctx.pacienteId)
    .eq('clinica_id', ctx.clinicaId)
    .single();
  if (fetchError || !agendamento) {
    return { status: 404, body: { error: 'Agendamento não encontrado' } };
  }

  if (!['agendado', 'confirmado'].includes(agendamento.status)) {
    return {
      status: 409,
      body: { error: 'Esta consulta não pode mais ser remarcada pelo portal', code: 'appointment_state_changed' },
    };
  }

  if (horarioConsultaPassou(agendamento.data, agendamento.hora_inicio, agora)) {
    return {
      status: 409,
      body: {
        error: 'O horário desta consulta já passou e ela não pode mais ser remarcada pelo portal',
        code: 'appointment_state_changed',
      },
    };
  }

  // Mesma regra da busca de horários: profissional desativado não recebe
  // remarcação pelo portal, mesmo que a disponibilidade dele continue cadastrada.
  const { data: medicoAtivo, error: medicoError } = await db
    .from('medicos')
    .select('id')
    .eq('id', agendamento.medico_id)
    .eq('clinica_id', ctx.clinicaId)
    .eq('ativo', true)
    .maybeSingle();
  if (medicoError) throw medicoError;
  if (!medicoAtivo) {
    return {
      status: 409,
      body: {
        error: 'O profissional desta consulta não está disponível para remarcação pelo portal. Fale com a clínica.',
        code: 'professional_unavailable',
      },
    };
  }

  // "09:00" e "09:00:00" são o mesmo horário; compara em minutos.
  const minutosAtuais = timeToMinutes(agendamento.hora_inicio);
  if (
    novaData === agendamento.data &&
    minutosAtuais !== null &&
    timeToMinutes(novoHorario) === minutosAtuais
  ) {
    return {
      status: 400,
      body: { error: 'Esta já é a data e o horário da sua consulta. Escolha outro horário.', code: 'same_slot' },
    };
  }

  if (!dataValida(novaData) || novaData < agoraEmBrasilia(agora).data) {
    return { status: 400, body: { error: 'A nova data não pode ser no passado' } };
  }

  const alemDoLimite = await recusarDataAlemDoLimite(db, ctx.clinicaId, novaData, agora);
  if (alemDoLimite) return alemDoLimite;

  const slot = await validarSlot(db, ctx.clinicaId, agendamento.medico_id, novaData, novoHorario, agendamentoId);
  if (slot.error) {
    return { status: 409, body: { error: slot.error } };
  }

  // Check no double-booking at new time
  const { data: conflictingSlots, error: conflictError } = await db
    .from('agendamentos')
    .select('id')
    .eq('medico_id', agendamento.medico_id)
    .eq('clinica_id', ctx.clinicaId)
    .eq('data', novaData)
    .eq('hora_inicio', novoHorario)
    .not('status', 'in', '("cancelado")')
    .neq('id', agendamentoId)
    .limit(1);
  if (conflictError) throw conflictError;
  if (conflictingSlots && conflictingSlots.length > 0) {
    return { status: 409, body: { error: 'Este horário já está ocupado na nova data' } };
  }

  // Só grava se a consulta ainda estiver na data e hora lidas acima: uma
  // remarcação feita pela recepção nesse intervalo não pode ser sobrescrita.
  let atualizacao = db
    .from('agendamentos')
    .update({
      data: novaData,
      hora_inicio: novoHorario,
      hora_fim: somarMinutos(novoHorario, slot.duration),
      status: 'agendado',
    })
    .eq('id', agendamentoId)
    .eq('paciente_id', ctx.pacienteId)
    .eq('clinica_id', ctx.clinicaId)
    .in('status', ['agendado', 'confirmado'])
    .eq('data', agendamento.data);
  atualizacao = agendamento.hora_inicio === null || agendamento.hora_inicio === undefined
    ? atualizacao.is('hora_inicio', null)
    : atualizacao.eq('hora_inicio', agendamento.hora_inicio);
  const { data: remarcado, error: updateError } = await atualizacao
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!remarcado) {
    return {
      status: 409,
      body: { error: 'A consulta foi atualizada. Recarregue a página e tente novamente.', code: 'appointment_state_changed' },
    };
  }
  // A consulta já está no novo horário: daqui para frente nada pode virar erro
  // para o paciente. `registrarRemarcacao` não lança; o try é defesa extra.
  let avisos: ResultadoRegistroRemarcacao;
  try {
    avisos = await (deps.registrarRemarcacao ?? registrarRemarcacao)(db, {
      agendamentoId,
      clinicaId: ctx.clinicaId,
      pacienteId: ctx.pacienteId,
      anterior: { data: agendamento.data, hora_inicio: agendamento.hora_inicio ?? null },
      nova: { data: novaData, hora_inicio: novoHorario },
    });
  } catch (erro) {
    console.error(`[remarcacao-portal] registro pós-remarcação falhou (agendamento=${agendamentoId}; ${resumoErro(erro)}).`);
    avisos = { auditoria: 'falhou', aviso_clinica: 'falhou' };
  }

  const corpo: Record<string, unknown> = { success: true, message: 'Agendamento remarcado com sucesso', avisos };
  if (avisos.aviso_clinica !== 'enfileirado') corpo.aviso = AVISO_CLINICA_NAO_NOTIFICADA;
  return { status: 200, body: corpo };
}
