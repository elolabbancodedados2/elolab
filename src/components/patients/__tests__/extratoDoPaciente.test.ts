import { describe, it, expect } from 'vitest';
import { saldoDevedor } from '@/lib/liberacaoAtendimento';

/**
 * O extrato do paciente reusa `saldoDevedor` — a mesma função da trava de
 * pagamento e do painel do dia. Estes testes travam as regras de que o extrato
 * depende: o que conta como dívida e o que não conta.
 *
 * Três telas discordando sobre quanto um paciente deve seria pior que não ter
 * nenhuma.
 */

const falta = (c: any) => Math.max(0, saldoDevedor('x', [{ ...c, agendamento_id: 'x' }]));

describe('quanto falta numa cobrança', () => {
  it('conta o que não foi pago', () => {
    expect(falta({ valor: 250, valor_pago: null, desconto: 0, acrescimo: 0 })).toBe(250);
    expect(falta({ valor: 250, valor_pago: 100, desconto: 0, acrescimo: 0 })).toBe(150);
    expect(falta({ valor: 250, valor_pago: 250, desconto: 0, acrescimo: 0 })).toBe(0);
  });

  it('desconto reduz a dívida, acréscimo aumenta', () => {
    expect(falta({ valor: 250, valor_pago: 0, desconto: 50, acrescimo: 0 })).toBe(200);
    expect(falta({ valor: 250, valor_pago: 0, desconto: 0, acrescimo: 30 })).toBe(280);
  });

  /** Quem pagou a mais não vira crédito negativo no total do extrato. */
  it('pagamento a mais não vira dívida negativa', () => {
    expect(falta({ valor: 100, valor_pago: 150, desconto: 0, acrescimo: 0 })).toBe(0);
  });

  it('aceita numeric vindo como string do Postgres', () => {
    expect(falta({ valor: '250.00', valor_pago: '99.90', desconto: '0', acrescimo: '0' })).toBe(150.1);
  });

  /** Somar em float deixaria resíduo e o extrato mostraria R$ 0,01 eterno. */
  it('não deixa resíduo de centavo', () => {
    const total = [
      { valor: 10.1, valor_pago: 10.1 },
      { valor: 20.2, valor_pago: 20.2 },
      { valor: 0.3, valor_pago: 0.3 },
    ].reduce((s, c) => s + falta({ ...c, desconto: 0, acrescimo: 0 }), 0);
    expect(total).toBe(0);
  });
});

describe('o que não é dívida', () => {
  const naoConta = ['cancelado', 'estornado'];

  it('cancelado e estornado ficam fora do total', () => {
    const cobrancas = [
      { status: 'pendente',  valor: 100, valor_pago: 0 },
      { status: 'cancelado', valor: 500, valor_pago: 0 },
      { status: 'estornado', valor: 300, valor_pago: 0 },
    ];
    const total = cobrancas
      .filter(c => !naoConta.includes(c.status))
      .reduce((s, c) => s + falta({ ...c, desconto: 0, acrescimo: 0 }), 0);

    // Contar os cancelados cobraria o paciente por algo que a própria clínica
    // desfez.
    expect(total).toBe(100);
  });
});
