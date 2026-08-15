import { describe, it, expect } from 'vitest';
import { resumoDoDia } from '@/components/recepcao/PainelDoDia';

/**
 * O painel responde às sete perguntas da recepção. Se ele contar errado, a
 * recepcionista fecha o dia achando que recebeu o que não recebeu — por isso
 * cada pergunta tem teste, incluindo o dia vazio.
 */

const atendimento = (over: Partial<any> = {}) => ({
  step: 0,
  ag: { id: 'ag-1', status: 'confirmado', hora_inicio: '09:00:00' },
  lanc: null,
  ...over,
});

const conta = (id: string, valor: number, pago: number | null = null) => ({
  agendamento_id: id, valor, valor_pago: pago, desconto: 0, acrescimo: 0,
});

describe('resumoDoDia', () => {
  it('dia vazio não inventa número nem valor', () => {
    const r = resumoDoDia([], []);
    expect(r).toMatchObject({
      total: 0, chegaram: 0, naoChegaram: 0, proximo: null,
      noBalcao: 0, aReceberBalcao: 0, esperandoChamada: 0,
      emAtendimento: 0, devendoAdicional: 0, valorAdicional: 0,
      recebidoTotal: 0, aReceberTotal: 0,
    });
    expect(r.porForma).toEqual([]);
  });

  it('1 e 2. separa quem chegou de quem ainda não, e mostra o próximo horário', () => {
    const r = resumoDoDia([
      atendimento({ step: 0, ag: { id: 'a', status: 'confirmado', hora_inicio: '08:30:00' } }),
      atendimento({ step: 0, ag: { id: 'b', status: 'confirmado', hora_inicio: '10:00:00' } }),
      atendimento({ step: 1, ag: { id: 'c', status: 'aguardando', hora_inicio: '09:00:00' } }),
      atendimento({ step: 4, ag: { id: 'd', status: 'finalizado', hora_inicio: '07:00:00' } }),
    ], []);

    expect(r.total).toBe(4);
    expect(r.chegaram).toBe(2);
    expect(r.naoChegaram).toBe(2);
    expect(r.proximo).toBe('08:30');
  });

  it('3. soma o que falta receber no balcão', () => {
    const r = resumoDoDia([
      atendimento({ step: 1, ag: { id: 'a', status: 'aguardando' }, lanc: conta('a', 250) }),
      atendimento({ step: 1, ag: { id: 'b', status: 'aguardando' }, lanc: conta('b', 180, 80) }),
      // Já pago: não entra na conta do balcão.
      atendimento({ step: 2, ag: { id: 'c', status: 'aguardando' }, lanc: conta('c', 300, 300) }),
    ], []);

    expect(r.noBalcao).toBe(2);
    expect(r.aReceberBalcao).toBe(350);
  });

  it('4 e 5. quem está na sala não conta como esperando', () => {
    const r = resumoDoDia([
      atendimento({ step: 2, ag: { id: 'a', status: 'aguardando' } }),
      atendimento({ step: 2, ag: { id: 'b', status: 'em_atendimento' } }),
      atendimento({ step: 3, ag: { id: 'c', status: 'em_atendimento' } }),
    ], []);

    expect(r.esperandoChamada).toBe(1);
    expect(r.emAtendimento).toBe(2);
  });

  it('6. o procedimento lançado na consulta aparece como adicional a cobrar', () => {
    // Consulta R$ 250 paga + sutura R$ 100 durante o atendimento.
    const r = resumoDoDia([
      atendimento({
        step: 3,
        ag: { id: 'a', status: 'aguardando_pagamento_adicional' },
        lanc: conta('a', 350, 250),
      }),
      atendimento({ step: 4, ag: { id: 'b', status: 'finalizado' }, lanc: conta('b', 200, 200) }),
    ], []);

    expect(r.devendoAdicional).toBe(1);
    expect(r.valorAdicional).toBe(100);
  });

  it('7. agrupa o recebido por forma, do maior para o menor', () => {
    const r = resumoDoDia([], [
      { forma_pagamento: 'pix', valor: 200 },
      { forma_pagamento: 'credito', valor: 300 },
      { forma_pagamento: 'pix', valor: 150 },
      { forma_pagamento: 'dinheiro', valor: 50 },
    ]);

    expect(r.recebidoTotal).toBe(700);
    expect(r.porForma).toEqual([
      ['pix', 350],
      ['credito', 300],
      ['dinheiro', 50],
    ]);
  });

  it('aceita numeric vindo como string do Postgres', () => {
    const r = resumoDoDia([], [{ forma_pagamento: 'pix', valor: '199.90' }]);
    expect(r.recebidoTotal).toBe(199.9);
  });

  it('pagamento a mais não vira saldo negativo no total a receber', () => {
    const r = resumoDoDia([
      atendimento({ step: 1, ag: { id: 'a', status: 'aguardando' }, lanc: conta('a', 100, 150) }),
      atendimento({ step: 1, ag: { id: 'b', status: 'aguardando' }, lanc: conta('b', 200) }),
    ], []);

    // Sem o corte em zero, os R$ 50 pagos a mais esconderiam parte da dívida.
    expect(r.aReceberTotal).toBe(200);
  });

  it('atendimento sem cobrança (retorno gratuito) não soma nada', () => {
    const r = resumoDoDia([
      atendimento({ step: 1, ag: { id: 'a', status: 'aguardando' }, lanc: null }),
    ], []);

    expect(r.noBalcao).toBe(1);
    expect(r.aReceberBalcao).toBe(0);
  });
});
