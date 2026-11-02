import { isValidDateOnly } from '@/lib/dateOnly';
import { emCentavos } from '@/lib/dinheiro';

export type StatusConta = 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado' | 'parcial';

export interface AlteracoesRenegociacao {
  descricao: string;
  valor: number;
  desconto: number;
  acrescimo: number;
  data_vencimento: string;
  status: StatusConta;
  observacoes: string;
}

export interface ContaRenegociavel {
  id: string;
  descricao: string;
  valor: number;
  valor_pago: number | null;
  desconto: number | null;
  acrescimo: number | null;
  data_vencimento: string | null;
  status: StatusConta;
  observacoes: string | null;
}

export interface PropostaRenegociacao {
  descricao: string;
  valor: number | null;
  vencimento: string;
  desconto: number | null;
  acrescimo: number | null;
  motivo: string;
}

export type ResultadoRenegociacao =
  | { ok: true; saldoAtual: number; novoSaldo: number; alteracoes: AlteracoesRenegociacao; erro?: undefined }
  | { ok: false; saldoAtual: number; novoSaldo: number; erro: string; alteracoes?: undefined };

const brData = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Valida a renegociação e devolve o que gravar. Com pagamento registrado o
 * valor original não muda (o saldo se ajusta por desconto e acréscimo), e o
 * novo saldo precisa continuar positivo: zerar a conta é recebimento, não
 * renegociação. O motivo vai para as observações com a data e quem alterou.
 */
export function calcularRenegociacao(
  conta: ContaRenegociavel,
  proposta: PropostaRenegociacao,
  contexto: { hoje: string; autor: string | null },
): ResultadoRenegociacao {
  const pago = emCentavos(conta.valor_pago ?? 0);
  const saldoAtual = Math.max(0, emCentavos(conta.valor) - emCentavos(conta.desconto ?? 0) + emCentavos(conta.acrescimo ?? 0) - pago) / 100;
  const falha = (erro: string): ResultadoRenegociacao => ({ ok: false, saldoAtual, novoSaldo: saldoAtual, erro });

  if (!proposta.descricao.trim()) return falha('Informe a descrição da conta.');
  if (proposta.valor === null || proposta.valor <= 0) return falha('Informe um valor maior que zero, com até duas casas decimais.');
  if (proposta.desconto === null || proposta.desconto < 0) return falha('O desconto precisa ser um valor válido, sem sinal negativo.');
  if (proposta.acrescimo === null || proposta.acrescimo < 0) return falha('O acréscimo precisa ser um valor válido, sem sinal negativo.');
  if (!isValidDateOnly(proposta.vencimento)) return falha('Informe um vencimento válido.');
  if (proposta.motivo.trim().length < 5) return falha('Explique o motivo da renegociação (mínimo 5 caracteres).');

  const comPagamento = pago > 0;
  const valor = comPagamento ? Number(conta.valor) : proposta.valor;
  if (comPagamento && emCentavos(proposta.valor) !== emCentavos(conta.valor)) {
    return falha('Com pagamento registrado, o valor original não muda. Use desconto ou acréscimo.');
  }
  if (emCentavos(proposta.desconto) > emCentavos(valor)) return falha('O desconto não pode ser maior que o valor da conta.');
  const novoSaldo = (emCentavos(valor) - emCentavos(proposta.desconto) + emCentavos(proposta.acrescimo) - pago) / 100;
  if (novoSaldo <= 0) return { ok: false, saldoAtual, novoSaldo, erro: 'O novo saldo precisa ser maior que zero. Para quitar a conta, registre o recebimento.' };

  const mudancaVencimento = conta.data_vencimento !== proposta.vencimento && conta.data_vencimento
    ? ` (vencimento ${brData(conta.data_vencimento)} → ${brData(proposta.vencimento)})`
    : '';
  const anotacao = `Renegociada em ${brData(contexto.hoje)}${contexto.autor ? ` por ${contexto.autor}` : ''}${mudancaVencimento}: ${proposta.motivo.trim()}`;
  // Vencida que ganhou novo prazo volta a "pendente" (ou continua "parcial").
  const status: StatusConta = conta.status === 'atrasado' && proposta.vencimento >= contexto.hoje
    ? (comPagamento ? 'parcial' : 'pendente')
    : conta.status;

  return {
    ok: true,
    saldoAtual,
    novoSaldo,
    alteracoes: {
      descricao: proposta.descricao.trim(),
      valor,
      desconto: proposta.desconto,
      acrescimo: proposta.acrescimo,
      data_vencimento: proposta.vencimento,
      status,
      observacoes: conta.observacoes ? `${conta.observacoes}\n${anotacao}` : anotacao,
    },
  };
}
