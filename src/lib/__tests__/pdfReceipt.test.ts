import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReceiptWhatsAppText, montarLinhasRecibo, printReceiptPdf, type ReceiptData } from '@/lib/pdfReceipt';

const base: ReceiptData = {
  dataHora: '01/11/2026, 10:30',
  docId: 'ABCD1234',
  paciente: 'Maria da Silva',
  descricao: 'Consulta',
  formaPagamento: 'PIX',
  valorOriginal: 200,
  valorFinal: 200,
};

const textos = (linhas: ReturnType<typeof montarLinhasRecibo>) => linhas.map(l => ('texto' in l ? l.texto : 'rotulo' in l ? `${l.rotulo} ${l.valor}` : '')).join('\n');

describe('montarLinhasRecibo', () => {
  it('mantém o texto inteiro, sem cortar em 30 caracteres', () => {
    const descricao = 'Consulta de retorno com avaliação de exames laboratoriais completos';
    expect(textos(montarLinhasRecibo({ ...base, descricao }))).toContain(descricao);
  });

  it('gera comprovante de estorno com título e total próprios', () => {
    const t = textos(montarLinhasRecibo({ ...base, modelo: 'estorno' }));
    expect(t).toContain('COMPROVANTE DE ESTORNO');
    expect(t).toContain('TOTAL ESTORNADO:');
    expect(t).not.toContain('COMPROVANTE DE PAGAMENTO');
  });

  it('mostra o já pago e o saldo no recibo parcial', () => {
    const t = textos(montarLinhasRecibo({ ...base, valorFinal: 50, jaPagoAntes: 100, saldoRestante: 50 }));
    expect(t).toContain('Já pago antes:');
    expect(t).toContain('Saldo em aberto:');
  });

  it('recibo para reembolso traz CNPJ, CPF, registro e valor por extenso', () => {
    const t = textos(montarLinhasRecibo({
      ...base, modelo: 'reembolso', cpf: '123.456.789-00', clinicaNome: 'Clínica Exemplo',
      clinicaCnpj: '12.345.678/0001-90', medico: 'Dra. Ana', medicoRegistro: 'CRM 12345/SP', valorFinal: 150.75,
    }));
    expect(t).toContain('CNPJ 12.345.678/0001-90');
    expect(t).toContain('CPF 123.456.789-00');
    expect(t).toContain('CRM 12345/SP');
    expect(t).toContain('cento e cinquenta reais e setenta e cinco centavos');
  });

  it('mostra troco quando informado o valor entregue', () => {
    const t = textos(montarLinhasRecibo({ ...base, valorEntregue: 250, troco: 50 }));
    expect(t).toContain('Troco:');
  });
});

describe('getReceiptWhatsAppText', () => {
  it('monta o texto com paciente e total', () => {
    const texto = getReceiptWhatsAppText(base);
    expect(texto).toContain('Maria da Silva');
    expect(texto).toContain('Total pago');
  });
});

describe('printReceiptPdf', () => {
  afterEach(() => vi.restoreAllMocks());

  it('devolve false e libera o blob quando o navegador bloqueia a aba', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:teste'), revokeObjectURL: revoke });
    await expect(printReceiptPdf(base)).resolves.toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:teste');
  });
});
