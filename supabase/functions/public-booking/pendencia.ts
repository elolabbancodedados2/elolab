/**
 * Pedido do link público que não pôde ser vinculado a um paciente (CPF
 * ambíguo ou nascimento divergente) vira tarefa para a recepção.
 *
 * A tarefa fica sem `paciente_id`, então não aparece na revisão nem na
 * anonimização do paciente (LGPD). Por isso ela guarda só o mínimo para a
 * recepção retornar o contato: motivo, horário pedido, primeiro nome e
 * telefone. Nome completo, CPF, nascimento e e-mail não são copiados; a
 * recepção confirma a identidade com o paciente no retorno.
 *
 * A reserva temporária do horário é liberada depois que a tarefa é criada,
 * porque nenhum agendamento sai desse pedido. Se a tarefa falhar, a reserva
 * fica até expirar e o erro sobe, para o pedido poder ser repetido.
 */
import { DESCRICAO_MOTIVO_PENDENCIA, type MotivoPendencia } from '../_shared/identificacaoPaciente.ts';

export interface DadosPendencia {
  clinicaId: string;
  motivo: MotivoPendencia;
  data: string;
  hora: string;
  medicoNome: string;
  nome: string;
  telefone: string;
  hoje: string;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0]?.slice(0, 40) ?? '';
}

export function montarTarefaPendencia(d: DadosPendencia) {
  return {
    clinica_id: d.clinicaId,
    titulo: 'Agendamento online pendente: conferir cadastro',
    descricao: [
      'Pedido feito pelo link público que não foi vinculado a nenhum paciente nem agendado.',
      `Motivo: ${DESCRICAO_MOTIVO_PENDENCIA[d.motivo]}`,
      '',
      `Horário solicitado: ${d.data} às ${d.hora} com ${d.medicoNome}`,
      `Retornar contato: ${primeiroNome(d.nome)}, telefone ${d.telefone}`,
      '',
      'Por segurança, CPF, data de nascimento e nome completo não foram copiados para esta tarefa.',
      'Confirme a identidade com o paciente antes de agendar ou corrigir o cadastro.',
    ].join('\n'),
    categoria: 'Administrativo',
    prioridade: 'alta',
    status: 'pendente',
    data_vencimento: d.hoje,
    paciente_id: null,
  };
}

type ErroDb = { message?: string; code?: string } | null;

/** Subconjunto do cliente Supabase usado aqui (facilita o teste). */
export interface DbPendencia {
  from(tabela: string): {
    insert(valores: Record<string, unknown>): PromiseLike<{ error: ErroDb }>;
    delete(): {
      eq(coluna: string, valor: string): {
        eq(coluna: string, valor: string): PromiseLike<{ error: ErroDb }>;
      };
    };
  };
}

export async function liberarReserva(db: DbPendencia, clinicaId: string, tokenHash: string): Promise<ErroDb> {
  const { error } = await db.from('public_booking_holds').delete()
    .eq('clinica_id', clinicaId).eq('token_hash', tokenHash);
  return error;
}

/**
 * Cria a tarefa e só então libera a reserva. Falha ao criar a tarefa sobe
 * como erro (reserva preservada). Falha ao liberar a reserva não desfaz a
 * tarefa: o pedido já foi registrado e a reserva expira sozinha.
 */
export async function registrarPendenciaELiberar(
  db: DbPendencia,
  dados: DadosPendencia,
  tokenHash: string,
): Promise<void> {
  const { error: erroTarefa } = await db.from('tarefas').insert(montarTarefaPendencia(dados));
  if (erroTarefa) throw erroTarefa;

  const erroRelease = await liberarReserva(db, dados.clinicaId, tokenHash);
  if (erroRelease) {
    console.error('[public-booking] reserva não liberada após pendência', { code: erroRelease.code ?? null });
  }
}
