import type { PacienteIdentificacao } from '@/components/clinical/IdentificacaoPaciente';

/**
 * Invariante de CLIN-QA-545: o paciente exibido num diálogo de registro é o
 * mesmo paciente em que o registro será gravado.
 *
 * O prontuário guarda `paciente_id` na abertura; a tela guarda o paciente
 * selecionado à parte. Se os dois divergirem (corrida com o rascunho, troca de
 * `?paciente=` com o diálogo aberto), gravar seria registrar no paciente A o
 * que o profissional digitou vendo o paciente B.
 */
export function pacienteDivergeDoRegistro(
  registroPacienteId: string | null | undefined,
  pacienteExibidoId: string | null | undefined,
): boolean {
  if (!registroPacienteId) return false;
  return registroPacienteId !== pacienteExibidoId;
}

/**
 * Devolve o paciente carregado só quando ele é o paciente do registro.
 * Assim o cabeçalho, as alergias e os anexos nunca mostram outra pessoa.
 */
export function pacienteDoRegistro<T extends { id: string }>(
  registroPacienteId: string | null | undefined,
  paciente: T | null | undefined,
): T | null {
  if (!registroPacienteId || !paciente) return null;
  return paciente.id === registroPacienteId ? paciente : null;
}

interface PacienteCadastro {
  nome?: string | null;
  nome_social?: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  alergias?: string[] | null;
}

/**
 * Converte o cadastro em dados para `IdentificacaoPaciente`.
 *
 * `pacientes.alergias` tem padrão `'{}'`: lista vazia no banco pode ser
 * "nunca perguntado". Sem campo de confirmação, ela vira `null` ("Alergias não
 * informadas"), conforme docs/ux/telas/identificacao-paciente.md, seção 5.3.
 */
export function paraIdentificacao(
  paciente: PacienteCadastro,
  convenio?: string | null,
): PacienteIdentificacao {
  const alergias = (paciente.alergias ?? []).map((a) => a?.trim()).filter(Boolean) as string[];
  return {
    nome: paciente.nome ?? '',
    nome_social: paciente.nome_social ?? null,
    data_nascimento: paciente.data_nascimento ?? null,
    cpf: paciente.cpf ?? null,
    alergias: alergias.length > 0 ? alergias : null,
    ...(convenio !== undefined ? { convenio } : {}),
  };
}
