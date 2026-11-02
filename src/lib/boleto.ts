/**
 * Leitura da linha digitável de boletos (padrão FEBRABAN).
 *
 * - Boleto bancário: 47 dígitos em cinco campos. Os três primeiros têm dígito
 *   verificador módulo 10; o quinto traz o fator de vencimento e o valor.
 * - Arrecadação (contas de consumo, tributos): 48 dígitos começando por 8,
 *   em quatro blocos de 11 + 1 dígito verificador (módulo 10 ou 11).
 *
 * Nada aqui consulta banco: só confere os dígitos e extrai valor e vencimento
 * para preencher o formulário da despesa.
 */

export type TipoBoleto = 'bancario' | 'arrecadacao';

export interface BoletoLido {
  tipo: TipoBoleto;
  linha: string;
  /** Linha digitável com a máscara de leitura. */
  formatada: string;
  valor: number | null;
  vencimento: string | null;
}

export type ResultadoBoleto =
  | { ok: true; boleto: BoletoLido; erro?: undefined }
  | { ok: false; erro: string; boleto?: undefined };

export const apenasDigitosBoleto = (texto: string) => texto.replace(/\D/g, '');

export function modulo10(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    const produto = Number(numero[i]) * peso;
    soma += produto > 9 ? Math.floor(produto / 10) + (produto % 10) : produto;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/** Módulo 11 do código de barras bancário (pesos 2 a 9; 0, 10 e 11 viram 1). */
export function modulo11Bancario(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Módulo 11 da arrecadação (restos 0 e 1 viram 0; 10 vira 1). */
function modulo11Arrecadacao(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  if (resto === 0 || resto === 1) return 0;
  if (resto === 10) return 1;
  return 11 - resto;
}

const DIA_MS = 86_400_000;
const isoUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * O fator 1000 corresponde a 03/07/2000 e chegou a 9999 em 21/02/2025;
 * desde 22/02/2025 a contagem recomeçou em 1000. Escolhe o ciclo cuja data
 * fica mais perto de hoje.
 */
export function vencimentoDoFator(fator: number, hoje: string): string | null {
  if (!Number.isInteger(fator) || fator < 1000 || fator > 9999) return null;
  const baseAntiga = Date.UTC(1997, 9, 7);
  const baseNova = Date.UTC(2025, 1, 22);
  const antiga = baseAntiga + fator * DIA_MS;
  const nova = baseNova + (fator - 1000) * DIA_MS;
  const referencia = Date.parse(`${hoje}T00:00:00Z`);
  return isoUtc(Math.abs(nova - referencia) <= Math.abs(antiga - referencia) ? nova : antiga);
}

function lerBancario(linha: string, hoje: string): ResultadoBoleto {
  const campos = [linha.slice(0, 10), linha.slice(10, 21), linha.slice(21, 32)];
  for (const [indice, campo] of campos.entries()) {
    if (modulo10(campo.slice(0, -1)) !== Number(campo.slice(-1))) {
      return { ok: false, erro: `O campo ${indice + 1} da linha digitável não confere. Verifique os números digitados.` };
    }
  }
  const codigoBarras = linha.slice(0, 4) + linha[32] + linha.slice(33, 47) + linha.slice(4, 9) + linha.slice(10, 20) + linha.slice(21, 31);
  if (modulo11Bancario(codigoBarras.slice(0, 4) + codigoBarras.slice(5)) !== Number(codigoBarras[4])) {
    return { ok: false, erro: 'O dígito verificador geral do boleto não confere. Verifique os números digitados.' };
  }
  const fator = Number(linha.slice(33, 37));
  const centavos = Number(linha.slice(37, 47));
  return {
    ok: true,
    boleto: {
      tipo: 'bancario',
      linha,
      formatada: `${linha.slice(0, 5)}.${linha.slice(5, 10)} ${linha.slice(10, 15)}.${linha.slice(15, 21)} ${linha.slice(21, 26)}.${linha.slice(26, 32)} ${linha[32]} ${linha.slice(33)}`,
      valor: centavos > 0 ? centavos / 100 : null,
      vencimento: fator === 0 ? null : vencimentoDoFator(fator, hoje),
    },
  };
}

function lerArrecadacao(linha: string): ResultadoBoleto {
  const referencia = linha[2];
  if (!['6', '7', '8', '9'].includes(referencia)) {
    return { ok: false, erro: 'Código de arrecadação não reconhecido.' };
  }
  const calcular = referencia === '6' || referencia === '7' ? modulo10 : modulo11Arrecadacao;
  const blocos = [0, 1, 2, 3].map(i => linha.slice(i * 12, i * 12 + 12));
  for (const [indice, bloco] of blocos.entries()) {
    if (calcular(bloco.slice(0, 11)) !== Number(bloco[11])) {
      return { ok: false, erro: `O bloco ${indice + 1} da linha digitável não confere. Verifique os números digitados.` };
    }
  }
  const codigoBarras = blocos.map(bloco => bloco.slice(0, 11)).join('');
  // Referências 6 e 8 trazem o valor efetivo; 7 e 9, uma quantidade de moeda.
  const centavos = referencia === '6' || referencia === '8' ? Number(codigoBarras.slice(4, 15)) : 0;
  return {
    ok: true,
    boleto: {
      tipo: 'arrecadacao',
      linha,
      formatada: blocos.map(bloco => `${bloco.slice(0, 11)}-${bloco[11]}`).join(' '),
      valor: centavos > 0 ? centavos / 100 : null,
      vencimento: null,
    },
  };
}

/** Confere e lê a linha digitável. `hoje` em AAAA-MM-DD (fuso da clínica). */
export function lerLinhaDigitavel(texto: string, hoje: string): ResultadoBoleto {
  const linha = apenasDigitosBoleto(texto);
  if (!linha) return { ok: false, erro: 'Informe a linha digitável do boleto.' };
  if (linha.length === 48 && linha[0] === '8') return lerArrecadacao(linha);
  if (linha.length === 47) return lerBancario(linha, hoje);
  return { ok: false, erro: `A linha digitável tem ${linha.length} dígitos; boletos bancários têm 47 e contas de consumo, 48.` };
}

const MARCA_BOLETO = 'Linha digitável do boleto:';

/** Acrescenta (ou troca) a linha digitável nas observações da conta. */
export function observacoesComBoleto(observacoes: string, linha: string): string {
  const semBoleto = observacoes.split('\n').filter(l => !l.startsWith(MARCA_BOLETO)).join('\n').trim();
  return linha ? [semBoleto, `${MARCA_BOLETO} ${linha}`].filter(Boolean).join('\n') : semBoleto;
}

/** Linha digitável gravada nas observações, se houver. */
export function boletoDasObservacoes(observacoes: string | null | undefined): string | null {
  const linha = (observacoes ?? '').split('\n').find(l => l.startsWith(MARCA_BOLETO));
  return linha ? apenasDigitosBoleto(linha.slice(MARCA_BOLETO.length)) || null : null;
}
