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
  cartao_sus?: string | null;
}

/**
 * O paciente corresponde ao termo digitado?
 *
 * Casa por nome (e nome social), CPF, telefone, e-mail e cartão do SUS,
 * ignorando acento, caixa e máscara. Um termo só de dígitos é procurado nos
 * campos numéricos; um termo com letras, nos campos de texto.
 */
export function pacienteCorresponde(paciente: PacienteBuscavel, termo: string): boolean {
  const busca = termo.trim();
  if (!busca) return true;

  const digitos = apenasDigitos(busca);

  // Termo numérico: CPF, telefone ou cartão do SUS, sem depender da máscara.
  if (digitos.length >= 3) {
    if (apenasDigitos(paciente.cpf).includes(digitos)) return true;
    if (apenasDigitos(paciente.telefone).includes(digitos)) return true;
    if (apenasDigitos(paciente.cartao_sus).includes(digitos)) return true;
  }

  // Termo puramente numérico não deve casar por nome.
  if (digitos.length === busca.length) return false;

  const texto = normalizarTexto(busca);
  return (
    normalizarTexto(paciente.nome).includes(texto) ||
    normalizarTexto(paciente.nome_social).includes(texto) ||
    normalizarTexto(paciente.email).includes(texto)
  );
}
