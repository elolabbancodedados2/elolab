import { describe, it, expect } from 'vitest';
import { podeAtender, saldoDevedor } from '@/lib/liberacaoAtendimento';

/**
 * Os mesmos seis cenários que `supabase/verificacoes/trava-pagamento.sql`
 * exercita no banco. Se estes testes e aquele arquivo discordarem, a tela e o
 * trigger estão divergindo — e o sintoma seria botão que aparece e falha ao
 * clicar, ou paciente preso na fila sem motivo visível.
 */

const AG = 'ag-1';
const devendo = [{ agendamento_id: AG, valor: 250, valor_pago: null, desconto: 0, acrescimo: 0 }];
const pago    = [{ agendamento_id: AG, valor: 250, valor_pago: 250, desconto: 0, acrescimo: 0 }];

describe('podeAtender', () => {
  it('1. trava desligada: atende mesmo devendo', () => {
    expect(podeAtender(AG, {}, devendo, false)).toBe(true);
  });

  it('2. trava ligada e devendo: não atende', () => {
    expect(podeAtender(AG, {}, devendo, true)).toBe(false);
  });

  it('3. trava ligada e pago: atende', () => {
    expect(podeAtender(AG, {}, pago, true)).toBe(true);
  });

  it('4. sem cobrança nenhuma (retorno gratuito): atende', () => {
    expect(podeAtender(AG, {}, [], true)).toBe(true);
  });

  it('5. marcado como isento (convênio): atende mesmo devendo', () => {
    expect(podeAtender(AG, { exige_pagamento_previo: false }, devendo, true)).toBe(true);
  });

  it('6. liberado com justificativa: atende mesmo devendo', () => {
    expect(podeAtender(AG, { liberado_sem_pagamento: true }, devendo, true)).toBe(true);
  });

  it('pagamento parcial ainda bloqueia', () => {
    const parcial = [{ agendamento_id: AG, valor: 250, valor_pago: 100, desconto: 0, acrescimo: 0 }];
    expect(podeAtender(AG, {}, parcial, true)).toBe(false);
  });

  it('desconto que zera a conta libera', () => {
    const comDesconto = [{ agendamento_id: AG, valor: 250, valor_pago: null, desconto: 250, acrescimo: 0 }];
    expect(podeAtender(AG, {}, comDesconto, true)).toBe(true);
  });

  it('cobrança de outro agendamento não prende este', () => {
    const deOutro = [{ agendamento_id: 'ag-2', valor: 999, valor_pago: null, desconto: 0, acrescimo: 0 }];
    expect(podeAtender(AG, {}, deOutro, true)).toBe(true);
  });

  it('duas cobranças no mesmo atendimento somam', () => {
    const duas = [
      { agendamento_id: AG, valor: 250, valor_pago: 250, desconto: 0, acrescimo: 0 },
      { agendamento_id: AG, valor: 100, valor_pago: null, desconto: 0, acrescimo: 0 },
    ];
    // O procedimento extra de R$ 100 reabre o saldo.
    expect(podeAtender(AG, {}, duas, true)).toBe(false);
  });
});

describe('saldoDevedor', () => {
  it('conta desconto e acréscimo', () => {
    expect(saldoDevedor(AG, [
      { agendamento_id: AG, valor: 250, valor_pago: 100, desconto: 50, acrescimo: 10 },
    ])).toBe(110);
  });

  it('aceita numeric vindo como string do Postgres', () => {
    expect(saldoDevedor(AG, [
      { agendamento_id: AG, valor: '250.00', valor_pago: '100.00', desconto: '0', acrescimo: '0' },
    ])).toBe(150);
  });

  /** Centavos: somar em float deixaria resíduo e o saldo nunca zeraria. */
  it('não deixa resíduo de ponto flutuante', () => {
    expect(saldoDevedor(AG, [
      { agendamento_id: AG, valor: 10.1, valor_pago: 10.1, desconto: 0, acrescimo: 0 },
      { agendamento_id: AG, valor: 20.2, valor_pago: 20.2, desconto: 0, acrescimo: 0 },
    ])).toBe(0);
  });

  it('sem cobrança, saldo é zero', () => {
    expect(saldoDevedor(AG, [])).toBe(0);
  });
});
