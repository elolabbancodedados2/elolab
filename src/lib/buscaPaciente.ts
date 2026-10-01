/**
 * Casamento de texto para busca de paciente no balcão.
 *
 * O PROBLEMA
 * A busca comparava texto cru dos dois lados:
 *
 *   p.cpf.includes(termo)          // CPF é salvo com máscara: "123.456.789-00"
 *   p.telefone.includes(termo)     // telefone também: "(11) 98888-7777"
 *   p.nome.toLowerCase().includes(termo.toLowerCase())
 *
 * A recepcionista lê o CPF do documento e digita `12345678900` — não acha.
 * Digita "jose" e o José Antônio não aparece. Com fila na frente, ela conclui
 * que o paciente não está cadastrado e cria um duplicado. Duplicata de paciente
 * é a pior: o histórico clínico racha em dois e ninguém percebe na hora.
 */

/** minúsculas, sem acento — para casar nome digitado com nome cadastrado. */
export function normalizarTexto(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, já separadas pelo NFD
    .replace(/\s+/g, ' ')
    .trim();
}

/** Só os dígitos — para casar CPF e telefone independentemente da máscara. */
export function apenasDigitos(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor.replace(/\D/g, '');
}

export interface PacienteBuscavel {
  nome?: string | null;
  nome_social?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
}

/**
 * O paciente corresponde ao termo digitado?
 *
 * Casa por nome (e nome social), CPF, telefone e e-mail, ignorando acento,
 * caixa e máscara. Um termo com 3+ dígitos é procurado em CPF e telefone; a
 * busca textual roda sempre. (Não há cartão do SUS: `pacientes` não tem essa
 * coluna, então prometer essa busca só enganaria quem lê o código.)
 */
export function pacienteCorresponde(paciente: PacienteBuscavel, termo: string): boolean {
  const busca = termo.trim();
  if (!busca) return true;

  const digitos = apenasDigitos(busca);

  // Termo numérico: CPF ou telefone, sem depender da máscara.
  if (digitos.length >= 3) {
    if (apenasDigitos(paciente.cpf).includes(digitos)) return true;
    if (apenasDigitos(paciente.telefone).includes(digitos)) return true;
  }

  // A busca textual roda SEMPRE, inclusive para termo só de dígitos.
  //
  // Havia aqui um `if (digitos.length === busca.length) return false`, que
  // impedia termo numérico de casar por nome. Isso regredia o comportamento
  // anterior: quem procurasse "123" deixava de encontrar "Paciente 123" — e
  // nome com número é comum em cadastro provisório ("RN 2", "Leito 12") e em
  // recém-nascido ainda sem nome definido.
  const texto = normalizarTexto(busca);
  return (
    normalizarTexto(paciente.nome).includes(texto) ||
    normalizarTexto(paciente.nome_social).includes(texto) ||
    normalizarTexto(paciente.email).includes(texto)
  );
}
