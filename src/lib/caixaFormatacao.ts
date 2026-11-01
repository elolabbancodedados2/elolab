/** Formatação compartilhada pelas telas do caixa (hoje, histórico e edição). */

const FUSO_CLINICA = 'America/Sao_Paulo';

/** Hora (HH:mm) de um instante, sempre no fuso da clínica. */
export function horaSP(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const instante = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(instante.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_CLINICA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(instante);
}

/** Data e hora (dd/mm/aaaa, HH:mm) de um instante, no fuso da clínica. */
export function dataHoraSP(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const instante = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(instante.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_CLINICA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(instante);
}

export const FORMA_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Crédito',
  cartao_credito: 'Crédito',
  debito: 'Débito',
  cartao_debito: 'Débito',
  cheque: 'Cheque',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  convenio: 'Convênio',
};

export function rotuloForma(forma: string | null | undefined): string {
  if (!forma) return '—';
  return FORMA_LABELS[forma] ?? forma.replace(/_/g, ' ');
}

/** Impede que o Excel interprete um texto do usuário como fórmula. */
export function textoSeguroCsv(valor: string | null | undefined): string {
  const texto = valor ?? '';
  return /^[=+@\-\t\r]/.test(texto) ? `'${texto}` : texto;
}
